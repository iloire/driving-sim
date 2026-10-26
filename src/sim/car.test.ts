import { describe, expect, it } from 'vitest';
import { createCar, TRUCK, stepCar, type CarEnv, type CarState, type Controls } from './car';

const STEP = 1 / 120;
const TARMAC = { grip: 1, rolling: 0.012 };
const flat: CarEnv = { height: () => 10, surface: () => TARMAC };
/** A 10 % grade climbing to the north. */
const hill: CarEnv = { height: (_x, y) => 10 + y * 0.1, surface: () => TARMAC };

const idle = (): Controls => ({ throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false, flight: { pitch: 0, roll: 0, yaw: 0, thrust: 0, lift: 0 } });

function run(s: CarState, c: Controls, seconds: number, env = flat, each?: (t: number) => void): void {
  for (let t = 0; t < seconds; t += STEP) {
    stepCar(s, TRUCK, c, env, STEP);
    each?.(t);
  }
}

const speedOf = (s: CarState) => Math.hypot(...s.vel);

describe('car at rest', () => {
  it('settles on its springs at the ride height and stays put', () => {
    const s = createCar(TRUCK, 0, 0, 10, 0);
    run(s, idle(), 3);
    expect(s.pos[2] - 10).toBeCloseTo(TRUCK.cgHeight, 1);
    expect(speedOf(s)).toBeLessThan(0.01);
    expect(Math.hypot(s.pos[0], s.pos[1])).toBeLessThan(0.05);
  });

  it('holds on a 10 % grade with no pedal pressed', () => {
    const s = createCar(TRUCK, 0, 0, 10, Math.PI / 2); // across the slope would roll sideways; face east
    run(s, idle(), 5, hill);
    expect(Math.hypot(s.pos[0], s.pos[1])).toBeLessThan(0.3);
  });

  it('faces the compass heading it was placed on', () => {
    const s = createCar(TRUCK, 0, 0, 10, Math.PI / 2);
    run(s, { ...idle(), throttle: 1 }, 2);
    expect(s.pos[0]).toBeGreaterThan(5); // east
    expect(Math.abs(s.pos[1])).toBeLessThan(0.5);
    expect(s.heading).toBeCloseTo(Math.PI / 2, 1);
  });
});

describe('straight line', () => {
  it('reaches 100 km/h in 5–9 s, changing up through the gears', () => {
    const s = createCar(TRUCK, 0, 0, 10, 0);
    let at100 = 0;
    run(s, { ...idle(), throttle: 1 }, 15, flat, (t) => {
      if (!at100 && s.speed >= 100 / 3.6) at100 = t;
    });
    expect(at100).toBeGreaterThan(5);
    expect(at100).toBeLessThan(9);
    expect(s.gear).toBeGreaterThanOrEqual(3);
  });

  it('tops out between 200 and 260 km/h', () => {
    const s = createCar(TRUCK, 0, 0, 10, 0);
    run(s, { ...idle(), throttle: 1 }, 90);
    expect(s.speed * 3.6).toBeGreaterThan(200);
    expect(s.speed * 3.6).toBeLessThan(260);
  });

  it('stops from 100 km/h in 22–34 m', () => {
    const s = createCar(TRUCK, 0, 0, 10, 0);
    s.vel = [0, 100 / 3.6, 0];
    s.gear = 4;
    run(s, idle(), 0.5); // let the springs take the load first
    const y0 = s.pos[1], v0 = s.speed;
    let stopY = 0;
    run(s, { ...idle(), brake: 1 }, 6, flat, () => { if (!stopY && s.speed < 0.1) stopY = s.pos[1]; });
    const scaled = ((stopY - y0) * (100 / 3.6) ** 2) / v0 ** 2;
    expect(scaled).toBeGreaterThan(22);
    expect(scaled).toBeLessThan(34);
  });

  it('backs up when the brake is held at a standstill', () => {
    const s = createCar(TRUCK, 0, 0, 10, 0);
    run(s, { ...idle(), brake: 1 }, 3);
    expect(s.gear).toBe(-1);
    expect(s.pos[1]).toBeLessThan(-2);
  });
});

describe('turbo', () => {
  it('goes crazy fast with the nitro lit, and stays on the road doing it', () => {
    const lit = createCar(TRUCK, 0, 0, 10, 0), plain = createCar(TRUCK, 0, 0, 10, 0);
    let at100 = 0;
    run(lit, { ...idle(), throttle: 1, boost: true }, 40, flat, (t) => { if (!at100 && lit.speed > 100 / 3.6) at100 = t; });
    run(plain, { ...idle(), throttle: 1 }, 40);
    expect(at100).toBeLessThan(3.5);
    expect(lit.speed * 3.6).toBeGreaterThan(450);
    expect(lit.speed * 3.6).toBeGreaterThan(plain.speed * 3.6 + 200);
    expect(Math.abs(lit.pos[2] - 10 - TRUCK.cgHeight)).toBeLessThan(0.3); // still on its wheels
    expect(Math.abs(lit.pos[0])).toBeLessThan(5); // and running straight
  });

  it('does nothing until it is pressed', () => {
    const s = createCar(TRUCK, 0, 0, 10, 0);
    run(s, idle(), 2);
    expect(Math.hypot(...s.vel)).toBeLessThan(0.05);
  });
});

describe('cornering', () => {
  it('turns left on positive steer, holding under ~1.5 g', () => {
    const s = createCar(TRUCK, 0, 0, 10, 0);
    s.vel = [0, 20, 0];
    s.gear = 3;
    let maxLat = 0;
    // Steady state only: in the turn-in transient yaw rate × speed is not the lateral acceleration.
    run(s, { ...idle(), throttle: 0.35, steer: 1 }, 6, flat, (t) => {
      if (t > 3) maxLat = Math.max(maxLat, Math.abs(s.w[2] * speedOf(s)) / 9.81);
    });
    expect(s.w[2]).toBeGreaterThan(0); // counter-clockwise seen from above = left
    expect(maxLat).toBeGreaterThan(0.5);
    expect(maxLat).toBeLessThan(1.6);
    expect(Math.abs(s.pos[2] - 10 - TRUCK.cgHeight)).toBeLessThan(0.3); // still on its wheels
  });

  it('keeps more grip on picón with its all-terrain tyres', () => {
    const picon: CarEnv = { height: () => 10, surface: () => ({ grip: 0.62, rolling: 0.06 }) };
    const lateral = (spec: typeof TRUCK) => {
      const s = createCar(spec, 0, 0, 10, 0);
      s.vel = [0, 16, 0];
      s.gear = 2;
      let g = 0;
      for (let t = 0; t < 5; t += STEP) {
        stepCar(s, spec, { ...idle(), throttle: 0.3, steer: 1 }, picon, STEP);
        if (t > 2.5) g = Math.max(g, Math.abs(s.w[2] * speedOf(s)) / 9.81);
      }
      return g;
    };
    expect(lateral(TRUCK)).toBeGreaterThan(lateral({ ...TRUCK, allTerrain: 0 }) * 1.1);
  });

  it('kicks the tail out on the handbrake', () => {
    const grip = createCar(TRUCK, 0, 0, 10, 0);
    const pull = createCar(TRUCK, 0, 0, 10, 0);
    for (const s of [grip, pull]) { s.vel = [0, 18, 0]; s.gear = 3; }
    run(grip, { ...idle(), steer: 0.6 }, 1);
    run(pull, { ...idle(), steer: 0.6, handbrake: true }, 1);
    expect(Math.abs(pull.w[2])).toBeGreaterThan(Math.abs(grip.w[2]));
    expect(pull.wheels[2].slip).toBe(1);
  });
});

describe('driver aids at speed', () => {
  /** A truck rolling north at `kmh`, settled on its springs. */
  const rolling = (kmh: number) => {
    const s = createCar(TRUCK, 0, 0, 10, 0);
    s.vel = [0, kmh / 3.6, 0];
    s.gear = 5;
    run(s, idle(), 0.5);
    return s;
  };
  /** Degrees between where the nose points and where the car is going. */
  const sideslip = (s: CarState) => {
    const course = Math.atan2(s.vel[0], s.vel[1]);
    return (Math.abs(((course - s.heading + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * 180) / Math.PI;
  };
  const turned = (s: CarState) => ((s.heading > Math.PI ? 2 * Math.PI - s.heading : s.heading) * 180) / Math.PI;

  it('stops from 150 km/h in under 65 m', () => {
    const s = rolling(150);
    const y0 = s.pos[1];
    let stopY = 0;
    run(s, { ...idle(), brake: 1 }, 10, flat, () => { if (!stopY && s.speed < 0.1) stopY = s.pos[1]; });
    expect(stopY - y0).toBeGreaterThan(0);
    expect(stopY - y0).toBeLessThan(65);
  });

  it('carves a full-lock turn at 130 km/h without the tail stepping out, and turns in sharply', () => {
    const s = rolling(130);
    let slip = 0;
    run(s, { ...idle(), throttle: 0.5, steer: 1 }, 1.5, flat, () => { slip = Math.max(slip, sideslip(s)); });
    expect(turned(s)).toBeGreaterThan(45);
    run(s, { ...idle(), throttle: 0.5 }, 2.5, flat, () => { slip = Math.max(slip, sideslip(s)); });
    expect(slip).toBeLessThan(6);
    expect(Math.abs(s.w[2])).toBeLessThan(0.05); // straightened up when let go
  });
});

describe('rough handling', () => {
  it('lands upside down without blowing up, and comes to rest', () => {
    const s = createCar(TRUCK, 0, 0, 10, 0);
    s.q = [0, 1, 0, 0]; // rolled 180° about the nose
    s.pos[2] = 13;
    run(s, idle(), 6);
    expect(s.pos.every(Number.isFinite)).toBe(true);
    expect(s.pos[2]).toBeGreaterThan(10);
    expect(speedOf(s)).toBeLessThan(0.5);
  });

  it('stops dead against a wall instead of driving through it', () => {
    // A house across the road 40 m ahead: everything north of y = 40 is inside it, the way out is south.
    const walled: CarEnv = { ...flat, wall: (_x, y) => (y > 40 && y < 60 ? { nx: 0, ny: -1, depth: y - 40 } : null) };
    const s = createCar(TRUCK, 0, 0, 10, 0);
    let peak = 0;
    run(s, { ...idle(), throttle: 1 }, 6, walled, () => { peak = Math.max(peak, s.pos[1]); });
    expect(peak + TRUCK.body[1]).toBeLessThan(41); // the bumper went at most a metre in
    expect(s.pos.every(Number.isFinite)).toBe(true);
    expect(s.pos[2] - 10).toBeLessThan(2); // not launched over it
  });

  it('knows when it has driven into the sea', () => {
    const coast: CarEnv = { height: (_x, y) => (y < 20 ? 5 : -15), surface: () => TARMAC };
    const s = createCar(TRUCK, 0, 0, 5, 0);
    run(s, { ...idle(), throttle: 1 }, 8, coast);
    expect(s.inWater).toBe(true);
  });
});
