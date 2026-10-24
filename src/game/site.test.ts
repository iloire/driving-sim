import { describe, expect, it } from 'vitest';
import { ZONES, zoneOf } from './site';

describe('zoneOf', () => {
  it('takes the zone a link names', () => {
    expect(zoneOf(new URLSearchParams('site=benasque'))).toBe('benasque');
  });

  it('falls back to the first zone, so links from before there were zones still open Lanzarote', () => {
    expect(ZONES[0].id).toBe('lanzarote');
    expect(zoneOf(new URLSearchParams(''))).toBe('lanzarote');
    expect(zoneOf(new URLSearchParams('site=atlantis'))).toBe('lanzarote');
  });
});
