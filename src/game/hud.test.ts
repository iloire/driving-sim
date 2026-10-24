import { describe, expect, it } from 'vitest';
import { mapScale } from './hud';

describe('mapScale', () => {
  it('keeps the road zoom as it was', () => {
    expect(mapScale(0, false, 0)).toBeCloseTo(2.5);
    expect(mapScale(160, false, 0)).toBeCloseTo(8.1);
  });

  it('keeps zooming out past road speeds, so a fast Jet sees as many seconds ahead', () => {
    const rimSeconds = (kmh: number) => (100 * mapScale(kmh, true, 0)) / (kmh / 3.6);
    expect(mapScale(900, true, 0)).toBeGreaterThan(30);
    expect(rimSeconds(1450)).toBeGreaterThan(12);
    expect(mapScale(3000, true, 0)).toBe(mapScale(1600, true, 0));
  });

  it('widens with height in the air only', () => {
    expect(mapScale(300, true, 1000) - mapScale(300, true, 0)).toBeCloseTo(20);
    expect(mapScale(300, false, 1000)).toBe(mapScale(300, false, 0));
  });
});
