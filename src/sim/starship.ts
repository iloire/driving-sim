// Starship: Super Heavy and Ship stacked on a launch tower, launched, staged, and the booster flown
// home to be caught by the tower's arms. Each stage is a point mass whose position is the middle of
// its engine plane, with an axis (the way its nose and its thrust point) that turns at a commanded
// rate: no gimbal dynamics, the flight computer is assumed to hold whatever attitude it is asked
// for. Thrust lies between its sea-level and vacuum values by the air's pressure, propellant burns
// at a fixed rate per engine and throttle, and the air (wings.ts' standard atmosphere) gives drag
// along the wind and a normal force when the body meets it at an angle, which is what the grid fins
// steer the falling booster with. A flat earth with a constant g (within 3 % up to 100 km), less
// the pull that going round the curve of the earth takes away.
// Site frame: x east, y north, z up, metres.

import { add, cross, dot, length, normalize, scale, sub, type V3 } from './vec';
import { atmosphere, SEA_LEVEL } from './wings';

const G = 9.81;
const EARTH_RADIUS = 6.371e6;
const DEG = Math.PI / 180;

export interface StageSpec {
  dry: number;
  prop: number;
  /** Bottom of the engines to the tip (m) and the body's diameter (m). */
  length: number;
  diameter: number;
  engines: number;
  /** One engine's thrust at sea level and in vacuum (N), and its vacuum Isp (s); it throttles down to `minThrottle`. */
  thrustSL: number;
  thrustVac: number;
  ispVac: number;
  minThrottle: number;
  /** How fast the flight computer can swing the axis (rad/s). */
  turnRate: number;
}

export const SUPER_HEAVY: StageSpec = {
  dry: 275e3, prop: 3400e3, length: 71, diameter: 9, engines: 33,
  thrustSL: 2.26e6, thrustVac: 2.45e6, ispVac: 347, minThrottle: 0.3, turnRate: 10 * DEG,
};
/** Three sea-level Raptors and three vacuum ones, lumped: it only ever fires up high. */
export const SHIP: StageSpec = {
  dry: 130e3, prop: 1500e3, length: 52, diameter: 9, engines: 6,
  thrustSL: 1.6e6, thrustVac: 2.49e6, ispVac: 365, minThrottle: 0.4, turnRate: 3 * DEG,
};
/** The whole stack swings slowly. */
const STACK_TURN = 3 * DEG;

/** The launch mount holds the booster's engines this high (m), and the arms catch it with its engines this high. */
export const MOUNT = 20;
export const CATCH_BASE = 30;
/** The landing burn stops it this far over the arms (m) to slide in over the mount. */
const HOLD = 12;
/** The glide aims this far past the mount (m), for the way the landing burn falls short. */
const AIM_LONG = 400;
/** Caught: crossing the arms within this far of the mount's axis (m), this slow (m/s), this upright. */
export const CATCH = { radius: 3.5, sink: 4, tilt: 5 * DEG };
/** The engines the booster's middle rings hold: the centre three, and the inner thirteen. */
const RINGS = [3, 13];
/** The autopilot cuts the booster's engines with this much propellant left for the way home. */
export const RESERVE = 0.12 * SUPER_HEAVY.prop;
/** The gravity turn: from `start` metres up, tipping to `pitch` from vertical by `height`, as the `shape` power. */
const ASCENT = { start: 400, pitch: 72 * DEG, height: 60e3, shape: 0.6 };
/** The autopilot throttles back to keep the dynamic pressure near this (Pa). */
const MAX_Q = 32e3;

export type Phase = 'pad' | 'ascent' | 'flip' | 'boostback' | 'coast' | 'landing' | 'caught' | 'lost';
export type LaunchEvent = 'ignition' | 'liftoff' | 'maxq' | 'meco' | 'staging' | 'boostback' | 'cutoff' | 'landing' | 'caught' | 'lost' | 'manual' | 'auto';

export interface Stage {
  /** The middle of the engine plane. */
  pos: V3;
  vel: V3;
  /** Unit vector along the body, engines to nose: the way the thrust pushes. */
  axis: V3;
  prop: number;
  /** Engines lit, and their throttle (0..1). */
  lit: number;
  throttle: number;
}

export interface Launch {
  /** Mission clock (s): negative counting down, zero at release. */
  t: number;
  phase: Phase;
  /** Counting down (Space starts it). */
  counting: boolean;
  /** The ship still sits on the booster. */
  stacked: boolean;
  booster: Stage;
  ship: Stage;
  /** The mount's centre on the ground, and the compass heading the stack flies out on. */
  pad: V3;
  azimuth: number;
  /** The flight computer flies; any stick hands it to you until F gives it back. */
  auto: boolean;
  /** Dynamic pressure on the booster (Pa) and the highest it has been on the way up. */
  q: number;
  peakQ: number;
  /** Where the booster would come down at the arms' height, if nothing more were done. */
  impact: V3 | null;
  /** What happened this step, for the HUD and the sound. */
  events: LaunchEvent[];
  /** When the booster's engines cut (s), for the staging sequence. */
  meco: number;
  /** Seconds until the impact prediction is refreshed. */
  predictIn: number;
}

export interface LaunchControls {
  /** −1..1: nose down towards the azimuth (and past it) / back; roll the tilt left / right. */
  pitch: number;
  yaw: number;
  /** 0..1, the throttle lever. */
  throttle: number;
  /** Space this step: start the countdown, or (booster, by hand) light or cut the engines. */
  fire: boolean;
  /** F this step: autopilot on or off. */
  auto: boolean;
}

export function createLaunch(pad: V3, azimuth: number): Launch {
  const base: V3 = [pad[0], pad[1], pad[2] + MOUNT];
  const up: V3 = [0, 0, 1];
  return {
    t: -10, phase: 'pad', counting: false, stacked: true, pad, azimuth,
    booster: { pos: base, vel: [0, 0, 0], axis: up, prop: SUPER_HEAVY.prop, lit: 0, throttle: 0 },
    ship: { pos: add(base, [0, 0, SUPER_HEAVY.length]), vel: [0, 0, 0], axis: up, prop: SHIP.prop, lit: 0, throttle: 0 },
    auto: true, q: 0, peakQ: 0, impact: null, events: [], meco: 0, predictIn: 0,
  };
}

const AREA = (s: StageSpec) => Math.PI * (s.diameter / 2) ** 2;
const mass = (spec: StageSpec, s: Stage) => spec.dry + s.prop;
const stackMass = (l: Launch) => mass(SUPER_HEAVY, l.booster) + mass(SHIP, l.ship);
/** Air pressure over the sea's. */
const pressure = (h: number) => {
  const a = atmosphere(h);
  return (a.rho * a.sound ** 2) / (SEA_LEVEL.rho * SEA_LEVEL.sound ** 2);
};
/** One engine at full throttle `h` metres up (N). */
export const engineThrust = (spec: StageSpec, h: number) => spec.thrustVac - (spec.thrustVac - spec.thrustSL) * pressure(h);
/** Falling engines first with the grid fins out, the drag is this many times the nose-first value. */
const ENGINES_FIRST = 2.5;
/** Drag coefficient on the frontal area: a hump through the sound barrier. */
const dragCoefficient = (mach: number) => 0.35 + 0.45 * Math.exp(-(((mach - 1.1) / 0.4) ** 2));
/** Downrange: the horizontal unit vector the stack flies out on. */
const downrange = (l: Launch): V3 => [Math.sin(l.azimuth), Math.cos(l.azimuth), 0];
const horizontal = (v: V3): V3 => [v[0], v[1], 0];
/** `v` no longer than `max`. */
const clampLength = (v: V3, max: number): V3 => (length(v) > max ? scale(v, max / length(v)) : v);
/** The angle between two unit vectors. */
const angle = (a: V3, b: V3) => Math.acos(Math.min(Math.max(dot(a, b), -1), 1));
/** Turns unit vector `a` towards `b` by at most `max` radians. */
function turnTowards(a: V3, b: V3, max: number): V3 {
  const th = angle(a, b);
  if (th <= max || th < 1e-9) return normalize(b);
  let k = cross(a, b);
  if (length(k) < 1e-9) k = cross(a, Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]); // opposite: any way round
  return rotateAbout(a, normalize(k), max);
}
/** Rodrigues: `v` turned `th` about the unit axis `k`. */
function rotateAbout(v: V3, k: V3, th: number): V3 {
  const c = Math.cos(th), s = Math.sin(th);
  return normalize(add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c))));
}

/** Aerodynamic force on a body (N): drag along the wind, and a normal force when it meets the wind at an angle. */
function airForce(spec: StageSpec, bodyLen: number, s: Stage): { force: V3; q: number } {
  const air = atmosphere(s.pos[2]);
  const v = Math.hypot(...s.vel);
  if (v < 0.1) return { force: [0, 0, 0], q: 0 };
  const q = 0.5 * air.rho * v * v;
  const wind = scale(s.vel, -1 / v);
  const area = AREA(spec);
  // Engines first, the blunt end and the grid fins out make it a far worse arrow.
  const blunt = dot(s.vel, s.axis) < 0 ? ENGINES_FIRST : 1;
  let force = scale(wind, q * area * dragCoefficient(v / air.sound) * blunt);
  // Slender-body lift plus the crossflow on the side of the cylinder, along the wind's part across the body.
  const across = sub(wind, scale(s.axis, dot(wind, s.axis)));
  const sinA = Math.hypot(...across);
  if (sinA > 1e-4) {
    const cosA = Math.abs(dot(wind, s.axis));
    const cn = 2 * sinA * cosA + 1.2 * sinA * sinA * (bodyLen * spec.diameter) / area;
    force = add(force, scale(across, (q * area * cn) / sinA));
  }
  return { force, q };
}

/**
 * Gravity, less what the curve of the earth takes away from a body going round it: the one
 * thing a flat earth gets badly wrong, and what holds the ship up as it nears orbital speed.
 */
const gravity = (vel: V3) => G - (vel[0] ** 2 + vel[1] ** 2) / EARTH_RADIUS;

/** The booster's engines for a thrust (N) `h` metres up: the fewest of 3, 13, 33 that make it, and their throttle. */
export function enginesFor(thrust: number, h: number, most = SUPER_HEAVY.engines): { lit: number; throttle: number } {
  const one = engineThrust(SUPER_HEAVY, h);
  for (const n of [...RINGS, SUPER_HEAVY.engines]) {
    if (n > most) break;
    if (thrust <= n * one || n === most) return { lit: n, throttle: Math.min(Math.max(thrust / (n * one), SUPER_HEAVY.minThrottle), 1) };
  }
  return { lit: most, throttle: 1 };
}

/**
 * Where a stage falling with its engines first would cross height `z` (no thrust, no lift), by
 * coarse steps; null if it never comes down there within `limit` seconds.
 */
export function predictImpact(spec: StageSpec, s: Stage, z: number, limit = 600): V3 | null {
  const p: Stage = { ...s, pos: [...s.pos], vel: [...s.vel], lit: 0 };
  const m = mass(spec, s);
  const dt = 0.5;
  for (let t = 0; t < limit; t += dt) {
    p.axis = Math.hypot(...p.vel) > 1 ? scale(normalize(p.vel), -1) : [0, 0, 1];
    const { force } = airForce(spec, spec.length, p);
    const acc = add(scale(force, 1 / m), [0, 0, -G]);
    const prevZ = p.pos[2];
    p.vel = add(p.vel, scale(acc, dt));
    p.pos = add(p.pos, scale(p.vel, dt));
    if (p.pos[2] <= z && p.vel[2] < 0) {
      const k = (prevZ - z) / Math.max(prevZ - p.pos[2], 1e-6);
      return add(sub(p.pos, scale(p.vel, dt)), scale(p.vel, dt * k));
    }
  }
  return null;
}

/** Thrust, drag, gravity and the propellant burnt for one stage over `dt`. */
function fly(spec: StageSpec, s: Stage, extraMass: number, bodyLen: number, dt: number): number {
  const engines = s.prop > 0 ? s.lit : 0;
  const thrust = engines * s.throttle * engineThrust(spec, s.pos[2]);
  const flow = (engines * s.throttle * spec.thrustVac) / (spec.ispVac * G);
  s.prop = Math.max(s.prop - flow * dt, 0);
  const m = mass(spec, s) + extraMass;
  const { force, q } = airForce(spec, bodyLen, s);
  const acc = add(scale(add(scale(s.axis, thrust), force), 1 / m), [0, 0, -gravity(s.vel)]);
  s.vel = add(s.vel, scale(acc, dt));
  s.pos = add(s.pos, scale(s.vel, dt));
  return q;
}

/** Turns a stage's axis by the stick: pitch towards / away from where it leans (the azimuth when upright), yaw across it. */
function steer(l: Launch, s: Stage, c: LaunchControls, rate: number, dt: number): void {
  const lean = horizontal(s.axis);
  const fwd = length(lean) > 0.02 ? normalize(lean) : downrange(l);
  const side = normalize(cross([0, 0, 1], fwd)); // left of fwd
  // Nose down (W, pitch < 0) tips the nose towards fwd: about the axis fwd × up... = −side.
  s.axis = rotateAbout(s.axis, side, c.pitch * rate * dt);
  s.axis = rotateAbout(s.axis, fwd, -c.yaw * rate * dt);
}

/**
 * The ascent's attitude: straight up off the tower, then tipping east by a schedule on height,
 * steeply at first and easing towards 55° from vertical at staging height, so the booster cuts
 * high, fast and still climbing.
 */
function ascentAxis(l: Launch): V3 {
  const h = l.booster.pos[2] - l.pad[2];
  if (h < ASCENT.start) return [0, 0, 1];
  const pitch = ASCENT.pitch * Math.min(1, (h - ASCENT.start) / ASCENT.height) ** ASCENT.shape;
  return normalize(add(scale([0, 0, 1], Math.cos(pitch)), scale(downrange(l), Math.sin(pitch))));
}

/**
 * How far the booster falls before `engines` full engines and the drag stop it, falling straight
 * down from where it is (a quick integration: the drag falls away as it slows).
 */
export function stoppingDistance(b: Stage, engines: number): number {
  const m = mass(SUPER_HEAVY, b);
  let z = b.pos[2], v = Math.min(b.vel[2], 0), fell = 0;
  const dt = 0.05;
  for (let t = 0; t < 120 && v < 0; t += dt) {
    const air = atmosphere(z);
    const drag = 0.5 * air.rho * v * v * AREA(SUPER_HEAVY) * dragCoefficient(-v / air.sound) * ENGINES_FIRST;
    v += ((engines * engineThrust(SUPER_HEAVY, z) + drag) / m - G) * dt;
    z += v * dt;
    fell -= v * dt;
  }
  return fell;
}

/** The booster's flight computer after staging: it sets attitude, engines and throttle for the phase. */
function boosterAuto(l: Launch, dt: number): void {
  const b = l.booster;
  const m = mass(SUPER_HEAVY, b);
  const catchZ = l.pad[2] + CATCH_BASE;
  const toPad = sub(horizontal(l.pad), horizontal(b.pos));
  const wantAxis = (a: V3) => { b.axis = turnTowards(b.axis, a, SUPER_HEAVY.turnRate * dt); };
  if (l.phase === 'flip' || l.phase === 'boostback') {
    const miss = l.impact ? sub(horizontal(l.pad), horizontal(l.impact)) : toPad;
    // Burn back along the miss, level.
    const dir = normalize(length(miss) > 1 ? miss : toPad);
    wantAxis(dir);
    if (l.phase === 'flip' && angle(b.axis, dir) < 12 * DEG) {
      l.phase = 'boostback';
      l.events.push('boostback');
    }
    if (l.phase === 'boostback') {
      // Easing off as the miss closes, so the cut lands it close; cut once the fall would bring it home.
      Object.assign(b, enginesFor(13 * engineThrust(SUPER_HEAVY, b.pos[2]) * Math.min(Math.max(length(miss) / 8000, 0.1), 1), b.pos[2], 13));
      if (l.impact && (length(miss) < 50 || dot(miss, horizontal(b.axis)) <= 0)) {
        b.lit = 0;
        l.phase = 'coast';
        l.events.push('cutoff');
      }
    }
    return;
  }
  if (l.phase === 'coast') {
    const v = Math.hypot(...b.vel);
    const retro = v > 1 ? scale(b.vel, -1 / v) : [0, 0, 1] as V3;
    const air = atmosphere(b.pos[2]);
    const q = 0.5 * air.rho * v * v;
    // The grid fins: tilting the top towards the miss moves the booster away from it.
    let axis = retro;
    if (l.impact && q > 500) {
      // Aimed long: the landing burn and the thick air at the bottom kill the last of the way across.
      const vh = horizontal(b.vel);
      const aim = length(vh) > 1 ? add(horizontal(l.pad), scale(normalize(vh), AIM_LONG)) : horizontal(l.pad);
      const miss = sub(horizontal(l.impact), aim);
      const tilt = Math.min(length(miss) / 400, 1) * 9 * DEG;
      if (length(miss) > 1) axis = normalize(add(retro, scale(normalize(miss), Math.tan(tilt))));
    }
    wantAxis(axis);
    // Light the landing burn when thirteen engines at 85 %, with the air's help, would only just stop it at the arms.
    const h = b.pos[2] - catchZ;
    if (b.vel[2] < 0 && h < 20e3 && h < stoppingDistance(b, 0.85 * 13) + 2 * Math.abs(b.vel[2]) * dt) {
      l.phase = 'landing';
      l.events.push('landing');
    }
    return;
  }
  if (l.phase === 'landing') {
    // Vertical: the deceleration that stops it just over the arms; there it slides across until
    // it's over the mount, then settles down through them.
    const over = length(toPad) < 1.5 && length(horizontal(b.vel)) < 1.5;
    const h = b.pos[2] - catchZ - (over ? 0 : HOLD);
    const az = h > 3 && b.vel[2] < -3 ? (b.vel[2] ** 2) / (2 * h) + G : G + ((over ? -1.5 : -0.5 * h) - b.vel[2]) * 2;
    // Across, on the way down: arrive over the mount and still as the burn ends, about 2h/v from
    // now (zero-effort miss and velocity); hovering, in over the mount and still.
    const tGo = h > 3 && b.vel[2] < -2 ? Math.max((2 * h) / -b.vel[2], 2) : 0;
    const vh = horizontal(b.vel);
    const ah = tGo > 0
      ? add(scale(sub(toPad, scale(vh, tGo)), 6 / tGo ** 2), scale(vh, 2 / tGo))
      : scale(sub(clampLength(scale(toPad, 0.3), 15), vh), 0.8);
    // The air brakes too: the engines only make up the rest. They tip at most 30° off vertical;
    // a big push across takes more thrust upwards with it rather than tipping further.
    const drag = scale(airForce(SUPER_HEAVY, SUPER_HEAVY.length, b).force, 1 / m);
    let side = sub(ah, horizontal(drag));
    if (length(side) > G) side = scale(normalize(side), G);
    let up = az - drag[2];
    if (h > 100) up = Math.max(up, length(side) / Math.tan(30 * DEG));
    else if (length(side) > Math.tan(30 * DEG) * up) side = scale(normalize(side), Math.tan(30 * DEG) * Math.max(up, 0));
    const want: V3 = [side[0], side[1], up];
    if (up > 0) wantAxis(normalize(want));
    Object.assign(b, up > 0 ? enginesFor(m * length(want), b.pos[2], 13) : { lit: 3, throttle: SUPER_HEAVY.minThrottle });
  }
}

function lose(l: Launch): void {
  l.phase = 'lost';
  l.booster.lit = 0;
  l.events.push('lost');
}

/** One step of the whole launch: countdown, the stack, staging, the ship, the booster home. */
export function stepLaunch(l: Launch, c: LaunchControls, groundAt: (x: number, y: number) => number, dt: number): void {
  l.events = [];
  const b = l.booster, s = l.ship;
  if (c.auto && l.phase !== 'pad') {
    l.auto = !l.auto;
    l.events.push(l.auto ? 'auto' : 'manual');
  }
  if (l.auto && l.phase !== 'pad' && (Math.abs(c.pitch) > 0.15 || Math.abs(c.yaw) > 0.15)) {
    l.auto = false;
    l.events.push('manual');
  }

  if (l.phase === 'pad') {
    if (c.fire && !l.counting) l.counting = true;
    if (!l.counting) return;
    l.t += dt;
    if (l.t >= -3 && b.lit === 0) {
      b.lit = SUPER_HEAVY.engines;
      l.events.push('ignition');
    }
    // The engines come up over three seconds; it's released at zero once they lift more than it weighs.
    if (b.lit) b.throttle = Math.min(1, (l.t + 3) / 2.5);
    const thrust = b.lit * b.throttle * engineThrust(SUPER_HEAVY, b.pos[2]);
    b.prop -= ((b.lit * b.throttle * SUPER_HEAVY.thrustVac) / (SUPER_HEAVY.ispVac * G)) * dt;
    if (l.t >= 0 && thrust > stackMass(l) * G) {
      l.phase = 'ascent';
      l.events.push('liftoff');
    }
    return;
  }
  l.t += dt;

  if (l.phase === 'ascent') {
    if (l.auto) {
      b.axis = turnTowards(b.axis, ascentAxis(l), STACK_TURN * dt);
      // Full throttle, eased back through max-q.
      b.throttle = Math.min(Math.max(1 - (l.q - MAX_Q) / 8e3, 0.6), 1);
    } else {
      steer(l, b, c, STACK_TURN * 2, dt);
      b.throttle = Math.max(c.throttle, SUPER_HEAVY.minThrottle);
    }
    s.axis = b.axis;
    const q = fly(SUPER_HEAVY, b, mass(SHIP, s), SUPER_HEAVY.length + SHIP.length, dt);
    if (q < l.q && l.peakQ === 0 && l.q > 15e3) {
      l.peakQ = l.q;
      l.events.push('maxq');
    }
    l.q = q;
    s.vel = [...b.vel];
    s.pos = add(b.pos, scale(b.axis, SUPER_HEAVY.length));
    if (b.prop <= RESERVE) {
      b.lit = 0;
      l.meco = l.t;
      l.phase = 'flip';
      l.events.push('meco');
    }
  } else if (l.stacked) {
    // Hot staging: two seconds after the booster cuts, the ship lights on top of it and pulls away.
    s.vel = [...b.vel];
    s.axis = b.axis;
    fly(SUPER_HEAVY, b, mass(SHIP, s), SUPER_HEAVY.length + SHIP.length, dt);
    s.pos = add(b.pos, scale(b.axis, SUPER_HEAVY.length));
    if (l.t - l.meco > 2) {
      l.stacked = false;
      Object.assign(s, { lit: SHIP.engines, throttle: 1 });
      b.vel = sub(b.vel, scale(b.axis, 4)); // the ship's exhaust shoves the booster back
      l.events.push('staging');
    }
    return;
  }

  if (!l.stacked) {
    // The ship flies itself on towards orbit, its nose up as far as it takes to climb to about
    // 150 km and hold there while it gathers speed, until its tanks run dry.
    const climb = Math.min(Math.max((150e3 - s.pos[2]) / 60, -200), 600);
    const raise = Math.min(Math.max(15 + (climb - s.vel[2]) * 0.1, -10), 50) * DEG;
    const flat = normalize(add(normalize(horizontal(s.vel)), [0, 0, Math.tan(raise)]));
    s.axis = turnTowards(s.axis, flat, SHIP.turnRate * dt);
    if (s.prop <= 0) s.lit = 0;
    fly(SHIP, s, 0, SHIP.length, dt);
  }

  if (l.phase === 'flip' || l.phase === 'boostback' || l.phase === 'coast' || l.phase === 'landing') {
    l.impact = predictImpactEvery(l, dt);
    if (l.auto) boosterAuto(l, dt);
    else {
      steer(l, b, c, SUPER_HEAVY.turnRate, dt);
      if (c.fire) b.lit = b.lit ? 0 : 1; // lit for now; the throttle picks how many
      if (b.lit) Object.assign(b, enginesFor(c.throttle * 13 * engineThrust(SUPER_HEAVY, b.pos[2]), b.pos[2], 13));
      // By hand the phases only follow what it's doing, for the HUD.
      if (l.phase === 'flip' && b.lit) l.phase = 'boostback';
      if (l.phase === 'boostback' && !b.lit) l.phase = 'coast';
      if (l.phase === 'coast' && b.lit && b.vel[2] < 0 && b.pos[2] - l.pad[2] < 15e3) l.phase = 'landing';
    }
    l.q = fly(SUPER_HEAVY, b, 0, SUPER_HEAVY.length, dt);
    if (b.prop <= 0) b.lit = 0;
    landOrCrash(l, groundAt, dt);
  }
}

/** The prediction is coarse and costs a few hundred steps, so it's refreshed four times a second (every step of the boostback). */
function predictImpactEvery(l: Launch, dt: number): V3 | null {
  l.predictIn -= dt;
  if (l.predictIn > 0 && l.impact && l.phase !== 'boostback') return l.impact;
  l.predictIn = 0.25;
  return predictImpact(SUPER_HEAVY, l.booster, l.pad[2] + CATCH_BASE);
}

/** Through the arms' height: caught if it's over the mount, slow and upright; into the tower, the mount or the ground if not. */
function landOrCrash(l: Launch, groundAt: (x: number, y: number) => number, dt: number): void {
  const b = l.booster;
  const catchZ = l.pad[2] + CATCH_BASE;
  const off = length(sub(horizontal(b.pos), horizontal(l.pad)));
  const prevZ = b.pos[2] - b.vel[2] * dt;
  if (off < 15 && prevZ >= catchZ && b.pos[2] < catchZ) {
    if (off < CATCH.radius && -b.vel[2] < CATCH.sink && angle(b.axis, [0, 0, 1]) < CATCH.tilt) {
      l.phase = 'caught';
      Object.assign(b, { lit: 0, vel: [0, 0, 0], axis: [0, 0, 1] as V3 });
      b.pos = [l.pad[0], l.pad[1], catchZ];
      l.events.push('caught');
    } else lose(l);
    return;
  }
  const ground = Math.max(groundAt(b.pos[0], b.pos[1]), 0);
  if (b.pos[2] <= ground) lose(l);
}

export const launchMass = stackMass;
