import { describe, expect, it } from 'vitest';
import { CATCH_BASE, createLaunch, enginesFor, MOUNT, stepLaunch, SUPER_HEAVY, type Launch, type LaunchControls, type LaunchEvent } from './starship';

const STEP = 1 / 120;
const PAD_Z = 193;
const ground = () => PAD_Z;
const hands = (): LaunchControls => ({ pitch: 0, yaw: 0, throttle: 1, fire: false, auto: false });

/** Runs the launch from the countdown until `stop` says so (or 15 minutes pass), noting when each event happened. */
function run(l: Launch, stop: (l: Launch) => boolean, each?: (l: Launch, c: LaunchControls) => void): Map<LaunchEvent, Launch> {
  const seen = new Map<LaunchEvent, Launch>();
  const c = hands();
  c.fire = true;
  for (let i = 0; i < 120 * 900 && !stop(l); i++) {
    each?.(l, c);
    stepLaunch(l, c, ground, STEP);
    c.fire = c.auto = false;
    for (const e of l.events) seen.set(e, structuredClone(l));
  }
  return seen;
}
const done = (l: Launch) => l.phase === 'caught' || l.phase === 'lost';
const speed = (l: Launch) => Math.hypot(...l.booster.vel);

describe('Starship', () => {
  it('sits on the tower until the countdown, and lifts off at zero', () => {
    const l = createLaunch([0, 0, PAD_Z], Math.PI / 2);
    for (let i = 0; i < 600; i++) stepLaunch(l, hands(), ground, STEP);
    expect(l.phase).toBe('pad');
    expect(l.booster.pos[2]).toBe(PAD_Z + MOUNT);
    const seen = run(l, (x) => x.t > 5);
    expect(seen.get('ignition')!.t).toBeCloseTo(-3, 1);
    expect(seen.get('liftoff')!.t).toBeGreaterThanOrEqual(0);
    expect(seen.get('liftoff')!.t).toBeLessThan(0.1);
    expect(l.booster.vel[2]).toBeGreaterThan(5);
  });

  it('on the autopilot, cuts the booster high, fast and still climbing, through a max-q it eases back for', () => {
    const l = createLaunch([0, 0, PAD_Z], Math.PI / 2);
    const seen = run(l, (x) => x.phase !== 'pad' && x.phase !== 'ascent');
    const meco = seen.get('meco')!;
    expect(meco.t).toBeGreaterThan(110);
    expect(meco.t).toBeLessThan(150);
    expect(meco.booster.pos[2] - PAD_Z).toBeGreaterThan(45e3);
    expect(meco.booster.pos[2] - PAD_Z).toBeLessThan(75e3);
    expect(speed(meco)).toBeGreaterThan(1400);
    expect(speed(meco)).toBeLessThan(2000);
    expect(meco.booster.vel[2]).toBeGreaterThan(300);
    // Downrange is east.
    expect(meco.booster.pos[0]).toBeGreaterThan(30e3);
    expect(Math.abs(meco.booster.pos[1])).toBeLessThan(100);
    const maxq = seen.get('maxq')!;
    expect(maxq.peakQ).toBeGreaterThan(25e3);
    expect(maxq.peakQ).toBeLessThan(40e3);
  });

  for (const [name, azimuth] of [['east', Math.PI / 2], ['north-east', Math.PI / 4]] as const) {
    it(`on the autopilot, flies the booster home and the arms catch it (launching ${name})`, () => {
      const l = createLaunch([12e3, 20e3, PAD_Z], azimuth);
      const seen = run(l, done);
      expect(l.phase).toBe('caught');
      expect(seen.has('staging')).toBe(true);
      expect(seen.has('boostback')).toBe(true);
      expect(seen.has('landing')).toBe(true);
      expect(l.booster.pos).toEqual([12e3, 20e3, PAD_Z + CATCH_BASE]);
      expect(l.booster.prop).toBeGreaterThan(0);
      // Caught in under seven minutes, the ship long gone and still climbing.
      expect(l.t).toBeLessThan(420);
      expect(l.ship.pos[2] - PAD_Z).toBeGreaterThan(100e3);
    });
  }

  it('left alone after staging, with the flight computer off, the booster is lost', () => {
    const l = createLaunch([0, 0, PAD_Z], Math.PI / 2);
    run(l, done, (x, c) => { if (x.events.includes('staging')) c.auto = true; });
    expect(l.auto).toBe(false);
    expect(l.phase).toBe('lost');
  });

  it('takes the stick as a hand-over: the autopilot lets go', () => {
    const l = createLaunch([0, 0, PAD_Z], Math.PI / 2);
    const seen = run(l, (x) => x.t > 20, (x, c) => { c.pitch = x.t > 15 ? -1 : 0; });
    expect(seen.has('manual')).toBe(true);
    expect(l.auto).toBe(false);
  });

  it('lights the fewest engines that make the thrust: the centre three, the inner thirteen, all thirty-three', () => {
    const one = SUPER_HEAVY.thrustSL;
    expect(enginesFor(2 * one, 0).lit).toBe(3);
    expect(enginesFor(10 * one, 0).lit).toBe(13);
    expect(enginesFor(20 * one, 0).lit).toBe(33);
    expect(enginesFor(20 * one, 0, 13)).toEqual({ lit: 13, throttle: 1 });
    // Never below the engines' lowest setting.
    expect(enginesFor(0.1 * one, 0).throttle).toBe(SUPER_HEAVY.minThrottle);
  });
});
