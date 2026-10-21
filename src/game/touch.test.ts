import { describe, expect, it } from 'vitest';
import { thumb } from './touch';

describe('thumb', () => {
  it('steers left when the left thumb slides left, to full lock and no further', () => {
    expect(thumb('left', -35, 0).steer).toBeCloseTo(0.5);
    expect(thumb('left', -500, 0).steer).toBe(1);
    expect(thumb('left', 70, 0).steer).toBe(-1);
  });

  it('accelerates when the right thumb pushes up and brakes when it pulls down', () => {
    expect(thumb('right', 0, -70)).toEqual({ steer: 0, throttle: 1, brake: 0 });
    expect(thumb('right', 0, 35)).toEqual({ steer: 0, throttle: 0, brake: 0.5 });
  });
});
