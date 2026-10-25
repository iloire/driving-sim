import { describe, expect, it } from 'vitest';
import { roughness, waves } from './sea';

describe('the sea', () => {
  it('runs downwind: every wave goes with the wind, give or take its spread, the swell straight down it', () => {
    // Scene axes: X east, Z south. Lanzarote's trades blow [-4, -6] (towards the SSW): scene (-4, 6).
    for (const w of waves([-4, -6])) expect(-4 * w.x + 6 * w.y).toBeGreaterThan(0);
    const [swell] = waves([-4, -6]);
    expect(Math.atan2(swell.y, swell.x)).toBeCloseTo(Math.atan2(6, -4), 6);
  });

  it('keeps some swell on a still day, roughens with the wind and stops at a gale', () => {
    expect(roughness([0, 0])).toBeCloseTo(0.3);
    expect(roughness([3, 0])).toBeGreaterThan(roughness([0, 0]));
    expect(roughness([0, -8])).toBeGreaterThan(roughness([3, 0]));
    expect(roughness([20, 20])).toBe(1);
    expect(waves([0, 0])[0].w).toBeGreaterThan(0);
  });

  it('moves each wave at the deep-water speed for its length', () => {
    for (const w of waves([5, 0])) {
      const k = Math.hypot(w.x, w.y);
      // Phase speed ω / k = √(g / k): a 60 m swell does about 9.7 m/s.
      expect(w.z / k).toBeCloseTo(Math.sqrt(9.81 / k), 6);
    }
    expect(waves([5, 0])[0].z / Math.hypot(waves([5, 0])[0].x, waves([5, 0])[0].y)).toBeCloseTo(9.68, 1);
  });
});
