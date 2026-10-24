import { describe, expect, it } from 'vitest';
import { axisAngle, blendQuat, lerpV3, rotate } from './vec';

describe('drawing between physics steps', () => {
  it('puts the car part way along its step', () => {
    expect(lerpV3([0, 0, 10], [4, -2, 10], 0.25)).toEqual([1, -0.5, 10]);
  });

  it('turns part way, the short way round even when the second quaternion has flipped sign', () => {
    const a = axisAngle([0, 0, 1], 0), b = axisAngle([0, 0, 1], 0.2);
    const flipped = b.map((v) => -v) as typeof b;
    for (const end of [b, flipped]) {
      const [x, y] = rotate(blendQuat(a, end, 0.5), [1, 0, 0]);
      expect(Math.atan2(y, x)).toBeCloseTo(0.1, 3);
    }
  });
});
