// Hover flight: gas thrusters under the floor lift the car straight up, the way a rocket stands on
// its exhaust. It flies like a drone with the assists on. The lift holds a climb rate (Space up,
// Ctrl down, height held when both are released); an attitude assist tilts the body to the stick
// (W/S nose down/up to fly forwards/back, A/D bank and turn, Q/E yaw on top); and thrust tilted
// with the body is what moves it across the ground. The thrusters' own wash drags the car a little,
// so it settles at a cruise rather than running away. Body frame as in car.ts: X forward, Y left, Z up.

import { rotate, unrotate, type Quat, type V3 } from './vec';
import type { FlightControls } from './wings';

const G = 9.81;

export interface ThrusterSpec {
  /** Most the thrusters can lift, in multiples of the car's weight. */
  maxLift: number;
  /** Climb (and sink) rate at full lift input (m/s), and how hard the lift chases it (1/s). */
  climb: number;
  climbGain: number;
  /** Largest nose-down/up tilt and bank the stick asks for (rad). */
  tilt: number;
  bank: number;
  /** Yaw rate at full turn (rad/s). */
  turn: number;
  /** Attitude assist: stiffness (1/s²) and damping (1/s). */
  stiffness: number;
  damping: number;
  /** Horizontal drag of the thruster wash, per second (a share of the car's momentum). */
  wash: number;
  /** Thruster spool-up per second (1 = fully lit). */
  spool: number;
  /** The rear nozzles' boost in the air (N). */
  boost: number;
}

export const THRUSTERS: ThrusterSpec = {
  maxLift: 2.2,
  climb: 14,
  climbGain: 2.5,
  tilt: 0.55,
  bank: 0.4,
  turn: 1.3,
  stiffness: 14,
  damping: 7,
  wash: 0.06,
  spool: 2.5,
  boost: 24000,
};

export interface HoverResult {
  force: V3;
  /** World-frame torque about the centre of mass. */
  torque: V3;
  /** Lift as a share of the most the thrusters can give, 0..1 (sizes the plumes). */
  lift: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Thruster force and the assists' torque for thrusters `out` (0..1) lit. */
export function hover(t: ThrusterSpec, mass: number, inertia: V3, q: Quat, vel: V3, omega: V3, c: FlightControls, out: number): HoverResult {
  const up = rotate(q, [0, 0, 1]);
  const nose = rotate(q, [1, 0, 0]);
  const left = rotate(q, [0, 1, 0]);

  // Lift along the body's up axis, sized to hold the asked-for climb rate.
  const want = c.lift * t.climb;
  const accel = G + t.climbGain * (want - vel[2]);
  const most = t.maxLift * mass * G;
  const lift = clamp((mass * accel) / Math.max(up[2], 0.4), 0, most) * out;
  const force: V3 = [up[0] * lift - mass * t.wash * vel[0] * out, up[1] * lift - mass * t.wash * vel[1] * out, up[2] * lift];

  // Attitude: nose-up and right-bank angles chase the stick; yaw rate chases the turn.
  const wb = unrotate(q, omega);
  const pitch = Math.asin(clamp(nose[2], -1, 1)); // nose up +
  const bank = Math.asin(clamp(left[2], -1, 1)); // right wing down +
  const k = t.stiffness, d = t.damping;
  const turn = clamp(c.roll + c.yaw, -1, 1);
  const tb: V3 = [
    // Rotation about +X raises the left wing: a bank to the right.
    inertia[0] * (k * (c.roll * t.bank - bank) - d * wb[0]) * out,
    // Rotation about +Y (left) is nose down; wb[1] > 0 is the nose dropping.
    -inertia[1] * (k * (c.pitch * t.tilt - pitch) + d * wb[1]) * out,
    // Rotation about +Z is to the left; a right turn asks for a negative rate.
    inertia[2] * d * (-turn * t.turn - wb[2]) * out,
  ];
  return { force, torque: rotate(q, tb), lift: lift / most };
}
