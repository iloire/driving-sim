// Where the sun is. Time is local solar time (12 = the
// sun due south), so a "sunset" setting puts the sun on the horizon at every site and every date.

export interface Sun {
  /** Height above the horizon, degrees (negative after sunset). */
  elevationDeg: number;
  /** Compass bearing, degrees (90 = east). */
  azimuthDeg: number;
  /** Unit vector towards the sun: east, north, up. */
  dir: [number, number, number];
}

const RAD = Math.PI / 180;
/** Margin inside sunrise and sunset for the hours on offer: the sun ~3° up, so the scene stays lit. */
const DAYLIGHT_MARGIN_H = 0.25;

/** Day of the year, 1 = 1 January. */
export function dayOfYear(date: Date): number {
  return Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 0)) / 86400000);
}

function declination(day: number): number {
  return 23.44 * RAD * Math.sin((2 * Math.PI * (284 + day)) / 365);
}

export function sunPosition(latDeg: number, day: number, hour: number): Sun {
  const phi = latDeg * RAD, d = declination(day), h = 15 * (hour - 12) * RAD;
  const e = -Math.cos(d) * Math.sin(h);
  const n = Math.sin(d) * Math.cos(phi) - Math.cos(d) * Math.sin(phi) * Math.cos(h);
  const u = Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(h);
  return {
    elevationDeg: Math.asin(u) / RAD,
    azimuthDeg: ((Math.atan2(e, n) / RAD) + 360) % 360,
    dir: [e, n, u],
  };
}

/** Solar hours of sunrise and sunset (sun centre on the horizon). Polar day/night clamp to 0/24. */
export function daylight(latDeg: number, day: number): { sunrise: number; sunset: number } {
  const c = -Math.tan(latDeg * RAD) * Math.tan(declination(day));
  const h0 = Math.acos(Math.min(Math.max(c, -1), 1)) / RAD / 15;
  return { sunrise: 12 - h0, sunset: 12 + h0 };
}

/** The solar hours a drive can be set at: sunrise to sunset, short of the dark either side. */
export function daylightHours(latDeg: number, day: number): { first: number; last: number } {
  const { sunrise, sunset } = daylight(latDeg, day);
  return { first: sunrise + DAYLIGHT_MARGIN_H, last: sunset - DAYLIGHT_MARGIN_H };
}
