import { describe, expect, it } from 'vitest';
import { CloudField, seedOf, wrapNear, type CloudLayer } from './weather';

const CUMULUS: CloudLayer = { base: 1000, top: 1800, cover: 0.3, size: 700 };
const EXTENT = 20000;

describe('CloudField', () => {
  it('draws the same sky from the same seed, and more cloud for more cover', () => {
    const a = new CloudField([CUMULUS], EXTENT, seedOf('trades'));
    const b = new CloudField([CUMULUS], EXTENT, seedOf('trades'));
    expect(a.puffs).toEqual(b.puffs);
    const more = new CloudField([{ ...CUMULUS, cover: 0.6 }], EXTENT, seedOf('trades'));
    expect(more.puffs.length).toBeGreaterThan(1.6 * a.puffs.length);
  });

  it('keeps every puff between its layer\'s base and top', () => {
    const f = new CloudField([CUMULUS], EXTENT, 1);
    for (const p of f.puffs) {
      expect(p.z).toBeGreaterThanOrEqual(CUMULUS.base);
      expect(p.z).toBeLessThanOrEqual(CUMULUS.top);
    }
  });

  it('is dense in the middle of a puff, clear far from one and clear under the cloud base', () => {
    const f = new CloudField([CUMULUS], EXTENT, 7);
    const p = f.puffs[0];
    expect(f.density(p.x, p.y, p.z)).toBeGreaterThan(0.99);
    expect(f.density(p.x, p.y, 200)).toBe(0);
    expect(f.density(p.x, p.y, 9000)).toBe(0);
  });

  it('moves the clouds with the wind and brings them round again', () => {
    const f = new CloudField([CUMULUS], EXTENT, 7);
    const p = f.puffs[0];
    f.step(100, [30, 0]); // 3 km east
    expect(f.density(p.x + 3000, p.y, p.z)).toBeGreaterThan(0.99);
    expect(f.at(p, p.x, p.y)[0]).toBeCloseTo(p.x + 3000);
    // A whole period on, it is back where it started.
    f.step((f.period - 3000) / 30, [30, 0]);
    expect(f.density(p.x, p.y, p.z)).toBeGreaterThan(0.99);
  });

  it('only fills a layer\'s box', () => {
    const f = new CloudField([{ ...CUMULUS, cover: 0.8, box: [0, 0.5, 1, 1] }], EXTENT, 3);
    expect(f.puffs.length).toBeGreaterThan(0);
    // The puffs spill a cloud's width past the edge, no more.
    for (const p of f.puffs) expect(p.y).toBeGreaterThan(0.5 * EXTENT - 2 * CUMULUS.size);
  });
});

describe('wrapNear', () => {
  it('moves a value by whole periods to the copy nearest a point', () => {
    expect(wrapNear(100, 0, 1000)).toBe(100);
    expect(wrapNear(900, 0, 1000)).toBe(-100);
    expect(wrapNear(-2100, 0, 1000)).toBe(-100);
  });
});
