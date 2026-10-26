// The people (src/sim/people.ts) drawn: one blocky figure stamped out by a single InstancedMesh.
// Its vertex colours mark what each part is (shirt, trousers, skin, or dark for shoes and hair),
// and each instance brings its own three colours; the vertex shader swings the arms and legs from
// the hips and shoulders by the stride's phase. Tumbling, lying down and getting up are the
// instance's matrix.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Person } from '../sim/people';
import { shadeByClouds } from './cloud-shadow';
import { paint } from './shapes';

const CAP = 64;
const SHIRT = 0xff0000, PANTS = 0x00ff00, SKIN = 0x0000ff, DARK = 0x000000;
const HIP = 0.9, SHOULDER = 1.46;
const SHIRTS = [0xe8e4da, 0x2f5f9e, 0xc0392b, 0x1e8a6e, 0xf2c14e, 0x3d3d45, 0xe07a5f, 0x7aa6c2, 0xffffff, 0x8e5c9e];
const TROUSERS = [0x2b3f66, 0x3a4f7a, 0xc8b48a, 0x2a2a2e, 0x6b6e73, 0xe8e4da, 0x4a5a3a];
const SKINS = [0xf1c8a8, 0xe0ac86, 0xc68a62, 0x9c6644, 0x6e4630];

/** Facing +Z, standing on y = 0, 1.8 m tall. */
function figure(): THREE.BufferGeometry {
  const b = (sx: number, sy: number, sz: number, x: number, y: number, z: number, part: number) =>
    paint(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z), part);
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    parts.push(
      b(0.15, HIP - 0.08, 0.17, s * 0.1, 0.08 + (HIP - 0.08) / 2, 0, PANTS),
      b(0.16, 0.08, 0.25, s * 0.1, 0.04, 0.03, DARK),
      b(0.1, 0.5, 0.12, s * 0.27, SHOULDER - 0.25, 0, SHIRT),
      b(0.09, 0.12, 0.1, s * 0.27, SHOULDER - 0.56, 0, SKIN),
    );
  }
  parts.push(
    b(0.42, 0.62, 0.24, 0, HIP + 0.31, 0, SHIRT),
    b(0.2, 0.25, 0.22, 0, 1.68, 0, SKIN),
    b(0.22, 0.07, 0.24, 0, 1.83, -0.01, DARK),
    b(0.22, 0.18, 0.05, 0, 1.73, -0.11, DARK),
  );
  // The colours are marks, not colours: keep them out of the colour-space conversion.
  const g = mergeGeometries(parts);
  const c = g.attributes.color;
  for (let i = 0; i < c.count; i++) c.setXYZ(i, Math.round(c.getX(i)), Math.round(c.getY(i)), Math.round(c.getZ(i)));
  return g;
}

export class PeopleView {
  readonly mesh: THREE.InstancedMesh;
  private readonly anim = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 2), 2);
  private readonly shirt = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
  private readonly pants = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
  private readonly skin = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
  private readonly m = new THREE.Matrix4();
  private readonly t = new THREE.Matrix4();
  private readonly c = new THREE.Color();

  constructor(private readonly extent: number) {
    const geo = figure();
    geo.setAttribute('pedAnim', this.anim);
    geo.setAttribute('pedShirt', this.shirt);
    geo.setAttribute('pedPants', this.pants);
    geo.setAttribute('pedSkin', this.skin);
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    m.customProgramCacheKey = () => 'people';
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
attribute vec2 pedAnim;
attribute vec3 pedShirt, pedPants, pedSkin;
vec3 pedSwing(vec3 p, float pivot, float a) {
  float y = p.y - pivot;
  return vec3(p.x, pivot + y * cos(a) - p.z * sin(a), y * sin(a) + p.z * cos(a));
}`)
        .replace('#include <color_vertex>', `#include <color_vertex>
vColor.rgb = color.r * pedShirt + color.g * pedPants + color.b * pedSkin + (1.0 - min(color.r + color.g + color.b, 1.0)) * vec3(0.05);`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
float pedSide = sign(position.x);
float pedBeat = pedAnim.y * sin(pedAnim.x);
if (position.y < ${HIP.toFixed(2)} && abs(position.x) < 0.2) transformed = pedSwing(transformed, ${HIP.toFixed(2)}, pedBeat * pedSide);
else if (abs(position.x) > 0.22) transformed = pedSwing(transformed, ${SHOULDER.toFixed(2)}, -0.8 * pedBeat * pedSide);`);
      // The normals swing too little to matter.
    };
    this.mesh = new THREE.InstancedMesh(geo, shadeByClouds(m), CAP);
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
  }

  update(people: readonly Person[]): void {
    const n = Math.min(people.length, CAP), h = this.extent / 2;
    const yAxis = new THREE.Vector3(0, 1, 0), xAxis = new THREE.Vector3(1, 0, 0);
    for (let i = 0; i < n; i++) {
      const p = people[i];
      // Scene frame: feet at the point, +Z of the model turned onto the compass heading.
      this.m.makeTranslation(p.pos[0] - h, p.pos[2], h - p.pos[1]);
      this.m.multiply(this.t.makeRotationAxis(yAxis, Math.PI - p.heading));
      // Tumbling about the hips; lying on its back from the feet, and getting up from that.
      const lie = p.state === 'down' ? 1 : p.state === 'rise' ? Math.min(p.timer, 1) : 0;
      if (p.state === 'flying') {
        this.m.multiply(this.t.makeTranslation(0, HIP, 0)).multiply(this.t.makeRotationAxis(xAxis, p.tumble)).multiply(this.t.makeTranslation(0, -HIP, 0));
      } else if (lie > 0) {
        this.m.multiply(this.t.makeTranslation(0, 0.13 * lie, 0)).multiply(this.t.makeRotationAxis(xAxis, (-Math.PI / 2) * lie));
      }
      this.mesh.setMatrixAt(i, this.m);
      const amp = p.state === 'walk' || p.state === 'wander' ? 0.45 : p.state === 'dodge' ? 0.9 : p.state === 'flying' ? 1.1 : 0;
      this.anim.setXY(i, p.state === 'flying' ? p.tumble * 3 : p.phase, amp);
      const set = (attr: THREE.InstancedBufferAttribute, list: number[], salt: number) => {
        this.c.setHex(list[Math.floor(p.look / salt) % list.length]);
        attr.setXYZ(i, this.c.r, this.c.g, this.c.b);
      };
      set(this.shirt, SHIRTS, 1);
      set(this.pants, TROUSERS, 11);
      set(this.skin, SKINS, 97);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    for (const a of [this.anim, this.shirt, this.pants, this.skin]) a.needsUpdate = true;
  }
}
