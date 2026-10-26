// Traffic: cars driving the paved roads round the camera, in the right-hand lane, at the road's
// pace, slowing for bends and for whatever is ahead of them (another car, or yours), and picking a
// road at random (straight on the likeliest) where theirs ends. They are solid: the car pushes off
// them like a wall that moves, and they take the push back, so a hit sends one sliding and
// spinning across the road as a wreck, which drives on again if it came to rest in its lane.
// Only a dozen or so exist, round the camera; one far behind is dropped and another appears out of
// sight down some road. Site frame (x east, y north, z up).

import { ROAD_WIDTH, type Road, type RoadIndex, type RoadKind } from './roads';
import type { WallContact } from './car';
import type { V3 } from './vec';

export const TRAFFIC = {
  count: 14,
  /** New cars appear this far from the camera (m), and go past `drop`. */
  spawnMin: 220,
  spawnMax: 650,
  drop: 900,
  /** A wreck goes once this old (s) and out of the way. */
  wreckLife: 40,
  /** Gap kept to whatever's ahead (m), standing. */
  gap: 8,
  accel: 2.5,
  brake: 7,
  /** Sideways grip on a bend (m/s²): sets how slow it takes one. */
  corner: 3,
  mass: 1300,
  /** Half-length and half-width of the body (m), and its height. */
  half: [2.2, 0.9] as [number, number],
  height: 1.5,
};
/** Inertia about the vertical (kg m²): a 4.4 × 1.8 m box. */
const YAW_INERTIA = (TRAFFIC.mass * (4.4 ** 2 + 1.8 ** 2)) / 12;
/** Corners of the player's car can poke this far between the points it feels walls at (m). */
const PAD = 0.3;

/** Cruising speed (m/s) by road; roads not listed carry no traffic. */
export const PACE: Partial<Record<RoadKind, number>> = { highway: 27, primary: 22, secondary: 19, tertiary: 15, minor: 11 };

export interface TrafficCar {
  road: Road;
  /** Index of the vertex it last passed, and which way along the road it's going (±1). */
  k: number;
  dir: 1 | -1;
  /** Metres past vertex k. */
  along: number;
  speed: number;
  /** The fastest the road ahead allows (bends), refreshed a few times a second. */
  limit: number;
  limitAge: number;
  pos: V3;
  /** Compass heading (rad), eased round corners; and its rate once wrecked. */
  heading: number;
  spin: number;
  vel: V3;
  braking: boolean;
  /** Which model and colour (indices the view maps). */
  look: number;
  /** Set once it's been hit: how long ago, and how long it's been still. */
  wreck: { age: number; still: number } | null;
}

/** What traffic needs of the world. */
export interface TrafficWorld {
  roads: RoadIndex;
  height(x: number, y: number): number;
  /** The way out of a building, for a wreck sliding into one. */
  wall?(x: number, y: number, z: number): { nx: number; ny: number; depth: number } | null;
}

const vertex = (r: Road, k: number): [number, number] => [r.pts[2 * k], r.pts[2 * k + 1]];
const count = (r: Road) => r.pts.length / 2;
/** Compass heading from a to b. */
const bearing = (a: [number, number], b: [number, number]) => Math.atan2(b[0] - a[0], b[1] - a[1]);
/** The signed smallest turn from heading a to b. */
const turnTo = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const driven = (r: Road) => !r.bridge && PACE[r.kind] !== undefined;

export class Traffic {
  readonly cars: TrafficCar[] = [];
  /** How many cars have been hit so far: the crash sound listens for it going up. */
  hits = 0;

  constructor(private readonly world: TrafficWorld, private readonly rnd: () => number = Math.random) {}

  /**
   * Moves everything on by `dt`, keeping clear of `others` (the player's car: where, how fast),
   * then drops far cars and adds new ones round `eye`.
   */
  step(dt: number, eye: V3, others: { pos: V3; vel: V3 }[]): void {
    for (const c of this.cars) {
      if (c.wreck) this.slide(c, dt);
      else this.drive(c, dt, others);
    }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i], d = Math.hypot(c.pos[0] - eye[0], c.pos[1] - eye[1]);
      if (d > TRAFFIC.drop || (c.wreck && c.wreck.age > TRAFFIC.wreckLife && d > 120)) this.cars.splice(i, 1);
    }
    if (this.cars.length < TRAFFIC.count) this.spawn(eye);
  }

  /** The way out of whichever car (x, y, z) is in, moving with it and taking the push back. */
  contact(x: number, y: number, z: number): WallContact | null {
    const [hx, hy] = TRAFFIC.half;
    for (const c of this.cars) {
      const dx = x - c.pos[0], dy = y - c.pos[1];
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3 || z > c.pos[2] + TRAFFIC.height || z < c.pos[2] - 0.5) continue;
      const s = Math.sin(c.heading), co = Math.cos(c.heading);
      const fwd = dx * s + dy * co, right = dx * co - dy * s;
      const px = hx + PAD - Math.abs(fwd), py = hy + PAD - Math.abs(right);
      if (px <= 0 || py <= 0) continue;
      // Out the nearest side: the nose or tail, or a flank.
      const [nx, ny, depth] = px < py
        ? [Math.sign(fwd) * s, Math.sign(fwd) * co, px]
        : [Math.sign(right) * co, -Math.sign(right) * s, py];
      return { nx, ny, depth, vel: c.vel, react: (f, at, h) => this.push(c, f, at, h) };
    }
    return null;
  }

  /** A force on a car: it's a wreck from now on, flung by it. */
  private push(c: TrafficCar, f: V3, at: V3, dt: number): void {
    if (!c.wreck) {
      c.wreck = { age: 0, still: 0 };
      this.hits++;
    }
    c.vel[0] += (f[0] * dt) / TRAFFIC.mass;
    c.vel[1] += (f[1] * dt) / TRAFFIC.mass;
    // Torque about the vertical; a compass heading turns the other way to the maths angle.
    const rx = at[0] - c.pos[0], ry = at[1] - c.pos[1];
    c.spin -= ((rx * f[1] - ry * f[0]) * dt) / YAW_INERTIA;
  }

  private drive(c: TrafficCar, dt: number, others: { pos: V3; vel: V3 }[]): void {
    if ((c.limitAge -= dt) <= 0) {
      c.limit = this.bendLimit(c);
      c.limitAge = 0.25;
    }
    // Slow for whatever is in the lane ahead.
    let want = Math.min(PACE[c.road.kind] ?? 11, c.limit);
    const s = Math.sin(c.heading), co = Math.cos(c.heading);
    const ahead = (p: V3) => {
      const dx = p[0] - c.pos[0], dy = p[1] - c.pos[1];
      const fwd = dx * s + dy * co, side = Math.abs(dx * co - dy * s);
      if (fwd > 0 && fwd < 70 && side < 2.4) want = Math.min(want, Math.max(0, (fwd - TRAFFIC.gap) * 0.6));
    };
    for (const o of others) ahead(o.pos);
    for (const o of this.cars) if (o !== c) ahead(o.pos);
    c.braking = want < c.speed - 0.5;
    c.speed = c.braking ? Math.max(want, c.speed - TRAFFIC.brake * dt) : Math.min(want, c.speed + TRAFFIC.accel * dt);
    this.advance(c, c.speed * dt);
    this.place(c, dt);
  }

  /** On along the road; at its end onto another road there, or round if there's none. */
  private advance(c: TrafficCar, ds: number): void {
    for (let guard = 0; guard < 50; guard++) {
      const next = c.k + c.dir;
      if (next < 0 || next >= count(c.road)) {
        if (!this.junction(c)) c.dir = -c.dir as 1 | -1;
        continue;
      }
      const a = vertex(c.road, c.k), b = vertex(c.road, next), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (c.along + ds < len) {
        c.along += ds;
        return;
      }
      ds -= len - c.along;
      c.along = 0;
      c.k = next;
    }
  }

  /** At the end of its road: picks another road through this point, the straighter the likelier. */
  private junction(c: TrafficCar): boolean {
    const [x, y] = vertex(c.road, c.k);
    const back = vertex(c.road, c.k - c.dir);
    const coming = bearing(back, [x, y]);
    const options: { road: Road; k: number; dir: 1 | -1; w: number }[] = [];
    for (const { road, i } of this.world.roads.within(x, y, 0.5)) {
      if (road === c.road || !driven(road)) continue;
      for (const k of [i / 2, i / 2 + 1]) {
        const [vx, vy] = vertex(road, k);
        if (Math.hypot(vx - x, vy - y) > 0.3) continue;
        for (const dir of [1, -1] as const) {
          if (k + dir < 0 || k + dir >= count(road) || options.some((o) => o.road === road && o.k === k && o.dir === dir)) continue;
          const turn = Math.abs(turnTo(coming, bearing([vx, vy], vertex(road, k + dir))));
          if (turn < 2.4) options.push({ road, k, dir, w: 0.3 + Math.max(Math.cos(turn), 0) * 3 });
        }
      }
    }
    if (!options.length) return false;
    let at = this.rnd() * options.reduce((sum, o) => sum + o.w, 0);
    const pick = options.find((o) => (at -= o.w) < 0) ?? options[options.length - 1];
    Object.assign(c, { road: pick.road, k: pick.k, dir: pick.dir, along: 0, limitAge: 0 });
    return true;
  }

  /** The bend in the next 40 m of its road, as the fastest it can take it. */
  private bendLimit(c: TrafficCar): number {
    let k = c.k, dist = -c.along, sharpest = 0, first: number | null = null;
    while (dist < 40 && k + c.dir >= 0 && k + c.dir < count(c.road)) {
      const a = vertex(c.road, k), b = vertex(c.road, k + c.dir);
      const h = bearing(a, b), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (first === null) first = h;
      // Turn per metre from here: a long gentle curve and a hairpin both show.
      else sharpest = Math.max(sharpest, Math.abs(turnTo(first, h)) / Math.max(dist, 12));
      dist += len;
      k += c.dir;
    }
    return sharpest > 1e-4 ? Math.max(Math.sqrt(TRAFFIC.corner / sharpest), 4) : Infinity;
  }

  /** Puts it in its lane: the centreline point plus the lane's offset to the right of its eased heading. */
  private place(c: TrafficCar, dt: number): void {
    const n = count(c.road), next = Math.min(Math.max(c.k + c.dir, 0), n - 1);
    const a = vertex(c.road, c.k), b = vertex(c.road, next), len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const along = bearing(a, b);
    const old = c.heading;
    c.heading += turnTo(c.heading, along) * Math.min(1, dt * (2 + c.speed / 4));
    const lane = ROAD_WIDTH[c.road.kind] / 4;
    const t = Math.min(c.along / len, 1);
    const x = a[0] + (b[0] - a[0]) * t + Math.cos(c.heading) * lane, y = a[1] + (b[1] - a[1]) * t - Math.sin(c.heading) * lane;
    const z = this.world.height(x, y);
    c.vel = dt > 0 ? [(x - c.pos[0]) / dt, (y - c.pos[1]) / dt, 0] : c.vel;
    c.spin = dt > 0 ? turnTo(old, c.heading) / dt : 0;
    c.pos = [x, y, z];
  }

  /** A wreck slides and spins to a stop on its tyres' grip; once still in a lane it drives on. */
  private slide(c: TrafficCar, dt: number): void {
    const w = c.wreck!;
    w.age += dt;
    const v = Math.hypot(c.vel[0], c.vel[1]);
    const stop = Math.min(v, 7 * dt);
    if (v > 1e-6) {
      c.vel[0] -= (c.vel[0] / v) * stop;
      c.vel[1] -= (c.vel[1] / v) * stop;
    }
    c.spin *= Math.exp(-2.5 * dt);
    c.heading += c.spin * dt;
    c.pos[0] += c.vel[0] * dt;
    c.pos[1] += c.vel[1] * dt;
    const hit = this.world.wall?.(c.pos[0], c.pos[1], c.pos[2] + 0.5);
    if (hit) {
      c.pos[0] += hit.nx * hit.depth;
      c.pos[1] += hit.ny * hit.depth;
      const vn = c.vel[0] * hit.nx + c.vel[1] * hit.ny;
      if (vn < 0) {
        c.vel[0] -= vn * hit.nx;
        c.vel[1] -= vn * hit.ny;
      }
    }
    c.pos[2] = this.world.height(c.pos[0], c.pos[1]);
    c.speed = 0;
    w.still = v < 0.3 && Math.abs(c.spin) < 0.1 ? w.still + dt : 0;
    if (w.still > 3) this.recover(c);
  }

  /** Back on the road if it came to rest in a lane, more or less facing along it. */
  private recover(c: TrafficCar): void {
    const hit = this.world.roads.nearest(c.pos[0], c.pos[1], 4, driven);
    if (!hit) return;
    const facing = Math.abs(turnTo(hit.heading, c.heading));
    if (facing > 0.6 && facing < Math.PI - 0.6) return;
    const dir: 1 | -1 = facing <= 0.6 ? 1 : -1;
    const p = hit.road.pts;
    // The vertex behind it going that way.
    let k = 0, best = Infinity;
    for (let j = 0; j + 1 < count(hit.road); j++) {
      const d = Math.hypot(p[2 * j] - hit.x, p[2 * j + 1] - hit.y) + Math.hypot(p[2 * j + 2] - hit.x, p[2 * j + 3] - hit.y) - Math.hypot(p[2 * j + 2] - p[2 * j], p[2 * j + 3] - p[2 * j + 1]);
      if (d < best) { best = d; k = j; }
    }
    if (dir === -1) k += 1;
    const [vx, vy] = vertex(hit.road, k);
    Object.assign(c, { road: hit.road, k, dir, along: Math.hypot(hit.x - vx, hit.y - vy), speed: 0, limitAge: 0, wreck: null, spin: 0 });
  }

  /** A new car out of sight down some road near `eye`, clear of the others. */
  private spawn(eye: V3): void {
    const r = this.rnd, d = TRAFFIC.spawnMin + (TRAFFIC.spawnMax - TRAFFIC.spawnMin) * r(), a = r() * 2 * Math.PI;
    const x = eye[0] + Math.sin(a) * d, y = eye[1] + Math.cos(a) * d;
    const segs = this.world.roads.within(x, y, 80).filter((s) => driven(s.road));
    if (!segs.length) return;
    const { road, i } = segs[Math.floor(r() * segs.length)];
    const dir: 1 | -1 = r() < 0.5 ? 1 : -1;
    const k = dir === 1 ? i / 2 : i / 2 + 1;
    const a0 = vertex(road, k), b0 = vertex(road, k + dir);
    const len = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]), along = r() * len;
    const cx = a0[0] + ((b0[0] - a0[0]) * along) / len, cy = a0[1] + ((b0[1] - a0[1]) * along) / len;
    if (this.world.height(cx, cy) < 0 || Math.hypot(cx - eye[0], cy - eye[1]) < TRAFFIC.spawnMin * 0.8) return;
    if (this.cars.some((o) => Math.hypot(o.pos[0] - cx, o.pos[1] - cy) < 40)) return;
    const pace = PACE[road.kind]!;
    const c: TrafficCar = {
      road, k, dir, along, speed: pace * 0.8, limit: Infinity, limitAge: 0, pos: [cx, cy, 0], heading: bearing(a0, b0), spin: 0,
      vel: [0, 0, 0], braking: false, look: Math.floor(r() * 1e6), wreck: null,
    };
    this.place(c, 0);
    this.cars.push(c);
  }
}
