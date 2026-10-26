// The birds (src/sim/birds.ts) drawn: one gull-shaped model, white body and grey wings with dark
// tips, stamped out by a single InstancedMesh. Each instance carries its flap phase and strength,
// and the vertex shader beats the wings (or folds them, standing) and grows the bird in at the edge
// of its range, so the CPU only places them.

import * as THREE from 'three';
import type { BirdPose } from '../sim/birds';
import { shadeByClouds } from './cloud-shadow';

const CAP = 240;
/** Beyond this (m) a bird isn't drawn; it grows in over the last quarter. */
const REACH = 1200;
/** Half the body's width: past it, a vertex is wing. */
const ROOT = 0.06;
/** How long the legs are: tucked into the belly in flight, stood on in a field. */
const LEGS = 0.32;

/** Nose along +Z, wings along ±X, 1.3 m across. */
function gull(): THREE.BufferGeometry {
  const white = new THREE.Color(0xf4f4f0), grey = new THREE.Color(0x9aa0a6), tip = new THREE.Color(0x26282a);
  const pos: number[] = [], col: number[] = [];
  const tri = (a: number[], b: number[], c: number[], ca: THREE.Color, cb = ca, cc = ca) => {
    pos.push(...a, ...b, ...c);
    col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
  };
  // Body: a slim diamond in section, head to tail.
  const nose = [0, 0, 0.32], tail = [0, 0.01, -0.3], l = [-ROOT, 0, 0], r = [ROOT, 0, 0], top = [0, 0.08, 0], bot = [0, -0.07, 0];
  for (const [a, b] of [[l, top], [top, r], [r, bot], [bot, l]]) {
    tri(nose, a, b, white);
    tri(tail, b, a, white);
  }
  tri([-0.09, 0.01, -0.24], [0.09, 0.01, -0.24], [0, 0.01, -0.4], white);
  // Legs: a thin wedge each, below the belly.
  const leg = new THREE.Color(0xd9a33a);
  for (const s of [-0.035, 0.035]) tri([s, -0.06, 0.03], [s, -0.06, -0.03], [s, -0.06 - LEGS, 0], leg);
  // Wings: a broad inner panel and a swept, dark-tipped outer one.
  for (const s of [-1, 1]) {
    const rootF = [s * ROOT, 0.01, 0.1], rootB = [s * ROOT, 0.01, -0.1];
    const elbowF = [s * 0.36, 0.02, 0.08], elbowB = [s * 0.36, 0.02, -0.12], wingTip = [s * 0.65, 0.01, -0.2];
    tri(rootF, elbowF, rootB, grey);
    tri(rootB, elbowF, elbowB, grey);
    tri(elbowF, wingTip, elbowB, grey, tip, grey);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export class BirdsView {
  readonly mesh: THREE.InstancedMesh;
  private readonly anim = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 2), 2);
  private readonly time = { value: 0 };

  constructor(private readonly extent: number) {
    const geo = gull();
    geo.setAttribute('birdAnim', this.anim);
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    m.customProgramCacheKey = () => 'birds';
    m.onBeforeCompile = (shader) => {
      shader.uniforms.birdTime = this.time;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
attribute vec2 birdAnim;
uniform float birdTime;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
float birdWing = max(abs(position.x) - ${ROOT.toFixed(2)}, 0.0);
float birdSide = sign(position.x);
if (birdWing <= 0.0) {
  // The body: only the legs move, tucked up in flight.
  if (birdAnim.y >= 0.0) transformed.y = max(transformed.y, -0.07);
} else if (birdAnim.y < 0.0) {
  // Standing: the wings folded back along the body.
  transformed.x = birdSide * (${ROOT.toFixed(2)} + birdWing * 0.12);
  transformed.z -= birdWing * 0.45;
  transformed.y += birdWing * 0.08;
} else {
  float birdBeat = birdAnim.y * 0.9 * sin(birdTime * 14.0 + birdAnim.x) + 0.12;
  transformed.x = birdSide * (${ROOT.toFixed(2)} + birdWing * cos(birdBeat));
  transformed.y += birdWing * sin(birdBeat);
}
vec3 birdAt = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
transformed *= smoothstep(${REACH.toFixed(1)}, ${(REACH * 0.75).toFixed(1)}, distance(birdAt, cameraPosition));`);
    };
    this.mesh = new THREE.InstancedMesh(geo, shadeByClouds(m), CAP);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly p = new THREE.Vector3();
  /** A touch bigger than life, so a flock reads at a few hundred metres. */
  private readonly s = new THREE.Vector3(1.5, 1.5, 1.5);

  update(dt: number, poses: BirdPose[]): void {
    this.time.value += dt;
    const n = Math.min(poses.length, CAP), h = this.extent / 2;
    for (let i = 0; i < n; i++) {
      const { pos, vel, flap, phase } = poses[i];
      // Scene frame: X east, Y up, Z south. Nose (+Z of the model) along the velocity.
      const vx = vel[0], vy = vel[2], vz = -vel[1], horiz = Math.hypot(vx, vz);
      this.e.set(-Math.atan2(vy, horiz || 1e-6), Math.atan2(vx, vz), 0);
      this.m.compose(this.p.set(pos[0] - h, pos[2] + (flap < 0 ? (LEGS + 0.06) * this.s.y : 0), h - pos[1]), this.q.setFromEuler(this.e), this.s);
      this.mesh.setMatrixAt(i, this.m);
      this.anim.setXY(i, phase, flap);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.anim.needsUpdate = true;
  }
}
