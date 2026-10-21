import { describe, expect, it } from 'vitest';
import { carveRoads, resample, roadProfile, RoadIndex, type Road } from './roads';
import { Heightmap } from './terrain';

/** A 6 km site with one 5 m detail tile in its south-west corner. */
function site(fn: (x: number, y: number) => number): Heightmap {
  const map = Heightmap.fromFunction(64, 6000, fn);
  map.addDetail(3000, 0, 0, Heightmap.fromFunction(600, 3000, fn, 0, 0));
  return map;
}

const northSouth = (x: number, bridge = false): Road => ({ kind: 'secondary', name: 'LZ-1', bridge, pts: [x, 200, x, 2800] });

describe('resample', () => {
  it('spaces points evenly along the line and keeps both ends', () => {
    const p = resample([0, 0, 10, 0, 10, 10], 4);
    expect(p.slice(0, 2)).toEqual([0, 0]);
    expect(p.slice(-2)).toEqual([10, 10]);
    expect(p.length / 2).toBe(6); // 0, 4, 8, then 4 m on round the corner: (10,2), (10,6), (10,10)
  });
});

describe('roadProfile', () => {
  it('irons out the bumps along a road but keeps the climb', () => {
    const bumpy = site((_x, y) => 50 + y * 0.05 + (Math.floor(y / 10) % 2) * 3);
    const pts = resample([1500, 200, 1500, 2800]);
    const z = roadProfile(bumpy, pts);
    let worst = 0;
    for (let i = 1; i < z.length; i++) worst = Math.max(worst, Math.abs(z[i] - z[i - 1]));
    expect(worst).toBeLessThan(0.5); // raw ground jumps 3 m every 10 m
    expect(z[z.length - 1] - z[0]).toBeGreaterThan(100);
  });

  it('never dips below the sea', () => {
    const z = roadProfile(site(() => -15), resample([100, 100, 400, 100]));
    expect(Math.min(...z)).toBeGreaterThan(0);
  });
});

describe('carveRoads', () => {
  // A hillside falling 30 m in 100 m towards the east; the road runs across it, north to south.
  const hillside = (x: number) => 800 - x * 0.3;

  it('levels the carriageway across a side slope', () => {
    const terrain = site(hillside);
    carveRoads(terrain, [northSouth(1500)]);
    const left = terrain.heightAt(1497, 1500), right = terrain.heightAt(1503, 1500);
    expect(Math.abs(left - right)).toBeLessThan(0.3); // was 1.8 m
    expect(terrain.heightAt(1500, 1500)).toBeCloseTo(hillside(1500), 0);
  });

  it('leaves the ground beyond the shoulder alone', () => {
    const terrain = site(hillside);
    carveRoads(terrain, [northSouth(1500)]);
    expect(terrain.heightAt(1520, 1500)).toBeCloseTo(hillside(1520), 3);
    expect(terrain.heightAt(1480, 1500)).toBeCloseTo(hillside(1480), 3);
  });

  it('does not cut under a bridge', () => {
    const terrain = site(hillside);
    carveRoads(terrain, [northSouth(1500, true)]);
    expect(terrain.heightAt(1503, 1500)).toBeCloseTo(hillside(1503), 3);
  });
});

describe('RoadIndex', () => {
  const index = new RoadIndex([northSouth(1500), { kind: 'track', name: '', bridge: false, pts: [0, 1000, 1400, 1000] }]);

  it('finds the closest road, its distance and its heading', () => {
    const hit = index.nearest(1510, 1500, 50)!;
    expect(hit.road.name).toBe('LZ-1');
    expect(hit.dist).toBeCloseTo(10, 5);
    expect(hit.x).toBeCloseTo(1500, 5);
    expect(hit.heading).toBeCloseTo(0, 5); // drawn south to north
  });

  it('honours the search radius and the filter', () => {
    expect(index.nearest(1600, 1500, 50)).toBeUndefined();
    const paved = index.nearest(1300, 1010, 300, (r) => r.kind !== 'track')!;
    expect(paved.road.name).toBe('LZ-1');
    expect(index.nearest(1300, 1010, 300)!.road.kind).toBe('track');
  });
});
