// The road network (from OpenStreetMap, written by scripts/fetch-terrain.ts as roads.json) and
// what the game does with it: carve each road into the 5 m terrain as a smooth graded strip, find
// the nearest road to a point (for the surface under a tyre, the HUD's road name and respawns).
// Roads are polylines in the site frame: x east, y north, metres from the bbox's south-west corner.

import type { Heightmap } from './terrain';

export type RoadKind = 'highway' | 'primary' | 'secondary' | 'tertiary' | 'minor' | 'service' | 'track';

export interface Road {
  kind: RoadKind;
  /** OSM ref and/or name, e.g. "LZ-2" or "LZ-67 · Carretera de Yaiza", '' when unnamed. */
  name: string;
  /** Bridges keep the terrain under them as it is. */
  bridge: boolean;
  /** Flat x, y pairs. */
  pts: number[];
}

/** Carriageway width (m) per kind; OSM's dual carriageways come as two one-way roads. */
export const ROAD_WIDTH: Record<RoadKind, number> = {
  highway: 8, primary: 7.5, secondary: 7, tertiary: 6.5, minor: 5.5, service: 4, track: 3.5,
};

export const isPaved = (kind: RoadKind): boolean => kind !== 'track';

/** On-disk form: k = kind, n = name, b = 1 on a bridge, p = coordinates to the decimetre. */
export interface RoadsFile {
  roads: { k: RoadKind; n?: string; b?: 1; p: number[] }[];
}

export function parseRoads(file: RoadsFile): Road[] {
  return file.roads.map((r) => ({ kind: r.k, name: r.n ?? '', bridge: r.b === 1, pts: r.p }));
}

/** Profile sample spacing along a road (m). */
const STEP = 4;
/** Moving-average half-window in samples, and passes: ~20 m either side, three times over. */
const SMOOTH_HALF = 5;
const SMOOTH_PASSES = 3;
/** Beyond the carriageway the cut or fill blends back into the hillside over this much (m). */
const SHOULDER = 6;
/** Flat margin beyond the carriageway edge (m): a 5 m grid needs it to keep the edge level. */
const VERGE = 1;

/** Points every `step` metres along a polyline, ends included. */
export function resample(pts: number[], step = STEP): number[] {
  const out = [pts[0], pts[1]];
  let carry = 0;
  for (let i = 2; i < pts.length; i += 2) {
    const ax = pts[i - 2], ay = pts[i - 1], bx = pts[i], by = pts[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    let d = step - carry;
    while (d < len) {
      out.push(ax + ((bx - ax) * d) / len, ay + ((by - ay) * d) / len);
      d += step;
    }
    carry = len - (d - step);
  }
  const n = pts.length;
  if (out[out.length - 2] !== pts[n - 2] || out[out.length - 1] !== pts[n - 1]) out.push(pts[n - 2], pts[n - 1]);
  return out;
}

/**
 * The road's surface height along resampled points: the terrain under its centreline, smoothed
 * along its length so the ride is graded rather than following every 5 m bump. Never below sea level.
 */
export function roadProfile(terrain: Heightmap, pts: number[]): Float32Array {
  const n = pts.length / 2;
  let z = new Float32Array(n);
  for (let i = 0; i < n; i++) z[i] = terrain.heightAt(pts[2 * i], pts[2 * i + 1]);
  for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
    const next = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      // A window that shrinks at the ends, so the road still meets the ground where it stops.
      const h = Math.min(SMOOTH_HALF, i, n - 1 - i);
      let sum = 0;
      for (let j = i - h; j <= i + h; j++) sum += z[j];
      next[i] = sum / (2 * h + 1);
    }
    z = next;
  }
  for (let i = 0; i < n; i++) z[i] = Math.max(z[i], 0.5);
  return z;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * Carves every road into the terrain's detail tiles: flat across the carriageway at its graded
 * profile, blending back to the natural ground over the shoulder. Where roads meet, the heights
 * are averaged by how much each one claims the cell. The coarse site map is left alone.
 */
export function carveRoads(terrain: Heightmap, roads: Road[]): void {
  const tiles = terrain.details();
  if (!tiles.length) return;
  const tileM = tiles[0].extent;
  const acc = new Map<Heightmap, { sum: Float32Array; sumZ: Float32Array; max: Float32Array }>();
  const accFor = (t: Heightmap) => {
    let a = acc.get(t);
    if (!a) {
      const n = t.size * t.size;
      a = { sum: new Float32Array(n), sumZ: new Float32Array(n), max: new Float32Array(n) };
      acc.set(t, a);
    }
    return a;
  };

  // Every profile comes from the untouched terrain, before any road is cut in.
  const profiled = roads.filter((r) => !r.bridge).map((r) => {
    const pts = resample(r.pts);
    return { road: r, pts, z: roadProfile(terrain, pts) };
  });

  for (const { road, pts, z } of profiled) {
    const flat = ROAD_WIDTH[road.kind] / 2 + VERGE;
    const reach = flat + SHOULDER;
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const ax = pts[i], ay = pts[i + 1], bx = pts[i + 2], by = pts[i + 3];
      const za = z[i / 2], zb = z[i / 2 + 1];
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
      const x0 = Math.min(ax, bx) - reach, x1 = Math.max(ax, bx) + reach;
      const y0 = Math.min(ay, by) - reach, y1 = Math.max(ay, by) + reach;
      for (let ty = Math.floor(y0 / tileM); ty <= Math.floor(y1 / tileM); ty++) {
        for (let tx = Math.floor(x0 / tileM); tx <= Math.floor(x1 / tileM); tx++) {
          const tile = terrain.detailAt((tx + 0.5) * tileM, (ty + 0.5) * tileM);
          if (!tile) continue;
          const a = accFor(tile);
          const px = tile.pixel, n = tile.size;
          const c0 = Math.max(Math.floor((x0 - tile.x0) / px - 0.5), 0), c1 = Math.min(Math.ceil((x1 - tile.x0) / px - 0.5), n - 1);
          const r0 = Math.max(Math.floor((tile.y0 + tile.extent - y1) / px - 0.5), 0);
          const r1 = Math.min(Math.ceil((tile.y0 + tile.extent - y0) / px - 0.5), n - 1);
          for (let r = r0; r <= r1; r++) {
            const cy = tile.y0 + tile.extent - (r + 0.5) * px;
            for (let c = c0; c <= c1; c++) {
              const cx = tile.x0 + (c + 0.5) * px;
              const t = Math.min(Math.max(((cx - ax) * dx + (cy - ay) * dy) / len2, 0), 1);
              const d = Math.hypot(cx - ax - t * dx, cy - ay - t * dy);
              if (d >= reach) continue;
              const w = 1 - smoothstep(flat, reach, d);
              const k = r * n + c;
              a.sum[k] += w;
              a.sumZ[k] += w * (za + (zb - za) * t);
              if (w > a.max[k]) a.max[k] = w;
            }
          }
        }
      }
    }
  }

  for (const [tile, a] of acc) {
    const d = tile.data;
    for (let k = 0; k < d.length; k++) {
      if (a.max[k] > 0) d[k] += (a.sumZ[k] / a.sum[k] - d[k]) * a.max[k];
    }
  }
}

export interface RoadHit {
  road: Road;
  /** Distance from the point to the road's centreline (m). */
  dist: number;
  /** Closest point on the centreline. */
  x: number;
  y: number;
  /** Compass heading of the road there, radians, in the direction it was drawn. */
  heading: number;
}

/** Nearest-road lookups over a 100 m grid of segments. */
export class RoadIndex {
  private static readonly CELL = 100;
  private readonly cells = new Map<number, number[]>();

  constructor(readonly roads: Road[]) {
    const C = RoadIndex.CELL;
    roads.forEach((road, ri) => {
      for (let i = 0; i + 3 < road.pts.length; i += 2) {
        const [ax, ay, bx, by] = road.pts.slice(i, i + 4);
        for (let cy = Math.floor(Math.min(ay, by) / C); cy <= Math.floor(Math.max(ay, by) / C); cy++) {
          for (let cx = Math.floor(Math.min(ax, bx) / C); cx <= Math.floor(Math.max(ax, bx) / C); cx++) {
            const key = cy * 100000 + cx;
            let list = this.cells.get(key);
            if (!list) this.cells.set(key, (list = []));
            list.push(ri, i);
          }
        }
      }
    });
  }

  /** The closest road within `maxDist` metres that passes `accept`, or undefined. */
  nearest(x: number, y: number, maxDist: number, accept: (r: Road) => boolean = () => true): RoadHit | undefined {
    const C = RoadIndex.CELL;
    let best: RoadHit | undefined;
    for (let cy = Math.floor((y - maxDist) / C); cy <= Math.floor((y + maxDist) / C); cy++) {
      for (let cx = Math.floor((x - maxDist) / C); cx <= Math.floor((x + maxDist) / C); cx++) {
        const list = this.cells.get(cy * 100000 + cx);
        if (!list) continue;
        for (let j = 0; j < list.length; j += 2) {
          const road = this.roads[list[j]];
          if (!accept(road)) continue;
          const p = road.pts, i = list[j + 1];
          const ax = p[i], ay = p[i + 1], dx = p[i + 2] - ax, dy = p[i + 3] - ay;
          const t = Math.min(Math.max(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0), 1);
          const qx = ax + t * dx, qy = ay + t * dy;
          const dist = Math.hypot(x - qx, y - qy);
          if (dist <= maxDist && (!best || dist < best.dist)) {
            best = { road, dist, x: qx, y: qy, heading: (Math.atan2(dx, dy) + 2 * Math.PI) % (2 * Math.PI) };
          }
        }
      }
    }
    return best;
  }
}
