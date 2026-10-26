// Birds round the camera: flocks wheeling on the breeze, flocks passing over in a loose V, and
// flocks sitting in the fields that scatter into the air when the car comes close. Only the few
// flocks near the camera exist; one that drifts out of range is dropped and another appears
// somewhere in view. Site frame (x east, y north, z up), like everything in sim/.

import type { V3 } from './vec';

export type FlockMode = 'soaring' | 'passing' | 'perched' | 'fleeing';

export interface Bird {
  /** Where it sits in the flock (m): across, along and up its frame, or its own state once fleeing. */
  off: V3;
  /** Flap phase (rad) and its own share of the flock's speed. */
  phase: number;
  /** Once scattered from the ground, each bird flies its own way. */
  pos: V3;
  vel: V3;
}

export interface Flock {
  mode: FlockMode;
  /** Soaring: the centre it circles; passing: its leader; perched: the patch of ground. */
  centre: V3;
  /** Compass heading (rad) a passing flock flies; the angle round the circle a soaring one is at. */
  heading: number;
  speed: number;
  /** Soaring: the circle's radius and which way round (±1). */
  radius: number;
  turn: number;
  /** Seconds since it last changed mode. */
  age: number;
  birds: Bird[];
}

/** What a bird looks like now: where, which way it flies, how hard it flaps (0 gliding … 1, −1 wings folded), its phase. */
export interface BirdPose {
  pos: V3;
  vel: V3;
  flap: number;
  phase: number;
}

export const BIRDS = {
  /** How many flocks of each kind are kept round the camera. */
  soaring: 3,
  passing: 2,
  perched: 2,
  /** Flocks appear between these distances from the camera (m) and go past `drop` (perched ones past `dropPerched`, once left behind). */
  near: 150,
  far: 700,
  drop: 1300,
  dropPerched: 450,
  /** A perched flock takes off when the car comes this close (m). */
  startle: 45,
  /** Fleeing birds regroup into a passing flock after this long (s). */
  regroup: 6,
};

/** The flocks round the camera; `rnd` is the dice (Math.random in the game, seeded in tests). */
export class Birds {
  readonly flocks: Flock[] = [];

  constructor(private readonly rnd: () => number = Math.random) {}

  /**
   * Moves every flock on, startles perched ones near the car, drops far ones and adds new ones
   * round `eye` (the camera). `ground` is the height under a point, `open` whether a perched flock
   * may sit there (dry land, off the road), `onGround` whether the car is on the ground at all, and
   * `heading` the way it's going: perched flocks settle ahead of it.
   */
  update(dt: number, eye: V3, car: V3, heading: number, ground: (x: number, y: number) => number, open: (x: number, y: number) => boolean, onGround: boolean): void {
    for (const f of this.flocks) step(f, dt, car, ground);
    for (let i = this.flocks.length - 1; i >= 0; i--) {
      const f = this.flocks[i], c = f.centre;
      if (Math.hypot(c[0] - eye[0], c[1] - eye[1]) > (f.mode === 'perched' ? BIRDS.dropPerched : BIRDS.drop)) this.flocks.splice(i, 1);
    }
    const count = (m: FlockMode) => this.flocks.filter((f) => f.mode === m || (m === 'passing' && f.mode === 'fleeing')).length;
    if (count('soaring') < BIRDS.soaring) this.add('soaring', eye, ground);
    if (count('passing') < BIRDS.passing) this.add('passing', eye, ground);
    if (onGround && count('perched') < BIRDS.perched) this.perch(car, heading, ground, open);
  }

  /** Every bird's pose this frame. */
  poses(): BirdPose[] {
    return this.flocks.flatMap((f) => f.birds.map((b) => pose(f, b)));
  }

  private add(mode: 'soaring' | 'passing', eye: V3, ground: (x: number, y: number) => number): void {
    const r = this.rnd, d = BIRDS.near + (BIRDS.far - BIRDS.near) * r(), a = r() * 2 * Math.PI;
    const x = eye[0] + Math.sin(a) * d, y = eye[1] + Math.cos(a) * d;
    const z = Math.max(ground(x, y), 0) + 20 + 120 * r() ** 2;
    const n = mode === 'soaring' ? 3 + Math.floor(r() * 7) : 4 + Math.floor(r() * 9);
    // A passing flock crosses the camera's patch of sky rather than leaving it at once.
    const heading = mode === 'passing' ? Math.atan2(eye[0] - x, eye[1] - y) + (r() - 0.5) * 1.6 : r() * 2 * Math.PI;
    this.flocks.push({
      mode, centre: [x, y, z], heading, speed: mode === 'soaring' ? 7 + 4 * r() : 10 + 5 * r(),
      radius: 35 + 90 * r(), turn: r() < 0.5 ? -1 : 1, age: 0,
      birds: Array.from({ length: n }, (_, i) => {
        // Soaring: spread round the circle, each at its own height; passing: a loose V behind the leader.
        const side = i % 2 ? 1 : -1, rank = Math.ceil(i / 2);
        const off: V3 = mode === 'soaring'
          ? [(r() - 0.5) * 30, r() * 2 * Math.PI, (r() - 0.5) * 25]
          : [side * rank * (2.5 + r()), -rank * (2 + r()), (r() - 0.5) * 2];
        return { off, phase: r() * 2 * Math.PI, pos: [0, 0, 0], vel: [0, 0, 0] };
      }),
    });
  }

  /** A flock settles in a field ahead of the car, if there's open ground there. */
  private perch(car: V3, heading: number, ground: (x: number, y: number) => number, open: (x: number, y: number) => boolean): void {
    const r = this.rnd, d = 120 + 200 * r(), a = heading + (r() - 0.5) * 1.4;
    const x = car[0] + Math.sin(a) * d, y = car[1] + Math.cos(a) * d;
    if (!open(x, y) || ground(x, y) < 1) return;
    const n = 5 + Math.floor(r() * 10);
    this.flocks.push({
      mode: 'perched', centre: [x, y, ground(x, y)], heading: 0, speed: 0, radius: 0, turn: 1, age: 0,
      birds: Array.from({ length: n }, () => {
        const ox = (r() - 0.5) * 14, oy = (r() - 0.5) * 14;
        return { off: [ox, oy, r() * 2 * Math.PI], phase: r() * 2 * Math.PI, pos: [x + ox, y + oy, ground(x + ox, y + oy)], vel: [0, 0, 0] };
      }),
    });
  }
}

function step(f: Flock, dt: number, car: V3, ground: (x: number, y: number) => number): void {
  f.age += dt;
  if (f.mode === 'soaring') {
    f.heading += (f.turn * f.speed * dt) / f.radius;
  } else if (f.mode === 'passing') {
    f.centre[0] += Math.sin(f.heading) * f.speed * dt;
    f.centre[1] += Math.cos(f.heading) * f.speed * dt;
  } else if (f.mode === 'perched') {
    if (Math.hypot(f.centre[0] - car[0], f.centre[1] - car[1]) < BIRDS.startle) scatter(f, car);
  } else {
    // Fleeing: away from the car and up, each its own way, then they form up and fly on.
    for (const b of f.birds) {
      b.vel[2] += (4 - b.vel[2]) * Math.min(dt, 1) * 0.5;
      for (let i = 0; i < 3; i++) b.pos[i] += b.vel[i] * dt;
      b.pos[2] = Math.max(b.pos[2], ground(b.pos[0], b.pos[1]) + 0.3);
    }
    if (f.age > BIRDS.regroup) regroup(f);
  }
}

/** The car's too close: every bird takes off away from it. */
function scatter(f: Flock, car: V3): void {
  f.mode = 'fleeing';
  f.age = 0;
  for (const b of f.birds) {
    const dx = b.pos[0] - car[0], dy = b.pos[1] - car[1], d = Math.hypot(dx, dy) || 1;
    const spread = (b.phase - Math.PI) * 0.25, ux = dx / d, uy = dy / d;
    const c = Math.cos(spread), s = Math.sin(spread), speed = 9 + 2 * Math.sin(b.phase * 3);
    b.vel = [(ux * c - uy * s) * speed, (ux * s + uy * c) * speed, 5];
  }
}

/** Fled far enough: the flock forms up behind its leader and flies on the way they were going. */
function regroup(f: Flock): void {
  const n = f.birds.length;
  const mean = (k: 0 | 1 | 2, of: 'pos' | 'vel') => f.birds.reduce((s, b) => s + b[of][k], 0) / n;
  f.mode = 'passing';
  f.age = 0;
  f.centre = [mean(0, 'pos'), mean(1, 'pos'), mean(2, 'pos') + 10];
  f.heading = Math.atan2(mean(0, 'vel'), mean(1, 'vel'));
  f.speed = 12;
  f.birds.forEach((b, i) => {
    const side = i % 2 ? 1 : -1, rank = Math.ceil(i / 2);
    b.off = [side * rank * 3, -rank * 2.5, 0];
  });
}

function pose(f: Flock, b: Bird): BirdPose {
  const [cx, cy, cz] = f.centre;
  if (f.mode === 'soaring') {
    // Off: [radius offset, angle offset, height offset]. The odd flap between long glides.
    const a = f.heading + b.off[1], r = f.radius + b.off[0];
    const tang = a + (f.turn * Math.PI) / 2;
    const flapping = Math.sin(f.age * 0.4 + b.phase) > 0.75 ? 0.8 : 0.06;
    return {
      pos: [cx + Math.sin(a) * r, cy + Math.cos(a) * r, cz + b.off[2] + 3 * Math.sin(f.age * 0.3 + b.phase)],
      vel: [Math.sin(tang) * f.speed, Math.cos(tang) * f.speed, 0], flap: flapping, phase: b.phase,
    };
  }
  if (f.mode === 'passing') {
    const s = Math.sin(f.heading), c = Math.cos(f.heading);
    const [across, along, up] = b.off;
    return {
      pos: [cx + c * across + s * along, cy - s * across + c * along, cz + up + 0.6 * Math.sin(f.age * 0.7 + b.phase)],
      vel: [s * f.speed, c * f.speed, 0], flap: 0.7, phase: b.phase,
    };
  }
  if (f.mode === 'perched') {
    // Off holds which way it faces in [2]; a slow walk is too much, so they just stand.
    const h = b.off[2];
    return { pos: b.pos, vel: [Math.sin(h) * 0.01, Math.cos(h) * 0.01, 0], flap: -1, phase: b.phase };
  }
  return { pos: b.pos, vel: b.vel, flap: 1, phase: b.phase };
}
