import { describe, expect, it } from 'vitest';
import { BuildingIndex } from './buildings';
import { buildingHeight, buildingStyle, parseObjects, placeFurniture, SPARSE } from './objects';
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

  it('lets a site raise the cap: a city keeps its blocks of flats', () => {
    const city = buildingStyle({ maxStoreys: 14 });
    expect(buildingHeight({ 'building:levels': '8' }, 1, 100, city)).toBeCloseTo(26.2);
    expect(buildingHeight({ height: '60' }, 1, 100, city)).toBeCloseTo(45.4);
  });

  const storeysOf = (h: number) => Math.round((h - 0.6) / 3.2);
  const city = buildingStyle({ maxStoreys: 10, storeys: [1, 1, 1, 1, 1, 1, 1, 1] });
  const rolls = (tags: Record<string, string>, footprint: number, neighbours: number) =>
    Array.from({ length: 400 }, (_, id) => storeysOf(buildingHeight(tags, id + 1, footprint, city, neighbours)));

  it("rolls an untagged building in town from the zone's odds, the big ones from the taller half", () => {
    const small = rolls({ building: 'yes' }, 120, 50), big = rolls({ building: 'yes' }, 900, 50);
    expect(new Set(small)).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(Math.min(...big)).toBe(5);
    expect(rolls({ building: 'apartments' }, 120, 50).every((n) => n >= 5)).toBe(true);
  });

  it('keeps a house, or a building out on its own, to two storeys, and a warehouse to one', () => {
    expect(Math.max(...rolls({ building: 'house' }, 120, 50))).toBe(2);
    expect(Math.max(...rolls({ building: 'yes' }, 900, SPARSE - 1))).toBe(2);
    expect(new Set(rolls({ building: 'warehouse' }, 2000, 50))).toEqual(new Set([1]));
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
