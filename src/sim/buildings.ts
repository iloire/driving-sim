// Buildings (OSM footprints, written per detail tile by scripts/fetch-terrain.ts) as solid
// obstacles: which footprint a point is inside, and the shortest way out of it, so the car's body
// can be pushed back out of a wall. Footprints are polygons in the site frame (x east, y north).

export interface Building {
  /** Flat x, y pairs, the ring not closed (last point ≠ first). */
  pts: number[];
  /** Height above the ground (m). */
  height: number;
}

/** Where a point is inside a footprint: the outward wall normal and how deep it is. */
export interface WallHit {
  nx: number;
  ny: number;
  depth: number;
}

/** Even-odd point-in-polygon. */
export function inside(pts: number[], x: number, y: number): boolean {
  let hit = false;
  const n = pts.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Signed area (m²), positive when the ring runs anticlockwise. */
export function area(pts: number[]): number {
  let a = 0;
  const n = pts.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) a += pts[j] * pts[i + 1] - pts[i] * pts[j + 1];
  return a / 2;
}

/** The nearest wall to a point inside a footprint, as the way out. */
export function wayOut(pts: number[], x: number, y: number): WallHit {
  let best: WallHit = { nx: 0, ny: 0, depth: Infinity };
  const n = pts.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const ax = pts[j], ay = pts[j + 1], dx = pts[i] - ax, dy = pts[i + 1] - ay;
    const t = Math.min(Math.max(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0), 1);
    const qx = ax + t * dx, qy = ay + t * dy;
    const depth = Math.hypot(qx - x, qy - y);
    if (depth < best.depth) best = depth > 1e-9 ? { nx: (qx - x) / depth, ny: (qy - y) / depth, depth } : { nx: 0, ny: 0, depth };
  }
  return best;
}

/** Footprints bucketed in a 25 m grid, added and dropped a tile at a time as the car moves. */
export class BuildingIndex {
  private static readonly CELL = 25;
  private readonly cells = new Map<number, Building[]>();
  private readonly byTile = new Map<string, Building[]>();

  /** Registers a tile's buildings under `key` (replacing any already there). */
  add(key: string, buildings: Building[]): void {
    this.remove(key);
    this.byTile.set(key, buildings);
    for (const b of buildings) for (const cell of this.cellsOf(b)) {
      let list = this.cells.get(cell);
      if (!list) this.cells.set(cell, (list = []));
      list.push(b);
    }
  }

  remove(key: string): void {
    const old = this.byTile.get(key);
    if (!old) return;
    this.byTile.delete(key);
    const gone = new Set(old);
    for (const b of old) for (const cell of this.cellsOf(b)) {
      const list = this.cells.get(cell);
      if (!list) continue;
      const kept = list.filter((x) => !gone.has(x));
      if (kept.length) this.cells.set(cell, kept); else this.cells.delete(cell);
    }
  }

  /** The way out of whatever footprint contains (x, y), or null in the open. */
  wall(x: number, y: number): WallHit | null {
    const C = BuildingIndex.CELL;
    const list = this.cells.get(Math.floor(y / C) * 100000 + Math.floor(x / C));
    if (!list) return null;
    for (const b of list) if (inside(b.pts, x, y)) return wayOut(b.pts, x, y);
    return null;
  }

  /** Any building within `r` metres of a point (a coarse test: footprint bounding cells). */
  near(x: number, y: number, r: number): boolean {
    const C = BuildingIndex.CELL;
    for (let cy = Math.floor((y - r) / C); cy <= Math.floor((y + r) / C); cy++) {
      for (let cx = Math.floor((x - r) / C); cx <= Math.floor((x + r) / C); cx++) {
        if (this.cells.has(cy * 100000 + cx)) return true;
      }
    }
    return false;
  }

  private cellsOf(b: Building): number[] {
    const C = BuildingIndex.CELL;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < b.pts.length; i += 2) {
      x0 = Math.min(x0, b.pts[i]); x1 = Math.max(x1, b.pts[i]);
      y0 = Math.min(y0, b.pts[i + 1]); y1 = Math.max(y1, b.pts[i + 1]);
    }
    const out: number[] = [];
    for (let cy = Math.floor(y0 / C); cy <= Math.floor(y1 / C); cy++) {
      for (let cx = Math.floor(x0 / C); cx <= Math.floor(x1 / C); cx++) out.push(cy * 100000 + cx);
    }
    return out;
  }
}
