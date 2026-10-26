import { describe, expect, it } from 'vitest';
import { createCar, stepCar, TRUCK, type CarEnv } from './car';
import { RoadIndex, ROAD_WIDTH, type Road } from './roads';
import { PACE, Traffic, TRAFFIC, type TrafficCar } from './traffic';
import type { V3 } from './vec';

function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const road = (pts: number[], kind: Road['kind'] = 'secondary'): Road => ({ kind, name: '', bridge: false, pts });
const STEP = 1 / 120;

/** A car put on `r` by hand, at vertex k going `dir`. */
function put(t: Traffic, r: Road, k: number, dir: 1 | -1, speed: number): TrafficCar {
  const c: TrafficCar = {
    road: r, k, dir, along: 0, speed, limit: Infinity, limitAge: 0, pos: [r.pts[2 * k], r.pts[2 * k + 1], 0],
    heading: Math.atan2(r.pts[2 * (k + dir)] - r.pts[2 * k], r.pts[2 * (k + dir) + 1] - r.pts[2 * k + 1]),
    spin: 0, vel: [0, 0, 0], braking: false, look: 0, wreck: null,
  };
  t.cars.push(c);
  return c;
}
/** Steps a traffic made of hand-placed cars only: no spawning, and the camera on the first car. */
function run(t: Traffic, seconds: number, others: { pos: V3; vel: V3 }[] = []): void {
  const saved = TRAFFIC.count;
  TRAFFIC.count = 0;
  for (let s = 0; s < seconds; s += STEP) t.step(STEP, t.cars[0].pos, others);
  TRAFFIC.count = saved;
}

describe('Traffic', () => {
  const straight = road([0, 0, 0, 3000]);
  const world = (roads: Road[]) => ({ roads: new RoadIndex(roads), height: () => 10 });

  it('spawns cars on the roads round the camera, keeping to the right', () => {
    const roads = [straight, road([0, 3000, 2000, 3000])];
    const t = new Traffic(world(roads), seeded(1));
    for (let s = 0; s < 30; s += 0.1) t.step(0.1, [0, 1500, 0], []);
    expect(t.cars.length).toBeGreaterThan(3);
    for (const c of t.cars) {
      if (c.road !== straight) continue;
      // Northbound cars east of the line, southbound west of it.
      const lane = ROAD_WIDTH.secondary / 4;
      expect(c.pos[0] * Math.cos(c.heading)).toBeCloseTo(lane, 0);
    }
  });

  it('drives at the road’s pace and stops behind a car standing in its lane', () => {
    const t = new Traffic(world([straight]), seeded(2));
    const c = put(t, straight, 0, 1, 10);
    const parked = { pos: [ROAD_WIDTH.secondary / 4, 600, 10] as V3, vel: [0, 0, 0] as V3 };
    run(t, 10, [parked]);
    expect(c.speed).toBeCloseTo(PACE.secondary!, 0);
    run(t, 40, [parked]);
    expect(c.speed).toBeLessThan(0.5);
    expect(600 - c.pos[1]).toBeGreaterThan(TRAFFIC.half[0] * 2);
    expect(600 - c.pos[1]).toBeLessThan(TRAFFIC.gap + 6);
  });

  it('slows for a hairpin', () => {
    const hairpin = road([0, 0, 0, 400, 10, 410, 20, 410, 30, 400, 30, 0]);
    const t = new Traffic(world([hairpin]), seeded(3));
    const c = put(t, hairpin, 0, 1, PACE.secondary!);
    let slowest = Infinity;
    for (let s = 0; s < 30; s += 0.5) {
      run(t, 0.5);
      if (c.pos[1] > 380) slowest = Math.min(slowest, c.speed);
    }
    expect(slowest).toBeLessThan(10);
  });

  it('turns onto another road where its own ends, and round at a dead end', () => {
    const a = road([0, 0, 0, 200]), b = road([0, 200, 300, 200]);
    const t = new Traffic(world([a, b]), seeded(4));
    const c = put(t, a, 0, 1, 10);
    let turned = false, back = false;
    for (let s = 0; s < 60; s += 0.5) {
      run(t, 0.5);
      turned ||= c.road === b && c.pos[0] > 5;
      back ||= turned && c.road === b && c.dir === -1; // at the end of b, where nothing goes on
    }
    expect(turned).toBe(true);
    expect(back).toBe(true);
  });

  it('is solid, and a hit flings it as a wreck while the car that hit it slows', () => {
    const t = new Traffic(world([straight]), seeded(5));
    // Pulling away 60 m up the road, run into from behind at 20 m/s.
    const victim = put(t, straight, 0, 1, 0);
    victim.along = 60;
    run(t, STEP);
    const lane = ROAD_WIDTH.secondary / 4;
    TRAFFIC.count = 0;
    const hit = t.contact(lane, victim.pos[1] - 2, 10.5)!;
    expect(hit.ny).toBeCloseTo(-1);
    const car = createCar(TRUCK, lane, 50, 10, 0);
    car.vel = [0, 20, 0];
    const env: CarEnv = { height: () => 10, surface: () => ({ grip: 1, rolling: 0.012 }), wall: (x, y, z) => t.contact(x, y, z) };
    for (let s = 0; s < 1.5; s += STEP) {
      stepCar(car, TRUCK, { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false, flight: { pitch: 0, roll: 0, yaw: 0, thrust: 0, lift: 0 } }, env, STEP);
      t.step(STEP, victim.pos, []);
    }
    TRAFFIC.count = 14;
    expect(victim.wreck).not.toBeNull();
    expect(victim.pos[1]).toBeGreaterThan(70);
    expect(car.vel[1]).toBeLessThan(15);
    // It went through no part of the other car: the bumper never passed its far side.
    expect(car.pos[1]).toBeLessThan(victim.pos[1]);
  });

  it('drives on once a wreck comes to rest in its lane', () => {
    const t = new Traffic(world([straight]), seeded(6));
    const c = put(t, straight, 0, 1, 10);
    run(t, 2);
    c.wreck = { age: 0, still: 0 };
    c.vel = [0, 3, 0];
    run(t, 6);
    expect(c.wreck).toBeNull();
    run(t, 3);
    expect(c.speed).toBeGreaterThan(3);
  });
});
