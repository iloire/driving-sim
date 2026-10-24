import { describe, expect, it } from 'vitest';
import { PLANE_ARROW_RATE, PLANE_ROLL_RATE, PLANE_STICK_RATE, shapeRoll, shapeStick, stepKey } from './input';

/** Holds a key (`target`) for `seconds` at 60 fps, from `v`. */
function hold(v: number, target: number, seconds: number, rate = PLANE_STICK_RATE, back = 4): number {
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) v = stepKey(v, target, rate, back, 1 / 60);
  return v;
}

describe('the key stick', () => {
  it('nudges on a tap and reaches full stick on a hold, on the plane curve', () => {
    expect(shapeStick(hold(0, 1, 0.2))).toBeCloseTo(0.027, 3);
    expect(shapeStick(hold(0, 1, 0.4))).toBeCloseTo(0.216, 2);
    expect(shapeStick(hold(0, -1, 0.67))).toBeCloseTo(-1, 5);
  });

  it('rolls from the first moment of a press, full by half a second', () => {
    expect(shapeRoll(hold(0, 1, 0.1, PLANE_ROLL_RATE))).toBeGreaterThan(0.03);
    expect(shapeRoll(hold(0, 1, 0.25, PLANE_ROLL_RATE))).toBeCloseTo(0.25, 2);
    expect(shapeRoll(hold(0, -1, 0.5, PLANE_ROLL_RATE))).toBeCloseTo(-1, 5);
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
