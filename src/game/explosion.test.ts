import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { flash, fling } from './explosion';

describe('the explosion', () => {
  it('flashes at once and is gone within half a second', () => {
    expect(flash(0)).toBe(1);
    expect(flash(0.1)).toBeGreaterThan(0.3);
    expect(flash(0.5)).toBe(0);
    expect(flash(-1)).toBe(0);
  });

  it('flings debris up and lets it fall back, bouncing lower each time and never through the ground', () => {
    const pos = new THREE.Vector3(0, 0, 0), vel = new THREE.Vector3(10, 30, 0);
    let top = 0, lowest = Infinity, bounces = 0, wasFalling = false;
    for (let t = 0; t < 10; t += 1 / 60) {
      fling(pos, vel, 0, 1 / 60);
      top = Math.max(top, pos.y);
      lowest = Math.min(lowest, pos.y);
      if (wasFalling && vel.y > 0) bounces++;
      wasFalling = vel.y < 0;
    }
    expect(top).toBeGreaterThan(25);
    expect(lowest).toBeGreaterThanOrEqual(0);
    expect(bounces).toBeGreaterThan(0);
    expect(Math.abs(vel.y)).toBeLessThan(1);
  });
});
