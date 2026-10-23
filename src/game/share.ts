// A shared moment of a drive, as a link: where the car is, which way it points and how fast it goes.
// It rides in the query as ?at=x,y,z,heading,speed (site metres to the decimetre, compass degrees,
// km/h along the nose) plus ?fly=1 while the car is in the air, next to the ?time and ?car the page
// already reads.

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

/** Writes the moment into `q`, in place of any ?spawn. */
export function writeMoment(m: Moment, q: URLSearchParams): void {
  const deg = (((m.heading * 180) / Math.PI) % 360 + 360) % 360;
  q.delete('spawn');
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

/** Solar time as the ?time value, HH:MM. */
export function formatHour(hour: number): string {
  const minutes = Math.round(hour * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
