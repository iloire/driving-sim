import { describe, expect, it } from 'vitest';
import { People, PEOPLE, type Hitter, type Person } from './people';
import { RoadIndex, ROAD_WIDTH, type Road } from './roads';
import type { V3 } from './vec';

function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const STEP = 1 / 120;
/** A street up the y axis, lamps along its east side every 28 m. */
const street: Road = { kind: 'minor', name: '', bridge: false, pts: [0, 0, 0, 1000] };
const lampsAll = Array.from({ length: 36 }, (_, i) => ({ x: ROAD_WIDTH.minor / 2 + 1.4, y: i * 28 }));
const world = (lamps = lampsAll) => ({
  roads: new RoadIndex([street]),
  height: () => 10,
  lamps: (x: number, y: number, r: number) => lamps.filter((l) => Math.hypot(l.x - x, l.y - y) < r),
});
/** A car on the street, going north at `speed`. */
const carAt = (y: number, speed: number, x = ROAD_WIDTH.minor / 2 + PEOPLE.kerb): Hitter => ({
  pos: [x, y, 10.6], vel: [0, speed, 0], heading: 0, front: 2.5, back: 2.35, side: 1, top: 1.2,
});
function run(p: People, seconds: number, eye: V3, car: Hitter | null = null): void {
  for (let t = 0; t < seconds; t += STEP) {
    if (car) {
      car.pos[0] += car.vel[0] * STEP;
      car.pos[1] += car.vel[1] * STEP;
    }
    p.step(STEP, eye, car);
  }
}

describe('People', () => {
  it('walk the pavement by the lamps, past the kerb, and only where there are lamps', () => {
    const p = new People(world(), seeded(1));
    run(p, 3, [0, 500, 10]);
    expect(p.people.length).toBeGreaterThan(5);
    for (const q of p.people) {
      expect(q.state).toBe('walk');
      expect(q.pos[0]).toBeCloseTo(ROAD_WIDTH.minor / 2 + PEOPLE.kerb, 1);
    }
    const none = new People(world([]), seeded(1));
    run(none, 3, [0, 500, 10]);
    expect(none.people.length).toBe(0);
  });

  it('turn back at the end of the street on the same pavement', () => {
    const p = new People(world(), seeded(2));
    run(p, 1, [0, 950, 10]);
    const q = p.people.find((x) => x.dir === 1)!;
    run(p, 120, [0, 950, 10]);
    expect(q.dir).toBe(-1);
    expect(q.pos[0]).toBeCloseTo(ROAD_WIDTH.minor / 2 + PEOPLE.kerb, 1);
  });

  it('jump clear of a car driving straight at them', () => {
    const p = new People(world(), seeded(3));
    run(p, 1, [0, 500, 10]);
    // Them alone on the pavement.
    const q: Person = p.people[0];
    p.people.splice(1);
    const saved = PEOPLE.count;
    PEOPLE.count = 1;
    const car = carAt(q.pos[1] - 30, 15, q.pos[0] + 0.5);
    run(p, 3, [0, 500, 10], car);
    PEOPLE.count = saved;
    expect(q.state).not.toBe('flying');
    expect(q.state).not.toBe('down');
    expect(p.hits).toBe(0);
  });

  it('are knocked flying by a car that catches them, then get up and wander off', () => {
    const p = new People(world(), seeded(4));
    run(p, 1, [0, 500, 10]);
    const q: Person = p.people[0];
    // Too close to get out of the way.
    const car = carAt(q.pos[1] - 4, 20, q.pos[0]);
    run(p, 0.3, [0, 500, 10], car);
    expect(q.state).toBe('flying');
    expect(p.hits).toBe(1);
    let peak = 0;
    for (let t = 0; t < 2; t += 0.1) {
      run(p, 0.1, [0, 500, 10]);
      peak = Math.max(peak, q.pos[2]);
    }
    expect(peak).toBeGreaterThan(11.5);
    run(p, 6, [0, 500, 10]);
    expect(q.state).toBe('wander');
    expect(q.pos[2]).toBe(10);
  });
});
