import { describe, expect, it } from 'vitest';
import { dayOfYear, daylight, daylightHours, sunPosition } from './sun';

const FAMARA = 29.08;
const JUNE_21 = 172;
const DEC_21 = 355;
const MAR_20 = 79;

describe('sunPosition', () => {
  it('stands due south at solar noon, 90° − latitude + declination high', () => {
    const s = sunPosition(FAMARA, JUNE_21, 12);
    expect(s.azimuthDeg).toBeCloseTo(180, 5);
    expect(s.elevationDeg).toBeCloseTo(90 - FAMARA + 23.44, 0);
    expect(sunPosition(FAMARA, DEC_21, 12).elevationDeg).toBeCloseTo(90 - FAMARA - 23.44, 0);
  });

  it('rises in the east and sets in the west', () => {
    expect(sunPosition(FAMARA, MAR_20, 7).azimuthDeg).toBeGreaterThan(80);
    expect(sunPosition(FAMARA, MAR_20, 7).azimuthDeg).toBeLessThan(110);
    expect(sunPosition(FAMARA, MAR_20, 17.9).azimuthDeg).toBeGreaterThan(250);
    expect(sunPosition(FAMARA, MAR_20, 17.9).elevationDeg).toBeLessThan(2);
  });

  it('gives a unit vector that agrees with elevation and azimuth', () => {
    const s = sunPosition(42, 300, 16.5);
    const [e, n, u] = s.dir;
    expect(Math.hypot(e, n, u)).toBeCloseTo(1, 9);
    expect(Math.asin(u) * 180 / Math.PI).toBeCloseTo(s.elevationDeg, 9);
    expect(e).toBeLessThan(0); // afternoon: west
  });
});

describe('daylight', () => {
  it('is twelve hours long at the equinox and longer in summer', () => {
    const eq = daylight(FAMARA, MAR_20);
    expect(eq.sunset - eq.sunrise).toBeCloseTo(12, 0);
    const jun = daylight(FAMARA, JUNE_21);
    expect(jun.sunset - jun.sunrise).toBeGreaterThan(13.5);
    expect(sunPosition(FAMARA, JUNE_21, jun.sunset).elevationDeg).toBeCloseTo(0, 5);
  });
});

describe('dayOfYear', () => {
  it('counts from 1 January', () => {
    expect(dayOfYear(new Date(2026, 0, 1))).toBe(1);
    expect(dayOfYear(new Date(2026, 11, 31))).toBe(365);
  });
});

describe('daylightHours', () => {
  it('keeps every hour on offer in daylight, sun above the horizon', () => {
    for (const day of [JUNE_21, MAR_20, DEC_21, 291]) {
      const { first, last } = daylightHours(FAMARA, day);
      expect(sunPosition(FAMARA, day, first).elevationDeg).toBeGreaterThan(1);
      expect(sunPosition(FAMARA, day, last).elevationDeg).toBeGreaterThan(1);
      expect(sunPosition(FAMARA, day, last + 0.5).elevationDeg).toBeLessThan(0);
    }
  });

  it('ends a mid-October day at Famara before 18:00', () => {
    expect(daylightHours(FAMARA, 291).last).toBeLessThan(18);
  });
});
