import { describe, expect, it } from 'vitest';
import { gearDown } from './jet-model';

describe('the Jet landing gear', () => {
  it('is down only when slow and low, or on the ground', () => {
    expect(gearDown(80, 50, false)).toBe(true);
    expect(gearDown(80, 600, false)).toBe(false);
    expect(gearDown(200, 50, false)).toBe(false);
    expect(gearDown(120, 0, true)).toBe(true);
  });
});
