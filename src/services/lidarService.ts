/**
 * lidarService.ts
 * Streams point cloud data from the USGS 3DEP public S3 bucket.
 * Zero cost — served by USGS/AWS Open Data.
 *
 * EPT public bucket: https://s3-us-west-2.amazonaws.com/usgs-lidar-public/
 * Note: index.entwine.io (the discovery API) is no longer operational.
 * Dataset names are sourced directly from the S3 bucket.
 */

export interface EptDataset {
  name: string;
  eptUrl: string;       // Full URL to ept.json
  bounds: [number, number, number, number, number, number]; // [minX,minY,minZ,maxX,maxY,maxZ] in dataset CRS
  srs: string;
  points: number;
}

export interface EptManifest {
  bounds: number[];
  boundsConforming: number[];
  dataType: string;
  hierarchyType: string;
  points: number;
  schema: Array<{ name: string; type: string; size: number }>;
  span: number;
  srs: { authority: string; horizontal: string; wkt: string };
  version: string;
}

const EPT_BASE = 'https://s3-us-west-2.amazonaws.com/usgs-lidar-public';

// Entwine index — returns all EPT datasets that intersect a lon/lat bbox
// Format: GET https://index.entwine.io/bounds?bounds=minLon,minLat,maxLon,maxLat
/**
 * Find USGS 3DEP EPT datasets covering a given lat/lng point.
 * Returns known datasets from the usgs-lidar-public S3 bucket.
 */
export async function findDatasetsForLocation(
  _lat: number,
  _lng: number,
): Promise<EptDataset[]> {
  return getFallbackDatasets();
}

/**
 * Fetch the ept.json manifest for a dataset.
 * This is a tiny JSON file (~1KB) that describes the entire point cloud.
 */
export async function fetchEptManifest(eptUrl: string): Promise<EptManifest> {
  const res = await fetch(eptUrl);
  if (!res.ok) throw new Error(`Failed to fetch EPT manifest: ${eptUrl}`);
  return res.json();
}

/**
 * Build the URL for a specific EPT tile node.
 * EPT uses a D-X-Y-Z addressing scheme (depth, x, y, z octree coords).
 */
export function buildEptNodeUrl(eptUrl: string, d: number, x: number, y: number, z: number): string {
  const base = eptUrl.replace('/ept.json', '');
  return `${base}/ept-data/${d}-${x}-${y}-${z}.laz`;
}

/**
 * Build the EPT hierarchy URL to get the octree node list.
 */
export function buildHierarchyUrl(eptUrl: string, d: number, x: number, y: number, z: number): string {
  const base = eptUrl.replace('/ept.json', '');
  return `${base}/ept-hierarchy/${d}-${x}-${y}-${z}.json`;
}

/**
 * Fallback: known Georgia / Fayette County datasets if the index API is unavailable.
 * Project names sourced from the USGS 3DEP catalog.
 */
function getFallbackDatasets(): EptDataset[] {
  // Verified against usgs-lidar-public S3 bucket — all have valid ept.json.
  // Bounds are in EPSG:3857 (Web Mercator), sourced from each dataset's ept.json.
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
 * Convert WGS84 lat/lng to approximate local XYZ offsets in meters
 * relative to a reference point. Used to position the pole model
 * within the LiDAR scene coordinate space.
 *
 * For precise work use proj4js; this approximation is fine for <5km scenes.
 */
export function latLngToLocalXZ(
  lat: number,
  lng: number,
  refLat: number,
  refLng: number
): { x: number; z: number } {
  const METERS_PER_DEG_LAT = 111320;
  const METERS_PER_DEG_LNG = 111320 * Math.cos((refLat * Math.PI) / 180);

  return {
    x: (lng - refLng) * METERS_PER_DEG_LNG,
    z: -(lat - refLat) * METERS_PER_DEG_LAT, // negate: north = negative Z in Three.js
  };
}
