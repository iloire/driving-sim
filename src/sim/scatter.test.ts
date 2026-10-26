import { describe, expect, it } from 'vitest';
import { createCar, stepCar, TRUCK } from './car';
import { FAR_LAYERS, groundOf, NEAR_LAYERS, ScatterField, scatterCell, scatterSpec, SOLID, type Ground, type ScatterWorld } from './scatter';

const FOREST = groundOf(0.2, 0.28, 0.17);
const LAVA = groundOf(0.22, 0.22, 0.24);
const SAND = groundOf(0.85, 0.82, 0.74);

/** Flat ground 10 m up, a road along y = 500 (8 m wide), the photo set by `ground`. */
const world = (ground: (x: number, y: number) => Ground = () => FOREST): ScatterWorld => ({
  ground,
  height: () => 10,
  clear: (_x, y, r) => Math.abs(y - 500) > 4 + r,
  ready: () => true,
});
const spec = scatterSpec({ trees: { pine: 1 }, lone: 0 });

describe('groundOf', () => {
  it('reads forest as green, lava as dark, sand as bare', () => {
    expect(FOREST.green).toBe(1);
    expect(LAVA.dark).toBeGreaterThan(0.8);
    expect(LAVA.green).toBe(0);
    expect(SAND.bare).toBeGreaterThan(0.8);
  });
});

describe('scatterCell', () => {
  it('is the same every time a cell is asked for', () => {
    const a = scatterCell(NEAR_LAYERS, 25, 4, 7, world(), spec);
    const b = scatterCell(NEAR_LAYERS, 25, 4, 7, world(), spec);
    expect(a.length).toBeGreaterThan(5);
    expect(b).toEqual(a);
    expect(scatterCell(NEAR_LAYERS, 25, 5, 7, world(), spec)).not.toEqual(a);
  });

  it('keeps everything in its cell and off the road', () => {
    for (let cx = 0; cx < 20; cx++) {
      for (const it of scatterCell(FAR_LAYERS, 50, cx, 9, world(), spec)) {
        expect(it.x).toBeGreaterThanOrEqual(cx * 50);
        expect(it.x).toBeLessThan((cx + 1) * 50);
        expect(Math.abs(it.y - 500)).toBeGreaterThan(4);
      }
    }
  });

  it('grows forest where the photo is green and rocks where it is lava', () => {
    const count = (g: Ground, kind: string) => {
      let n = 0;
      for (let cx = 0; cx < 30; cx++) n += scatterCell(FAR_LAYERS, 50, cx, 3, world(() => g), spec).filter((i) => i.kind === kind).length;
      return n;
    };
    expect(count(FOREST, 'pine')).toBeGreaterThan(10 * Math.max(count(LAVA, 'pine'), 1));
    expect(count(LAVA, 'boulder')).toBeGreaterThan(3 * count(FOREST, 'boulder'));
  });

  it('plants lone trees in open ground only as thick as the zone asks', () => {
    const farmland = groundOf(0.55, 0.45, 0.35);
    const trees = (lone: number) => {
      let n = 0;
      for (let cx = 0; cx < 60; cx++) n += scatterCell(FAR_LAYERS, 50, cx, 30, world(() => farmland), scatterSpec({ trees: { palm: 1 }, lone })).filter((i) => i.kind === 'palm').length;
      return n;
    };
    expect(trees(0)).toBe(0);
    expect(trees(0.1)).toBeGreaterThan(0);
  });

  it('leaves the sea bare', () => {
    expect(scatterCell(NEAR_LAYERS, 25, 1, 1, world(() => FOREST), spec).length).toBeGreaterThan(0);
    expect(scatterCell(NEAR_LAYERS, 25, 1, 1, { ...world(), height: () => -3 }, spec)).toEqual([]);
  });
});

describe('ScatterField', () => {
  it('fills the cells round the car and drops them once it is well past', () => {
    const f = new ScatterField(FAR_LAYERS, 50, 200, world(), spec);
    f.update(1000, 1000, Infinity);
    const near = f.cells.size;
    expect(near).toBeGreaterThan(40);
    f.update(3000, 1000, Infinity);
    expect(f.cells.size).toBe(near);
    for (const c of f.cells.values()) expect(Math.abs((c.cx + 0.5) * 50 - 3000)).toBeLessThan(260);
  });

  it('waits for cells whose ground has not loaded', () => {
    const f = new ScatterField(FAR_LAYERS, 50, 200, { ...world(), ready: (x) => x < 1000 }, spec);
    f.update(1000, 1000, Infinity);
    for (const c of f.cells.values()) expect(c.cx * 50).toBeLessThan(1000);
  });

  it('pushes the car out of a trunk, and not over the tree top', () => {
    const f = new ScatterField(FAR_LAYERS, 50, 200, world(), spec);
    f.update(1000, 1000, Infinity);
    const tree = [...f.cells.values()].flatMap((c) => c.items).find((i) => i.kind === 'pine')!;
    const hit = f.solid(tree.x + 0.3, tree.y, tree.z + 1)!;
    expect(hit.nx).toBeCloseTo(1);
    expect(hit.depth).toBeGreaterThan(0.3);
    expect(f.solid(tree.x + 0.3, tree.y, tree.z + SOLID.pine!.height * tree.size + 1)).toBeNull();
    expect(f.solid(tree.x + 5, tree.y + 5, tree.z + 1)).toBeNull();
  });
});

describe('a tree in the way', () => {
  it('stops the car even when the trunk lines up between the points the car feels walls at', () => {
    const f = new ScatterField(FAR_LAYERS, 50, 200, world(), spec);
    // One pine 40 m up the road, a hand off the car's centreline, and nothing else.
    f.cells.set(0, { cx: 0, cy: 0, items: [{ kind: 'pine', x: 0.55, y: 40, z: 10, size: 1, turn: 0, tint: [1, 1, 1] }] });
    const s = createCar(TRUCK, 0, 0, 10, 0);
    const c = { throttle: 1, brake: 0, steer: 0, handbrake: false, boost: false, flight: { pitch: 0, roll: 0, yaw: 0, thrust: 0, lift: 0 } };
    const env = { height: () => 10, surface: () => ({ grip: 1, rolling: 0.012 }), wall: (x: number, y: number, z: number) => f.solid(x, y, z) };
    let peak = 0;
    for (let t = 0; t < 6; t += 1 / 120) {
      stepCar(s, TRUCK, c, env, 1 / 120);
      peak = Math.max(peak, s.pos[1]);
    }
    expect(peak + TRUCK.body[1]).toBeLessThan(40);
  });
});
