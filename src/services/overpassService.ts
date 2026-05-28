// overpassService.ts — fetches real utility pole locations from OpenStreetMap.
//
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

/**
 * Finds the nearest OSM power pole within 500 m of the given lat/lng.
 * Uses the Overpass `around` filter which constrains results to a radius
 * around a point rather than a rectangular bounding box.
 *
 * Returns null if no pole is found nearby or the request fails.
 */
export async function findNearestPole(lat: number, lng: number): Promise<Pole | null> {
  // around:500 = search within 500 metres of the given point.
  // Fetching up to 10 candidates lets us pick the geometrically nearest one
  // ourselves, since Overpass returns results sorted by node ID, not distance.
  const query = `[out:json][timeout:15];node["power"="pole"](around:1500,${lat},${lng});out body 20;`;
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
    const data: OverpassResponse = await res.json();

    const nodes = data.elements.filter(el => el.type === 'node' && el.lat && el.lon);
    if (nodes.length === 0) return null;

    // Pick the node closest to the clicked point by straight-line distance.
    // Math.hypot(dx, dy) is the 2D Euclidean distance — accurate enough at this scale.
    const nearest = nodes.reduce((best, el) => {
      const d  = Math.hypot(el.lat - lat, el.lon - lng);
      const db = Math.hypot(best.lat - lat, best.lon - lng);
      return d < db ? el : best;
    });

    console.log(`[overpass] Nearest pole OSM id=${nearest.id} at (${nearest.lat}, ${nearest.lon})`);
    return nodeToP(nearest);
  } catch (err) {
    console.warn('[overpass] findNearestPole failed:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nodeToP(el: OverpassElement): Pole {
  return {
    id:          el.id,
    latitude:    el.lat,
    longitude:   el.lon,
    height:      parseFeet(el.tags?.['height']) ?? undefined,
    attachments: buildAttachments(el.tags),
  };
}

function parseFeet(raw: string | undefined): number | null {
  if (!raw) return null;
  const match = raw.match(/^([\d.]+)\s*(ft|')?/i);
  if (!match) return null;
  const val = parseFloat(match[1]);
  const isFeet = /ft|'/i.test(match[2] ?? '');
  return isFeet ? Math.round(val) : Math.round(val * 3.281);
}

function buildAttachments(tags?: Record<string, string>): Attachment[] {
  const attachments: Attachment[] = [
    { id: 1, type: 'Power', height: 35, diameter: 0.5 },
  ];
  if (tags?.['telecom'] || tags?.['communication:telephone']) {
    attachments.push({ id: 2, type: 'Telecom', height: 28, diameter: 0.3 });
  }
  return attachments;
}
