/**
 * lidarService.ts
 * Queries the USGS 3DEP EPT catalog to find available LiDAR datasets
 * for a given lat/lng, then streams point cloud data from the public
 * S3 bucket — zero cost to you, served by USGS/AWS Open Data.
 *
 * EPT public bucket: https://s3-us-west-2.amazonaws.com/usgs-lidar-public/
 * Coverage index:    https://index.entwine.io/
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
const ENTWINE_INDEX = 'https://index.entwine.io/bounds';

/**
 * Find USGS 3DEP EPT datasets covering a given lat/lng point.
 * Returns datasets sorted by point count (most detailed first).
 */
export async function findDatasetsForLocation(
  lat: number,
  lng: number,
  radiusDeg = 0.01  // ~1km
): Promise<EptDataset[]> {
  const minLon = lng - radiusDeg;
  const minLat = lat - radiusDeg;
  const maxLon = lng + radiusDeg;
  const maxLat = lat + radiusDeg;

  const url = `${ENTWINE_INDEX}?bounds=${minLon},${minLat},${maxLon},${maxLat}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Index query failed: ${res.status}`);
    const data: Array<{ name: string; bounds: number[]; srs: string; points: number }> = await res.json();

    return data
      .map((d) => ({
        name: d.name,
        eptUrl: `${EPT_BASE}/${d.name}/ept.json`,
        bounds: d.bounds as [number, number, number, number, number, number],
        srs: d.srs,
        points: d.points,
      }))
      .sort((a, b) => b.points - a.points);
  } catch (err) {
    console.warn('[lidarService] Index query failed, using fallback dataset list', err);
    return getFallbackDatasets(lat, lng);
  }
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
function getFallbackDatasets(lat: number, lng: number): EptDataset[] {
  // Fayette County area datasets (confirmed coverage from NOAA InPort)
  const knownGeorgiaProjects = [
    'GA_CentralGA_2019_D20',   // 2019-2020 Central Georgia — covers Fayette County
    'GA_Statewide_2018_D19',   // 2018-2019 GA Statewide
  ];

  return knownGeorgiaProjects.map((name) => ({
    name,
    eptUrl: `${EPT_BASE}/${name}/ept.json`,
    bounds: [-85, 32, -80, 35, 0, 500] as [number, number, number, number, number, number],
    srs: 'EPSG:6350',
    points: 0,
  }));
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
