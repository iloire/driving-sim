import { describe, expect, it } from 'vitest';
import { formatHour, readMoment, readView, writeMoment, writeView } from './share';

describe('shared moments', () => {
  it('round-trips a car in the air, replacing the spawn', () => {
    const q = new URLSearchParams('spawn=haria&car=4x4');
    writeMoment({ x: 12345.678, y: 2345.61, z: 412.04, heading: -Math.PI / 2, speed: 25, flying: true }, 'lanzarote', q);
    expect(q.get('spawn')).toBeNull();
    expect(q.get('car')).toBe('4x4');
    expect(q.get('site')).toBe('lanzarote');
    expect(q.get('at')).toBe('12345.7,2345.6,412.0,270,90');
    const m = readMoment(q)!;
    expect(m.x).toBeCloseTo(12345.7);
    expect(m.y).toBeCloseTo(2345.6);
    expect(m.z).toBeCloseTo(412);
    expect(m.heading).toBeCloseTo((3 * Math.PI) / 2);
    expect(m.speed).toBeCloseTo(25);
    expect(m.flying).toBe(true);
  });

  it('drops ?fly on the ground and keeps reversing negative', () => {
    const q = new URLSearchParams('fly=1');
    writeMoment({ x: 1, y: 2, z: 3, heading: 0, speed: -5, flying: false }, 'lanzarote', q);
    expect(q.get('fly')).toBeNull();
    expect(readMoment(q)!.speed).toBeCloseTo(-5, 0);
  });

  it('names the zone it was shared in, over the one the sharer arrived by', () => {
    const q = new URLSearchParams('site=lanzarote&spawn=pilar');
    writeMoment({ x: 1, y: 2, z: 3, heading: 0, speed: 0, flying: false }, 'zaragoza', q);
    expect(q.get('site')).toBe('zaragoza');
  });

  it('ignores a missing or broken moment', () => {
    expect(readMoment(new URLSearchParams())).toBeNull();
    expect(readMoment(new URLSearchParams('at=1,2,3'))).toBeNull();
    expect(readMoment(new URLSearchParams('at=1,2,x,4,5'))).toBeNull();
  });

  it('round-trips the view, leaving defaults out of the link', () => {
    const drives = ['AWD', 'RWD', 'FWD'];
    const q = new URLSearchParams('cam=orbit&balloons=1');
    writeView({ cam: 'chase', hud: true, map: true, balloons: false, drive: 'AWD' }, q);
    expect(q.toString()).toBe('');
    writeView({ cam: 'bonnet', hud: false, map: false, balloons: true, drive: 'RWD' }, q);
    expect(readView(q, drives)).toEqual({ cam: 'bonnet', hud: false, map: false, balloons: true, drive: 'RWD' });
  });

  it('reads an unknown camera or drivetrain as the default', () => {
    expect(readView(new URLSearchParams('cam=drone&drive=4WD'), ['AWD', 'RWD'])).toMatchObject({ cam: 'chase', drive: 'AWD' });
  });

  it('writes the time as HH:MM', () => {
    expect(formatHour(17.5)).toBe('17:30');
    expect(formatHour(9.999)).toBe('10:00');
  });
});
