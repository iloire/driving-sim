import { describe, expect, it } from 'vitest';
import { createCar, TRUCK, stepCar, type CarEnv, type CarState, type Controls } from './car';
import { liftCoefficient, WINGS } from './wings';

const STEP = 1 / 120;
const flat: CarEnv = { height: () => 0.5, surface: () => ({ grip: 1, rolling: 0.012 }) };

function controls(pitch = 0, roll = 0, thrust = 0.7): Controls {
  return { throttle: 0, brake: 0, steer: 0, handbrake: false, flight: { pitch, roll, yaw: 0, thrust } };
}

/** A plane already flying level and north at `speed`, `height` metres up, wings out. */
function airborne(speed: number, height = 600): CarState {
  const s = createCar(TRUCK, 0, 0, height, 0);
  s.flying = true;
  s.wings = 1;
  s.vel = [0, speed, 0];
  return s;
}

function fly(s: CarState, c: Controls | ((t: number) => Controls), seconds: number, each?: (t: number) => void): void {
  for (let t = 0; t < seconds; t += STEP) {
    stepCar(s, TRUCK, typeof c === 'function' ? c(t) : c, flat, STEP);
    each?.(t);
  }
}

describe('liftCoefficient', () => {
  it('climbs with angle of attack, then collapses past the stall', () => {
    expect(liftCoefficient(WINGS, 0)).toBeCloseTo(WINGS.cl0);
    const peak = liftCoefficient(WINGS, WINGS.stall);
    expect(peak).toBeGreaterThan(1.4);
    expect(liftCoefficient(WINGS, WINGS.stall + 0.2)).toBeLessThan(peak * 0.6);
  });
});

describe('flying', () => {
  it('takes off from a road: unfold, roll, rotate, climb', () => {
    const s = createCar(TRUCK, 0, 0, 0.5, 0);
    s.flying = true;
    let liftOff = 0;
    // Wait for the wings, then full jet; pull up past 160 km/h.
    fly(s, (t) => controls(t > 1 && s.speed > 45 ? 0.6 : 0, 0, t > 1 ? 1 : 0), 25, (t) => {
      if (!liftOff && s.pos[2] > 0.5 + TRUCK.cgHeight + 3) liftOff = t;
    });
    expect(s.wings).toBe(1);
    expect(liftOff).toBeGreaterThan(3);
    expect(liftOff).toBeLessThan(16);
    expect(s.pos[1]).toBeLessThan(1500); // the take-off run fits a road
    expect(s.pos[2]).toBeGreaterThan(60);
  });

  it('flies hands-off: a gentle, damped climb on spare thrust, never a dive', () => {
    const s = airborne(70);
    let low = Infinity, steepest = 0, slowest = Infinity;
    fly(s, controls(0, 0, 0.55), 30, () => {
      low = Math.min(low, s.pos[2]);
      steepest = Math.max(steepest, Math.abs(s.vel[2]));
      slowest = Math.min(slowest, s.airspeed);
    });
    expect(low).toBeGreaterThan(595);
    expect(steepest).toBeLessThan(20);
    expect(slowest).toBeGreaterThan(45); // never near the stall
    expect(s.pos.every(Number.isFinite)).toBe(true);
  });

  it('banks and turns right on right aileron', () => {
    const s = airborne(70);
    fly(s, (t) => controls(0.3, t < 1.2 ? 1 : 0), 6);
    const heading = Math.atan2(s.vel[0], s.vel[1]);
    expect(heading).toBeGreaterThan(0.3); // swung east of north
  });

  it('falls when too slow, and when the wings fold', () => {
    const slow = airborne(18);
    fly(slow, controls(1, 0, 0), 4);
    expect(slow.vel[2]).toBeLessThan(-8);
    const folded = airborne(70);
    folded.flying = false;
    fly(folded, controls(0, 0, 0), 5);
    expect(folded.wings).toBe(0);
    expect(folded.vel[2]).toBeLessThan(-15);
  });
});
