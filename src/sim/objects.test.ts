import { describe, expect, it } from 'vitest';
import { BuildingIndex } from './buildings';
import { buildingHeight, parseObjects, placeFurniture } from './objects';
import { ROAD_WIDTH, type Road } from './roads';

const main = (pts: number[]): Road => ({ kind: 'secondary', name: 'LZ-1', bridge: false, pts });

describe('buildingHeight', () => {
  it('trusts the tags up to two storeys', () => {
    expect(buildingHeight({ height: '5' }, 1, 100)).toBe(5);
    expect(buildingHeight({ height: '12' }, 1, 100)).toBeCloseTo(7);
    expect(buildingHeight({ 'building:levels': '1' }, 1, 100)).toBeCloseTo(3.8);
    expect(buildingHeight({ 'building:levels': '8' }, 1, 100)).toBeCloseTo(7);
    expect(buildingHeight({ building: 'church', height: '20' }, 1, 100)).toBe(11);
  });

  it('gives an untagged house one or two storeys, the same every time', () => {
    const seen = new Set<number>();
    for (let id = 1; id < 200; id++) {
      const h = buildingHeight({ building: 'house' }, id, 90);
      seen.add(h);
      expect(buildingHeight({ building: 'house' }, id, 90)).toBe(h);
    }
    expect([...seen].map((h) => Math.round(h * 10) / 10).sort()).toEqual([3.8, 7]);
  });
});

describe('placeFurniture', () => {
  it('posts the open road on both sides, at the edge and off the tarmac', () => {
    const { lamps, posts } = placeFurniture([main([0, 0, 0, 1000])], new BuildingIndex());
    expect(lamps).toHaveLength(0);
    expect(posts.length).toBeGreaterThan(30); // ~20 per side over a kilometre
    for (const p of posts) expect(Math.abs(Math.abs(p.x) - (ROAD_WIDTH.secondary / 2 + 1))).toBeLessThan(0.01);
  });

  it('lights the road through town instead, the arms over the road', () => {
    const town = new BuildingIndex();
    town.add('t', [{ pts: [12, 0, 30, 0, 30, 1000, 12, 1000], height: 6 }]);
    const { lamps, posts } = placeFurniture([main([0, 0, 0, 1000])], town);
    expect(posts).toHaveLength(0);
    expect(lamps.length).toBeGreaterThan(25);
    for (const l of lamps) expect(Math.sign(Math.sin(l.heading))).toBe(-Math.sign(l.x)); // pointing at x = 0
  });

  it('keeps furniture out of buildings and off crossing roads', () => {
    const town = new BuildingIndex();
    town.add('t', [{ pts: [-30, 0, -4.4, 0, -4.4, 1000, -30, 1000], height: 6 }]); // flush with the west kerb
    const { lamps } = placeFurniture([main([0, 0, 0, 1000])], town);
    expect(lamps.every((l) => l.x > 0)).toBe(true);
  });
});

describe('parseObjects', () => {
  it('unpacks the tile file', () => {
    const o = parseObjects({ b: [[6, 0, 0, 10, 0, 10, 10]], l: [1, 2, 0.5], p: [3, 4] });
    expect(o.buildings[0]).toEqual({ height: 6, pts: [0, 0, 10, 0, 10, 10] });
    expect(o.lamps[0]).toEqual({ x: 1, y: 2, heading: 0.5 });
    expect(o.posts[0]).toEqual({ x: 3, y: 4 });
  });
});
