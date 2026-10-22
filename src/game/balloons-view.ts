// Draws the balloon field: every balloon is an instance of one glossy mesh (the envelope and its
// knot), each with its own colour and a slow bob and sway; their strings are a second instanced
// mesh. A pop throws pooled confetti (one instanced mesh for all of it) and a quick flash.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BALLOON_RADIUS, type Balloon } from '../sim/balloons';

const MAX_BALLOONS = 64;
const CONFETTI = 900;
const PER_POP = 70;
const STRING = 7;
const PALETTE = [0xe8432e, 0xf2b705, 0x2f9e5b, 0x2b7de9, 0xd23ea0, 0xf4f3ee].map((c) => new THREE.Color(c));

interface Flake {
  life: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  rot: THREE.Euler;
}

export class BalloonsView {
  readonly group = new THREE.Group();
  private readonly balloons: THREE.InstancedMesh;
  private readonly strings: THREE.InstancedMesh;
  private readonly confetti: THREE.InstancedMesh;
  private readonly flakes: Flake[] = [];
  private readonly flashes: { mesh: THREE.Mesh; age: number }[] = [];
  private readonly flashMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private time = 0;

  constructor(private readonly extent: number) {
    const r = BALLOON_RADIUS;
    // Envelope a touch taller than wide, the knot underneath; origin at the envelope's centre.
    const envelope = mergeGeometries([
      new THREE.SphereGeometry(r, 28, 18).scale(1, 1.15, 1).toNonIndexed(),
      new THREE.ConeGeometry(r * 0.12, r * 0.22, 10).rotateX(Math.PI).translate(0, -r * 1.2, 0).toNonIndexed(),
    ]);
    this.balloons = new THREE.InstancedMesh(envelope,
      new THREE.MeshPhysicalMaterial({ roughness: 0.28, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.15, sheen: 0.4 }), MAX_BALLOONS);
    this.balloons.castShadow = true;
    this.strings = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, STRING, 4).translate(0, -STRING / 2, 0),
      new THREE.MeshBasicMaterial({ color: 0xdedbd2 }), MAX_BALLOONS);
    this.confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.55, 0.32),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), CONFETTI);
    for (const mesh of [this.balloons, this.strings, this.confetti]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; // instances span kilometres; the bounding sphere would be the first one's
      mesh.count = 0;
    }
    for (let i = 0; i < CONFETTI; i++) {
      this.flakes.push({ life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: new THREE.Vector3(), rot: new THREE.Euler() });
      this.confetti.setColorAt(i, PALETTE[i % PALETTE.length]);
    }
    this.group.add(this.balloons, this.strings, this.confetti);
  }

  /** Site frame (x east, y north, z up) to the scene. */
  private scene(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(x - this.extent / 2, z, this.extent / 2 - y);
  }

  /** Bursts a balloon: a flash where it was and a shower of confetti in its colour and others. */
  burst(b: Balloon): void {
    const at = this.scene(b.x, b.y, b.z, new THREE.Vector3());
    let spawned = 0;
    for (const f of this.flakes) {
      if (f.life > 0) continue;
      f.life = 2 + Math.random() * 1.5;
      f.pos.copy(at).add(this.v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(BALLOON_RADIUS));
      f.vel.set(Math.random() - 0.5, Math.random() * 0.8 - 0.2, Math.random() - 0.5).normalize().multiplyScalar(8 + Math.random() * 14);
      f.spin.set(Math.random() * 12, Math.random() * 12, Math.random() * 12);
      if (++spawned >= PER_POP) break;
    }
    const flash = new THREE.Mesh(new THREE.SphereGeometry(BALLOON_RADIUS, 16, 10), this.flashMat.clone());
    flash.material.color.copy(PALETTE[b.colour]).lerp(new THREE.Color(0xffffff), 0.5);
    flash.position.copy(at);
    this.group.add(flash);
    this.flashes.push({ mesh: flash, age: 0 });
  }

  update(dt: number, balloons: readonly Balloon[]): void {
    this.time += dt;
    const n = Math.min(balloons.length, MAX_BALLOONS);
    for (let i = 0; i < n; i++) {
      const b = balloons[i];
      const bob = Math.sin(this.time * 0.8 + b.phase) * 0.7;
      this.scene(b.x, b.y, b.z + bob, this.v);
      this.q.setFromEuler(new THREE.Euler(Math.sin(this.time * 0.6 + b.phase) * 0.06, b.phase, Math.cos(this.time * 0.5 + b.phase) * 0.06));
      this.m.compose(this.v, this.q, this.s.set(1, 1, 1));
      this.balloons.setMatrixAt(i, this.m);
      this.balloons.setColorAt(i, PALETTE[b.colour]);
      // The string hangs from the knot.
      this.v.y -= BALLOON_RADIUS * 1.3;
      this.m.compose(this.v, this.q, this.s);
      this.strings.setMatrixAt(i, this.m);
    }
    this.balloons.count = this.strings.count = n;
    this.balloons.instanceMatrix.needsUpdate = this.strings.instanceMatrix.needsUpdate = true;
    if (this.balloons.instanceColor) this.balloons.instanceColor.needsUpdate = true;

    // Confetti: falls, tumbles, drifts to a stop; live flakes are packed to the front.
    let live = 0;
    for (let i = 0; i < this.flakes.length; i++) {
      const f = this.flakes[i];
      if (f.life <= 0) continue;
      f.life -= dt;
      f.vel.multiplyScalar(Math.exp(-dt * 1.6));
      f.vel.y -= 3.5 * dt;
      f.pos.addScaledVector(f.vel, dt);
      f.rot.set(f.rot.x + f.spin.x * dt, f.rot.y + f.spin.y * dt, f.rot.z + f.spin.z * dt);
      const fade = Math.min(f.life / 0.5, 1);
      this.m.compose(f.pos, this.q.setFromEuler(f.rot), this.s.setScalar(fade));
      this.confetti.setMatrixAt(live, this.m);
      this.confetti.setColorAt(live, PALETTE[i % PALETTE.length]);
      live++;
    }
    this.confetti.count = live;
    this.confetti.instanceMatrix.needsUpdate = true;
    if (this.confetti.instanceColor) this.confetti.instanceColor.needsUpdate = true;

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.age += dt;
      // A quick, faint puff where it was: big enough to see, never enough to white out the view.
      const t = f.age / 0.18;
      f.mesh.scale.setScalar(1 + t * 0.6);
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(1 - t, 0) * 0.45;
      if (t >= 1) {
        this.group.remove(f.mesh);
        f.mesh.geometry.dispose();
        (f.mesh.material as THREE.Material).dispose();
        this.flashes.splice(i, 1);
      }
    }
  }

  set visible(on: boolean) {
    this.group.visible = on;
  }
}
