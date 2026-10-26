// What grows and lies about off the roads: trees, bushes, grass, stones and boulders, placed only
// round the car, a cell at a time, and the same every visit (each cell seeds its own dice). What a
// spot gets follows the aerial photo under it (`Ground`): green ground grows trees and grass, black
// lava lies under rocks, brown farmland gets bushes and tufts, and bright sand or snow little at all.
// The zone picks the species (site.json `scatter`). Trees and boulders are solid; the rest isn't.

import type { WallHit } from './buildings';

export const TREE_KINDS = ['broadleaf', 'pine', 'umbrella', 'cypress', 'palm'] as const;
export const BUSH_KINDS = ['bush', 'cactus'] as const;
export type TreeKind = (typeof TREE_KINDS)[number];
export type BushKind = (typeof BUSH_KINDS)[number];
export type ScatterKind = TreeKind | BushKind | 'grass' | 'stone' | 'boulder';

/**
 * The zone's plant life: the relative odds of each tree and bush, `lone` how thick trees stand
 * in open ground that the photo doesn't show green (0 = only where it does), `density` a multiplier on everything.
 */
export interface ScatterSpec {
  trees: Partial<Record<TreeKind, number>>;
  bushes: Partial<Record<BushKind, number>>;
  lone: number;
  density: number;
}

export const DEFAULT_SCATTER: ScatterSpec = { trees: { broadleaf: 2, umbrella: 2, cypress: 0.4 }, bushes: { bush: 1 }, lone: 0.05, density: 1 };
export const scatterSpec = (s: Partial<ScatterSpec> = {}): ScatterSpec => ({ ...DEFAULT_SCATTER, ...s });

/** What the photo shows at a point, each 0..1, and its colour (linear-ish 0..1 RGB). */
export interface Ground {
  green: number;
  /** Lava and other dark bare rock. */
  dark: number;
  /** Browns: farmland, scrub, dry earth. */
  warm: number;
  /** Bright sand, salt or snow: little grows. */
  bare: number;
  rgb: [number, number, number];
}

/** Reads a photo pixel (0..1 RGB) as ground. */
export function groundOf(r: number, g: number, b: number): Ground {
  const l = (r + g + b) / 3;
  const green = clamp01((g - (r + b) / 2) / 0.06);
  const dark = clamp01((0.36 - l) / 0.14) * (1 - green);
  const warm = clamp01((r - b) / 0.15) * (1 - dark);
  const bare = clamp01((l - 0.62) / 0.2);
  return { green, dark, warm, bare, rgb: [r, g, b] };
}

export interface ScatterItem {
  kind: ScatterKind;
  x: number;
  y: number;
  /** Ground height under it. */
  z: number;
  /** Scale on the kind's own size. */
  size: number;
  /** Turn about the vertical (rad). */
  turn: number;
  /** Colour multiplier. */
  tint: [number, number, number];
}

/** Per kind: trunk (or rock) radius and height at size 1 (m) for the solid ones, 0 for those driven through. */
export const SOLID: Partial<Record<ScatterKind, { radius: number; height: number }>> = {
  broadleaf: { radius: 0.3, height: 7 }, pine: { radius: 0.3, height: 12 }, umbrella: { radius: 0.35, height: 9 },
  cypress: { radius: 0.35, height: 10 }, palm: { radius: 0.35, height: 9 }, boulder: { radius: 1.1, height: 1.6 },
};
/**
 * Obstacles are fattened by this much (m): the car feels them at eight points round its waist about
 * a metre apart, and a bare trunk could slip between two.
 */
export const SOLID_PAD = 0.5;

/** What the world tells the scatter: the photo under a point, and whether a thing may stand there. */
export interface ScatterWorld {
  /** null where there is no ground to grow on (sea, outside the site, not loaded). */
  ground(x: number, y: number): Ground | null;
  height(x: number, y: number): number;
  /** Clear of roads and buildings by `r` metres. */
  clear(x: number, y: number, r: number): boolean;
  /** The cell's ground (heights, buildings) is in, so what's placed now won't be in the wrong place. */
  ready(x: number, y: number): boolean;
}

/** One layer of things: up to `per1000` a 1000 m², thinned by `chance` of the ground there. */
export interface Layer {
  kinds(spec: ScatterSpec): Partial<Record<ScatterKind, number>>;
  per1000: number;
  chance(g: Ground, spec: ScatterSpec, grove: number): number;
  size: [number, number];
  /** Kept this far (m) from roads and buildings. */
  clearance: number;
  tint(g: Ground, rnd: () => number): [number, number, number];
}

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Dry straw to fresh green with the ground's greenness, each tuft a little different. */
const plantTint = (g: Ground, rnd: () => number): [number, number, number] => {
  const k = 0.85 + 0.3 * rnd(), wet = clamp01(g.green + 0.25 * rnd());
  return [mix(1.15, 0.8, wet) * k, mix(1.0, 1.05, wet) * k, mix(0.75, 0.75, wet) * k];
};
/** Rocks take the colour of the ground they lie on, lifted out of the photo's shade. */
const rockTint = (g: Ground, rnd: () => number): [number, number, number] => {
  const k = 0.9 + 0.25 * rnd();
  return g.rgb.map((c) => clamp01((0.1 + 1.3 * c) * k)) as [number, number, number];
};
const treeTint = (_g: Ground, rnd: () => number): [number, number, number] => {
  const k = 0.85 + 0.3 * rnd();
  return [k * (0.95 + 0.1 * rnd()), k, k * (0.95 + 0.1 * rnd())];
};

/** Close round the car: grass, stones and bushes. */
export const NEAR_LAYERS: Layer[] = [
  {
    kinds: () => ({ grass: 1 }), per1000: 30, size: [0.8, 1.8], clearance: 0.8, tint: plantTint,
    chance: (g, s) => s.density * (0.12 + 0.6 * g.green + 0.35 * g.warm - 0.12 * g.dark - 0.6 * g.bare),
  },
  {
    kinds: () => ({ stone: 1 }), per1000: 24, size: [0.6, 3], clearance: 0.6, tint: rockTint,
    chance: (g, s) => s.density * (0.12 + 0.88 * g.dark - 0.1 * g.green),
  },
  {
    kinds: (s) => s.bushes, per1000: 6, size: [0.6, 1.5], clearance: 1.5, tint: plantTint,
    chance: (g, s) => s.density * (0.12 + 0.45 * g.green + 0.5 * g.warm - 0.06 * g.dark - 0.4 * g.bare),
  },
];

/** Further out, the big things: trees (in groves) and boulders. */
export const FAR_LAYERS: Layer[] = [
  {
    kinds: (s) => s.trees, per1000: 8, size: [0.7, 1.35], clearance: 3, tint: treeTint,
    chance: (g, s, grove) => s.density * (g.green ** 1.5 + s.lone * grove * (1 - 0.7 * g.dark)) * (1 - 0.8 * g.bare),
  },
  {
    kinds: () => ({ boulder: 1 }), per1000: 2.5, size: [0.6, 2], clearance: 2.5, tint: rockTint,
    chance: (g, s) => s.density * (0.12 + 0.88 * g.dark) * (1 - 0.5 * g.green),
  },
];

/** A stable hash of integers to 0..2³². */
function hash(...n: number[]): number {
  let h = 2166136261;
  for (const v of n) {
    h = Math.imul(h ^ (v | 0), 16777619);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

/** Dice seeded by a cell (mulberry32). */
function dice(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth noise over a 300 m grid, 0..4 averaging about 0.9: trees in open ground stand in groves, not evenly. */
export function grove(x: number, y: number): number {
  const S = 300;
  const gx = x / S, gy = y / S, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
  const v = (i: number, j: number) => hash(i, j, 7) / 4294967296;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const n = mix(mix(v(ix, iy), v(ix + 1, iy), sx), mix(v(ix, iy + 1), v(ix + 1, iy + 1), sx), sy);
  return 4 * clamp01((n - 0.35) / 0.65) ** 2;
}

function pick<K extends string>(odds: Partial<Record<K, number>>, r: number): K | null {
  const entries = Object.entries(odds) as [K, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return null;
  let at = r * total;
  for (const [k, w] of entries) if ((at -= w) < 0) return k;
  return entries[entries.length - 1][0];
}

/** Everything in cell (cx, cy) of a `cellM` grid: the same every time it's asked. */
export function scatterCell(layers: Layer[], cellM: number, cx: number, cy: number, world: ScatterWorld, spec: ScatterSpec): ScatterItem[] {
  const items: ScatterItem[] = [];
  layers.forEach((layer, li) => {
    const rnd = dice(hash(cx, cy, li));
    const n = Math.round((layer.per1000 * cellM * cellM) / 1000);
    for (let i = 0; i < n; i++) {
      // Every candidate takes the same dice whether kept or not, so a cell never shuffles.
      const x = (cx + rnd()) * cellM, y = (cy + rnd()) * cellM, keep = rnd(), which = rnd(), size = rnd(), turn = rnd();
      const g = world.ground(x, y);
      if (!g || keep >= layer.chance(g, spec, grove(x, y))) continue;
      const kind = pick(layer.kinds(spec), which);
      if (!kind || !world.clear(x, y, layer.clearance)) continue;
      const z = world.height(x, y);
      if (z < 0.5) continue;
      items.push({ kind, x, y, z, size: mix(layer.size[0], layer.size[1], size * size), turn: turn * 2 * Math.PI, tint: layer.tint(g, rnd) });
    }
  });
  return items;
}

/** The cells within `radiusM` of the car, filled nearest first and dropped once well behind. */
export class ScatterField {
  readonly cells = new Map<number, { cx: number; cy: number; items: ScatterItem[] }>();
  /** Bumped whenever a cell comes or goes. */
  version = 0;

  constructor(
    readonly layers: Layer[],
    readonly cellM: number,
    readonly radiusM: number,
    private readonly world: ScatterWorld,
    private readonly spec: ScatterSpec,
  ) {}

  /** Fills missing cells round (x, y), nearest first, until `budgetMs` is spent; returns whether anything changed. */
  update(x: number, y: number, budgetMs = 2, now: () => number = () => performance.now()): boolean {
    const C = this.cellM, R = this.radiusM, start = now();
    const before = this.version;
    for (const [key, c] of this.cells) {
      if (Math.hypot((c.cx + 0.5) * C - x, (c.cy + 0.5) * C - y) > R * 1.25) {
        this.cells.delete(key);
        this.version++;
      }
    }
    const want: [number, number, number][] = [];
    for (let cy = Math.floor((y - R) / C); cy <= Math.floor((y + R) / C); cy++) {
      for (let cx = Math.floor((x - R) / C); cx <= Math.floor((x + R) / C); cx++) {
        const d = Math.hypot((cx + 0.5) * C - x, (cy + 0.5) * C - y);
        if (d <= R && !this.cells.has(key(cx, cy))) want.push([d, cx, cy]);
      }
    }
    want.sort((a, b) => a[0] - b[0]);
    for (const [, cx, cy] of want) {
      if (!this.world.ready((cx + 0.5) * C, (cy + 0.5) * C)) continue;
      this.cells.set(key(cx, cy), { cx, cy, items: scatterCell(this.layers, C, cx, cy, this.world, this.spec) });
      this.version++;
      if (now() - start > budgetMs) break;
    }
    return this.version !== before;
  }

  /** Drops every cell, to be refilled (the ground under them changed). */
  clear(): void {
    this.cells.clear();
    this.version++;
  }

  /** The way out of a trunk or boulder (x, y, z) is in, or null. */
  solid(x: number, y: number, z: number): WallHit | null {
    const C = this.cellM;
    let best: WallHit | null = null;
    for (let cy = Math.floor(y / C - 0.5); cy <= Math.floor(y / C + 0.5); cy++) {
      for (let cx = Math.floor(x / C - 0.5); cx <= Math.floor(x / C + 0.5); cx++) {
        const cell = this.cells.get(key(cx, cy));
        if (!cell) continue;
        for (const it of cell.items) {
          const s = SOLID[it.kind];
          if (!s || z > it.z + s.height * it.size) continue;
          const r = s.radius * it.size + SOLID_PAD;
          const dx = x - it.x, dy = y - it.y;
          if (Math.abs(dx) > r || Math.abs(dy) > r) continue;
          const d = Math.hypot(dx, dy);
          if (d >= r) continue;
          const depth = r - d;
          if (!best || depth > best.depth) best = d > 1e-6 ? { nx: dx / d, ny: dy / d, depth } : { nx: 1, ny: 0, depth };
        }
      }
    }
    return best;
  }
}

const key = (cx: number, cy: number) => cy * 100000 + cx;
