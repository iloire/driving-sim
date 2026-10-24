import { describe, expect, it } from 'vitest';
import { secondsToGround } from './flight-hud';

const flat = () => 0;
/** A 500 m ridge across the way 2 km north. */
const ridge = (_x: number, y: number) => (y > 2000 && y < 2200 ? 500 : 0);

describe('secondsToGround', () => {
  it('sees a dive coming, and stays quiet flying level or climbing', () => {
    expect(secondsToGround([0, 0, 300], [0, 200, -100], flat)).toBeCloseTo(3, 0);
    expect(secondsToGround([0, 0, 300], [0, 200, 0], flat)).toBe(Infinity);
    expect(secondsToGround([0, 0, 100], [0, 200, 30], flat)).toBe(Infinity);
  });

  it('sees a ridge ahead on a level line, and only within its horizon', () => {
    expect(secondsToGround([0, 0, 300], [0, 250, 0], ridge, 10)).toBeCloseTo(8, 0);
    expect(secondsToGround([0, 1000, 300], [0, 250, 0], ridge)).toBeCloseTo(4, 0);
    expect(secondsToGround([0, 0, 300], [0, 250, 0], ridge)).toBe(Infinity);
  });
});
