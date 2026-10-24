// What makes the Jet's speed and height show: a contrail from the engine once the air is cold
// enough up high, vapour trails off the wingtips while it pulls hard, dust or sea spray thrown up
// under it when it's fast and low, and how hard the airframe buffets (through the sound barrier,
// and skimming the ground). The trails are ribbons laid in the scene, so they stay where the jet
// has been and the camera sees it fly away from them.

import * as THREE from 'three';
import { Smoke } from './smoke';

const ramp = (v: number, from: number, to: number) => Math.min(Math.max((v - from) / (to - from), 0), 1);

/** 0..1: how thick the contrail is at this height (m): none below 7.5 km, full from 9 km. */
export const contrailStrength = (altitude: number) => ramp(altitude, 7500, 9000);

/** 0..1: wingtip vapour, from pulling past 4 g or flying past 10° of angle of attack, once it's fast enough to wring the air. */
export const vortexStrength = (g: number, alphaDeg: number, airspeed: number) =>
  Math.max(ramp(g, 4, 7), ramp(alphaDeg, 10, 18)) * ramp(airspeed, 60, 120);

/** 0..1: dust or spray thrown up under the jet, fast and within 50 m of the ground. */
export const groundWash = (agl: number, airspeed: number) => ramp(airspeed, 80, 250) * (1 - ramp(agl, 8, 50));

/** 0..1: the airframe's buffet, through the sound barrier and skimming the ground fast. */
export const buffet = (mach: number, agl: number, airspeed: number) =>
  Math.min(Math.exp(-(((mach - 1) / 0.05) ** 2)) * 0.8 + groundWash(agl, airspeed) * 0.5, 1);

/** Opacity across a ribbon: feathered to nothing at both edges, so it reads as vapour, not a band. */
function featherTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 1;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, 'rgb(0,0,0)');
  grad.addColorStop(0.5, 'rgb(255,255,255)');
  grad.addColorStop(1, 'rgb(0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 1);
  return new THREE.CanvasTexture(c);
}

let feather: THREE.CanvasTexture | null = null;

interface TrailStyle {
  /** Seconds a point lasts, and how often one is dropped. */
  life: number;
  every: number;
  /** Width (m) at the head and at the end of its life. */
  width: [number, number];
  /** Opacity at full strength, and seconds it takes to form behind the source. */
  opacity: number;
  formIn: number;
}

/**
 * A ribbon through the points a source has passed, turned to face the camera, widening and
 * fading with age. Points are dropped at a fixed interval and the source's current position
 * leads them, so the ribbon reaches right up to it.
 */
class Trail {
  readonly mesh: THREE.Mesh;
  private readonly max: number;
  private readonly pos: THREE.Vector3[] = [];
  private readonly age: number[] = [];
  private readonly power: number[] = [];
  private head = 0;
  private count = 0;
  private sinceDrop = 0;
  private readonly positions: Float32Array;
  private readonly colours: Float32Array;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly side = new THREE.Vector3();

  constructor(private readonly style: TrailStyle) {
    this.max = Math.ceil(style.life / style.every) + 1;
    for (let i = 0; i < this.max; i++) {
      this.pos.push(new THREE.Vector3());
      this.age.push(Infinity);
      this.power.push(0);
    }
    const n = this.max + 1; // the stored points plus the live head
    this.positions = new Float32Array(n * 2 * 3);
    this.colours = new Float32Array(n * 2 * 4);
    const index: number[] = [];
    for (let i = 0; i < n - 1; i++) index.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    this.geometry.setIndex(index);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colours, 4).setUsage(THREE.DynamicDrawUsage));
    // Across the ribbon u runs 0 to 1, for the feathered edges.
    const uv = new Float32Array(n * 2 * 2);
    for (let i = 0; i < n; i++) uv.set([0, 0, 1, 0], i * 4);
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    feather ??= featherTexture();
    this.mesh = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, alphaMap: feather,
    }));
    this.mesh.frustumCulled = false;
  }

  clear(): void {
    this.count = 0;
  }

  /** Ages the trail; `source` (scene position) lays more of it at `strength` 0..1, or none if null. */
  update(dt: number, source: THREE.Vector3 | null, strength: number, camera: THREE.Camera): void {
    const s = this.style;
    for (let i = 0; i < this.count; i++) this.age[(this.head - i + this.max) % this.max] += dt;
    while (this.count > 0 && this.age[(this.head - this.count + 1 + this.max) % this.max] > s.life) this.count--;
    if (source) {
      // A jump (a respawn, a teleport) would draw a streak across the island: start afresh.
      if (this.count > 0 && this.pos[this.head].distanceToSquared(source) > 2000 ** 2) this.count = 0;
      this.sinceDrop += dt;
      if (this.count === 0 || this.sinceDrop >= s.every) {
        this.sinceDrop = 0;
        this.head = (this.head + 1) % this.max;
        this.pos[this.head].copy(source);
        this.age[this.head] = 0;
        this.power[this.head] = strength;
        this.count = Math.min(this.count + 1, this.max);
      }
    }

    // Newest first: the live source (if any), then the stored points back in time.
    const pts: [THREE.Vector3, number, number][] = [];
    if (source) pts.push([source, 0, strength]);
    for (let i = 0; i < this.count; i++) {
      const k = (this.head - i + this.max) % this.max;
      pts.push([this.pos[k], this.age[k], this.power[k]]);
    }
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const [p, age, power] = pts[i];
      const t = age / s.life;
      // Along the ribbon, and across it square to the line of sight.
      this.a.copy(pts[Math.max(i - 1, 0)][0]).sub(pts[Math.min(i + 1, n - 1)][0]);
      this.b.copy(camera.position).sub(p);
      this.side.crossVectors(this.a, this.b).normalize().multiplyScalar((s.width[0] + (s.width[1] - s.width[0]) * Math.sqrt(t)) / 2);
      this.positions.set([p.x + this.side.x, p.y + this.side.y, p.z + this.side.z, p.x - this.side.x, p.y - this.side.y, p.z - this.side.z], i * 6);
      const alpha = power * s.opacity * Math.min(age / s.formIn, 1) * (1 - t) ** 1.5;
      this.colours.set([1, 1, 1, alpha, 1, 1, 1, alpha], i * 8);
    }
    this.geometry.setDrawRange(0, Math.max(n - 1, 0) * 6);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }
}

export interface JetEffectsFrame {
  /** The jet's drawn body (its world matrix places the engine and the wingtips). */
  body: THREE.Object3D;
  /** Off when it isn't the Jet in the air: the trails stop and fade. */
  on: boolean;
  /** Height above the sea and above the ground (m), airspeed (m/s), load factor, angle of attack (rad). */
  altitude: number;
  agl: number;
  airspeed: number;
  g: number;
  alpha: number;
  /** Scene height of the ground under the jet, whether that is sea, and the jet's scene velocity. */
  groundY: number;
  sea: boolean;
  vel: THREE.Vector3;
}

/** In the Jet's own frame (forward +X, up +Y, right +Z): the nozzle and the two wingtips. */
const NOZZLE = new THREE.Vector3(-8.4, 0.05, 0);
const TIPS = [new THREE.Vector3(-5.6, -0.15, 4.9), new THREE.Vector3(-5.6, -0.15, -4.9)];

export class JetEffects {
  readonly group = new THREE.Group();
  private readonly contrail = new Trail({ life: 25, every: 0.1, width: [1.2, 16], opacity: 0.8, formIn: 0.15 });
  private readonly tips = TIPS.map(() => new Trail({ life: 1.2, every: 0.03, width: [0.3, 1.1], opacity: 0.7, formIn: 0.02 }));
  private readonly dust = new Smoke(new THREE.Color(0xe0c49a), 0.22);
  private readonly spray = new Smoke(new THREE.Color(0xf2f6fa), 0.1);
  private washDue = 0;
  private readonly p = new THREE.Vector3();
  private readonly v = new THREE.Vector3();

  constructor() {
    this.group.add(this.contrail.mesh, ...this.tips.map((t) => t.mesh), this.dust.mesh, this.spray.mesh);
  }

  /** Drops every trail, after a respawn or a change of vehicle. */
  reset(): void {
    this.contrail.clear();
    for (const t of this.tips) t.clear();
  }

  update(dt: number, f: JetEffectsFrame, camera: THREE.Camera): void {
    f.body.updateMatrixWorld();
    const at = (local: THREE.Vector3) => (f.on ? local.clone().applyMatrix4(f.body.matrixWorld) : null);
    this.contrail.update(dt, at(NOZZLE), contrailStrength(f.altitude), camera);
    const vortex = vortexStrength(f.g, f.alpha * THREE.MathUtils.RAD2DEG, f.airspeed);
    this.tips.forEach((t, i) => t.update(dt, at(TIPS[i]), vortex, camera));

    // Ground wash: puffs off the surface under the jet, thrown up and forward with it.
    const wash = f.on ? groundWash(f.agl, f.airspeed) : 0;
    this.washDue += wash * 80 * dt;
    const smoke = f.sea ? this.spray : this.dust;
    const pos = f.body.getWorldPosition(this.p);
    for (; this.washDue >= 1; this.washDue--) {
      // Anywhere in a ring under it, and anywhere along this frame's path.
      const spread = 6 + 6 * Math.random();
      const turn = Math.random() * Math.PI * 2;
      const back = -Math.random() * dt;
      const puff = new THREE.Vector3(pos.x + Math.cos(turn) * spread + f.vel.x * back, f.groundY + 0.5, pos.z + Math.sin(turn) * spread + f.vel.z * back);
      // Dragged along in the jet's wake for a moment, so it billows round and behind it rather
      // than being left at once under the camera.
      this.v.copy(f.vel).multiplyScalar(0.55 + 0.25 * Math.random());
      this.v.y = 8 + 14 * Math.random() * wash;
      smoke.emit(puff, this.v, 5 + 5 * wash, 14 + 10 * wash, 1 + Math.random() * 0.6);
    }
    this.dust.update(dt, camera);
    this.spray.update(dt, camera);
  }
}
