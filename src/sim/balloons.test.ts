import { describe, expect, it } from 'vitest';
import { BALLOON_RADIUS, BalloonField, CAR_REACH, COMBO_WINDOW, DEFAULT_FIELD, segmentDistance } from './balloons';

const flat = () => 0;
const anywhere = () => true;

function fieldWithOneBalloonAt(x: number, y: number, z: number): BalloonField {
  const f = new BalloonField(flat, anywhere, { ...DEFAULT_FIELD, count: 1, near: 5000, far: 5001 });
  f.fill(0, 0);
  Object.assign(f.balloons[0], { x, y, z });
  return f;
}

describe('segmentDistance', () => {
  it('measures to the nearest point of the segment, ends included', () => {
    expect(segmentDistance(0, 0, 0, 10, 0, 0, 5, 3, 0)).toBeCloseTo(3);
    expect(segmentDistance(0, 0, 0, 10, 0, 0, 13, 4, 0)).toBeCloseTo(5);
  });
});

describe('BalloonField', () => {
  it('keeps the field full, in the ring and at flying height', () => {
    const f = new BalloonField(() => 50, anywhere);
    f.fill(1000, 1000);
    expect(f.balloons).toHaveLength(DEFAULT_FIELD.count);
    for (const b of f.balloons) {
      const r = Math.hypot(b.x - 1000, b.y - 1000);
      expect(r).toBeGreaterThanOrEqual(DEFAULT_FIELD.near - 1e-6);
      expect(r).toBeLessThanOrEqual(DEFAULT_FIELD.far + 1e-6);
      expect(b.z - 50).toBeGreaterThanOrEqual(DEFAULT_FIELD.minAgl);
      expect(b.z - 50).toBeLessThanOrEqual(DEFAULT_FIELD.maxAgl);
    }
  });

  it('only puts balloons over the map', () => {
    const f = new BalloonField(flat, (x) => x > 0);
    f.fill(0, 0);
    expect(f.balloons.every((b) => b.x > 0)).toBe(true);
  });

  it('pops a balloon the car flies through, even in one long 600 km/h step', () => {
    const f = fieldWithOneBalloonAt(500, 0, 100);
    // 167 m/s over a tenth of a second: the balloon sits mid-step, far from both ends.
    const pops = f.update(0.1, [490, 0, 100], [516.7, 0, 100], 167);
    expect(pops).toHaveLength(1);
    expect(f.popped).toBe(1);
    expect(f.balloons).toHaveLength(1); // a new one already floats somewhere else
    expect(f.balloons[0].id).not.toBe(pops[0].balloon.id);
  });

  it('misses a balloon that is just out of reach', () => {
    const f = fieldWithOneBalloonAt(500, BALLOON_RADIUS + CAR_REACH + 0.5, 100);
    expect(f.update(0.1, [490, 0, 100], [510, 0, 100], 100)).toHaveLength(0);
  });

  it('scores 100 plus a speed bonus, multiplied while the combo runs', () => {
    const f = fieldWithOneBalloonAt(100, 0, 100);
    const [first] = f.update(0.1, [90, 0, 100], [110, 0, 100], 100); // 360 km/h
    expect(first.points).toBe(200);
    Object.assign(f.balloons[0], { x: 300, y: 0, z: 100 });
    const [second] = f.update(1, [290, 0, 100], [310, 0, 100], 100);
    expect(second.combo).toBe(2);
    expect(second.points).toBe(400);
    expect(f.score).toBe(600);
  });

  it('lets the combo lapse after the window', () => {
    const f = fieldWithOneBalloonAt(100, 0, 100);
    f.update(0.1, [90, 0, 100], [110, 0, 100], 0);
    f.update(COMBO_WINDOW + 0.5, [110, 0, 100], [111, 0, 100], 0);
    Object.assign(f.balloons[0], { x: 300, y: 0, z: 100 });
    const [next] = f.update(0.1, [290, 0, 100], [310, 0, 100], 0);
    expect(next.combo).toBe(1);
    expect(next.points).toBe(100);
  });

  it('moves on balloons left far behind', () => {
    const f = new BalloonField(flat, anywhere);
    f.fill(0, 0);
    const ids = new Set(f.balloons.map((b) => b.id));
    f.update(0.1, [0, 0, 100], [20000, 0, 100], 50); // teleported away
    expect(f.balloons).toHaveLength(DEFAULT_FIELD.count);
    expect(f.balloons.some((b) => ids.has(b.id))).toBe(false);
  });
});
