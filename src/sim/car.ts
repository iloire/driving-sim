// The car: one rigid body on four raycast wheels. Each wheel is a spring-damper strut cast
// down from its mount to the terrain; the strut's force is the tyre's load, and the tyre
// pushes back in the ground plane, its grip shaped by slip angle and capped by a friction
// circle. An engine with a torque curve drives the wheels through an automatic gearbox.
//
// Frames: world x east, y north, z up (the site frame). Body X forward, Y left, Z up, origin at
// the centre of mass. `q` rotates body vectors into the world.

import { add, cross, dot, integrate, normalize, rotate, scale, sub, unrotate, type Quat, type V3 } from './vec';
import { aero, WINGS, type FlightControls, type WingSpec } from './wings';

const G = 9.81;
const RHO = 1.225;
/** Internal sub-steps per call: the tyres are stiff springs and want ~2 ms. */
const SUBSTEPS = 4;
/** Slip-angle curve (a lean Pacejka): B sets the peak (~8°), C how much grip a full slide keeps (~80 %). */
const TYRE_B = 10;
const TYRE_C = 1.4;
/** Below this forward speed (m/s) the slip angle is taken against it, so a parked car doesn't jitter. */
const SLIP_FLOOR = 2.5;
/** N per m/s: how hard a braked wheel resists rolling before its brake saturates (stops dead, no oscillation). */
const BRAKE_STIFFNESS = 20000;
/** A locked, sliding tyre keeps this share of its grip. */
const KINETIC = 0.8;
/** Body corners touching the ground (a roll, a bottoming): stiffness N/m, damping N per m/s. */
const BODY_K = 200000;
const BODY_C = 15000;
/** Walls: stiff and close to critically damped, so a crash stops the car rather than bouncing it. */
const WALL_K = 1000000;
const WALL_C = 40000;

export interface Controls {
  /** 0..1 — the accelerator, or reverse when backing up. */
  throttle: number;
  /** 0..1 — the brake, or the accelerator in reverse. */
  brake: number;
  /** −1..1, positive = left. */
  steer: number;
  handbrake: boolean;
  /** Turbo: a nitro rocket on the ground, an afterburner in the air. */
  boost: boolean;
  /** The stick, used once the wings are out. */
  flight: FlightControls;
}

export interface Surface {
  /** Multiplies the tyre's friction coefficient. */
  grip: number;
  /** Rolling resistance coefficient. */
  rolling: number;
}

export interface CarEnv {
  /** Terrain height (m) at a point of the site frame; below 0 is sea floor. */
  height(x: number, y: number): number;
  surface(x: number, y: number): Surface;
  /** The way out of a building a point is inside (horizontal outward normal, depth in m), or null. */
  wall?(x: number, y: number): { nx: number; ny: number; depth: number } | null;
}

export interface CarSpec {
  mass: number;
  /** Principal moments (kg m²) about body X (roll), Y (pitch), Z (yaw). */
  inertia: V3;
  wheelbase: number;
  track: number;
  /** Share of the weight on the front axle. */
  frontWeight: number;
  /** Height of the centre of mass above the ground at rest. */
  cgHeight: number;
  wheelRadius: number;
  /** Strut: unloaded length, travel before the bump stop, spring N/m, damper N per m/s. */
  suspension: { rest: number; travel: number; k: number; c: number };
  /** Peak tyre friction coefficient on dry tarmac. */
  mu: number;
  /** 0..1: how much of the grip a loose surface takes away the tyres win back (and of its drag). */
  allTerrain: number;
  /** Steering lock at a standstill (rad); it shrinks with speed so keys stay drivable at 120 km/h. */
  maxSteer: number;
  /** Speed (m/s) at which the available lock has halved. */
  steerFalloff: number;
  /** Rad per second the front wheels can turn. */
  steerRate: number;
  engine: { idle: number; peakRpm: number; redline: number; peakTorque: number };
  gears: number[];
  reverse: number;
  finalDrive: number;
  /** Share of drive on the front axle: 0 = RWD, 1 = FWD. */
  driveFront: number;
  /** Total brake force (N) and the share on the front axle. */
  brakeForce: number;
  brakeFront: number;
  cdA: number;
  /** Nitro rocket thrust along the nose while boosting as a car (N). */
  nitro: number;
  /** Half-extents of the body box for ground contact, from the centre of mass: [back, front, side, bottom, top]. */
  body: [number, number, number, number, number];
  /** The wings it unfolds to fly (see wings.ts). */
  wings: WingSpec;
}

/**
 * A 1850 kg armoured 4×4 pickup: a 520 N m V8, permanent 50/50 four-wheel drive, 1 m tall
 * all-terrain tyres and long-travel suspension. It grips picón and gravel far better than a road
 * car, and its high centre of mass will roll it if it's thrown about. With the bigger mass, its
 * wings are bigger and its jet stronger too.
 */
export const TRUCK: CarSpec = {
  mass: 1850,
  inertia: [950, 3300, 3600],
  wheelbase: 2.9,
  track: 1.86,
  frontWeight: 0.55,
  cgHeight: 0.8,
  wheelRadius: 0.5,
  suspension: { rest: 0.45, travel: 0.3, k: 44000, c: 5200 },
  mu: 1.0,
  allTerrain: 0.45,
  maxSteer: 0.58,
  steerFalloff: 20,
  steerRate: 2.4,
  engine: { idle: 800, peakRpm: 4000, redline: 6200, peakTorque: 520 },
  gears: [3.6, 2.2, 1.52, 1.16, 0.92, 0.76],
  reverse: 3.4,
  finalDrive: 4.1,
  driveFront: 0.5,
  brakeForce: 21000,
  brakeFront: 0.62,
  cdA: 1.25,
  nitro: 14000,
  body: [2.35, 2.5, 1.0, 0.2, 1.15],
  wings: { ...WINGS, area: 15, span: 9.4, thrust: 13000, afterburner: 20000, inertia: [1700, 700, 2000] },
};

export interface Wheel {
  /** Strut mount in the body frame. */
  mount: V3;
  front: boolean;
  compression: number;
  contact: boolean;
  /** Visual: rolling angle (rad) and the strut length from mount to hub. */
  spin: number;
  strut: number;
  /** 0 = gripping, 1 = fully sliding: drives the screech and the skid marks. */
  slip: number;
  /** World contact point while on the ground. */
  ground: V3;
}

export interface CarState {
  pos: V3;
  vel: V3;
  q: Quat;
  /** Angular velocity, world frame. */
  w: V3;
  /** Front wheel angle (rad), positive left. */
  steer: number;
  /** −1 reverse, 1..n forward. */
  gear: number;
  rpm: number;
  shiftTimer: number;
  wheels: Wheel[];
  /** Signed speed along the body's nose, m/s. */
  speed: number;
  /** Compass heading of the nose, radians (0 north, clockwise). */
  heading: number;
  inWater: boolean;
  /** Plane mode: the wings unfold towards fully out, the wheels go undriven, the jet takes over. */
  flying: boolean;
  /** How far the wings are out, 0..1, animating towards `flying`. */
  wings: number;
  /** Angle of attack (rad) and airspeed (m/s) while the wings are out. */
  alpha: number;
  airspeed: number;
}

/** Strut length at rest under the static load, mount to hub. */
function restStrut(spec: CarSpec, front: boolean): number {
  const load = (spec.mass * G * (front ? spec.frontWeight : 1 - spec.frontWeight)) / 2;
  return spec.suspension.rest - load / spec.suspension.k;
}

/** A car parked on the ground at (x, y), nose on a compass `heading`. */
export function createCar(spec: CarSpec, x: number, y: number, groundZ: number, heading: number): CarState {
  const a = spec.wheelbase * (1 - spec.frontWeight); // centre of mass to front axle
  const b = spec.wheelbase * spec.frontWeight;
  const wheels: Wheel[] = [];
  for (const [front, side] of [[true, 1], [true, -1], [false, 1], [false, -1]] as const) {
    const hubZ = spec.wheelRadius - spec.cgHeight;
    const strut = restStrut(spec, front);
    wheels.push({
      mount: [front ? a : -b, (side * spec.track) / 2, hubZ + strut],
      front, compression: spec.suspension.rest - strut, contact: true, spin: 0, strut, slip: 0, ground: [0, 0, 0],
    });
  }
  // Body X onto the compass heading: a yaw of π/2 − heading about world up.
  const yaw = Math.PI / 2 - heading;
  return {
    pos: [x, y, groundZ + spec.cgHeight], vel: [0, 0, 0], q: [Math.cos(yaw / 2), 0, 0, Math.sin(yaw / 2)], w: [0, 0, 0],
    steer: 0, gear: 1, rpm: spec.engine.idle, shiftTimer: 0, wheels, speed: 0, heading, inWater: false,
    flying: false, wings: 0, alpha: 0, airspeed: 0,
  };
}

/** Engine torque (N m) at full throttle: a broad hump peaking at peakRpm, nothing past the redline. */
export function torqueAt(spec: CarSpec, rpm: number): number {
  const e = spec.engine;
  if (rpm > e.redline) return 0;
  const x = (rpm - e.peakRpm) / (e.redline - e.idle);
  return e.peakTorque * Math.max(1 - 1.6 * x * x, 0.45);
}

function groundNormal(env: CarEnv, x: number, y: number): V3 {
  const d = 0.75;
  const hx = (env.height(x + d, y) - env.height(x - d, y)) / (2 * d);
  const hy = (env.height(x, y + d) - env.height(x, y - d)) / (2 * d);
  return normalize([-hx, -hy, 1]);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Gearbox and engine for one sub-step: returns the total drive force at the tyres (N, signed) and the brake demand. */
function powertrain(s: CarState, spec: CarSpec, c: Controls, dt: number): { drive: number; brake: number } {
  const e = spec.engine;
  // In reverse the pedals swap: the brake key backs up, the throttle stops.
  const stopped = Math.abs(s.speed) < 0.6;
  if (s.gear > 0 && stopped && c.brake > 0.1 && c.throttle < 0.1) s.gear = -1;
  else if (s.gear < 0 && stopped && c.throttle > 0.1 && c.brake < 0.1) s.gear = 1;
  const throttle = s.gear > 0 ? c.throttle : c.brake;
  let brake = s.gear > 0 ? c.brake : c.throttle;
  // Hill hold: no pedal and barely moving, the brakes keep it parked.
  if (throttle < 0.05 && Math.abs(s.speed) < 0.4) brake = Math.max(brake, 1);

  const ratio = (s.gear > 0 ? spec.gears[s.gear - 1] : spec.reverse) * spec.finalDrive;
  const wheelRpm = (Math.abs(s.speed) / spec.wheelRadius) * (60 / (2 * Math.PI)) * ratio;
  // Pulling away, the clutch slips: the engine runs above what the wheels say.
  const slipping = Math.abs(s.gear) === 1 && wheelRpm < 2200;
  const target = Math.max(wheelRpm, e.idle, slipping ? e.idle + throttle * 2600 : 0);
  s.rpm += (target - s.rpm) * (1 - Math.exp(-dt * 12));

  if (s.gear > 0 && s.shiftTimer <= 0) {
    if (wheelRpm > e.redline - 400 && s.gear < spec.gears.length) { s.gear++; s.shiftTimer = 0.3; }
    else if (wheelRpm < 2400 && s.gear > 1) {
      const lower = (Math.abs(s.speed) / spec.wheelRadius) * (60 / (2 * Math.PI)) * spec.gears[s.gear - 2] * spec.finalDrive;
      if (lower < e.redline - 1200) { s.gear--; s.shiftTimer = 0.2; }
    }
  }
  if (s.shiftTimer > 0) { s.shiftTimer -= dt; return { drive: 0, brake }; }

  // Off the throttle the engine drags a little: engine braking.
  const torque = throttle > 0.02 ? throttle * torqueAt(spec, s.rpm) : -0.12 * e.peakTorque * (s.rpm / e.redline);
  const drive = (torque * ratio * 0.9) / spec.wheelRadius;
  return { drive: s.gear > 0 ? drive : -drive, brake };
}

function substep(s: CarState, spec: CarSpec, c: Controls, env: CarEnv, dt: number): void {
  const up = rotate(s.q, [0, 0, 1]);
  const nose = rotate(s.q, [1, 0, 0]);
  s.speed = dot(s.vel, nose);
  let force: V3 = [0, 0, -spec.mass * G];
  let torque: V3 = [0, 0, 0];
  const apply = (f: V3, at: V3) => {
    force = add(force, f);
    torque = add(torque, cross(sub(at, s.pos), f));
  };

  const lock = spec.maxSteer / (1 + Math.abs(s.speed) / spec.steerFalloff);
  s.steer += clamp(c.steer * lock - s.steer, -spec.steerRate * dt, spec.steerRate * dt);
  const w = spec.wings;
  s.wings += clamp((s.flying ? 1 : 0) - s.wings, -w.unfoldRate * dt, w.unfoldRate * dt);
  // In plane mode the jet drives it, so the wheels just roll (Space still brakes the rear ones).
  const { drive, brake } = s.flying ? { drive: 0, brake: 0 } : powertrain(s, spec, c, dt);
  if (s.flying) s.rpm += (spec.engine.idle + c.flight.thrust * (spec.engine.redline - spec.engine.idle) - s.rpm) * (1 - Math.exp(-dt * 3));
  const sus = spec.suspension;

  for (const wheel of s.wheels) {
    const mount = add(s.pos, rotate(s.q, wheel.mount));
    wheel.contact = false;
    // On its side or roof, the struts point at the sky.
    if (up[2] < 0.25) { wheel.compression = 0; wheel.strut = sus.rest; wheel.slip = 0; continue; }
    // Distance down the strut to the ground, refined once at the contact point.
    // The ray only reaches as far as the wheel can: a steeply pitched car must not find a
    // cliff top tens of metres along it.
    const reach = sus.rest + spec.wheelRadius;
    let t = (mount[2] - env.height(mount[0], mount[1])) / up[2];
    let at = add(mount, scale(up, -Math.min(t, reach)));
    if (t < reach) t = (mount[2] - env.height(at[0], at[1])) / up[2];
    // Past full compression the hub is in the body: the body corners take it from there.
    const comp = Math.min(sus.rest - (t - spec.wheelRadius), sus.rest);
    if (comp <= 0) {
      wheel.compression = 0;
      wheel.strut = sus.rest;
      wheel.slip = 0;
      if (!(c.handbrake && !wheel.front)) wheel.spin += (s.speed / spec.wheelRadius) * dt;
      continue;
    }
    wheel.contact = true;
    at = add(mount, scale(up, -t));
    wheel.ground = at;
    const rate = (comp - wheel.compression) / dt;
    wheel.compression = comp;
    wheel.strut = sus.rest - Math.min(comp, sus.travel);
    const bump = comp > sus.travel ? 10 * sus.k * (comp - sus.travel) : 0;
    const load = Math.max(sus.k * comp + sus.c * rate + bump, 0);

    // The tyre's own axes, laid in the ground plane.
    const n = groundNormal(env, at[0], at[1]);
    const aim = wheel.front ? rotate(s.q, [Math.cos(s.steer), Math.sin(s.steer), 0]) : nose;
    const fwd = normalize(sub(aim, scale(n, dot(n, aim))));
    const left = cross(n, fwd);
    const vc = add(s.vel, cross(s.w, sub(at, s.pos)));
    const vx = dot(vc, fwd), vy = dot(vc, left);

    const surface = env.surface(at[0], at[1]);
    // Knobbly all-terrain tyres claw back part of what loose ground takes away.
    const grip = spec.mu * (surface.grip + (1 - surface.grip) * spec.allTerrain) * load;
    const axleDrive = wheel.front ? spec.driveFront : 1 - spec.driveFront;
    const axleBrake = wheel.front ? spec.brakeFront : 1 - spec.brakeFront;
    const locked = c.handbrake && !wheel.front;
    const brakeCap = brake * spec.brakeForce * axleBrake / 2 + (locked ? spec.brakeForce : 0);
    let fx = (drive * axleDrive) / 2
      - clamp(vx * BRAKE_STIFFNESS, -brakeCap, brakeCap)
      - surface.rolling * (1 - 0.5 * spec.allTerrain) * load * clamp(vx * 2, -1, 1);
    const alpha = Math.atan2(vy, Math.max(Math.abs(vx), SLIP_FLOOR));
    let fy = -grip * Math.sin(TYRE_C * Math.atan(TYRE_B * alpha));
    let slip = clamp((Math.abs(alpha) - 0.12) / 0.25, 0, 1);

    const sliding = Math.hypot(vx, vy);
    if (locked && sliding > 0.5) {
      // A locked wheel just skates: kinetic friction against the way it is moving.
      fx = (-KINETIC * grip * vx) / sliding;
      fy = (-KINETIC * grip * vy) / sliding;
      slip = 1;
    }
    const total = Math.hypot(fx, fy);
    if (total > grip) {
      // Friction circle: driving or braking past the grip steals it from cornering.
      fx *= grip / total;
      fy *= grip / total;
      slip = Math.max(slip, clamp((total / grip - 1) * 2, 0, 1));
    }
    wheel.slip = slip;
    apply(add(scale(up, load), add(scale(fwd, fx), scale(left, fy))), at);

    const spinning = !locked && fx > 0 && total > grip ? slip * 25 : 0; // wheelspin, for the eye
    if (!locked) wheel.spin += (vx / spec.wheelRadius + spinning) * dt;
  }

  // Body corners that dig in: a roll, a bottomed-out landing, the car on its roof.
  const [back, front, side, bottom, top] = spec.body;
  for (const bx of [-back, front]) for (const by of [-side, side]) for (const bz of [-bottom, top]) {
    const p = add(s.pos, rotate(s.q, [bx, by, bz]));
    const h = env.height(p[0], p[1]);
    const depth = h - p[2];
    if (depth <= 0) continue;
    const n = groundNormal(env, p[0], p[1]);
    const v = add(s.vel, cross(s.w, sub(p, s.pos)));
    const vn = dot(v, n);
    const press = Math.max(BODY_K * depth - BODY_C * vn, 0);
    const vt = sub(v, scale(n, vn));
    const vtLen = Math.hypot(...vt);
    // Sliding friction, but never more than stops the corner's slide in this sub-step (stable at rest).
    const scrape = vtLen > 1e-6 ? scale(vt, -Math.min(0.6 * press, (vtLen * spec.mass) / (4 * dt)) / vtLen) : vt;
    apply(add(scale(n, press), scrape), p);
  }

  // Walls: points round the body's waist pushed back out of any building they are in.
  if (env.wall) {
    for (const [bx, by] of [[front, side], [front, 0], [front, -side], [0, side], [0, -side], [-back, side], [-back, 0], [-back, -side]]) {
      const p = add(s.pos, rotate(s.q, [bx, by, 0.1]));
      const hit = env.wall(p[0], p[1]);
      if (!hit) continue;
      const n: V3 = [hit.nx, hit.ny, 0];
      const v = add(s.vel, cross(s.w, sub(p, s.pos)));
      const vn = dot(v, n);
      const press = Math.max(WALL_K * Math.min(hit.depth, 1) - WALL_C * vn, 0);
      const vt = sub(v, scale(n, vn));
      const vtLen = Math.hypot(...vt);
      const rub = vtLen > 1e-6 ? scale(vt, -Math.min(0.3 * press, (vtLen * spec.mass) / (4 * dt)) / vtLen) : vt;
      apply(add(scale(n, press), rub), p);
    }
  }

  const speed = Math.hypot(...s.vel);
  apply(scale(s.vel, -0.5 * RHO * spec.cdA * speed), s.pos);
  // Turbo: the nitro rocket fades into the afterburner as the wings come out.
  if (c.boost) force = add(force, scale(nose, spec.nitro * (1 - s.wings) + w.afterburner * s.wings));
  if (s.wings > 0) {
    const a = aero(w, s.q, s.vel, s.w, c.flight, s.wings);
    force = add(force, a.force);
    torque = add(torque, a.torque);
    s.alpha = a.alpha;
    s.airspeed = a.airspeed;
  }

  // Newton for the centre of mass, Euler's equations for the rotation (in the body frame).
  s.vel = add(s.vel, scale(force, dt / spec.mass));
  s.pos = add(s.pos, scale(s.vel, dt));
  const I: V3 = [0, 1, 2].map((i) => spec.inertia[i] + s.wings * w.inertia[i]) as V3;
  const wb = unrotate(s.q, s.w);
  const tb = unrotate(s.q, torque);
  const gyro = cross(wb, [I[0] * wb[0], I[1] * wb[1], I[2] * wb[2]]);
  const wb2: V3 = [
    wb[0] + ((tb[0] - gyro[0]) / I[0]) * dt,
    wb[1] + ((tb[1] - gyro[1]) / I[1]) * dt,
    wb[2] + ((tb[2] - gyro[2]) / I[2]) * dt,
  ];
  s.w = rotate(s.q, wb2);
  s.q = integrate(s.q, s.w, dt);
}

/** Advances the car by dt seconds (call at ~120 Hz). */
export function stepCar(s: CarState, spec: CarSpec, c: Controls, env: CarEnv, dt: number): void {
  const h = dt / SUBSTEPS;
  for (let i = 0; i < SUBSTEPS; i++) substep(s, spec, c, env, h);
  const nose = rotate(s.q, [1, 0, 0]);
  s.speed = dot(s.vel, nose);
  s.heading = (Math.atan2(nose[0], nose[1]) + 2 * Math.PI) % (2 * Math.PI);
  s.inWater = env.height(s.pos[0], s.pos[1]) < 0 && s.pos[2] < 0.4;
}
