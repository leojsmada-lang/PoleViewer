// eptLoader.ts — downloads and decodes EPT point cloud tiles from USGS S3.
//
// LAZ vs LAS:
//   The USGS 3DEP datasets use LASzip (LAZ) compression — a lossless codec
//   that reduces tile file sizes by ~5–10x. Plain LAS would be uncompressed.
//   We use the `laz-perf` WASM library for in-browser LAZ decompression.
//   laz-perf@0.0.7 is an Emscripten module: it exports a `create` factory
//   that must be awaited to initialize the WASM runtime. The resulting module
//   provides LASZip (point-by-point decompressor) and ChunkDecoder classes.
//   If laz-perf fails to load, we fall back to a plain LAS parser which
//   handles any uncompressed tiles.
//
// HOW EPT STREAMING WORKS:
//   1. Fetch the root hierarchy node (ept-hierarchy/0-0-0-0.json).
//      This JSON lists all the octree nodes that exist in the dataset.
//   2. Walk the hierarchy tree up to a chosen depth limit.
//      Depth 0 = one tile (whole dataset, very coarse).
//      Depth 3 = up to 512 tiles (fine detail, manageable size).
//   3. Fetch each tile file (ept-data/D-X-Y-Z.laz) in parallel batches.
//   4. Parse each tile's binary LAS data into Float32Arrays of XYZ positions.
//   5. Merge all tiles into a single array that Three.js can render.
//
// LAS FILE FORMAT (brief):
//   LAS is a binary format for point cloud data, standardized by ASPRS.
//   The file starts with a fixed header block (bytes 0–375) that contains:
//     - "LASF" signature (4 bytes) — used to verify the file is valid
//     - Byte offsets and counts for the point records
//     - Scale and offset values needed to convert stored integers to real coords
//   After the header, point records are stored sequentially. Each record
//   contains the X, Y, Z position as 32-bit integers, plus intensity.
//   Real coordinate = (stored integer × scale) + offset
//   This integer-plus-scale encoding saves space while preserving precision.

import { EptManifest, buildEptNodeUrl, buildHierarchyUrl } from './lidarService';

// PointCloudChunk is the result of loading one or more EPT tiles.
// positions holds all XYZ coordinates as a flat array: [x0,y0,z0, x1,y1,z1, ...]
// A flat Float32Array is used (instead of an array of {x,y,z} objects) because
// Three.js BufferGeometry expects data in exactly this interleaved format.
export interface PointCloudChunk {
  positions: Float32Array;    // flat XYZ array, length = count * 3
  intensities?: Float32Array; // 0–1 normalized intensity per point (optional)
  count: number;              // number of points
}

// LoadOptions controls how much data to fetch — important for keeping
// memory and load time under control on large datasets.
export interface LoadOptions {
  maxPoints?: number;  // hard cap on total points loaded (default 500,000)
  maxDepth?: number;   // octree depth limit — 0=root (coarse), 3=good overview
  bounds?: [number, number, number, number, number, number]; // spatial filter (unused currently)
  onProgress?: (loaded: number, total: number) => void; // progress callback for the UI
}

// HierarchyNode represents one entry in the EPT hierarchy JSON.
// Keys are node addresses like "1-0-0-0", values are point counts
// or nested objects for sub-hierarchies.
type HierarchyNode = { [key: string]: number | HierarchyNode };

/**
 * Main entry point: loads a point cloud from an EPT dataset.
 * Orchestrates hierarchy fetch → node collection → tile streaming → merge.
 */
export async function loadEptPointCloud(
  eptUrl: string,
  manifest: EptManifest,
  options: LoadOptions = {}
): Promise<PointCloudChunk> {
  const { maxPoints = 500_000, maxDepth = 3, onProgress } = options;

  // Step 1: fetch the root hierarchy node.
  // The hierarchy tells us which tiles actually exist so we don't request
  // tiles that would 404. The root node (0-0-0-0) covers the whole dataset.
  const hierUrl = buildHierarchyUrl(eptUrl, 0, 0, 0, 0);
  const hierRes = await fetch(hierUrl);
  if (!hierRes.ok) throw new Error(`Hierarchy fetch failed: ${hierUrl}`);
  const hierarchy: HierarchyNode = await hierRes.json();

  // Step 2: walk the hierarchy tree and collect node addresses to fetch.
  const nodesToLoad: Array<{ d: number; x: number; y: number; z: number }> = [];
  collectNodes(hierarchy, 0, 0, 0, 0, maxDepth, nodesToLoad);

  // Step 3: fetch tiles in parallel batches of 4.
  // Promise.allSettled (unlike Promise.all) continues even if some tiles fail —
  // a missing or corrupt tile should not abort the whole load.
  const allPositions: Float32Array[] = [];
  const allIntensities: Float32Array[] = [];
  let totalLoaded = 0;

  const BATCH = 4; // number of concurrent tile fetches
  for (let i = 0; i < nodesToLoad.length; i += BATCH) {
    const batch = nodesToLoad.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map((n) => loadTile(eptUrl, manifest, n.d, n.x, n.y, n.z))
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        allPositions.push(result.value.positions);
        if (result.value.intensities) allIntensities.push(result.value.intensities);
        totalLoaded += result.value.count;
      }
      // 'rejected' results (network errors, bad tiles) are silently skipped
    }

    // Report progress after each batch so the UI progress bar moves smoothly.
    // The ?. (optional chaining) safely calls onProgress only if it was provided.
    onProgress?.(Math.min(totalLoaded, maxPoints), maxPoints);

    if (totalLoaded >= maxPoints) break; // stop early once we have enough points
  }

  // Step 4: merge all per-tile Float32Arrays into a single flat buffer.
  // Three.js needs one contiguous array, not an array of arrays.
  const merged = mergeFloat32Arrays(allPositions, maxPoints * 3);
  const mergedIntensities =
    allIntensities.length > 0 ? mergeFloat32Arrays(allIntensities, maxPoints) : undefined;

  return {
    positions: merged,
    intensities: mergedIntensities,
    count: merged.length / 3, // each point uses 3 floats (X, Y, Z)
  };
}

// ---------------------------------------------------------------------------
// Tile loading
// ---------------------------------------------------------------------------

// loadTile fetches a single .laz tile file and decodes it.
// Returns null if the tile doesn't exist or fails to parse — the caller
// uses Promise.allSettled so a null result is harmlessly skipped.
async function loadTile(
  eptUrl: string,
  manifest: EptManifest,
  d: number,
  x: number,
  y: number,
  z: number
): Promise<PointCloudChunk | null> {
  const url = buildEptNodeUrl(eptUrl, d, x, y, z);

  try {
    const res = await fetch(url);
    if (!res.status || res.status === 404) return null; // tile simply doesn't exist
    if (!res.ok) return null;

    // arrayBuffer() returns the raw binary data of the response body.
    // We pass it directly to the LAS parser rather than converting to text.
    const buffer = await res.arrayBuffer();
    return decodeLaz(buffer);
  } catch {
    return null; // network error — skip this tile
  }
}

// ---------------------------------------------------------------------------
// LAZ decompression
// ---------------------------------------------------------------------------

// laz-perf@0.0.7 exports a factory function (`create`) that initializes
// the Emscripten WASM runtime and returns a module with LASZip and ChunkDecoder.
// Creating the WASM instance is expensive, so we cache the Promise here and
// reuse it for every tile rather than re-initializing once per file.
let lazPerfModulePromise: Promise<any> | null = null;

function getLazPerfModule(): Promise<any> {
  if (!lazPerfModulePromise) {
    // locateFile() is not reliable here because webpack may resolve the .wasm
    // path at build time before our override runs. Instead we fetch the WASM
    // binary ourselves from the known public URL and pass it via `wasmBinary`.
    // Emscripten skips its own network fetch entirely when wasmBinary is provided.
    const publicUrl = (process.env.PUBLIC_URL ?? '').replace(/\/$/, '');
    const wasmUrl = `${publicUrl}/laz-perf.wasm`;

    lazPerfModulePromise = Promise.all([
      import('laz-perf'),
      fetch(wasmUrl).then((r) => {
        if (!r.ok) throw new Error(`laz-perf WASM fetch failed: ${r.status} ${wasmUrl}`);
        return r.arrayBuffer();
      }),
    ])
      .then(([m, wasmBinary]: [any, ArrayBuffer]) => {
        const factory = m.create ?? m.createLazPerf ?? m.default;
        if (typeof factory !== 'function') throw new Error('laz-perf: no factory export found');
        // Pass the pre-fetched binary — Emscripten uses it directly without re-fetching.
        return factory({ wasmBinary });
      })
      .catch((err) => {
        lazPerfModulePromise = null; // allow retry on transient errors
        throw err;
      });
  }
  return lazPerfModulePromise;
}

/**
 * Decodes a LAZ (LASzip-compressed) tile buffer using the laz-perf WASM module.
 * Falls back to the plain LAS parser if laz-perf is unavailable or the tile
 * is already uncompressed.
 *
 * HOW laz-perf WORKS AT THE WASM LEVEL:
 *   laz-perf exposes a C++ LASZip class via Emscripten bindings.
 *   All data exchange goes through the WASM linear memory (HEAP8, HEAP32, etc.).
 *   We must:
 *     1. _malloc space for the whole LAZ file, copy it in via HEAPU8.set()
 *     2. Call laszip.open(ptr, length) — parses the LAS header + chunk table
 *     3. Loop: laszip.getPoint(pointPtr) decompresses one point record at a time
 *     4. Read raw integers from HEAP32/HEAPU16 at the point pointer
 *     5. _free both allocations and call laszip.delete() to avoid WASM heap leaks
 *   Scale and offset come from the LAS header (readable directly from the
 *   ArrayBuffer with DataView — same layout in both compressed and uncompressed files).
 */
async function decodeLaz(buffer: ArrayBuffer): Promise<PointCloudChunk | null> {
  try {
    const module = await getLazPerfModule();

    // Read the LAS header with DataView — identical layout in LAZ and plain LAS.
    const view = new DataView(buffer);
    const sig = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    if (sig !== 'LASF') return null;

    // Byte 107: legacy 32-bit point count (sufficient for all USGS EPT tiles)
    const count = view.getUint32(107, true);
    if (count === 0) return null;

    // Bytes 131–178: scale and offset for converting stored integers → real coords
    const xScale  = view.getFloat64(131, true);
    const yScale  = view.getFloat64(139, true);
    const zScale  = view.getFloat64(147, true);
    const xOffset = view.getFloat64(155, true);
    const yOffset = view.getFloat64(163, true);
    const zOffset = view.getFloat64(171, true);

    // Copy the full LAZ file into the WASM heap so LASZip can read it.
    // HEAPU8 is a Uint8Array view over the entire WASM linear memory.
    const data   = new Uint8Array(buffer);
    const filePtr = module._malloc(data.length);
    module.HEAPU8.set(data, filePtr);

    // Initialize the LASZip decompressor with the file data.
    const laszip = new module.LASZip();
    laszip.open(filePtr, data.length);

    // Allocate a scratch buffer for one decompressed point record.
    // getPointLength() returns the number of bytes in one point record.
    const pointSize = laszip.getPointLength();
    const pointPtr  = module._malloc(pointSize);

    const positions   = new Float32Array(count * 3);
    const intensities = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Decompress the next point record into WASM memory at pointPtr.
      laszip.getPoint(pointPtr);

      // X, Y, Z are signed 32-bit integers at byte offsets 0, 4, 8 in the record.
      // HEAP32 is indexed in 4-byte units — shift right by 2 to convert byte → int32 index.
      const xi = module.HEAP32[(pointPtr >> 2) + 0];
      const yi = module.HEAP32[(pointPtr >> 2) + 1];
      const zi = module.HEAP32[(pointPtr >> 2) + 2];

      // Intensity is an unsigned 16-bit value at byte offset 12.
      // HEAPU16 is indexed in 2-byte units — (pointPtr + 12) / 2 = (pointPtr >> 1) + 6.
      const inten = module.HEAPU16[(pointPtr >> 1) + 6];

      positions[i * 3 + 0] = xi * xScale + xOffset;
      positions[i * 3 + 1] = yi * yScale + yOffset;
      positions[i * 3 + 2] = zi * zScale + zOffset;
      intensities[i] = inten / 65535;
    }

    // Free WASM memory — Emscripten does NOT garbage-collect these automatically.
    laszip.delete();
    module._free(pointPtr);
    module._free(filePtr);

    return { positions, intensities, count };
  } catch (err) {
    // laz-perf failed or unavailable — fall back to the plain LAS parser,
    // which handles uncompressed tiles correctly.
    console.warn('[eptLoader] laz-perf decode failed, trying plain LAS parser', err);
    return parseLasHeader(buffer);
  }
}

// ---------------------------------------------------------------------------
// LAS binary parser
// ---------------------------------------------------------------------------

/**
 * Parses a LAS 1.x binary file and extracts XYZ positions and intensity.
 *
 * All byte offsets below come from the LAS 1.2/1.4 specification.
 * DataView is the browser API for reading typed values from raw binary at
 * specific byte positions. `true` as the second argument means little-endian
 * (the byte order used by LAS files and most modern hardware).
 */
function parseLasHeader(buffer: ArrayBuffer): PointCloudChunk | null {
  const view = new DataView(buffer);

  // Bytes 0–3: file signature. Must be "LASF" or the file is not a valid LAS file.
  const sig = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (sig !== 'LASF') return null;

  // Byte 96:  offset (in bytes) from the start of the file to the first point record
  const offsetToData = view.getUint32(96, true);
  // Byte 107: number of point records (legacy 32-bit field; sufficient for most tiles)
  const pointCount    = view.getUint32(107, true);
  // Byte 104: point data format ID (0=basic XYZ, 1=XYZ+time, 6=LAS 1.4 extended, etc.)
  // Not used directly — point record structure is the same for our XYZ+intensity read regardless of format.
  void view.getUint8(104);
  // Byte 105: size in bytes of each point record
  const pointSize     = view.getUint16(105, true);

  // Bytes 131–178: scale and offset values for X, Y, Z.
  // LAS stores coordinates as integers to save space. The real-world value is:
  //   real = (stored_int × scale) + offset
  // Scale is typically something like 0.001 (millimeter precision).
  const xScale  = view.getFloat64(131, true);
  const yScale  = view.getFloat64(139, true);
  const zScale  = view.getFloat64(147, true);
  const xOffset = view.getFloat64(155, true);
  const yOffset = view.getFloat64(163, true);
  const zOffset = view.getFloat64(171, true);

  // Pre-allocate output arrays. Float32Array is more memory-efficient than
  // a regular JavaScript number array (4 bytes per value vs 8 bytes).
  const positions   = new Float32Array(pointCount * 3); // [x0,y0,z0, x1,y1,z1, ...]
  const intensities = new Float32Array(pointCount);     // [i0, i1, i2, ...]

  // Read each point record sequentially.
  for (let i = 0; i < pointCount; i++) {
    const off = offsetToData + i * pointSize; // byte offset of this point's record

    // X, Y, Z are at byte offsets 0, 4, 8 within each point record (signed 32-bit int)
    positions[i * 3 + 0] = view.getInt32(off + 0, true) * xScale + xOffset;
    positions[i * 3 + 1] = view.getInt32(off + 4, true) * yScale + yOffset;
    positions[i * 3 + 2] = view.getInt32(off + 8, true) * zScale + zOffset;

    // Intensity is at byte offset 12 (unsigned 16-bit int, range 0–65535).
    // Normalize to 0–1 by dividing by the max value.
    intensities[i] = view.getUint16(off + 12, true) / 65535;
  }

  return { positions, intensities, count: pointCount };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Recursively walks the EPT hierarchy tree to collect the addresses of all
 * nodes that should be fetched, up to maxDepth levels deep.
 *
 * The EPT hierarchy JSON uses keys like "0-0-0-0", "1-0-0-0", "1-1-0-0" etc.
 * Each node at depth D has up to 8 children at depth D+1, positioned by
 * doubling the parent's X/Y/Z and adding 0 or 1 in each axis — this is
 * the standard octree subdivision pattern.
 */
function collectNodes(
  hierarchy: HierarchyNode,
  d: number,
  x: number,
  y: number,
  z: number,
  maxDepth: number,
  result: Array<{ d: number; x: number; y: number; z: number }>
): void {
  const key = `${d}-${x}-${y}-${z}`;
  if (!(key in hierarchy)) return; // this node doesn't exist in the dataset — stop recursing

  result.push({ d, x, y, z }); // this node exists, add it to the fetch list
  if (d >= maxDepth) return;    // don't go deeper than the requested level

  // Each parent splits into 8 children (2 splits per axis: dx=0|1, dy=0|1, dz=0|1).
  // Child address = (parent * 2) + 0 or 1 per axis.
  for (let dx = 0; dx < 2; dx++) {
    for (let dy = 0; dy < 2; dy++) {
      for (let dz = 0; dz < 2; dz++) {
        collectNodes(
          hierarchy,
          d + 1,
          x * 2 + dx,
          y * 2 + dy,
          z * 2 + dz,
          maxDepth,
          result
        );
      }
    }
  }
}

/**
 * Concatenates multiple Float32Arrays into one, capping the total length at maxLen.
 * Used to merge per-tile position arrays into the single buffer Three.js needs.
 */
function mergeFloat32Arrays(arrays: Float32Array[], maxLen: number): Float32Array {
  const totalLen = Math.min(
    arrays.reduce((sum, a) => sum + a.length, 0), // sum of all array lengths
    maxLen
  );
  const merged = new Float32Array(totalLen);
  let offset = 0;
  for (const arr of arrays) {
    if (offset >= totalLen) break;
    // subarray() gives a view into the source array without copying — then
    // merged.set() copies that slice into the right position in the output.
    const chunk = arr.subarray(0, Math.min(arr.length, totalLen - offset));
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}
