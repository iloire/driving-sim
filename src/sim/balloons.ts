// The balloon game: big party balloons float over the island around the car; fly (or jump) through
// one to pop it. A field keeps a fixed number of them in a ring around the car, respawning popped
// and far-behind ones ahead of time, so there is always something to chase. Hits test the whole
// path the car moved since the last check, so a 600 km/h pass can't step over a balloon.
// Scoring: 100 a balloon plus a speed bonus, times a combo that grows while pops come within
// COMBO_WINDOW seconds of each other.

export interface Balloon {
  id: number;
  x: number;
  y: number;
  /** Height of the balloon's centre above sea level (m). */
  z: number;
  /** Index into the view's colour palette. */
  colour: number;
  /** Phase of its gentle bob, so they don't all move together. */
  phase: number;
}

export interface Pop {
  balloon: Balloon;
  points: number;
  combo: number;
}

export const BALLOON_RADIUS = 5;
/** The car's reach around its centre: half the wingspan, near enough. */
export const CAR_REACH = 4;
export const COMBO_WINDOW = 4;
const MAX_COMBO = 5;
const COLOURS = 6;

export interface FieldOptions {
  count: number;
  /** Balloons spawn this far from the car (m)… */
  near: number;
  far: number;
  /** …and are moved on once further than this. */
  drop: number;
  /** Height above the ground of a balloon's centre (m). */
  minAgl: number;
  maxAgl: number;
}

export const DEFAULT_FIELD: FieldOptions = { count: 40, near: 300, far: 2500, drop: 3500, minAgl: 40, maxAgl: 400 };

/** Small seeded PRNG (mulberry32), so a field is reproducible in tests. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Distance from point p to the segment a→b, all in 3D. */
export function segmentDistance(ax: number, ay: number, az: number, bx: number, by: number, bz: number,
  px: number, py: number, pz: number): number {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len2 = dx * dx + dy * dy + dz * dz;
  const t = len2 > 0 ? Math.min(Math.max(((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / len2, 0), 1) : 0;
  return Math.hypot(ax + t * dx - px, ay + t * dy - py, az + t * dz - pz);
}

export class BalloonField {
  readonly balloons: Balloon[] = [];
  score = 0;
  popped = 0;
  combo = 0;
  /** Seconds since the last pop (Infinity before the first). */
  sinceLast = Infinity;
  private nextId = 0;
  private readonly rand: () => number;

  constructor(
    /** Ground height at a point of the site frame. */
    private readonly ground: (x: number, y: number) => number,
    /** Whether a point is inside the site (balloons stay over the map). */
    private readonly inside: (x: number, y: number) => boolean,
    private readonly opts: FieldOptions = DEFAULT_FIELD,
    seed = 1,
  ) {
    this.rand = random(seed);
  }

  /** Fills the field around the car (call once it is placed, and after a respawn). */
  fill(x: number, y: number): void {
    this.balloons.length = 0;
    for (let i = 0; i < this.opts.count; i++) this.spawn(x, y);
  }

  private spawn(cx: number, cy: number): void {
    const o = this.opts;
    for (let tries = 0; tries < 20; tries++) {
      const a = this.rand() * Math.PI * 2;
      // Uniform over the ring's area, not bunched at its inner edge.
      const r = Math.sqrt(o.near * o.near + this.rand() * (o.far * o.far - o.near * o.near));
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (!this.inside(x, y)) continue;
      const z = Math.max(this.ground(x, y), 0) + o.minAgl + this.rand() * (o.maxAgl - o.minAgl);
      this.balloons.push({ id: this.nextId++, x, y, z, colour: Math.floor(this.rand() * COLOURS), phase: this.rand() * Math.PI * 2 });
      return;
    }
  }

  /**
   * Advances the field: pops every balloon the car's path from `from` to `to` (site frame, z up)
   * passed through, scores them, and keeps the field full around `to`. `speed` in m/s.
   */
  update(dt: number, from: [number, number, number], to: [number, number, number], speed: number): Pop[] {
    this.sinceLast += dt;
    if (this.sinceLast > COMBO_WINDOW) this.combo = 0;
    const pops: Pop[] = [];
    const reach = BALLOON_RADIUS + CAR_REACH;
    for (let i = this.balloons.length - 1; i >= 0; i--) {
      const b = this.balloons[i];
      if (segmentDistance(from[0], from[1], from[2], to[0], to[1], to[2], b.x, b.y, b.z) > reach) continue;
      this.balloons.splice(i, 1);
      this.combo = Math.min(this.combo + 1, MAX_COMBO);
      this.sinceLast = 0;
      // 100 a balloon, +10 for every 36 km/h, times the combo.
      const points = Math.round((100 + Math.floor(speed / 10) * 10) * this.combo);
      this.score += points;
      this.popped++;
      pops.push({ balloon: b, points, combo: this.combo });
    }
    // Move on the ones left far behind, and top the field back up.
    for (let i = this.balloons.length - 1; i >= 0; i--) {
      const b = this.balloons[i];
      if (Math.hypot(b.x - to[0], b.y - to[1]) > this.opts.drop) this.balloons.splice(i, 1);
    }
    while (this.balloons.length < this.opts.count) {
      const before = this.balloons.length;
      this.spawn(to[0], to[1]);
      if (this.balloons.length === before) break; // nowhere inside the map to put one
    }
    return pops;
  }

  /** Starts a new round: score, combo and field reset around (x, y). */
  reset(x: number, y: number): void {
    this.score = 0;
    this.popped = 0;
    this.combo = 0;
    this.sinceLast = Infinity;
    this.fill(x, y);
  }
}
