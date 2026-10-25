import { describe, expect, it } from 'vitest';
import { step } from './welcome';

describe('welcome screen', () => {
  it('steps through places, wrapping at both ends', () => {
    const list = ['timanfaya', 'airport', 'mirador'];
    expect(step(list, 'airport', 1)).toBe('mirador');
    expect(step(list, 'mirador', 1)).toBe('timanfaya');
    expect(step(list, 'timanfaya', -1)).toBe('mirador');
  });

});
