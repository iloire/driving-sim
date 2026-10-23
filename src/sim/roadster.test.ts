import { describe, expect, it } from 'vitest';
import { createCar, ROADSTER, stepCar, torqueAt, type CarEnv, type CarState, type Controls } from './car';

const STEP = 1 / 120;
const flat: CarEnv = { height: () => 10, surface: () => ({ grip: 1, rolling: 0.012 }) };

function controls(c: Partial<Controls> = {}, flight: Partial<Controls['flight']> = {}): Controls {
  return { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false, ...c, flight: { pitch: 0, roll: 0, yaw: 0, thrust: 0, lift: 0, ...flight } };
}

function run(s: CarState, c: Controls | ((t: number) => Controls), seconds: number, each?: (t: number) => void): void {
  for (let t = 0; t < seconds; t += STEP) {
    stepCar(s, ROADSTER, typeof c === 'function' ? c(t) : c, flat, STEP);
    each?.(t);
  }
}

describe('electric drive', () => {
  it('has full torque from a standstill, falling off at constant power', () => {
    expect(torqueAt(ROADSTER, 0)).toBe(ROADSTER.engine.peakTorque);
    const p = (rpm: number) => torqueAt(ROADSTER, rpm) * rpm;
    expect(p(10000)).toBeCloseTo(p(15000), 0);
    expect(torqueAt(ROADSTER, 21000)).toBe(0);
  });

  it('does 0–100 km/h in under 3 s and tops out at 350–400 km/h, in one gear', () => {
    const s = createCar(ROADSTER, 0, 0, 10, 0);
    let at100 = 0;
    run(s, controls({ throttle: 1 }), 60, (t) => { if (!at100 && s.speed > 100 / 3.6) at100 = t; });
    expect(at100).toBeGreaterThan(1.5);
    expect(at100).toBeLessThan(3);
    expect(s.speed * 3.6).toBeGreaterThan(350);
    expect(s.speed * 3.6).toBeLessThan(400);
    expect(s.gear).toBe(1);
  });
});

describe('hovering on thrusters', () => {
  function lit(): CarState {
    const s = createCar(ROADSTER, 0, 0, 10, 0);
    s.flying = true;
    return s;
  }

  it('lifts off the road on Space and climbs', () => {
    const s = lit();
    run(s, controls({}, { lift: 1 }), 4);
    expect(s.wings).toBe(1);
    expect(s.pos[2] - 10).toBeGreaterThan(25);
    expect(s.lift).toBeGreaterThan(0.4);
  });

  it('holds its height, level, with the stick let go', () => {
    const s = lit();
    run(s, controls({}, { lift: 1 }), 3);
    run(s, controls(), 3); // settle
    const z = s.pos[2];
    let drift = 0;
    run(s, controls(), 8, () => { drift = Math.max(drift, Math.abs(s.pos[2] - z)); });
    expect(drift).toBeLessThan(2);
    expect(Math.hypot(...s.vel)).toBeLessThan(1);
  });

  it('flies forwards on W (nose down), settling at a cruise', () => {
    const s = lit();
    run(s, controls({}, { lift: 1 }), 3);
    run(s, controls({}, { pitch: -1 }), 25);
    expect(s.vel[1]).toBeGreaterThan(30); // north, the way it faces
    expect(s.vel[1] * 3.6).toBeLessThan(320);
    expect(s.pos[2] - 10).toBeGreaterThan(20); // still up
  });

  it('turns right on D', () => {
    const s = lit();
    run(s, controls({}, { lift: 1 }), 3);
    run(s, controls({}, { roll: 1 }), 2);
    expect(s.heading).toBeGreaterThan(0.8);
    expect(s.heading).toBeLessThan(Math.PI);
  });

  it('drops when the thrusters go out', () => {
    const s = lit();
    run(s, controls({}, { lift: 1 }), 4);
    run(s, controls(), 3); // hovering still
    s.flying = false;
    run(s, controls(), 1.5);
    expect(s.wings).toBe(0);
    expect(s.vel[2]).toBeLessThan(-5);
  });
});
