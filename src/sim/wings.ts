// The car's flying half: once its wings unfold it is a light plane. Lift and drag come from the
// angle of attack (lift linear up to the stall at ~15°, then falling away); the tail keeps the nose
// into the airflow (pitch and yaw stability); elevator, ailerons and rudder are torques scaled by
// dynamic pressure, with damping that grows with it, so the controls go soft as it slows. A jet
// pushes along the nose. All of it scales with how far the wings are out, so a half-unfolded
// wing half-flies. Body frame as in car.ts: X forward, Y left, Z up.

import { cross, length, normalize, rotate, scale, unrotate, type Quat, type V3 } from './vec';

const RHO = 1.225;

export interface WingSpec {
  /** Wing area (m²), span (m), mean chord (m). */
  area: number;
  span: number;
  chord: number;
  /** Lift: at zero angle of attack, per radian, and the stall angle (rad). */
  cl0: number;
  clAlpha: number;
  stall: number;
  /** Drag: parasitic, and induced per CL². */
  cd0: number;
  cdInduced: number;
  /** Side force per radian of sideslip, on the body's side area (m²). */
  sideArea: number;
  /** Pitch: stability per rad of α, trim (nose-up), elevator power, damping. */
  cmAlpha: number;
  cm0: number;
  cmElevator: number;
  cmDamping: number;
  /** Roll: aileron power and damping. Yaw: weathervane, rudder, damping. */
  clAileron: number;
  clDamping: number;
  cnBeta: number;
  cnRudder: number;
  cnDamping: number;
  /** Jet thrust at full throttle (N), and what the afterburner adds on top while boosting. */
  thrust: number;
  afterburner: number;
  /** Extra inertia (kg m², roll / pitch / yaw) with the wings out. */
  inertia: V3;
  /** Wing travel per second while transforming (1 = fully out). */
  unfoldRate: number;
}

export const WINGS: WingSpec = {
  area: 12,
  span: 8.4,
  chord: 1.5,
  cl0: 0.25,
  clAlpha: 5,
  stall: 0.26,
  cd0: 0.035,
  cdInduced: 0.06,
  sideArea: 5,
  cmAlpha: 1.2,
  cm0: 0.04,
  cmElevator: 0.25,
  cmDamping: 14,
  clAileron: 0.05,
  clDamping: 0.5,
  cnBeta: 0.12,
  cnRudder: 0.04,
  cnDamping: 0.2,
  thrust: 9500,
  afterburner: 15000,
  inertia: [1300, 500, 1500],
  unfoldRate: 1.1,
};

export interface FlightControls {
  /** −1..1, positive = pull up (nose up). */
  pitch: number;
  /** −1..1, positive = roll right. */
  roll: number;
  /** −1..1, positive = yaw right. */
  yaw: number;
  /** 0..1 jet throttle. */
  thrust: number;
  /** −1..1, hovering only: sink or climb (Space up, Ctrl down). */
  lift: number;
}

/** Lift coefficient: linear to the stall, then the flat-plate fall-off. */
export function liftCoefficient(w: WingSpec, alpha: number): number {
  if (Math.abs(alpha) <= w.stall) return w.cl0 + w.clAlpha * alpha;
  const peak = w.cl0 + w.clAlpha * w.stall * Math.sign(alpha);
  // Over the next ~9° the lift collapses onto a flat plate's (0.9 sin 2α).
  const t = Math.min((Math.abs(alpha) - w.stall) / 0.15, 1);
  return peak + (0.9 * Math.sin(2 * alpha) - peak) * t;
}

export interface AeroResult {
  force: V3;
  /** World-frame torque about the centre of mass. */
  torque: V3;
  /** Angle of attack (rad) and airspeed (m/s), for the HUD. */
  alpha: number;
  airspeed: number;
}

/** Aerodynamic force and torque on the body for wings `out` (0..1) unfolded. */
export function aero(w: WingSpec, q: Quat, vel: V3, omega: V3, c: FlightControls, out: number): AeroResult {
  const vb = unrotate(q, vel);
  const V = length(vel);
  const force: V3 = [0, 0, 0];
  const tb: V3 = [0, 0, 0]; // body-frame torque
  const thrust = rotate(q, [w.thrust * c.thrust * out, 0, 0]);
  if (V < 1) return { force: thrust, torque: [0, 0, 0], alpha: 0, airspeed: V };

  const alpha = Math.atan2(-vb[2], vb[0]);
  const beta = Math.atan2(vb[1], Math.abs(vb[0]) + 1e-6);
  const qbar = 0.5 * RHO * V * V;
  const S = w.area * out;
  const cl = liftCoefficient(w, alpha);
  const cd = w.cd0 + w.cdInduced * cl * cl;
  const along = scale(vel, 1 / V);
  const left = rotate(q, [0, 1, 0]);
  const liftDir = normalize(cross(along, left));
  const lift = scale(liftDir, qbar * S * cl);
  const drag = scale(along, -qbar * S * cd);
  // Sideslip pushes the body back into line (on the side area, wings or not out).
  const side = scale(left, -qbar * w.sideArea * out * beta);
  for (const f of [lift, drag, side, thrust]) for (let i = 0; i < 3; i++) force[i] += f[i];

  const wb = unrotate(q, omega);
  const damp = 1 / (2 * Math.max(V, 10));
  // Pitch about +Y (left) is nose down: α noses it down, the elevator (pull = nose up) the other way.
  tb[1] = qbar * S * w.chord * (w.cmAlpha * alpha - w.cm0 - w.cmElevator * c.pitch
    - w.cmDamping * wb[1] * w.chord * damp);
  // Roll about +X: positive raises the left wing, which is a roll to the right.
  tb[0] = qbar * S * w.span * (w.clAileron * c.roll - w.clDamping * wb[0] * w.span * damp);
  // Yaw about +Z is to the left: sideslip from the left turns it left, right rudder turns it right.
  tb[2] = qbar * S * w.span * (w.cnBeta * beta - w.cnRudder * c.yaw - w.cnDamping * wb[2] * w.span * damp);
  return { force, torque: rotate(q, tb), alpha, airspeed: V };
}

/** True when the airflow is past the wing's stall angle. */
export function stalled(w: WingSpec, alpha: number): boolean {
  return Math.abs(alpha) > w.stall;
}
