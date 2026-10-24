// Thruster smoke: soft puffs from a pool, each an instance of one camera-facing quad with a radial
// gradient. They're blown out of a nozzle, slowed by the air, grow as they spread and fade (by
// colour, under additive blending) to nothing. Lives in scene space, not on the car, so the plumes
// stay behind where the car has been.

import * as THREE from 'three';

const POOL = 900;

function puffTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

interface Puff {
  life: number;
  max: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  size: number;
  grow: number;
}

export class Smoke {
  readonly mesh: THREE.InstancedMesh;
  private readonly puffs: Puff[] = [];
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();

  /** `opacity`: a fresh puff's brightness under the additive blend (they pile up where they overlap). */
  constructor(private readonly tint = new THREE.Color(0xe9f1ff), private readonly opacity = 0.55) {
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: puffTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), POOL);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    for (let i = 0; i < POOL; i++) this.puffs.push({ life: 0, max: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 1, grow: 1 });
  }

  /** One puff at a scene position, blown at `vel` (m/s), starting `size` m across and growing `grow` m/s. */
  emit(pos: THREE.Vector3, vel: THREE.Vector3, size: number, grow: number, life: number): void {
    const p = this.puffs[this.next];
    this.next = (this.next + 1) % POOL;
    p.life = p.max = life;
    p.pos.copy(pos);
    p.vel.copy(vel);
    p.size = size;
    p.grow = grow;
  }

  /** Advances the puffs and turns them to face the camera. */
  update(dt: number, camera: THREE.Camera): void {
    let live = 0;
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vel.multiplyScalar(Math.exp(-dt * 2.2));
      p.vel.y += 1.2 * dt; // warm gas drifts up
      p.pos.addScaledVector(p.vel, dt);
      p.size += p.grow * dt;
      const age = 1 - p.life / p.max;
      this.m.compose(p.pos, camera.quaternion, this.s.setScalar(p.size));
      this.mesh.setMatrixAt(live, this.m);
      // Fade in fast, out slowly; under additive blending, darker is more transparent.
      const a = Math.min(age / 0.08, 1) * (1 - age) ** 1.5 * this.opacity;
      this.mesh.setColorAt(live, this.c.copy(this.tint).multiplyScalar(a));
      live++;
    }
    this.mesh.count = live;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
