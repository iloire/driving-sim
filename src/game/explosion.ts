// The Jet hitting the ground: a white-hot flash, a fireball of glowing puffs thrown out with what's
// left of its speed, black smoke boiling up after it, burning debris flung out and bouncing off
// the ground, and an orange light over the terrain that dies away. All of it lives in the scene and
// plays out on its own once `burst` sets it off.

import * as THREE from 'three';
import { Smoke } from './smoke';

const DEBRIS = 16;
const SMOKE = 36;
const G = 9.81;

/** The fireball's light: peak intensity, and how long it takes to die (s). */
const LIGHT = { peak: 4e4, fade: 0.9 };

/** 0..1: how bright the flash is `age` seconds after the impact: an instant peak, gone by 0.4 s. */
export const flash = (age: number) => (age < 0 ? 0 : Math.exp(-age / 0.12) * (age < 0.4 ? 1 : 0));

/** Moves a bit of debris on by `dt` under gravity, bouncing it off the ground at `floor`. */
export function fling(pos: THREE.Vector3, vel: THREE.Vector3, floor: number, dt: number): void {
  vel.y -= G * dt;
  vel.multiplyScalar(Math.exp(-dt * 0.3));
  pos.addScaledVector(vel, dt);
  if (pos.y < floor) {
    pos.y = floor;
    if (vel.y < 0) vel.y *= -0.35;
    vel.x *= 0.6;
    vel.z *= 0.6;
  }
}

function puffTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

interface Bit {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
}

interface Plume {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  age: number;
  life: number;
  grow: number;
}

export class Explosion {
  readonly group = new THREE.Group();
  private readonly fire = new Smoke(new THREE.Color(0xff7a2a), 0.6);
  private readonly core: THREE.Sprite;
  private readonly light: THREE.PointLight;
  private readonly bits: Bit[] = [];
  private readonly plumes: Plume[] = [];
  private age = Infinity;
  private readonly at = new THREE.Vector3();
  private readonly v = new THREE.Vector3();

  /** `size`: how many times the Jet's crash it is (the booster's is about eight). */
  constructor(private readonly size = 1) {
    this.light = new THREE.PointLight(0xff9a50, 0, 600 * size, 2);
    const map = puffTexture();
    // The flash: a soft white-hot glow, not a ball with an edge.
    this.core = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: 0xfff1c8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.core.visible = false;
    // The light stays in the scene at zero, so lighting up doesn't recompile every shader.
    this.group.add(this.fire.mesh, this.core, this.light);
    const metal = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.7, metalness: 0.4 });
    for (let i = 0; i < DEBRIS; i++) {
      const s = (0.3 + Math.random() * 1.1) * size;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(s * 1.6, s * 0.25, s), metal);
      mesh.visible = false;
      this.group.add(mesh);
      this.bits.push({ mesh, vel: new THREE.Vector3(), spin: new THREE.Vector3() });
    }
    for (let i = 0; i < SMOKE; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: 0x3a3631, transparent: true, depthWrite: false, opacity: 0 }));
      sprite.visible = false;
      this.group.add(sprite);
      this.plumes.push({ sprite, vel: new THREE.Vector3(), age: 0, life: 1, grow: 1 });
    }
  }

  /** Sets it off at scene point `at`, with the jet's scene velocity `vel` at impact. */
  burst(at: THREE.Vector3, vel: THREE.Vector3): void {
    this.age = 0;
    this.at.copy(at);
    // What carries on is a fraction of the speed, mostly along the ground.
    const k = this.size;
    const carry = this.v.copy(vel).multiplyScalar(0.15);
    carry.y = Math.max(carry.y, 0);
    for (let i = 0; i < 45; i++) {
      const dir = new THREE.Vector3().randomDirection();
      dir.y = Math.abs(dir.y) * 0.8 + 0.1;
      const speed = (10 + Math.random() * 30) * Math.sqrt(k);
      this.fire.emit(at.clone().addScaledVector(dir, 2 * k), dir.multiplyScalar(speed).add(carry), (4 + Math.random() * 3) * k, (10 + Math.random() * 10) * k, (0.7 + Math.random() * 0.8) * Math.sqrt(k));
    }
    for (const b of this.bits) {
      const dir = new THREE.Vector3().randomDirection();
      dir.y = Math.abs(dir.y) + 0.3;
      b.vel.copy(dir.normalize().multiplyScalar((20 + Math.random() * 50) * Math.sqrt(k))).add(carry);
      b.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(14);
      b.mesh.position.copy(at);
      b.mesh.visible = true;
    }
    this.plumes.forEach((p, i) => {
      p.age = -0.3 - i * 0.05; // after the fireball, a column that keeps rising for a couple of seconds
      p.life = (4 + Math.random() * 3) * Math.sqrt(k);
      p.grow = (6 + Math.random() * 6) * k;
      p.vel.set((Math.random() - 0.5) * 8 * k, (10 + Math.random() * 10) * Math.sqrt(k), (Math.random() - 0.5) * 8 * k).add(this.v.copy(carry).multiplyScalar(0.5));
      p.sprite.position.copy(at);
      p.sprite.scale.setScalar(8 * k);
      p.sprite.visible = false;
    });
    this.core.position.copy(at);
    this.light.position.copy(at).y += 8 * k;
  }

  /** Plays it on; `floor` gives the ground's scene height under a point, for the debris to land on. */
  update(dt: number, camera: THREE.Camera, floor: (p: THREE.Vector3) => number): void {
    this.fire.update(dt, camera);
    if (this.age === Infinity) return;
    this.age += dt;
    const a = this.age;

    const f = flash(a);
    this.core.visible = f > 0.01;
    this.core.scale.setScalar((10 + 40 * Math.min(a / 0.25, 1)) * this.size);
    this.core.material.opacity = f;
    this.light.intensity = a < LIGHT.fade ? LIGHT.peak * this.size ** 2 * (1 - a / LIGHT.fade) ** 2 : 0;

    for (const b of this.bits) {
      if (!b.mesh.visible) continue;
      fling(b.mesh.position, b.vel, floor(b.mesh.position) + 0.2, dt);
      b.mesh.rotation.x += b.spin.x * dt;
      b.mesh.rotation.y += b.spin.y * dt;
      b.mesh.rotation.z += b.spin.z * dt;
      b.spin.multiplyScalar(Math.exp(-dt * 0.8));
      // Burning bits trail fire for the first second and a half.
      if (a < 1.5 && Math.random() < 0.5) this.fire.emit(b.mesh.position.clone(), this.v.set(0, 3, 0), 1.2 * this.size, 3 * this.size, 0.4);
      if (a > 6) b.mesh.visible = false;
    }

    for (const p of this.plumes) {
      p.age += dt;
      if (p.age < 0) continue;
      if (p.age > p.life) {
        p.sprite.visible = false;
        continue;
      }
      // Set off in turn from round the crash.
      const k = this.size;
      if (!p.sprite.visible) p.sprite.position.set(this.at.x + (Math.random() - 0.5) * 14 * k, this.at.y + Math.random() * 6 * k, this.at.z + (Math.random() - 0.5) * 14 * k);
      p.sprite.visible = true;
      p.vel.multiplyScalar(Math.exp(-dt * 0.6));
      p.vel.y += 2 * dt; // hot smoke keeps rising
      p.sprite.position.addScaledVector(p.vel, dt);
      p.sprite.scale.setScalar(8 * k + p.grow * p.age);
      const t = p.age / p.life;
      p.sprite.material.opacity = Math.min(p.age / 0.5, 1) * (1 - t) ** 1.3 * 0.5;
    }
    if (a > 10) this.age = Infinity;
  }
}
