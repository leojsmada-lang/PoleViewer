// lidarService.ts — discovers and describes USGS LiDAR datasets.
//
// BACKGROUND — what is LiDAR and EPT?
//   LiDAR (Light Detection And Ranging) is a survey technique that fires
//   laser pulses from an aircraft and measures return times to build a
//   precise 3D point cloud of the terrain below. USGS makes this data
//   publicly available via their 3DEP (3D Elevation Program) initiative.
//
//   EPT (Entwine Point Tiles) is a file format for storing and streaming
//   large point clouds efficiently. The key files are:
//     ept.json         — small manifest (~1KB) describing the whole dataset
//                        (bounds, coordinate system, point count, schema)
//     ept-hierarchy/   — JSON files that describe the octree node structure
//     ept-data/        — the actual .laz point tile files, one per octree node
//
//   An "octree" is a 3D spatial index: the bounding box is recursively split
//   into 8 smaller boxes (like cutting a cube in half along all 3 axes).
//   Depth 0 is the whole dataset (coarse); each deeper level is 8x denser.
//
// EPT public bucket: https://s3-us-west-2.amazonaws.com/usgs-lidar-public/
// Note: index.entwine.io (the discovery API) is no longer operational.
// Dataset names are sourced directly from the S3 bucket.

// EptDataset describes one available LiDAR survey from USGS.
export interface EptDataset {
  name: string;    // S3 folder name, e.g. "GA_Central_1_2018"
  eptUrl: string;  // full URL to the ept.json manifest for this dataset
  bounds: [number, number, number, number, number, number]; // [minX,minY,minZ,maxX,maxY,maxZ] in dataset CRS
  srs: string;     // spatial reference system, e.g. "EPSG:3857" (Web Mercator)
  points: number;  // total point count (0 = unknown for hardcoded entries)
}

// EptManifest mirrors the JSON structure of an ept.json file.
// TypeScript uses this to give you autocomplete and type-checking when
// working with the data returned by fetchEptManifest().
export interface EptManifest {
  bounds: number[];           // [minX, minY, minZ, maxX, maxY, maxZ]
  boundsConforming: number[]; // tighter bounds — only where data actually exists
  dataType: string;           // storage format, e.g. "laszip"
  hierarchyType: string;      // hierarchy format, e.g. "json"
  points: number;             // total point count in the dataset
  schema: Array<{ name: string; type: string; size: number }>; // per-point fields (X, Y, Z, Intensity, etc.)
  span: number;               // number of octree cells along each axis at the root level
  srs: { authority: string; horizontal: string; wkt: string }; // coordinate reference system
  version: string;            // EPT spec version, e.g. "1.0.0"
}

// Base URL for the USGS 3DEP public LiDAR data hosted on AWS S3.
// All dataset folders sit directly under this path.
const EPT_BASE = 'https://s3-us-west-2.amazonaws.com/usgs-lidar-public';

/**
 * Returns the list of USGS LiDAR datasets available for a given location.
 * The lat/lng parameters are accepted for future use (e.g. filtering by
 * bounding box) but are not used while the dataset list is hardcoded.
 */
export async function findDatasetsForLocation(
  _lat: number,
  _lng: number,
): Promise<EptDataset[]> {
  return getFallbackDatasets();
}

/**
 * Fetches the ept.json manifest for a dataset.
 * This is a tiny JSON file (~1KB) that describes the entire point cloud —
 * its bounds, coordinate system, and the schema of each point record.
 * Always fetched first before requesting any tile data.
 */
export async function fetchEptManifest(eptUrl: string): Promise<EptManifest> {
  const res = await fetch(eptUrl);
  if (!res.ok) throw new Error(`Failed to fetch EPT manifest: ${eptUrl}`);
  return res.json(); // parse the response body as JSON
}

/**
 * Builds the URL for a specific EPT tile node.
 * EPT uses D-X-Y-Z addressing to identify octree nodes:
 *   D = depth (0 = root, 1 = first split, etc.)
 *   X, Y, Z = position within the grid at that depth
 * For example, "0-0-0-0.laz" is the root tile containing a coarse
 * representation of the entire dataset.
 */
export function buildEptNodeUrl(eptUrl: string, d: number, x: number, y: number, z: number): string {
  const base = eptUrl.replace('/ept.json', ''); // strip the filename to get the folder URL
  return `${base}/ept-data/${d}-${x}-${y}-${z}.laz`;
}

/**
 * Builds the EPT hierarchy URL for a given node.
 * Hierarchy files are small JSON files that list which child nodes exist
 * under a given parent — used to know which tiles to fetch next.
 */
export function buildHierarchyUrl(eptUrl: string, d: number, x: number, y: number, z: number): string {
  const base = eptUrl.replace('/ept.json', '');
  return `${base}/ept-hierarchy/${d}-${x}-${y}-${z}.json`;
}

/**
 * Hardcoded list of verified USGS 3DEP datasets for central/southern Georgia.
 * These were confirmed present in the usgs-lidar-public S3 bucket with valid
 * ept.json files. Bounds are in EPSG:3857 (Web Mercator, units = meters),
 * sourced directly from each dataset's ept.json.
 *
 * GA_Central_1_2018 covers Fayette County (lat ~33.4, lng ~-84.5).
 */
function getFallbackDatasets(): EptDataset[] {
  return [
    {
      name: 'GA_Central_1_2018',
      eptUrl: `${EPT_BASE}/GA_Central_1_2018/ept.json`,
      bounds: [-9422133, 3870887, -125541, -9170573, 4122447, 126019],
      srs: 'EPSG:3857',
      points: 0,
    },
    {
      name: 'GA_Central_2_2018',
      eptUrl: `${EPT_BASE}/GA_Central_2_2018/ept.json`,
      bounds: [-9540929, 3700483, -114719, -9311007, 3930405, 115203],
      srs: 'EPSG:3857',
      points: 0,
    },
    {
      name: 'GA_Central_3_2018',
      eptUrl: `${EPT_BASE}/GA_Central_3_2018/ept.json`,
      bounds: [-9509667, 3533495, -134185, -9240817, 3802345, 134665],
      srs: 'EPSG:3857',
      points: 0,
    },
  ];
}

/**
 * Converts a WGS84 lat/lng to approximate local X/Z offsets in meters
 * relative to a reference point. Used to position the pole model within
 * the LiDAR scene's coordinate space.
 *
 * This uses a flat-earth approximation that's accurate enough for distances
 * under ~5km. For precise work across larger areas, use the proj4js library.
 *
 * In Three.js, Y is up (height). The horizontal plane is X/Z.
 * North (increasing latitude) maps to negative Z because Three.js's default
 * camera looks down the negative Z axis.
 */
export function latLngToLocalXZ(
  lat: number,
  lng: number,
  refLat: number,
  refLng: number
): { x: number; z: number } {
  const METERS_PER_DEG_LAT = 111320; // roughly constant everywhere
  // Longitude degrees shrink toward the poles, so scale by cos(latitude)
  const METERS_PER_DEG_LNG = 111320 * Math.cos((refLat * Math.PI) / 180);

  return {
    x: (lng - refLng) * METERS_PER_DEG_LNG,
    z: -(lat - refLat) * METERS_PER_DEG_LAT, // negated: north = -Z in Three.js
  };
}
