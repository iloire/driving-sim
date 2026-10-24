import { describe, expect, it } from 'vitest';
import { step, timesOfDay } from './welcome';

describe('welcome screen', () => {
  it('steps through places, wrapping at both ends', () => {
    const list = ['timanfaya', 'airport', 'mirador'];
    expect(step(list, 'airport', 1)).toBe('mirador');
    expect(step(list, 'mirador', 1)).toBe('timanfaya');
    expect(step(list, 'timanfaya', -1)).toBe('mirador');
  });

  it('names the times of day inside the daylight, dawn and sunset at its ends', () => {
    const t = timesOfDay(7.2, 18.8);
    expect(Object.keys(t)).toEqual(['Dawn', 'Morning', 'Midday', 'Afternoon', 'Sunset']);
    expect(t.Dawn).toBe(7.2);
    expect(t.Sunset).toBe(18.8);
    expect(t.Afternoon).toBe(16.5);
  });

  it('keeps every time lit on a short day', () => {
    const t = timesOfDay(10, 15);
    expect(Math.min(...Object.values(t))).toBe(10);
    expect(Math.max(...Object.values(t))).toBe(15);
  });
});
