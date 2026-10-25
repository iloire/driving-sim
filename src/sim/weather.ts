// The weather a zone offers (site.json's `weather`) and the clouds it puts in the sky. The clouds
// are clusters of puffs scattered over a square a bit larger than the site, which repeats: the
// wind slides the whole sky along and what leaves one side comes back on the other, so there are
// always clouds round the car and none piles up downwind. Sim frame (x east, y north, z up, m).

/** A clear sky: what a zone without `weather` in its site.json gets. */
export const CLEAR: WeatherSpec = { id: 'clear', name: { en: 'Clear', es: 'Despejado' } };

/** One layer of cloud: cumulus, a deck, a thin high sheet; the shapes come out of these numbers. */
export interface CloudLayer {
  /** Heights of the flat bottom and the tallest tops (m above the sea). */
  base: number;
  top: number;
  /** 0..1: how much of the sky the layer covers. */
  cover: number;
  /** A typical cloud's radius (m). */
  size: number;
  /** Only within [west, south, east, north], fractions of the site (0..1, beyond it over the sea); omitted = everywhere. */
  box?: [number, number, number, number];
}

export interface WeatherSpec {
  id: string;
  name: Record<string, string>;
  layers?: CloudLayer[];
  /** The wind the clouds drift on, [east, north] m/s; omitted = still. */
  wind?: [number, number];
  /** Haze, times the usual (calima: about 2); omitted = 1. */
  haze?: number;
  /** The haze's colour by day (calima's dust), as #rrggbb; omitted = the usual blue-grey. */
  hazeColor?: string;
  /** The sun's strength, times the usual (overcast is less); omitted = 1. */
  light?: number;
}

export interface Puff {
  x: number;
  y: number;
  z: number;
  r: number;
  /** From the middle of its cloud's base to the puff (m): which way it faces, for the light. */
  dx: number;
  dy: number;
  dz: number;
  /** Its layer's base and top. */
  base: number;
  top: number;
  /** 0..1, to vary its texture. */
  seed: number;
}

/** The repeating square is this much bigger than the site, so the clouds reach out over the sea. */
const SKY_SCALE = 1.6;

/** A small fast seeded random: the same seed, the same sky. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A string's seed, so a preset always draws the same clouds. */
export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** `v` moved by whole periods to within half a period of `around`. */
export function wrapNear(v: number, around: number, period: number): number {
  return around + ((((v - around + period / 2) % period) + period) % period) - period / 2;
}

export class CloudField {
  readonly puffs: Puff[] = [];
  /** The repeating square's side (m) and its south-west corner. */
  readonly period: number;
  readonly origin: [number, number];
  /** How far the wind has carried the sky so far (m), within one period. */
  readonly drift: [number, number] = [0, 0];
  private readonly cell: number;
  private readonly cells: number;
  private readonly grid: Puff[][];

  /** `amount` scales the number of clouds (fewer on a phone). */
  constructor(layers: readonly CloudLayer[], extent: number, seed: number, amount = 1) {
    this.period = extent * SKY_SCALE;
    const o = (extent - this.period) / 2;
    this.origin = [o, o];
    const rand = rng(seed);
    for (const layer of layers) {
      // No box: the whole repeating square. A box is clipped to it.
      const end = o + this.period;
      const [w, s, e, n] = layer.box ?? [o / extent, o / extent, end / extent, end / extent];
      const bx0 = Math.max(w * extent, o), bx1 = Math.min(e * extent, end);
      const by0 = Math.max(s * extent, o), by1 = Math.min(n * extent, end);
      const area = Math.max(bx1 - bx0, 0) * Math.max(by1 - by0, 0);
      const clouds = Math.round((layer.cover * area * amount) / (Math.PI * layer.size * layer.size));
      const depth = layer.top - layer.base;
      for (let c = 0; c < clouds; c++) {
        const cx = bx0 + rand() * (bx1 - bx0), cy = by0 + rand() * (by1 - by0);
        const size = layer.size * (0.6 + 0.8 * rand());
        const tall = depth * (0.45 + 0.55 * rand()) * Math.min(size / layer.size, 1.2);
        const count = Math.round(7 + 7 * (size / layer.size));
        for (let i = 0; i < count; i++) {
          // Wide at the base, narrowing up into a dome.
          const up = rand() ** 0.8;
          const spread = size * (1 - 0.6 * up);
          const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * spread;
          const r = Math.min(size * (0.5 - 0.2 * up) * (0.8 + 0.4 * rand()), depth * 0.9 + size * 0.15);
          const dz = Math.min(up * tall + r * 0.3, depth);
          this.puffs.push({
            x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, z: layer.base + dz, r,
            dx: Math.cos(a) * d, dy: Math.sin(a) * d, dz, base: layer.base, top: layer.top, seed: rand(),
          });
        }
      }
    }
    // A grid over the square for the inside test: a puff sits in the cell of its centre.
    const biggest = this.puffs.reduce((m, p) => Math.max(m, p.r), 1);
    this.cells = Math.max(1, Math.floor(this.period / Math.max(biggest, 400)));
    this.cell = this.period / this.cells;
    this.grid = Array.from({ length: this.cells * this.cells }, () => []);
    for (const p of this.puffs) this.grid[this.cellOf(p.x - o, p.y - o)].push(p);
  }

  private cellOf(u: number, v: number): number {
    const n = this.cells;
    const i = ((Math.floor(u / this.cell) % n) + n) % n, j = ((Math.floor(v / this.cell) % n) + n) % n;
    return j * n + i;
  }

  /** The wind carries the sky `dt` seconds on. */
  step(dt: number, wind: readonly [number, number]): void {
    for (const k of [0, 1] as const) this.drift[k] = (((this.drift[k] + wind[k] * dt) % this.period) + this.period) % this.period;
  }

  /** Where a puff is now, carried by the wind, in the copy of the sky nearest (x, y). */
  at(p: Puff, x: number, y: number): [number, number] {
    return [wrapNear(p.x + this.drift[0], x, this.period), wrapNear(p.y + this.drift[1], y, this.period)];
  }

  /** 0 in clear air … 1 deep in a cloud, at a point. */
  density(x: number, y: number, z: number): number {
    // Back into the still sky, where the grid is.
    const u = x - this.drift[0] - this.origin[0], v = y - this.drift[1] - this.origin[1];
    let most = 0;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        for (const p of this.grid[this.cellOf(u + di * this.cell, v + dj * this.cell)]) {
          if (z < p.base) continue;
          const [px, py] = this.at(p, x, y);
          const d = Math.hypot(x - px, y - py, (z - p.z) * 1.25) / p.r;
          if (d < 1) most = Math.max(most, 1 - smoothstep(0.5, 1, d));
        }
      }
    }
    return most;
  }
}
