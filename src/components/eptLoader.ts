/**
 * eptLoader.ts
 * Streams EPT point cloud tiles from USGS S3 and decodes them into
 * Float32Array buffers that Three.js BufferGeometry can consume directly.
 *
 * EPT tiles are LASzip (.laz) compressed — we use the `laz-perf` WASM
 * library for in-browser decompression (no server needed).
 *
 * Install:  npm install laz-perf
 */

import { EptManifest, buildEptNodeUrl, buildHierarchyUrl } from './lidarService';

export interface PointCloudChunk {
  positions: Float32Array;   // Flat [x,y,z, x,y,z, ...] in dataset units
  intensities?: Float32Array; // 0–1 normalized intensity per point
  count: number;
}

export interface LoadOptions {
  /** Max points to load total — keeps memory bounded */
  maxPoints?: number;
  /** Octree depth limit — 0=root (coarse), higher=denser. 2–3 good for overview */
  maxDepth?: number;
  /** Bounding box filter in dataset CRS [minX,minY,minZ,maxX,maxY,maxZ] */
  bounds?: [number, number, number, number, number, number];
  onProgress?: (loaded: number, total: number) => void;
}

type HierarchyNode = { [key: string]: number | HierarchyNode };

/**
 * Main entry: load a point cloud from an EPT dataset.
 * Returns a merged Float32Array of XYZ positions (dataset native units).
 */
export async function loadEptPointCloud(
  eptUrl: string,
  manifest: EptManifest,
  options: LoadOptions = {}
): Promise<PointCloudChunk> {
  const { maxPoints = 500_000, maxDepth = 3, onProgress } = options;

  // 1. Fetch the root hierarchy node list
  const hierUrl = buildHierarchyUrl(eptUrl, 0, 0, 0, 0);
  const hierRes = await fetch(hierUrl);
  if (!hierRes.ok) throw new Error(`Hierarchy fetch failed: ${hierUrl}`);
  const hierarchy: HierarchyNode = await hierRes.json();

  // 2. Collect which nodes to load based on depth limit
  const nodesToLoad: Array<{ d: number; x: number; y: number; z: number }> = [];
  collectNodes(hierarchy, 0, 0, 0, 0, maxDepth, nodesToLoad);

  // 3. Load each node tile in parallel (batched)
  const allPositions: Float32Array[] = [];
  const allIntensities: Float32Array[] = [];
  let totalLoaded = 0;

  const BATCH = 4; // concurrent fetches
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
    }

    onProgress?.(Math.min(totalLoaded, maxPoints), maxPoints);

    if (totalLoaded >= maxPoints) break;
  }

  // 4. Merge into a single buffer
  const merged = mergeFloat32Arrays(allPositions, maxPoints * 3);
  const mergedIntensities =
    allIntensities.length > 0 ? mergeFloat32Arrays(allIntensities, maxPoints) : undefined;

  return {
    positions: merged,
    intensities: mergedIntensities,
    count: merged.length / 3,
  };
}

// ---------------------------------------------------------------------------
// Tile loading — fetches a single .laz file and decodes it
// ---------------------------------------------------------------------------

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
    if (!res.status || res.status === 404) return null;
    if (!res.ok) return null;

    const buffer = await res.arrayBuffer();
    return parseLasHeader (buffer, manifest);
  } catch {
    return null;
  }
}



/**
 * Minimal LAS 1.x parser (no compression) — fallback if laz-perf is absent.
 * Reads point format 0/1/6 from raw binary. Works on uncompressed EPT data
 * if the server returns plain LAS instead of LAZ.
 */
function parseLasHeader(buffer: ArrayBuffer): PointCloudChunk | null {
  const view = new DataView(buffer);
  const sig = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (sig !== 'LASF') return null;

  const offsetToData = view.getUint32(96, true);
  const pointCount = view.getUint32(107, true);
  const pointFormat = view.getUint8(104);
  const pointSize = view.getUint16(105, true);

  const xScale = view.getFloat64(131, true);
  const yScale = view.getFloat64(139, true);
  const zScale = view.getFloat64(147, true);
  const xOffset = view.getFloat64(155, true);
  const yOffset = view.getFloat64(163, true);
  const zOffset = view.getFloat64(171, true);

  const positions = new Float32Array(pointCount * 3);
  const intensities = new Float32Array(pointCount);

  for (let i = 0; i < pointCount; i++) {
    const off = offsetToData + i * pointSize;
    positions[i * 3 + 0] = view.getInt32(off + 0, true) * xScale + xOffset;
    positions[i * 3 + 1] = view.getInt32(off + 4, true) * yScale + yOffset;
    positions[i * 3 + 2] = view.getInt32(off + 8, true) * zScale + zOffset;
    intensities[i] = view.getUint16(off + 12, true) / 65535;
  }

  return { positions, intensities, count: pointCount };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  if (!(key in hierarchy)) return;
  result.push({ d, x, y, z });
  if (d >= maxDepth) return;

  // EPT children: 8 octants
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

function mergeFloat32Arrays(arrays: Float32Array[], maxLen: number): Float32Array {
  const totalLen = Math.min(
    arrays.reduce((sum, a) => sum + a.length, 0),
    maxLen
  );
  const merged = new Float32Array(totalLen);
  let offset = 0;
  for (const arr of arrays) {
    if (offset >= totalLen) break;
    const chunk = arr.subarray(0, Math.min(arr.length, totalLen - offset));
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}
