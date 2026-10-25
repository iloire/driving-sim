// A shared moment of a drive, as a link: where the car is, which way it points and how fast it goes.
// It rides in the query as ?site=<zone>&at=x,y,z,heading,speed (the zone's metres to the decimetre,
// compass degrees, km/h along the nose) plus ?fly=1 while the car is in the air, next to the ?time and ?car the page
// already reads. The view rides along too, so the link looks as it did: ?cam=bonnet|orbit, ?hud=0|1
// (flight HUD hidden or, in the Jet where it starts off, shown), ?map=0 (minimap hidden), ?balloons=1 and ?drive=RWD|FWD; defaults are left out.

import { CAMERA_MODES, type CameraMode } from './camera';

export interface Moment {
  x: number;
  y: number;
  /** Height of the car's centre (m); only used in the air, on the ground it sits on the road. */
  z: number;
  /** Compass heading of the nose, radians (0 north, clockwise). */
  heading: number;
  /** Signed speed along the nose, m/s. */
  speed: number;
  flying: boolean;
}

/** Writes the moment in zone `site` into `q`, in place of any ?spawn. */
export function writeMoment(m: Moment, site: string, q: URLSearchParams): void {
  const deg = (((m.heading * 180) / Math.PI) % 360 + 360) % 360;
  q.delete('spawn');
  q.set('site', site); // x and y mean nothing in another zone
  q.set('at', [m.x.toFixed(1), m.y.toFixed(1), m.z.toFixed(1), deg.toFixed(0), (m.speed * 3.6).toFixed(0)].join(','));
  if (m.flying) q.set('fly', '1');
  else q.delete('fly');
}

/** The moment in `q`, or null when there is none or it doesn't parse. */
export function readMoment(q: URLSearchParams): Moment | null {
  const v = (q.get('at') ?? '').split(',').map(Number);
  if (v.length !== 5 || !v.every(Number.isFinite)) return null;
  return { x: v[0], y: v[1], z: v[2], heading: (v[3] * Math.PI) / 180, speed: v[4] / 3.6, flying: q.get('fly') === '1' };
}

/** How the sharer had the screen and the car set up. */
export interface View {
  cam: CameraMode;
  hud: boolean;
  map: boolean;
  balloons: boolean;
  /** AWD, RWD or FWD. */
  drive: string;
}

const DEFAULT_VIEW: View = { cam: 'chase', hud: true, map: true, balloons: false, drive: 'AWD' };

/** Writes the view into `q`, leaving out whatever is at its default. `hudOn` is the HUD's default (off in the Jet). */
export function writeView(v: View, q: URLSearchParams, hudOn = DEFAULT_VIEW.hud): void {
  const put = (key: string, value: string | null) => (value === null ? q.delete(key) : q.set(key, value));
  put('cam', v.cam === DEFAULT_VIEW.cam ? null : v.cam);
  put('hud', v.hud === hudOn ? null : v.hud ? '1' : '0');
  put('map', v.map ? null : '0');
  put('balloons', v.balloons ? '1' : null);
  put('drive', v.drive === DEFAULT_VIEW.drive ? null : v.drive);
}

/** The view in `q`; anything missing or unknown is the default. `drives` are the drivetrains on offer, `hudOn` the HUD's default. */
export function readView(q: URLSearchParams, drives: string[], hudOn = DEFAULT_VIEW.hud): View {
  const cam = q.get('cam') as CameraMode;
  const drive = q.get('drive') ?? '';
  return {
    cam: CAMERA_MODES.includes(cam) ? cam : DEFAULT_VIEW.cam,
    hud: q.has('hud') ? q.get('hud') !== '0' : hudOn,
    map: q.get('map') !== '0',
    balloons: q.get('balloons') === '1',
    drive: drives.includes(drive) ? drive : DEFAULT_VIEW.drive,
  };
}

/** Solar time as the ?time value, HH:MM. */
export function formatHour(hour: number): string {
  const minutes = Math.round(hour * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
