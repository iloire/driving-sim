import { describe, expect, it } from 'vitest';
import { breath, breathPeriod } from './warnings';

describe('the strained breath', () => {
  it('is a quiet inhale, a held silence, then a louder grunt, and silent again', () => {
    expect(breath(0.11)).toBeCloseTo(0.55, 2);
    expect(breath(0.35)).toBe(0);
    expect(breath(0.6)).toBeCloseTo(1, 2);
    expect(breath(0.9)).toBe(0);
  });

  it('quickens as the strain nears a blackout', () => {
    expect(breathPeriod(0)).toBeCloseTo(1.8);
    expect(breathPeriod(1)).toBeCloseTo(1);
    expect(breathPeriod(0.5)).toBeLessThan(breathPeriod(0.2));
  });
});
