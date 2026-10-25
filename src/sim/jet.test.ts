import { describe, expect, it } from 'vitest';
import { createCar, JET, stepCar, type CarEnv, type CarState, type Controls } from './car';
import { atmosphere, stalled } from './wings';
import { PLANE_ARROW_RATE, PLANE_ROLL_RATE, PLANE_STICK_RATE, shapeRoll, shapeStick } from '../game/input';
import { rotate, unrotate } from './vec';

const STEP = 1 / 120;
const flat: CarEnv = { height: () => 0, surface: () => ({ grip: 1, rolling: 0.012 }) };
const wings = JET.wings!;

function controls(pitch = 0, roll = 0, thrust = 0.6, boost = false): Controls {
  return { throttle: 0, brake: 0, steer: 0, handbrake: false, boost, flight: { pitch, roll, yaw: 0, thrust, lift: 0 } };
}

/** The jet flying level and north at `speed`, `height` metres up (low level by default). */
function airborne(speed: number, height = 500): CarState {
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

/** Pitch on a held key, `t` s after it went down, as the keys work it on wings. */
const keyed = (t: number) => shapeStick(Math.min(PLANE_STICK_RATE * t, 1));

/** Nose above the horizon, degrees. */
function noseUp(s: CarState): number {
  return (Math.asin(rotate(s.q, [1, 0, 0])[2]) * 180) / Math.PI;
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
  it('cruises near 900 km/h; full dry thrust stops under the sound barrier, the afterburner breaks it', () => {
    const cruise = airborne(200), dry = airborne(200), burner = airborne(230);
    fly(cruise, controls(), 120);
    fly(dry, controls(0, 0, 1), 120);
    let mach1 = Infinity;
    fly(burner, controls(0, 0, 1, true), 90, () => { if (burner.airspeed > 340) mach1 = Math.min(mach1, burner.airspeed); });
    expect(cruise.airspeed * 3.6).toBeGreaterThan(800);
    expect(cruise.airspeed * 3.6).toBeLessThan(1000);
    expect(dry.airspeed / 340).toBeGreaterThan(0.9);
    expect(dry.airspeed / 340).toBeLessThan(0.97);
    expect(mach1).toBeLessThan(Infinity);
    expect(burner.airspeed / 340).toBeGreaterThan(1.15);
  });

  it('flies hands-off: holds its height within a gentle climb', () => {
    const s = airborne(230);
    let steepest = 0;
    fly(s, controls(), 60, () => { steepest = Math.max(steepest, Math.abs(s.vel[2])); });
    expect(steepest).toBeLessThan(10);
    expect(s.pos[2]).toBeGreaterThan(450);
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

  it('pulls out of a 60° dive at 800 km/h on a held key within 550 m, under 9 g', () => {
    const s = airborne(222, 6000);
    const pitch = Math.PI / 3;
    s.q = [Math.SQRT1_2 * Math.cos(pitch / 2), -Math.SQRT1_2 * Math.sin(pitch / 2), Math.SQRT1_2 * Math.sin(pitch / 2), Math.SQRT1_2 * Math.cos(pitch / 2)];
    s.vel = [0, 222 * Math.cos(pitch), -222 * Math.sin(pitch)];
    const c = controls();
    const g = gauge(s);
    let t = 0, most = 0;
    while (s.vel[2] < 0 && t < 10) {
      c.flight.pitch = keyed(t);
      fly(s, c, STEP, () => { most = Math.max(most, g()); });
      t += STEP;
    }
    expect(6000 - s.pos[2]).toBeLessThan(550);
    expect(most).toBeLessThan(9.3);
  });

  it('a short press at cruise nudges the nose a degree or two, and it stays there', () => {
    const s = airborne(230, 3000);
    const c = controls();
    const start = noseUp(s);
    let t = 0;
    for (; t < 0.4; t += STEP) { c.flight.pitch = keyed(t); fly(s, c, STEP); }
    const out = c.flight.pitch;
    for (let r = 0; r < 2; r += STEP) { c.flight.pitch = Math.max(0, out - 4 * r); fly(s, c, STEP); }
    const settled = noseUp(s);
    fly(s, c, 1);
    expect(settled - start).toBeGreaterThan(0.5);
    expect(settled - start).toBeLessThan(3);
    expect(Math.abs(noseUp(s) - settled)).toBeLessThan(1);
  });

  it('asks for a rate: full pull at 650 km/h turns the flight path at about 20°/s, under the g limit', () => {
    // Slower the wing's angle-of-attack limit holds it back, faster the 9 g limit does.
    const s = airborne(180);
    const g = gauge(s);
    let most = 0;
    fly(s, controls(1, 0, 1, true), 1.5, () => { most = Math.max(most, g()); });
    const before = Math.atan2(s.vel[2], s.vel[1]);
    fly(s, controls(1, 0, 1, true), 0.5);
    const rate = (Math.atan2(s.vel[2], s.vel[1]) - before) / 0.5;
    expect(rate).toBeGreaterThan(0.3);
    expect(rate).toBeLessThan(0.4);
    expect(most).toBeLessThan(8);
  });

  it('banks gently on D however long it is held, and briskly on the arrow', () => {
    const bank = (stick: (t: number) => number, seconds: number) => {
      const s = airborne(230, 3000);
      const c = controls();
      for (let t = 0; t < seconds; t += STEP) { c.flight.roll = stick(t); fly(s, c, STEP); }
      const right = rotate(s.q, [0, -1, 0]), up = rotate(s.q, [0, 0, 1]);
      return (Math.atan2(-right[2], up[2]) * 180) / Math.PI;
    };
    const d = (t: number) => shapeRoll(Math.min(PLANE_ROLL_RATE * t, 1));
    const arrow = (t: number) => Math.min(PLANE_ARROW_RATE * t, 1);
    expect(bank(d, 0.2)).toBeLessThan(2);
    expect(bank(d, 1)).toBeGreaterThan(15);
    expect(bank(d, 1)).toBeLessThan(35);
    expect(bank(d, 2)).toBeLessThan(80);
    expect(bank(arrow, 0.5)).toBeGreaterThan(35);
  });

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
    expect(rate(100)).toBeGreaterThan(fbw * 0.6);
  });

  it('sheds speed on the airbrake: from 830 km/h at idle, under 600 within 10 s, where the clean jet keeps over 700', () => {
    const clean = airborne(230), braked = airborne(230);
    fly(clean, controls(0, 0, 0.1), 10);
    const c = controls(0, 0, 0.1);
    c.flight.airbrake = true;
    fly(braked, c, 10);
    expect(clean.airspeed * 3.6).toBeGreaterThan(700);
    expect(braked.airspeed * 3.6).toBeLessThan(600);
    expect(braked.pos[2]).toBeGreaterThan(400);
  });

  it('swings the airbrake panel up over half a second and back down the same when Space lets go', () => {
    const s = airborne(230);
    const c = controls(0, 0, 0.1);
    c.flight.airbrake = true;
    fly(s, c, 0.25);
    expect(s.airbrake).toBeCloseTo(0.5, 1);
    fly(s, c, 0.3);
    expect(s.airbrake).toBe(1);
    c.flight.airbrake = false;
    fly(s, c, 0.55);
    expect(s.airbrake).toBe(0);
  });

  it('sinks when it is too slow to fly, nose held under the stall', () => {
    const s = airborne(55);
    fly(s, controls(1, 0, 0.1), 6);
    expect(s.vel[2]).toBeLessThan(-3);
    expect(stalled(wings, s.alpha)).toBe(false);
  });

  it('is faster up high, where the thin air drags less: Mach 1.2 at the sea, past Mach 1.9 at 8 km on the afterburner', () => {
    const sea = airborne(280, 300), high = airborne(280, 8000);
    fly(sea, controls(0, 0, 1, true), 150);
    fly(high, controls(0, 0, 1, true), 150);
    expect(sea.mach).toBeLessThan(1.3);
    expect(high.mach).toBeGreaterThan(1.9);
    expect(high.airspeed).toBeGreaterThan(sea.airspeed * 1.35);
    expect(high.pos[2]).toBeGreaterThan(7500);
  });

  it('stays near Mach 1 on dry thrust at any height: only the afterburner pushes well through', () => {
    for (const height of [300, 8000]) {
      const s = airborne(280, height);
      fly(s, controls(0, 0, 1), 150);
      expect(s.mach).toBeLessThan(1.2);
    }
  });

  it('gathers speed nose down: a held 45° dive from 8 km runs far past what it flew level', () => {
    const level = airborne(250, 8000), dive = airborne(250, 8000);
    const pitch = Math.PI / 4;
    // Northbound with the nose 45° down, and the stick pushed to the load that holds the path.
    dive.q = [Math.SQRT1_2 * Math.cos(pitch / 2), -Math.SQRT1_2 * Math.sin(pitch / 2), Math.SQRT1_2 * Math.sin(pitch / 2), Math.SQRT1_2 * Math.cos(pitch / 2)];
    dive.vel = [0, 250 * Math.cos(pitch), -250 * Math.sin(pitch)];
    fly(level, controls(), 20);
    fly(dive, controls((Math.cos(pitch) - 1) / (1 - wings.fbw!.gMin)), 20);
    expect(dive.airspeed).toBeGreaterThan(level.airspeed * 1.3);
    expect(dive.pos[2]).toBeLessThan(level.pos[2] - 3000);
  });

  it('has a ceiling near 18 km: at 20 km even the afterburner loses energy, at 17 km it still gains', () => {
    // Energy height: the height plus what the speed would buy in a zoom climb.
    const energy = (s: CarState) => s.pos[2] + Math.hypot(...s.vel) ** 2 / (2 * 9.81);
    const high = airborne(250, 20000), low = airborne(250, 17000);
    const [high0, low0] = [energy(high), energy(low)];
    fly(high, controls(0, 0, 1, true), 60);
    fly(low, controls(0, 0, 1, true), 60);
    expect(energy(high)).toBeLessThan(high0 - 500);
    expect(energy(low)).toBeGreaterThan(low0 + 500);
  });

  it('stays in one piece diving into the ground at full speed', () => {
    const s = airborne(300, 200);
    fly(s, controls(-1, 0, 1, true), 6);
    expect(s.pos.every(Number.isFinite)).toBe(true);
    expect(s.vel.every(Number.isFinite)).toBe(true);
  });
});

describe('the atmosphere', () => {
  it('reports its control surfaces as the fly-by-wire sets them: rolling right, a fading rudder', () => {
    const s = airborne(240), still = airborne(240);
    const c = controls(0, 1);
    c.flight.yaw = 1;
    fly(s, c, 0.2);
    fly(still, controls(), 0.2);
    expect(s.surfaces.roll).toBeGreaterThan(0.15);
    // Full right boot, cut to (120 / 240)² = a quarter at 240 m/s.
    expect(s.surfaces.yaw).toBeCloseTo(0.25, 2);
    expect(Math.abs(still.surfaces.roll)).toBeLessThan(0.05);
    expect(Math.abs(still.surfaces.yaw)).toBeLessThan(0.01);
  });

  it('matches the standard atmosphere at the sea, at 11 km and at 20 km', () => {
    expect(atmosphere(0).rho).toBeCloseTo(1.225, 3);
    expect(atmosphere(0).sound).toBeCloseTo(340.3, 0);
    expect(atmosphere(11000).rho).toBeCloseTo(0.364, 2);
    expect(atmosphere(11000).sound).toBeCloseTo(295.1, 0);
    expect(atmosphere(20000).rho).toBeCloseTo(0.0889, 2);
    expect(atmosphere(20000).sound).toBeCloseTo(295.1, 0);
  });
});
