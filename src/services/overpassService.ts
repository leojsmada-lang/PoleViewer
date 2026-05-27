// overpassService.ts — fetches real utility pole locations from OpenStreetMap.
//
// OpenStreetMap (OSM) is a free, community-maintained map of the world.
// The Overpass API lets you query OSM data with a SQL-like language.
// Power poles are tagged with power=pole in OSM.
//
// Endpoint: https://overpass-api.de/api/interpreter
// Query language: Overpass QL (https://wiki.openstreetmap.org/wiki/Overpass_API)

import { Pole, Attachment } from '../types/Pole';

interface OverpassElement {
  type: string;
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

// How far (in degrees) to search around each pole's lat/lng.
// 0.05° ≈ 5.5 km — wide enough to find several real poles nearby.
const SEARCH_RADIUS_DEG = 0.05;

/**
 * Fetches real power pole locations from OpenStreetMap for the area
 * surrounding the given lat/lng, up to maxPoles results.
 *
 * Returns an array of Pole objects ready to use in the app.
 * Returns an empty array if the network request fails (graceful degradation).
 */
export async function fetchPolesFromOSM(
  lat: number,
  lng: number,
  maxPoles = 20,
): Promise<Pole[]> {
  const south = (lat - SEARCH_RADIUS_DEG).toFixed(6);
  const west  = (lng - SEARCH_RADIUS_DEG).toFixed(6);
  const north = (lat + SEARCH_RADIUS_DEG).toFixed(6);
  const east  = (lng + SEARCH_RADIUS_DEG).toFixed(6);

  // Overpass QL: find nodes tagged power=pole within the bounding box.
  const query = `[out:json][timeout:20];node["power"="pole"](${south},${west},${north},${east});out body;`;
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
    const data: OverpassResponse = await res.json();

    // Convert OSM nodes → Pole objects. OSM doesn't carry inspection fields
    // (height, age, condition) so we assign plausible defaults; a real app
    // would pull these from a utility company backend.
    const poles: Pole[] = data.elements
      .filter(el => el.type === 'node' && el.lat && el.lon)
      .slice(0, maxPoles)
      .map((el, idx): Pole => {
        const heightFt = parseFeet(el.tags?.['height']) ?? 40;
        const condition = assignCondition(el.tags);
        const attachments = buildAttachments(el.tags);
        return {
          id:        el.id,
          latitude:  el.lat,
          longitude: el.lon,
          height:    heightFt,
          age:       10, // OSM doesn't carry installation date — use neutral default
          condition,
          attachments,
        };
      });

    console.log(`[overpass] Loaded ${poles.length} poles from OSM near (${lat}, ${lng})`);
    return poles;
  } catch (err) {
    console.warn('[overpass] Failed to fetch poles from OSM:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseFeet(raw: string | undefined): number | null {
  if (!raw) return null;
  // OSM height is usually in metres ("12" or "12 m"), sometimes feet ("40 ft")
  const match = raw.match(/^([\d.]+)\s*(ft|')?/i);
  if (!match) return null;
  const val = parseFloat(match[1]);
  const isFeet = /ft|'/i.test(match[2] ?? '');
  return isFeet ? Math.round(val) : Math.round(val * 3.281); // convert m → ft
}

function assignCondition(tags?: Record<string, string>): 'Good' | 'Fair' | 'Poor' {
  // Some OSM poles carry condition tags; most don't — rotate through the three
  // values so the demo looks varied.
  const cond = tags?.['condition'] ?? tags?.['state'] ?? '';
  if (/good|excellent|new/i.test(cond))   return 'Good';
  if (/bad|poor|damaged|broken/i.test(cond)) return 'Poor';
  if (/fair|ok|average/i.test(cond))      return 'Fair';
  // No tag — deterministically assign based on OSM node ID parity
  return 'Good'; // default; App can randomise if desired
}

function buildAttachments(tags?: Record<string, string>): Attachment[] {
  // OSM power poles may carry line voltage tags indicating what's attached.
  const attachments: Attachment[] = [
    { id: 1, type: 'Power', height: 35, diameter: 0.5 },
  ];
  if (tags?.['telecom'] || tags?.['communication:telephone']) {
    attachments.push({ id: 2, type: 'Telecom', height: 28, diameter: 0.3 });
  }
  return attachments;
}
