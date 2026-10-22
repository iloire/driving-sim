// What stands beside the road, per detail tile: OSM buildings, and the street furniture derived
// from the roads. Street lamps line roads through town (where buildings are close), and Spanish
// edge posts (hitos de arista: white, a black band, an amber reflector) line main roads in the
// open. scripts/fetch-terrain.ts places them offline into objects/<col>_<row>.json.

import { BuildingIndex, type Building } from './buildings';
import { resample, ROAD_WIDTH, RoadIndex, type Road, type RoadKind } from './roads';

/** On-disk form, coordinates in the site frame to the decimetre. */
export interface TileObjectsFile {
  /** Buildings: [height, x0, y0, x1, y1, …]. */
  b: number[][];
  /** Lamps: x, y, compass heading of the arm (towards the road), repeated. */
  l: number[];
  /** Edge posts: x, y, repeated. */
  p: number[];
}

export interface TileObjects {
  buildings: Building[];
  lamps: { x: number; y: number; heading: number }[];
  posts: { x: number; y: number }[];
}

export function parseObjects(f: TileObjectsFile): TileObjects {
  const lamps = [], posts = [];
  for (let i = 0; i < f.l.length; i += 3) lamps.push({ x: f.l[i], y: f.l[i + 1], heading: f.l[i + 2] });
  for (let i = 0; i < f.p.length; i += 2) posts.push({ x: f.p[i], y: f.p[i + 1] });
  return { buildings: f.b.map(([height, ...pts]) => ({ height, pts })), lamps, posts };
}

const STOREY = 3.2;

/**
 * A building's height from its OSM tags. Untagged ones (most of the island) get one or two storeys,
 * picked by the OSM id so a house is the same height on every load; a big footprint is likelier
 * to be taller.
 */
export function buildingHeight(tags: Record<string, string>, id: number, footprint: number): number {
  const h = parseFloat(tags.height ?? '');
  if (h > 0) return h;
  const levels = parseFloat(tags['building:levels'] ?? '');
  if (levels > 0) return levels * STOREY + 0.6;
  if (tags.building === 'church' || tags.building === 'cathedral') return 11;
  if (['garage', 'garages', 'shed', 'hut', 'roof', 'carport'].includes(tags.building)) return 2.6;
  const roll = ((id * 2654435761) >>> 0) / 2 ** 32;
  const storeys = roll < (footprint > 300 ? 0.3 : 0.65) ? 1 : roll < 0.95 ? 2 : 3;
  return storeys * STOREY + 0.6;
}

const LAMP_EVERY = 28;
const POST_EVERY = 50;
/** A road with a building this close (m) is in town and gets lamps rather than posts. */
const TOWN_RADIUS = 30;
const LIT: RoadKind[] = ['highway', 'primary', 'secondary', 'tertiary', 'minor'];
const POSTED: RoadKind[] = ['highway', 'primary', 'secondary', 'tertiary'];

/** Lamps and edge posts along the roads, kept off every carriageway and out of every building. */
export function placeFurniture(roads: Road[], buildings: BuildingIndex): Pick<TileObjects, 'lamps' | 'posts'> {
  const index = new RoadIndex(roads);
  const clear = (x: number, y: number) => {
    if (buildings.wall(x, y)) return false;
    const hit = index.nearest(x, y, 10);
    return !hit || hit.dist > ROAD_WIDTH[hit.road.kind] / 2 + 0.4;
  };
  const lamps: TileObjects['lamps'] = [];
  const posts: TileObjects['posts'] = [];
  for (const road of roads) {
    if (road.bridge || (!LIT.includes(road.kind) && !POSTED.includes(road.kind))) continue;
    const half = ROAD_WIDTH[road.kind] / 2;
    const pts = resample(road.pts, 2);
    let sinceLamp = LAMP_EVERY / 2, sincePost = POST_EVERY / 2, side = 1;
    for (let i = 2; i + 1 < pts.length; i += 2) {
      sinceLamp += 2;
      sincePost += 2;
      const x = pts[i], y = pts[i + 1];
      const dx = pts[i] - pts[i - 2], dy = pts[i + 1] - pts[i - 1];
      const len = Math.hypot(dx, dy) || 1;
      const lx = -dy / len, ly = dx / len; // to the left
      const town = buildings.near(x, y, TOWN_RADIUS);
      if (town && LIT.includes(road.kind) && sinceLamp >= LAMP_EVERY) {
        sinceLamp = 0;
        side = -side;
        const off = half + 1.4;
        const px = x + lx * off * side, py = y + ly * off * side;
        // The arm reaches back over the road: towards the centreline.
        if (clear(px, py)) lamps.push({ x: px, y: py, heading: Math.atan2(-lx * side, -ly * side) });
      }
      if (!town && POSTED.includes(road.kind) && sincePost >= POST_EVERY) {
        sincePost = 0;
        for (const s of [1, -1]) {
          const px = x + lx * (half + 1) * s, py = y + ly * (half + 1) * s;
          if (clear(px, py)) posts.push({ x: px, y: py });
        }
      }
    }
  }
  return { lamps, posts };
}
