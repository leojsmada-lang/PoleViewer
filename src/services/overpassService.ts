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

// Public Overpass instances to try in order. overpass-api.de rate-limits
// (HTTP 429) aggressively per-IP; falling back to a mirror lets the app
// keep working when the primary instance is throttling us.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
];

// Tracks the in-flight request so a new viewport query can cancel the
// previous one instead of letting them pile up against the public server —
// fast panning was stacking up concurrent requests, which is exactly what
// trips overpass-api.de's per-IP rate limit.
let currentController: AbortController | null = null;

/**
 * Returns all OSM power poles within the given map bounding box.
 * Capped at 200 results to keep rendering snappy.
 */
export async function findPolesInBounds(
  south: number, west: number, north: number, east: number
): Promise<Pole[]> {
  currentController?.abort();
  const controller = new AbortController();
  currentController = controller;
  const timeout = window.setTimeout(() => controller.abort(), 25000);

  const bbox = `${south},${west},${north},${east}`;
  // Union of every common OSM tagging scheme for a power/telecom pole:
  //   power=pole          — classic tag for poles carrying power lines
  //   man_made=utility_pole — modern general-purpose pole tag (power or telecom)
  //   telecom=pole        — legacy tag still used for telecom-only poles
  const query = `[out:json][timeout:25];(node["power"="pole"](${bbox});node["man_made"="utility_pole"](${bbox});node["telecom"="pole"](${bbox}););out body 200;`;

  try {
    let lastStatus = 0;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      const url = `${endpoint}?data=${encodeURIComponent(query)}`;
      const res = await fetch(url, { signal: controller.signal });
      if (res.status === 429) { lastStatus = 429; continue; } // rate-limited — try the next mirror
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
      const data: OverpassResponse = await res.json();
      const nodes = data.elements.filter(el => el.type === 'node' && el.lat && el.lon);
      console.log(`[overpass] Found ${nodes.length} poles in viewport (via ${endpoint})`);
      return nodes.map(nodeToP);
    }
    throw new Error(`Overpass HTTP ${lastStatus || 429} — all mirrors rate-limited, try again shortly.`);
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('OpenStreetMap query timed out after 25 seconds. The external Overpass service may be unavailable.');
    }
    console.warn('[overpass] findPolesInBounds failed:', err);
    throw err;
  } finally {
    window.clearTimeout(timeout);
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
  const utility   = tags?.['utility'];
  const isPower   = tags?.['power'] === 'pole' || utility === 'power' || utility === 'distribution' || utility === 'transmission';
  const isTelecom = tags?.['telecom'] === 'pole' || utility === 'telecom' || !!tags?.['communication:telephone'];

  const attachments: Attachment[] = [];
  // Default to Power when purpose isn't tagged at all (e.g. a bare
  // man_made=utility_pole) — matches the app's original power=pole-only behavior.
  if (isPower || (!isPower && !isTelecom)) {
    attachments.push({ id: 1, type: 'Power', height: 35, diameter: 0.5 });
  }
  if (isTelecom) {
    attachments.push({ id: attachments.length + 1, type: 'Telecom', height: 28, diameter: 0.3 });
  }
  return attachments;
}
