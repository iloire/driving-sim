// Instant replay: the last half-minute of the drive, kept in memory as poses (where the car was,
// how it sat, what the wheels, wings and engine were doing) 30 times a second, and drawn back
// between them. It stores no inputs and runs no physics, so playing it back can't drift off the
// line that was driven, and a change to the physics can't break it.

import type { CarState } from '../sim/car';
import { blendQuat, lerpV3 } from '../sim/vec';

export const REPLAY_SECONDS = 30;
export const REPLAY_HZ = 30;

/** The parts of the car the model, the camera, the HUD and the sound read. */
type Body = Pick<CarState, 'pos' | 'vel' | 'q' | 'steer' | 'gear' | 'rpm' | 'speed' | 'heading' | 'flying' | 'wings' | 'lift'
  | 'alpha' | 'airspeed' | 'mach' | 'airbrake' | 'surfaces'>;

export interface Pose {
  /** Seconds of drive time, only counted while live. */
  t: number;
  car: Body;
  wheels: { strut: number; spin: number; contact: boolean; slip: number }[];
  braking: boolean;
  boost: boolean;
  thrust: number;
  /** The pedal the engine note follows. */
  pedal: number;
  /** Load factor along the body's up axis. */
  g: number;
  /** False while a crash plays out and the jet is gone. */
  shown: boolean;
  /** The car was put somewhere new (a reset, a place): no drawing in between from the pose before. */
  cut: boolean;
}

/** The pose of `s` at time `t`. */
export function poseOf(t: number, s: CarState, extra: Omit<Pose, 't' | 'car' | 'wheels' | 'cut'>): Pose {
  return {
    t,
    car: {
      pos: [...s.pos], vel: [...s.vel], q: [...s.q], steer: s.steer, gear: s.gear, rpm: s.rpm, speed: s.speed, heading: s.heading,
      flying: s.flying, wings: s.wings, lift: s.lift, alpha: s.alpha, airspeed: s.airspeed, mach: s.mach, airbrake: s.airbrake,
      surfaces: { ...s.surfaces },
    },
    wheels: s.wheels.map((w) => ({ strut: w.strut, spin: w.spin, contact: w.contact, slip: w.slip })),
    ...extra,
    cut: false,
  };
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Between poses `a` and `b`, `k` of the way (0..1). Smooth numbers blend; on/off ones come from the nearer pose. */
export function blendPose(a: Pose, b: Pose, k: number): Pose {
  const near = k < 0.5 ? a : b;
  const x = a.car, y = b.car;
  return {
    ...near,
    t: lerp(a.t, b.t, k),
    car: {
      ...near.car,
      pos: lerpV3(x.pos, y.pos, k), vel: lerpV3(x.vel, y.vel, k), q: blendQuat(x.q, y.q, k),
      steer: lerp(x.steer, y.steer, k), rpm: lerp(x.rpm, y.rpm, k), speed: lerp(x.speed, y.speed, k),
      wings: lerp(x.wings, y.wings, k), lift: lerp(x.lift, y.lift, k), alpha: lerp(x.alpha, y.alpha, k),
      airspeed: lerp(x.airspeed, y.airspeed, k), mach: lerp(x.mach, y.mach, k), airbrake: lerp(x.airbrake, y.airbrake, k),
      surfaces: {
        pitch: lerp(x.surfaces.pitch, y.surfaces.pitch, k), roll: lerp(x.surfaces.roll, y.surfaces.roll, k),
        yaw: lerp(x.surfaces.yaw, y.surfaces.yaw, k),
      },
    },
    wheels: a.wheels.map((w, i) => ({ ...near.wheels[i], strut: lerp(w.strut, b.wheels[i].strut, k), spin: lerp(w.spin, b.wheels[i].spin, k) })),
    thrust: lerp(a.thrust, b.thrust, k), pedal: lerp(a.pedal, b.pedal, k), g: lerp(a.g, b.g, k),
  };
}

/** The car drawn as the pose has it; the rest (the wheel mounts, the springs) is `car`'s own. */
export function applyPose(car: CarState, p: Pose): CarState {
  return { ...car, ...p.car, wheels: car.wheels.map((w, i) => ({ ...w, ...p.wheels[i] })) };
}

/** The last REPLAY_SECONDS of poses, oldest first. */
export class ReplayBuffer {
  private poses: Pose[] = [];
  private cutNext = false;
  /** When the next pose is due. */
  private due = -Infinity;

  constructor(private readonly seconds = REPLAY_SECONDS) {}

  /** Adds a pose when one is due, REPLAY_HZ times a second, and forgets what has fallen out of the window. */
  push(make: () => Pose, t: number): void {
    if (t < this.due - 1e-9) return;
    // Keep to the beat, unless a pause or a long frame has put it more than a beat behind.
    this.due = (t - this.due > 1 / REPLAY_HZ ? t : this.due) + 1 / REPLAY_HZ;
    const p = make();
    p.cut = this.cutNext;
    this.cutNext = false;
    this.poses.push(p);
    let drop = 0;
    while (t - this.poses[drop].t > this.seconds) drop++;
    if (drop) this.poses.splice(0, drop);
  }

  /** The next pose starts afresh: the car was moved there, not driven. */
  cut(): void {
    this.cutNext = true;
  }

  clear(): void {
    this.poses = [];
    this.cutNext = false;
    this.due = -Infinity;
  }

  get start(): number {
    return this.poses[0]?.t ?? 0;
  }

  get end(): number {
    return this.poses[this.poses.length - 1]?.t ?? 0;
  }

  /** The pose at time `t`, clamped to what's kept; null when nothing is. */
  at(t: number): Pose | null {
    const ps = this.poses;
    if (!ps.length) return null;
    if (t <= ps[0].t) return ps[0];
    if (t >= ps[ps.length - 1].t) return ps[ps.length - 1];
    let lo = 0, hi = ps.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ps[mid].t <= t) lo = mid; else hi = mid;
    }
    const a = ps[lo], b = ps[hi];
    return b.cut ? a : blendPose(a, b, (t - a.t) / (b.t - a.t));
  }
}
