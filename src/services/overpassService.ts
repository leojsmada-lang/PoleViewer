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
 * Returns all OSM power poles within the given map bounding box.
 * Capped at 200 results to keep rendering snappy.
 */
export async function findPolesInBounds(
  south: number, west: number, north: number, east: number
): Promise<Pole[]> {
  const query = `[out:json][timeout:25];node["power"="pole"](${south},${west},${north},${east});out body 200;`;
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
    const data: OverpassResponse = await res.json();
    const nodes = data.elements.filter(el => el.type === 'node' && el.lat && el.lon);
    console.log(`[overpass] Found ${nodes.length} poles in viewport`);
    return nodes.map(nodeToP);
  } catch (err) {
    console.warn('[overpass] findPolesInBounds failed:', err);
    return [];
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
