import { describe, expect, it } from 'vitest';
import { BIRDS, Birds } from './birds';
import type { V3 } from './vec';

/** Mulberry32: the same flocks every run. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ground = () => 50;
const open = () => true;

describe('Birds', () => {
  it('keeps a few flocks in the sky round the camera, above the ground', () => {
    const b = new Birds(seeded(1));
    const eye: V3 = [5000, 5000, 52];
    for (let t = 0; t < 30; t += 0.1) b.update(0.1, eye, eye, 0, ground, open, false);
    const flying = b.flocks.filter((f) => f.mode !== 'perched');
    expect(flying.length).toBe(BIRDS.soaring + BIRDS.passing);
    for (const p of b.poses()) {
      expect(p.pos[2]).toBeGreaterThan(ground() + 10);
      expect(Math.hypot(p.pos[0] - eye[0], p.pos[1] - eye[1])).toBeLessThan(BIRDS.drop + 200);
    }
  });

  it('drops flocks left behind and finds new ones where the camera is', () => {
    const b = new Birds(seeded(2));
    const eye: V3 = [5000, 5000, 52];
    for (let t = 0; t < 2; t += 0.1) b.update(0.1, eye, eye, 0, ground, open, false);
    for (let t = 0; t < 2; t += 0.1) b.update(0.1, [20000, 5000, 52], [20000, 5000, 52], 0, ground, open, false);
    for (const f of b.flocks) expect(Math.abs(f.centre[0] - 20000)).toBeLessThan(BIRDS.drop);
  });

  it('settles flocks in the fields ahead, which take off when the car drives up', () => {
    const b = new Birds(seeded(3));
    const car: V3 = [5000, 5000, 52];
    b.update(0.1, car, car, 0, ground, open, true);
    const perched = b.flocks.find((f) => f.mode === 'perched')!;
    expect(perched.centre[1]).toBeGreaterThan(car[1]); // ahead, to the north
    for (const p of b.poses().filter((p) => p.flap < 0)) expect(p.pos[2]).toBe(50);
    // Drive up to it.
    const near: V3 = [perched.centre[0], perched.centre[1] - 20, 52];
    b.update(0.1, near, near, 0, ground, open, true);
    expect(perched.mode).toBe('fleeing');
    for (let t = 0; t < 3; t += 0.1) b.update(0.1, near, near, 0, ground, () => false, true);
    for (const bird of perched.birds) {
      expect(bird.pos[2]).toBeGreaterThan(55);
      expect(Math.hypot(bird.pos[0] - near[0], bird.pos[1] - near[1])).toBeGreaterThan(30);
    }
    for (let t = 0; t < BIRDS.regroup; t += 0.1) b.update(0.1, near, near, 0, ground, () => false, true);
    expect(perched.mode).toBe('passing');
  });

  it('never perches where it is not open ground', () => {
    const b = new Birds(seeded(4));
    const car: V3 = [5000, 5000, 52];
    for (let t = 0; t < 5; t += 0.1) b.update(0.1, car, car, 0, ground, () => false, true);
    expect(b.flocks.some((f) => f.mode === 'perched')).toBe(false);
  });
});
