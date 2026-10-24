import { describe, expect, it } from 'vitest';
import { createPilot, PILOT, stepPilot, type Pilot } from './pilot';

const STEP = 1 / 60;

function hold(p: Pilot, g: number, seconds: number): Pilot {
  for (let t = 0; t < seconds; t += STEP) stepPilot(p, PILOT, g, STEP);
  return p;
}

describe('the pilot under g', () => {
  it('shrugs off a 2 s snap to 9 g', () => {
    const p = hold(createPilot(), 9, 2);
    expect(p.grey).toBeLessThan(0.15);
    expect(p.out).toBe(false);
  });

  it('holds 6 g indefinitely with only a hint of grey', () => {
    const p = hold(createPilot(), 6, 60);
    expect(p.grey).toBeGreaterThan(0);
    expect(p.grey).toBeLessThan(0.25);
    expect(p.out).toBe(false);
  });

  it('greys out holding 9 g and blacks out within about 10 s', () => {
    const p = createPilot();
    let greyAt = Infinity, outAt = Infinity;
    for (let t = 0; t < 15; t += STEP) {
      stepPilot(p, PILOT, 9, STEP);
      if (p.grey > 0.5) greyAt = Math.min(greyAt, t);
      if (p.out) outAt = Math.min(outAt, t);
    }
    expect(greyAt).toBeGreaterThan(3);
    expect(outAt).toBeGreaterThan(5);
    expect(outAt).toBeLessThan(10);
  });

  it('stays out for 3 s even with the pull eased, then comes round with a clearing view', () => {
    const p = createPilot();
    while (!p.out) stepPilot(p, PILOT, 9, STEP);
    hold(p, 1, 2.8);
    expect(p.out).toBe(true);
    expect(p.grey).toBe(1);
    hold(p, 1, 0.4);
    expect(p.out).toBe(false);
    expect(p.grey).toBe(0);
  });

  it('clears faster than it greyed', () => {
    const p = hold(createPilot(), 7.5, 20);
    expect(p.grey).toBeGreaterThan(0.6);
    hold(p, 1, 2);
    expect(p.grey).toBe(0);
  });

  it('reddens under sustained negative g, and not under positive', () => {
    expect(hold(createPilot(), -3, 10).red).toBeGreaterThan(0.5);
    expect(hold(createPilot(), 9, 10).red).toBe(0);
  });
});
