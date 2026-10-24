import { describe, expect, it } from 'vitest';
import { createCar, JET, stepCar, type CarEnv, type CarState, type Controls } from './car';
import { stalled } from './wings';
import { rotate, unrotate } from './vec';

const STEP = 1 / 120;
const flat: CarEnv = { height: () => 0, surface: () => ({ grip: 1, rolling: 0.012 }) };
const wings = JET.wings!;

function controls(pitch = 0, roll = 0, thrust = 0.6, boost = false): Controls {
  return { throttle: 0, brake: 0, steer: 0, handbrake: false, boost, flight: { pitch, roll, yaw: 0, thrust, lift: 0 } };
}

/** The jet flying level and north at `speed`, `height` metres up. */
function airborne(speed: number, height = 3000): CarState {
  const s = createCar(JET, 0, 0, height, 0);
  s.flying = true;
  s.wings = 1;
  s.vel = [0, speed, 0];
  return s;
}

function fly(s: CarState, c: Controls, seconds: number, each?: () => void): void {
  for (let t = 0; t < seconds; t += STEP) {
    stepCar(s, JET, c, flat, STEP);
    each?.();
  }
}

/** Load factor along the body's up axis over the last step. */
function gauge(s: CarState): () => number {
  let prev = [...s.vel];
  return () => {
    const up = rotate(s.q, [0, 0, 1]);
    const a = s.vel.map((v, i) => (v - prev[i]) / STEP);
    prev = [...s.vel];
    return (a[0] * up[0] + a[1] * up[1] + (a[2] + 9.81) * up[2]) / 9.81;
  };
}

describe('the jet', () => {
  it('cruises near 850 km/h and tops out past 1,100 km/h on the afterburner, held off Mach 1', () => {
    const cruise = airborne(200), burner = airborne(200);
    fly(cruise, controls(), 120);
    fly(burner, controls(0, 0, 1, true), 120);
    expect(cruise.airspeed * 3.6).toBeGreaterThan(750);
    expect(cruise.airspeed * 3.6).toBeLessThan(950);
    expect(burner.airspeed * 3.6).toBeGreaterThan(1050);
    expect(burner.airspeed).toBeLessThan(340);
  });

  it('flies hands-off: holds its height within a gentle climb', () => {
    const s = airborne(230);
    let steepest = 0;
    fly(s, controls(), 60, () => { steepest = Math.max(steepest, Math.abs(s.vel[2])); });
    expect(steepest).toBeLessThan(10);
    expect(s.pos[2]).toBeGreaterThan(2950);
  });

  for (const speed of [80, 150, 250, 300]) {
    it(`pulls to the limit at ${speed} m/s without passing 9 g or stalling`, () => {
      const s = airborne(speed);
      const g = gauge(s);
      let most = 0, ever = false;
      fly(s, controls(1, 0, 1, true), 4, () => {
        most = Math.max(most, g());
        ever ||= stalled(wings, s.alpha);
      });
      expect(most).toBeLessThan(9.3);
      expect(ever).toBe(false);
      if (speed >= 250) expect(most).toBeGreaterThan(8);
    });
  }

  it('rolls at the same rate at 250 and 300 m/s, and slower when slow', () => {
    const rate = (speed: number) => {
      const s = airborne(speed);
      let most = 0;
      fly(s, controls(0, 1), 1.5, () => { most = Math.max(most, unrotate(s.q, s.w)[0]); });
      return most;
    };
    const fbw = wings.fbw!.rollRate;
    expect(rate(250)).toBeCloseTo(fbw, 1);
    expect(rate(300)).toBeCloseTo(fbw, 1);
    expect(rate(100)).toBeLessThan(fbw);
    expect(rate(100)).toBeGreaterThan(1.5);
  });

  it('sheds speed on the airbrake: from 830 km/h at idle, under 600 within 10 s, where the clean jet keeps over 700', () => {
    const clean = airborne(230), braked = airborne(230);
    fly(clean, controls(0, 0, 0.1), 10);
    const c = controls(0, 0, 0.1);
    c.flight.airbrake = true;
    fly(braked, c, 10);
    expect(clean.airspeed * 3.6).toBeGreaterThan(700);
    expect(braked.airspeed * 3.6).toBeLessThan(600);
    expect(braked.pos[2]).toBeGreaterThan(2900);
  });

  it('sinks when it is too slow to fly, nose held under the stall', () => {
    const s = airborne(55);
    fly(s, controls(1, 0, 0.1), 6);
    expect(s.vel[2]).toBeLessThan(-3);
    expect(stalled(wings, s.alpha)).toBe(false);
  });

  it('stays in one piece diving into the ground at full speed', () => {
    const s = airborne(300, 200);
    fly(s, controls(-1, 0, 1, true), 6);
    expect(s.pos.every(Number.isFinite)).toBe(true);
    expect(s.vel.every(Number.isFinite)).toBe(true);
  });
});
