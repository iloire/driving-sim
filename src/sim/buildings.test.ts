import { describe, expect, it } from 'vitest';
import { area, BuildingIndex, inside, roofline, wayOut, type Building } from './buildings';

// A 10 × 6 m house with its south-west corner at (100, 200).
const house = [100, 200, 110, 200, 110, 206, 100, 206];

describe('footprints', () => {
  it('knows inside from outside', () => {
    expect(inside(house, 105, 203)).toBe(true);
    expect(inside(house, 111, 203)).toBe(false);
    expect(inside(house, 105, 199.9)).toBe(false);
  });

  it('measures the area either way round', () => {
    expect(Math.abs(area(house))).toBeCloseTo(60);
  });

  it('points out through the nearest wall', () => {
    const out = wayOut(house, 109, 203); // 1 m from the east wall
    expect(out.depth).toBeCloseTo(1);
    expect(out.nx).toBeCloseTo(1);
    expect(out.ny).toBeCloseTo(0);
  });
});

describe('BuildingIndex', () => {
  it('finds a wall only inside a registered building, and forgets a dropped tile', () => {
    const index = new BuildingIndex();
    index.add('3_4', [{ pts: house, height: 6 }]);
    expect(index.wall(104, 201, 0)!.ny).toBeCloseTo(-1); // nearest is the south wall
    expect(index.wall(120, 201, 0)).toBeNull();
    expect(index.near(118, 203, 10)).toBe(true);
    index.remove('3_4');
    expect(index.wall(104, 201, 0)).toBeNull();
  });

  it('has walls only up to the roofline, so a car flying over is left alone', () => {
    const index = new BuildingIndex();
    const b: Building = { pts: house, height: 7 };
    // Ground rising 2 m across the plot: the roof is 7 m above the low side.
    b.top = roofline(b, (x) => 100 + (x - 100) / 5).top;
    expect(b.top).toBeCloseTo(107);
    index.add('t', [b]);
    expect(index.wall(104, 201, 106)).not.toBeNull();
    expect(index.wall(104, 201, 108)).toBeNull();
  });
});
