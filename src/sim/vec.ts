// Minimal 3-vector and quaternion maths for the car body, on plain tuples so the sim stays
// free of three.js. Quaternions are [w, x, y, z] and rotate body vectors into the world.

export type V3 = [number, number, number];
export type Quat = [number, number, number, number];

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export function normalize(a: V3): V3 {
  const l = length(a);
  return l > 1e-9 ? scale(a, 1 / l) : [0, 0, 0];
}

/** Rotates a body-frame vector into the world. */
export function rotate(q: Quat, v: V3): V3 {
  const [w, x, y, z] = q;
  // v + 2w(u × v) + 2u × (u × v), u = (x, y, z)
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

/** Rotates a world vector into the body frame. */
export function unrotate(q: Quat, v: V3): V3 {
  return rotate([q[0], -q[1], -q[2], -q[3]], v);
}

/** Rotation of `angle` radians about a unit axis. */
export function axisAngle(axis: V3, angle: number): Quat {
  const s = Math.sin(angle / 2);
  return [Math.cos(angle / 2), axis[0] * s, axis[1] * s, axis[2] * s];
}

export function mulQuat(a: Quat, b: Quat): Quat {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

/** Advances an orientation by a world-frame angular velocity over dt. */
export function integrate(q: Quat, w: V3, dt: number): Quat {
  const d = mulQuat([0, w[0], w[1], w[2]], q);
  const r: Quat = [q[0] + 0.5 * d[0] * dt, q[1] + 0.5 * d[1] * dt, q[2] + 0.5 * d[2] * dt, q[3] + 0.5 * d[3] * dt];
  const l = Math.hypot(r[0], r[1], r[2], r[3]);
  return [r[0] / l, r[1] / l, r[2] / l, r[3] / l];
}

export const lerpV3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Between two orientations a step apart (normalised lerp, plenty for one physics step), the short way round. */
export function blendQuat(a: Quat, b: Quat, t: number): Quat {
  const s = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  const r: Quat = [a[0] + (s * b[0] - a[0]) * t, a[1] + (s * b[1] - a[1]) * t, a[2] + (s * b[2] - a[2]) * t, a[3] + (s * b[3] - a[3]) * t];
  const l = Math.hypot(r[0], r[1], r[2], r[3]);
  return [r[0] / l, r[1] / l, r[2] / l, r[3] / l];
}
