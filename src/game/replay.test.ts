import { describe, expect, it } from 'vitest';
import { createCar, ROADSTER } from '../sim/car';
import { applyPose, poseOf, REPLAY_HZ, ReplayBuffer } from './replay';

const EXTRA = { braking: false, boost: false, thrust: 0.6, pedal: 0, g: 1, shown: true };

/** A pose of a car at x on the road, `t` seconds in. */
function at(t: number, x: number, shown = true) {
  const car = createCar(ROADSTER, x, 0, 0, 0);
  car.wheels.forEach((w) => { w.spin = x; });
  return poseOf(t, car, { ...EXTRA, shown });
}

/** A buffer fed one pose every 1 / REPLAY_HZ for `seconds`, the car moving 1 m a second. */
function driven(seconds: number): ReplayBuffer {
  const b = new ReplayBuffer();
  for (let i = 0; i <= seconds * REPLAY_HZ; i++) b.push(() => at(i / REPLAY_HZ, i / REPLAY_HZ), i / REPLAY_HZ);
  return b;
}

describe('instant replay', () => {
  it('keeps only the last 30 s', () => {
    const b = driven(45);
    expect(b.end).toBeCloseTo(45);
    expect(b.start).toBeGreaterThanOrEqual(15 - 1e-9);
    expect(b.start).toBeLessThan(15.1);
  });

  it('draws the car between the poses it kept', () => {
    const b = driven(2);
    const p = b.at(1.01)!;
    expect(p.car.pos[0]).toBeCloseTo(1.01, 6);
    expect(p.wheels[0].spin).toBeCloseTo(1.01, 6);
    expect(Math.hypot(...p.car.q)).toBeCloseTo(1);
  });

  it('clamps to the ends', () => {
    const b = driven(2);
    expect(b.at(-5)!.car.pos[0]).toBeCloseTo(0);
    expect(b.at(99)!.car.pos[0]).toBeCloseTo(2);
    expect(new ReplayBuffer().at(0)).toBeNull();
  });

  it('skips poses pushed sooner than 1 / REPLAY_HZ apart', () => {
    const b = new ReplayBuffer();
    let made = 0;
    for (let i = 0; i < 120; i++) b.push(() => { made++; return at(i / 120, 0); }, i / 120);
    expect(made).toBe(30);
  });

  it("doesn't slide the car across a jump to a new place", () => {
    const b = new ReplayBuffer();
    b.push(() => at(0, 0), 0);
    b.cut();
    b.push(() => at(0.1, 5000), 0.1);
    expect(b.at(0.09)!.car.pos[0]).toBe(0);
    expect(b.at(0.1)!.car.pos[0]).toBe(5000);
  });

  it('takes on/off states from the nearer pose', () => {
    const b = new ReplayBuffer();
    b.push(() => at(0, 0, true), 0);
    b.push(() => at(0.1, 1, false), 0.1);
    expect(b.at(0.04)!.shown).toBe(true);
    expect(b.at(0.06)!.shown).toBe(false);
  });

  it('keeps a copy, not the live car, and draws it back onto a car', () => {
    const car = createCar(ROADSTER, 10, 20, 0, 0);
    const p = poseOf(0, car, EXTRA);
    car.pos[0] = 99;
    car.wheels[0].strut = 9;
    const drawn = applyPose(car, p);
    expect(drawn.pos[0]).toBe(10);
    expect(drawn.wheels[0].strut).not.toBe(9);
    expect(drawn.wheels[0].mount).toEqual(car.wheels[0].mount);
    expect(car.pos[0]).toBe(99);
  });
});
