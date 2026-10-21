import { describe, expect, it } from 'vitest';
import { createCar, HATCH, stepCar, type CarEnv, type CarState, type Controls } from './car';

const STEP = 1 / 120;
const TARMAC = { grip: 1, rolling: 0.012 };
const flat: CarEnv = { height: () => 10, surface: () => TARMAC };
/** A 10 % grade climbing to the north. */
const hill: CarEnv = { height: (_x, y) => 10 + y * 0.1, surface: () => TARMAC };

const idle = (): Controls => ({ throttle: 0, brake: 0, steer: 0, handbrake: false });

function run(s: CarState, c: Controls, seconds: number, env = flat, each?: (t: number) => void): void {
  for (let t = 0; t < seconds; t += STEP) {
    stepCar(s, HATCH, c, env, STEP);
    each?.(t);
  }
}

const speedOf = (s: CarState) => Math.hypot(...s.vel);

describe('car at rest', () => {
  it('settles on its springs at the ride height and stays put', () => {
    const s = createCar(HATCH, 0, 0, 10, 0);
    run(s, idle(), 3);
    expect(s.pos[2] - 10).toBeCloseTo(HATCH.cgHeight, 1);
    expect(speedOf(s)).toBeLessThan(0.01);
    expect(Math.hypot(s.pos[0], s.pos[1])).toBeLessThan(0.05);
  });

  it('holds on a 10 % grade with no pedal pressed', () => {
    const s = createCar(HATCH, 0, 0, 10, Math.PI / 2); // across the slope would roll sideways; face east
    run(s, idle(), 5, hill);
    expect(Math.hypot(s.pos[0], s.pos[1])).toBeLessThan(0.3);
  });

  it('faces the compass heading it was placed on', () => {
    const s = createCar(HATCH, 0, 0, 10, Math.PI / 2);
    run(s, { ...idle(), throttle: 1 }, 2);
    expect(s.pos[0]).toBeGreaterThan(5); // east
    expect(Math.abs(s.pos[1])).toBeLessThan(0.5);
    expect(s.heading).toBeCloseTo(Math.PI / 2, 1);
  });
});

describe('straight line', () => {
  it('reaches 100 km/h in 5–9 s, changing up through the gears', () => {
    const s = createCar(HATCH, 0, 0, 10, 0);
    let at100 = 0;
    run(s, { ...idle(), throttle: 1 }, 15, flat, (t) => {
      if (!at100 && s.speed >= 100 / 3.6) at100 = t;
    });
    expect(at100).toBeGreaterThan(5);
    expect(at100).toBeLessThan(9);
    expect(s.gear).toBeGreaterThanOrEqual(3);
  });

  it('tops out between 200 and 260 km/h', () => {
    const s = createCar(HATCH, 0, 0, 10, 0);
    run(s, { ...idle(), throttle: 1 }, 90);
    expect(s.speed * 3.6).toBeGreaterThan(200);
    expect(s.speed * 3.6).toBeLessThan(260);
  });

  it('stops from 100 km/h in 35–50 m', () => {
    const s = createCar(HATCH, 0, 0, 10, 0);
    s.vel = [0, 100 / 3.6, 0];
    s.gear = 4;
    run(s, idle(), 0.5); // let the springs take the load first
    const y0 = s.pos[1], v0 = s.speed;
    let stopY = 0;
    run(s, { ...idle(), brake: 1 }, 6, flat, () => { if (!stopY && s.speed < 0.1) stopY = s.pos[1]; });
    const scaled = ((stopY - y0) * (100 / 3.6) ** 2) / v0 ** 2;
    expect(scaled).toBeGreaterThan(35);
    expect(scaled).toBeLessThan(50);
  });

  it('backs up when the brake is held at a standstill', () => {
    const s = createCar(HATCH, 0, 0, 10, 0);
    run(s, { ...idle(), brake: 1 }, 3);
    expect(s.gear).toBe(-1);
    expect(s.pos[1]).toBeLessThan(-2);
  });
});

describe('cornering', () => {
  it('turns left on positive steer, holding under ~1.1 g', () => {
    const s = createCar(HATCH, 0, 0, 10, 0);
    s.vel = [0, 20, 0];
    s.gear = 3;
    let maxLat = 0;
    // Steady state only: in the turn-in transient yaw rate × speed is not the lateral acceleration.
    run(s, { ...idle(), throttle: 0.35, steer: 1 }, 6, flat, (t) => {
      if (t > 3) maxLat = Math.max(maxLat, Math.abs(s.w[2] * speedOf(s)) / 9.81);
    });
    expect(s.w[2]).toBeGreaterThan(0); // counter-clockwise seen from above = left
    expect(maxLat).toBeGreaterThan(0.5);
    expect(maxLat).toBeLessThan(1.2);
    expect(Math.abs(s.pos[2] - 10 - HATCH.cgHeight)).toBeLessThan(0.3); // still on its wheels
  });

  it('kicks the tail out on the handbrake', () => {
    const grip = createCar(HATCH, 0, 0, 10, 0);
    const pull = createCar(HATCH, 0, 0, 10, 0);
    for (const s of [grip, pull]) { s.vel = [0, 18, 0]; s.gear = 3; }
    run(grip, { ...idle(), steer: 0.6 }, 1);
    run(pull, { ...idle(), steer: 0.6, handbrake: true }, 1);
    expect(Math.abs(pull.w[2])).toBeGreaterThan(Math.abs(grip.w[2]));
    expect(pull.wheels[2].slip).toBe(1);
  });
});

describe('rough handling', () => {
  it('lands upside down without blowing up, and comes to rest', () => {
    const s = createCar(HATCH, 0, 0, 10, 0);
    s.q = [0, 1, 0, 0]; // rolled 180° about the nose
    s.pos[2] = 13;
    run(s, idle(), 6);
    expect(s.pos.every(Number.isFinite)).toBe(true);
    expect(s.pos[2]).toBeGreaterThan(10);
    expect(speedOf(s)).toBeLessThan(0.5);
  });

  it('knows when it has driven into the sea', () => {
    const coast: CarEnv = { height: (_x, y) => (y < 20 ? 5 : -15), surface: () => TARMAC };
    const s = createCar(HATCH, 0, 0, 5, 0);
    run(s, { ...idle(), throttle: 1 }, 8, coast);
    expect(s.inWater).toBe(true);
  });
});
