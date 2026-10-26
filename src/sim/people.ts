// People on the pavements in town: they walk the kerbside of a street (where the street lamps
// are) at their own pace, turning back at its end. A car coming straight at one makes them jump
// clear; one that hits them sends them tumbling through the air like a skittle, and they lie a
// moment, get up, and wander off. Only a couple of dozen exist, round the camera, and only where
// there are lamps (in town). Site frame (x east, y north, z up).

import { ROAD_WIDTH, type Road, type RoadIndex } from './roads';
import type { V3 } from './vec';

export const PEOPLE = {
  count: 24,
  /** New people appear this far from the camera (m), and go past `drop`. */
  spawnMin: 70,
  spawnMax: 220,
  drop: 320,
  /** How far past the kerb they walk (m). */
  kerb: 1.6,
  /** Seconds to react to a car coming at them (they freeze if it's closer than `freeze`), and to jump clear. */
  react: 0.35,
  freeze: 0.5,
  dodge: 1.1,
  /** Seconds lying down after a fall, and getting up. */
  down: 2.5,
  rise: 1,
};

export type PersonState = 'walk' | 'dodge' | 'wander' | 'flying' | 'down' | 'rise';

export interface Person {
  state: PersonState;
  /** Walking a street: its road, the vertex last passed, which way (±1), metres past it, which kerb (±1, right of the road's drawn way). */
  road: Road;
  k: number;
  dir: 1 | -1;
  along: number;
  side: 1 | -1;
  speed: number;
  pos: V3;
  vel: V3;
  /** Compass heading (rad) the body faces. */
  heading: number;
  /** Stride phase (rad), for the swing of arms and legs. */
  phase: number;
  /** Tumbling: angle (rad) about the axis across its flight, and how fast it turns. */
  tumble: number;
  spin: number;
  /** Seconds left in the current state (dodge, down, rise). */
  timer: number;
  look: number;
}

/** What the people need of the world: the roads, the ground, and the street lamps near a point. */
export interface PeopleWorld {
  roads: RoadIndex;
  height(x: number, y: number): number;
  lamps(x: number, y: number, r: number): { x: number; y: number }[];
  /** The way out of a building, so nobody walks or flies through one. */
  wall?(x: number, y: number, z: number): { nx: number; ny: number; depth: number } | null;
}

/** The car, as far as people care: where its centre is, which way it points, how big it is and how fast. */
export interface Hitter {
  pos: V3;
  vel: V3;
  heading: number;
  /** Half-length forward and back, half-width, and height above `pos` (m). */
  front: number;
  back: number;
  side: number;
  top: number;
}

const count = (r: Road) => r.pts.length / 2;
const vertex = (r: Road, k: number): [number, number] => [r.pts[2 * k], r.pts[2 * k + 1]];
const walkable = (r: Road) => !r.bridge && r.kind !== 'runway' && r.kind !== 'track' && r.kind !== 'highway';
const G = 9.81;

export class People {
  readonly people: Person[] = [];
  /** How many have been knocked over: the thud listens for it going up. */
  hits = 0;

  constructor(private readonly world: PeopleWorld, private readonly rnd: () => number = Math.random) {}

  step(dt: number, eye: V3, car: Hitter | null): void {
    for (const p of this.people) {
      if (car && (p.state === 'walk' || p.state === 'wander' || p.state === 'dodge')) {
        if (this.struck(p, car)) continue;
        if (p.state !== 'dodge') this.lookOut(p, car);
      }
      this.move(p, dt);
    }
    for (let i = this.people.length - 1; i >= 0; i--) {
      const p = this.people[i];
      if (Math.hypot(p.pos[0] - eye[0], p.pos[1] - eye[1]) > PEOPLE.drop) this.people.splice(i, 1);
    }
    if (this.people.length < PEOPLE.count) this.spawn(eye);
  }

  /** In the car's way: knocked flying, the way it was going and up, faster the faster it was. */
  private struck(p: Person, car: Hitter): boolean {
    const dx = p.pos[0] - car.pos[0], dy = p.pos[1] - car.pos[1];
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6 || p.pos[2] > car.pos[2] + car.top || p.pos[2] + 1.7 < car.pos[2] - 1) return false;
    const s = Math.sin(car.heading), c = Math.cos(car.heading);
    const fwd = dx * s + dy * c, across = dx * c - dy * s;
    const speed = Math.hypot(car.vel[0], car.vel[1]);
    if (fwd > car.front + 0.25 || fwd < -car.back - 0.25 || Math.abs(across) > car.side + 0.25 || speed < 1.5) return false;
    // Thrown along with the car and a little out to its side, tumbling.
    const out = Math.sign(across) || 1, k = 1.1 + 0.3 * this.rnd();
    p.vel = [car.vel[0] * k + c * out * speed * 0.25, car.vel[1] * k - s * out * speed * 0.25, 2 + 0.25 * speed];
    p.state = 'flying';
    p.spin = (4 + speed * 0.4) * (this.rnd() < 0.5 ? -1 : 1);
    p.tumble = 0;
    this.hits++;
    return true;
  }

  /** A car bearing down on them within two seconds: jump clear, away from its line, after a moment's shock; too late, and they freeze. */
  private lookOut(p: Person, car: Hitter): void {
    const vx = car.vel[0], vy = car.vel[1], v = Math.hypot(vx, vy);
    if (v < 4) return;
    const dx = p.pos[0] - car.pos[0], dy = p.pos[1] - car.pos[1];
    const t = (dx * vx + dy * vy) / (v * v);
    if (t < PEOPLE.freeze || t > 2) return;
    const miss = (dx * vy - dy * vx) / v; // how far off the car's line, signed
    if (Math.abs(miss) > car.side + 1) return;
    const away = miss >= 0 ? 1 : -1;
    // Across the car's line, to whichever side they were already on.
    p.heading = Math.atan2(vy * away, -vx * away);
    p.state = 'dodge';
    p.speed = 4;
    p.timer = PEOPLE.react + PEOPLE.dodge;
  }

  private move(p: Person, dt: number): void {
    switch (p.state) {
      case 'walk': {
        this.advance(p, p.speed * dt);
        this.place(p);
        p.phase += p.speed * 4.2 * dt;
        break;
      }
      case 'dodge':
      case 'wander': {
        if (p.state === 'dodge' && p.timer > PEOPLE.dodge) {
          p.timer -= dt; // still taking it in
          break;
        }
        const x = p.pos[0] + Math.sin(p.heading) * p.speed * dt, y = p.pos[1] + Math.cos(p.heading) * p.speed * dt;
        // Up against a wall: turn away along it.
        const wall = this.world.wall?.(x, y, p.pos[2] + 1);
        if (wall) p.heading = Math.atan2(wall.nx, wall.ny) + (this.rnd() - 0.5) * 2;
        else p.pos = [x, y, this.world.height(x, y)];
        p.phase += p.speed * 4.2 * dt;
        if (p.state === 'dodge' && (p.timer -= dt) <= 0) {
          p.state = 'wander';
          p.speed = 1.2 + 0.3 * this.rnd();
          p.heading += (this.rnd() - 0.5) * 2;
        }
        break;
      }
      case 'flying': {
        p.vel[2] -= G * dt;
        for (let i = 0; i < 3; i++) p.pos[i] += p.vel[i] * dt;
        p.tumble += p.spin * dt;
        const wall = this.world.wall?.(p.pos[0], p.pos[1], p.pos[2]);
        if (wall) {
          // Off the wall, losing most of the speed into it.
          p.pos[0] += wall.nx * wall.depth;
          p.pos[1] += wall.ny * wall.depth;
          const vn = p.vel[0] * wall.nx + p.vel[1] * wall.ny;
          if (vn < 0) {
            p.vel[0] -= 1.3 * vn * wall.nx;
            p.vel[1] -= 1.3 * vn * wall.ny;
          }
        }
        const ground = this.world.height(p.pos[0], p.pos[1]);
        if (p.pos[2] <= ground) {
          p.pos[2] = ground;
          // A bounce that dies, sliding on the ground in between.
          p.vel = [p.vel[0] * 0.55, p.vel[1] * 0.55, Math.abs(p.vel[2]) * 0.3];
          p.spin *= 0.5;
          if (Math.hypot(...p.vel) < 1.5) {
            p.state = 'down';
            p.timer = PEOPLE.down;
            p.heading = Math.atan2(p.vel[0], p.vel[1]) || p.heading;
          }
        }
        break;
      }
      case 'down':
        if ((p.timer -= dt) <= 0) {
          p.state = 'rise';
          p.timer = PEOPLE.rise;
        }
        break;
      case 'rise':
        if ((p.timer -= dt) <= 0) {
          p.state = 'wander';
          p.speed = 1 + 0.3 * this.rnd();
          p.heading = this.rnd() * 2 * Math.PI;
        }
        break;
    }
  }

  /** On along the pavement; turned back at the street's end. */
  private advance(p: Person, ds: number): void {
    for (let guard = 0; guard < 20; guard++) {
      const next = p.k + p.dir;
      if (next < 0 || next >= count(p.road)) {
        p.dir = -p.dir as 1 | -1;
        continue;
      }
      const a = vertex(p.road, p.k), b = vertex(p.road, next), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (p.along + ds < len) {
        p.along += ds;
        return;
      }
      ds -= len - p.along;
      p.along = 0;
      p.k = next;
    }
  }

  /** On its kerb: the centreline point, out past the carriageway's edge. */
  private place(p: Person): void {
    const next = Math.min(Math.max(p.k + p.dir, 0), count(p.road) - 1);
    const a = vertex(p.road, p.k), b = vertex(p.road, next), len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const t = Math.min(p.along / len, 1), ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
    // The kerb side is fixed to the road's drawn way, so turning back keeps to the same pavement.
    const out = (ROAD_WIDTH[p.road.kind] / 2 + PEOPLE.kerb) * p.side * p.dir;
    const x = a[0] + (b[0] - a[0]) * t + uy * out, y = a[1] + (b[1] - a[1]) * t - ux * out;
    p.pos = [x, y, this.world.height(x, y)];
    p.heading = Math.atan2(ux, uy);
  }

  /** Someone out by a street lamp, on that side of the street. */
  private spawn(eye: V3): void {
    const r = this.rnd, d = PEOPLE.spawnMin + (PEOPLE.spawnMax - PEOPLE.spawnMin) * r(), a = r() * 2 * Math.PI;
    const lamps = this.world.lamps(eye[0] + Math.sin(a) * d, eye[1] + Math.cos(a) * d, 60);
    if (!lamps.length) return;
    const lamp = lamps[Math.floor(r() * lamps.length)];
    if (Math.hypot(lamp.x - eye[0], lamp.y - eye[1]) < PEOPLE.spawnMin) return;
    const hit = this.world.roads.nearest(lamp.x, lamp.y, 12, walkable);
    if (!hit) return;
    const segs = this.world.roads.within(hit.x, hit.y, 0.5).filter((s) => s.road === hit.road);
    if (!segs.length) return;
    const k0 = segs[0].i / 2;
    const [ax, ay] = vertex(hit.road, k0), [bx, by] = vertex(hit.road, k0 + 1);
    // Which side of the road's drawn way the lamp is: right is +1.
    const side: 1 | -1 = (lamp.x - ax) * (by - ay) - (lamp.y - ay) * (bx - ax) >= 0 ? 1 : -1;
    const dir: 1 | -1 = r() < 0.5 ? 1 : -1;
    const k = dir === 1 ? k0 : k0 + 1;
    const p: Person = {
      state: 'walk', road: hit.road, k, dir, side, along: Math.hypot(hit.x - (dir === 1 ? ax : bx), hit.y - (dir === 1 ? ay : by)),
      speed: 1.1 + 0.5 * r(), pos: [0, 0, 0], vel: [0, 0, 0], heading: 0, phase: r() * 6, tumble: 0, spin: 0, timer: 0,
      look: Math.floor(r() * 1e6),
    };
    this.place(p);
    if (this.people.some((o) => Math.hypot(o.pos[0] - p.pos[0], o.pos[1] - p.pos[1]) < 3)) return;
    this.people.push(p);
  }
}
