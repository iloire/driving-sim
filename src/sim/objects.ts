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

/** How a zone's buildings stand and look: site.json's `buildings`, any field left out taken from Lanzarote's. */
export interface BuildingStyle {
  /** The tallest a building gets, in storeys, whatever OSM says (church towers aside). */
  maxStoreys: number;
  /** Relative odds of one, two, three … storeys for a building OSM gives no height. */
  storeys: number[];
  /** Wall colours, one picked per building; list one twice to make it twice as common. */
  walls: string[];
  /** Roof colours, likewise. */
  roofs: string[];
}

/** Lanzarote's planning rules keep the island low and white: two storeys at most, the walls lime-washed. */
export const LANZAROTE: BuildingStyle = {
  maxStoreys: 2,
  storeys: [0.7, 0.3],
  walls: ['#f3f1ea', '#f3f1ea', '#f3f1ea', '#f3f1ea', '#f6f5f1', '#f6f5f1', '#eeeae0', '#efe8d9'],
  roofs: ['#e6e2d8', '#dedacf'],
};

export const buildingStyle = (s: Partial<BuildingStyle> = {}): BuildingStyle => ({ ...LANZAROTE, ...s });

const SHEDS = ['garage', 'garages', 'shed', 'hut', 'roof', 'carport'];
/** Kinds that are one storey, however big. */
const LOW = ['industrial', 'warehouse', 'greenhouse', 'farm_auxiliary', 'barn', 'cowshed', 'stable', 'hangar', 'service'];
/** Kinds that are a family's house: two storeys at most. */
const HOUSES = ['house', 'detached', 'semidetached_house', 'bungalow', 'farm', 'cabin', 'villa', 'terrace'];
/** Fewer neighbours than this within about 75 m and an untagged building is a farmhouse or a village house: two storeys at most. */
export const SPARSE = 12;

/**
 * A building's height from its OSM tags, capped at the zone's `maxStoreys`. Untagged ones (most of
 * Lanzarote, a good part of the rest) are rolled from the zone's `storeys` odds by the OSM id, so a
 * house is the same height on every load. A big footprint or a block of flats rolls from the taller
 * half of the odds; a house, or anything out on its own (`neighbours` under SPARSE), stops at two.
 */
export function buildingHeight(tags: Record<string, string>, id: number, footprint: number, style: BuildingStyle = LANZAROTE, neighbours = Infinity): number {
  if (tags.building === 'church' || tags.building === 'cathedral') return 11;
  const { maxStoreys } = style;
  const h = parseFloat(tags.height ?? '');
  if (h > 0) return Math.min(h, maxStoreys * STOREY + 0.6);
  const levels = parseFloat(tags['building:levels'] ?? '');
  if (levels > 0) return Math.min(levels, maxStoreys) * STOREY + 0.6;
  if (SHEDS.includes(tags.building)) return 2.6;
  if (LOW.includes(tags.building)) return STOREY + 0.6;
  const roll = ((id * 2654435761) >>> 0) / 2 ** 32;
  const r = footprint > 300 || tags.building === 'apartments' ? (1 + roll) / 2 : roll;
  const total = style.storeys.reduce((a, b) => a + b, 0);
  let n = 1;
  for (let acc = style.storeys[0]; n < style.storeys.length && r * total >= acc; n++) acc += style.storeys[n];
  if (HOUSES.includes(tags.building) || neighbours < SPARSE) n = Math.min(n, 2);
  return Math.min(n, maxStoreys) * STOREY + 0.6;
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
    if (buildings.wall(x, y, 0)) return false;
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
