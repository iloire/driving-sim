import { describe, expect, it } from 'vitest';
import { KEY_STICK_MAX, PLANE_ARROW_RATE, PLANE_STICK_RATE, shapeStick, stepKey } from './input';

/** Holds a key (`target`) for `seconds` at 60 fps, from `v`. */
function hold(v: number, target: number, seconds: number, rate = PLANE_STICK_RATE, back = 4): number {
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) v = stepKey(v, target, rate, back, 1 / 60);
  return v;
}

describe('the key stick', () => {
  it('works W A S D gently from the first moment of a press, never past the gentle cap', () => {
    expect(shapeStick(hold(0, 1, 0.1))).toBeGreaterThan(0.01);
    expect(shapeStick(hold(0, 1, 0.25))).toBeCloseTo(0.25 * KEY_STICK_MAX, 2);
    expect(shapeStick(hold(0, -1, 3))).toBeCloseTo(-KEY_STICK_MAX, 5);
    expect(KEY_STICK_MAX).toBeLessThan(0.5);
  });

  it('works the hard stick on the arrows: half at once, full by an eighth of a second', () => {
    expect(hold(0, 1, 1 / 15, PLANE_ARROW_RATE, PLANE_ARROW_RATE)).toBeGreaterThan(0.5);
    expect(hold(0, -1, 0.125, PLANE_ARROW_RATE, PLANE_ARROW_RATE)).toBeCloseTo(-1, 5);
    expect(hold(1, 0, 0.125, PLANE_ARROW_RATE, PLANE_ARROW_RATE)).toBeCloseTo(0, 5);
  });

  it('springs back to centre, and through it on the other key, at the faster rate', () => {
    expect(hold(1, 0, 0.25)).toBeCloseTo(0, 5);
    expect(hold(1, -1, 0.25)).toBeCloseTo(0, 5);
  });
});
