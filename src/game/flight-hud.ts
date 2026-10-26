// The flying HUD, drawn over the view in the Jet (the cars on wings fly without it): a flight path marker where the plane is actually
// going, a pitch ladder fixed to the real horizon (so it tilts as the view banks), a heading tape,
// the g and angle of attack, an amber AIRBRAKE box while it's out (flashing as the panel swings),
// and a flashing PULL UP when the line it's flying meets the ground.
// Everything is projected through the live camera, so it reads true in chase, bonnet and orbit.

import * as THREE from 'three';

export interface FlightHudFrame {
  /** Velocity in scene space (m/s). */
  vel: THREE.Vector3;
  /** Compass heading the ladder and tape centre on (rad, 0 north, clockwise). */
  heading: number;
  /** Load factor (g) and angle of attack (rad). */
  g: number;
  alpha: number;
  pullUp: boolean;
  /** How far the airbrake panel is up, 0..1. */
  airbrake: number;
}

/**
 * Seconds until the straight line from `pos` along `vel` (sim frame, Z up) passes under the
 * ground, looking `horizon` seconds ahead, or Infinity if it stays clear.
 */
export function secondsToGround(pos: readonly number[], vel: readonly number[], heightAt: (x: number, y: number) => number, horizon = 5): number {
  for (let t = 0.25; t <= horizon; t += 0.25) {
    if (pos[2] + vel[2] * t < heightAt(pos[0] + vel[0] * t, pos[1] + vel[1] * t)) return t;
  }
  return Infinity;
}

const GREEN = '#86ffa8';
const WARN = '#ff5a3a';
const CAUTION = '#ffbf3a';
/** A dark rim round every line and letter, so the green reads against a bright sky. */
const HALO = 'rgba(6, 18, 10, 0.6)';
const FONT = "600 13px 'IBM Plex Mono', ui-monospace, monospace";
/** Ladder rungs every 5°, drawn within this many degrees of the flight path. */
const LADDER_SPAN = 22;
const CARDINALS: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };

type Pt = [number, number];

export class FlightHud {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly v = new THREE.Vector3();
  private readonly cam = new THREE.Vector3();
  private w = 0;
  private h = 0;
  private camera!: THREE.PerspectiveCamera;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** Draws the HUD for this frame, or hides it when `f` is null. */
  update(camera: THREE.PerspectiveCamera, f: FlightHudFrame | null, time: number): void {
    this.canvas.hidden = !f;
    if (!f) return;
    this.fit();
    this.camera = camera;
    camera.updateMatrixWorld();
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);
    c.lineWidth = 1.6;
    c.strokeStyle = c.fillStyle = GREEN;
    c.font = FONT;
    c.lineJoin = 'round';

    // Scene axes: north is −Z, east is +X, up is +Y.
    const fwd = new THREE.Vector3(Math.sin(f.heading), 0, -Math.cos(f.heading));
    const right = new THREE.Vector3(Math.cos(f.heading), 0, Math.sin(f.heading));
    const up = new THREE.Vector3(0, 1, 0);
    const speed = f.vel.length();
    const path = speed > 1 ? Math.asin(THREE.MathUtils.clamp(f.vel.y / speed, -1, 1)) * THREE.MathUtils.RAD2DEG : 0;
    const at = (deg: number) => fwd.clone().multiplyScalar(Math.cos(deg * THREE.MathUtils.DEG2RAD)).addScaledVector(up, Math.sin(deg * THREE.MathUtils.DEG2RAD));

    for (let deg = -85; deg <= 85; deg += 5) {
      if (Math.abs(deg - path) <= LADDER_SPAN) this.rung(deg, at(deg), at(deg + 1), right);
    }
    if (speed > 1) this.marker(f.vel.clone().normalize(), at(path), right);
    this.tape(f.heading);

    const cx = this.w / 2, cy = this.h / 2;
    c.textAlign = 'left';
    this.text(`G ${f.g.toFixed(1)}`, cx - 230, cy - 30);
    this.text(`α ${Math.round(f.alpha * THREE.MathUtils.RAD2DEG)}°`, cx - 230, cy - 10);
    if (f.airbrake > 0) this.airbrake(f.airbrake, cx - 236, cy + 6, time);
    if (f.pullUp && Math.floor(time * 4) % 2 === 0) {
      c.fillStyle = WARN;
      c.font = "800 34px 'Big Shoulders Display', 'Barlow', sans-serif";
      c.textAlign = 'center';
      this.text('PULL UP', cx, cy + 90);
    }
  }

  /** The AIRBRAKE caution box with a bar under it for how far the panel is up; it flashes while the panel moves. */
  private airbrake(out: number, x: number, y: number, time: number): void {
    if (out < 1 && Math.floor(time * 8) % 2 === 0) return;
    const c = this.ctx;
    c.save();
    c.strokeStyle = c.fillStyle = CAUTION;
    c.beginPath();
    c.rect(x, y, 84, 20);
    this.ink();
    c.beginPath();
    c.moveTo(x, y + 26);
    c.lineTo(x + 84 * out, y + 26);
    c.lineWidth = 3;
    this.ink();
    c.textBaseline = 'middle';
    this.text('AIRBRAKE', x + 7, y + 11);
    c.restore();
  }

  /** Strokes the current path over its halo. */
  private ink(): void {
    const c = this.ctx;
    const { lineWidth, strokeStyle } = c;
    c.lineWidth = lineWidth + 2.5;
    c.strokeStyle = HALO;
    c.stroke();
    c.lineWidth = lineWidth;
    c.strokeStyle = strokeStyle;
    c.stroke();
  }

  /** Fills text over its halo. */
  private text(t: string, x: number, y: number): void {
    const c = this.ctx;
    const { lineWidth, strokeStyle } = c;
    c.lineWidth = 3;
    c.strokeStyle = HALO;
    c.strokeText(t, x, y);
    c.lineWidth = lineWidth;
    c.strokeStyle = strokeStyle;
    c.fillText(t, x, y);
  }

  /** Keeps the canvas's pixels matched to its size on screen. */
  private fit(): void {
    const dpr = Math.min(window.devicePixelRatio, 2);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (Math.round(w * dpr) !== this.canvas.width || Math.round(h * dpr) !== this.canvas.height) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    this.w = w;
    this.h = h;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Where a direction from the camera lands on screen, or null if it's behind. */
  private project(dir: THREE.Vector3): Pt | null {
    this.v.copy(dir).multiplyScalar(1000).add(this.camera.position);
    this.cam.copy(this.v).applyMatrix4(this.camera.matrixWorldInverse);
    if (this.cam.z > -1) return null;
    this.v.project(this.camera);
    return [(this.v.x + 1) / 2 * this.w, (1 - this.v.y) / 2 * this.h];
  }

  /** Screen point of `dir` plus unit vectors along the world's horizontal (`side`) and up it (`above`). */
  private frame(dir: THREE.Vector3, above: THREE.Vector3, right: THREE.Vector3): { p: Pt; u: Pt; n: Pt } | null {
    const p = this.project(dir);
    const s = this.project(dir.clone().addScaledVector(right, 0.02));
    const a = this.project(above);
    if (!p || !s || !a) return null;
    const unit = (q: Pt): Pt => { const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [(q[0] - p[0]) / l, (q[1] - p[1]) / l]; };
    return { p, u: unit(s), n: unit(a) };
  }

  /** One ladder rung: solid above the horizon, dashed below, its tips pointing at the horizon. */
  private rung(deg: number, dir: THREE.Vector3, above: THREE.Vector3, right: THREE.Vector3): void {
    const f = this.frame(dir, above, right);
    // Clear of the road plate at the top and the heading tape along the bottom.
    if (!f || f.p[1] < 70 || f.p[1] > this.h - 120) return;
    const c = this.ctx;
    const { p, u, n } = f;
    const horizon = deg === 0;
    const gap = horizon ? 40 : 34, len = horizon ? 240 : 78, tip = deg > 0 ? -8 : 8;
    c.setLineDash(deg < 0 ? [7, 5] : []);
    c.beginPath();
    for (const side of [-1, 1]) {
      const a: Pt = [p[0] + u[0] * gap * side, p[1] + u[1] * gap * side];
      const b: Pt = [p[0] + u[0] * len * side, p[1] + u[1] * len * side];
      c.moveTo(a[0], a[1]);
      c.lineTo(b[0], b[1]);
      if (!horizon) c.lineTo(b[0] + n[0] * tip, b[1] + n[1] * tip);
    }
    this.ink();
    c.setLineDash([]);
    if (horizon) return;
    c.save();
    c.translate(p[0] + u[0] * (len + 16), p[1] + u[1] * (len + 16));
    c.rotate(Math.atan2(u[1], u[0]));
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    this.text(String(Math.abs(deg)), 0, 0);
    c.restore();
  }

  /** The flight path marker: a ring with wings and a fin, level with the horizon. */
  private marker(dir: THREE.Vector3, level: THREE.Vector3, right: THREE.Vector3): void {
    const p = this.project(dir);
    const f = this.frame(level, level.clone().add(new THREE.Vector3(0, 0.02, 0)), right);
    if (!p || !f) return;
    const c = this.ctx;
    const { u, n } = f;
    const r = 8;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(p[0], p[1], r, 0, Math.PI * 2);
    for (const side of [-1, 1]) {
      c.moveTo(p[0] + u[0] * r * side, p[1] + u[1] * r * side);
      c.lineTo(p[0] + u[0] * (r + 14) * side, p[1] + u[1] * (r + 14) * side);
    }
    c.moveTo(p[0] + n[0] * r, p[1] + n[1] * r);
    c.lineTo(p[0] + n[0] * (r + 9), p[1] + n[1] * (r + 9));
    this.ink();
    c.lineWidth = 1.6;
  }

  /** The heading tape along the bottom: a tick every 5°, labels every 10°, the heading boxed. */
  private tape(heading: number): void {
    const c = this.ctx;
    const deg = ((heading * THREE.MathUtils.RAD2DEG) % 360 + 360) % 360;
    const cx = this.w / 2, y = this.h - 84, span = 30, half = Math.min(150, this.w / 2 - 40);
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    const labels: [string, number][] = [];
    c.beginPath();
    for (let d = Math.ceil((deg - span) / 5) * 5; d <= deg + span; d += 5) {
      const x = cx + ((d - deg) / span) * half;
      const major = d % 10 === 0;
      c.moveTo(x, y);
      c.lineTo(x, y + (major ? 9 : 5));
      if (major) {
        const k = ((d % 360) + 360) % 360;
        labels.push([CARDINALS[k] ?? String(k / 10).padStart(2, '0'), x]);
      }
    }
    c.moveTo(cx, y + 13);
    c.lineTo(cx - 5, y + 20);
    c.moveTo(cx, y + 13);
    c.lineTo(cx + 5, y + 20);
    c.rect(cx - 22, y + 22, 44, 18);
    this.ink();
    for (const [t, x] of labels) this.text(t, x, y - 5);
    this.text(String(Math.round(deg) % 360).padStart(3, '0'), cx, y + 36);
  }
}
