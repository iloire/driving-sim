import { describe, expect, it } from 'vitest';
import { PLANE_STICK_RATE, shapeStick, stepKey } from './input';

/** Holds a key (`target`) for `seconds` at 60 fps, from `v`. */
function hold(v: number, target: number, seconds: number, rate = PLANE_STICK_RATE, back = 4): number {
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) v = stepKey(v, target, rate, back, 1 / 60);
  return v;
}

describe('the key stick', () => {
  it('nudges on a tap and reaches full stick on a hold, on the plane curve', () => {
    expect(shapeStick(hold(0, 1, 0.3))).toBeLessThan(0.01);
    expect(shapeStick(hold(0, 1, 1))).toBeCloseTo(0.216, 2);
    expect(shapeStick(hold(0, -1, 1.7))).toBe(-1);
  });

  it('springs back to centre, and through it on the other key, at the faster rate', () => {
    expect(hold(1, 0, 0.25)).toBeCloseTo(0, 5);
    expect(hold(1, -1, 0.25)).toBeCloseTo(0, 5);
  });
});
