// The scatter (src/sim/scatter.ts) drawn: one low-poly model per kind, flat-shaded and coloured
// per vertex, stamped out with one InstancedMesh per kind, so the whole lot is about ten draw calls.
// A few lines in the vertex shader grow each thing out of the ground as the camera comes within its
// kind's reach (the pop-in), and sway grass and leaves in the wind; the CPU only refills the
// instance lists when cells come or go, from arrays kept per cell.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { groundOf, type Ground, type ScatterField, type ScatterItem, type ScatterKind } from '../sim/scatter';
import { shadeByClouds } from './cloud-shadow';
import { paint } from './shapes';

/** A stable 0..1 from a point, so shared corners of a mesh move together when it is roughened. */
const noise = (x: number, y: number, z: number) => {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
};

/** A lumpy ball, flat-shaded: canopies, bushes, rocks. */
function blob(r: number, sx: number, sy: number, sz: number, rough: number, hex: number, detail = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + rough * (noise(x, y, z) - 0.5);
    p.setXYZ(i, x * k * sx, y * k * sy, z * k * sz);
  }
  g.computeVertexNormals();
  return paint(g, hex);
}

const trunk = (r0: number, r1: number, h: number, hex: number, sides = 6) =>
  paint(new THREE.CylinderGeometry(r1, r0, h, sides, 1, true).translate(0, h / 2, 0), hex);

/** A strip of triangles from `a` bending along `dir`, `len` long and `w` wide at its root: a palm frond or a blade. */
function frond(dir: number, len: number, w: number, lift: number, droop: number, hexRoot: number, hexTip: number, y0: number): THREE.BufferGeometry {
  const segs = 4, pos: number[] = [], col: number[] = [];
  const c0 = new THREE.Color(hexRoot), c1 = new THREE.Color(hexTip);
  const pt = (t: number, side: number): [number, number, number] => {
    const along = len * t, up = lift * t - droop * t * t, half = w * (1 - t) * side;
    const cx = Math.sin(dir) * along + Math.cos(dir) * half, cz = Math.cos(dir) * along - Math.sin(dir) * half;
    return [cx, y0 + up, cz];
  };
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const quad = [pt(t0, -1), pt(t0, 1), pt(t1, 1), pt(t0, -1), pt(t1, 1), pt(t1, -1)];
    const ts = [t0, t0, t1, t0, t1, t1];
    quad.forEach((v, k) => {
      pos.push(...v);
      const c = c0.clone().lerp(c1, ts[k]);
      col.push(c.r, c.g, c.b);
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** The models, at their kind's size 1 (metres, y up, standing on y = 0). */
function models(): Record<ScatterKind, THREE.BufferGeometry> {
  const bark = 0x5a4232, red = 0x7a3b26;
  return {
    // A broadleaf: fig, holm oak, olive, poplar: a short trunk under three lumps of leaves.
    broadleaf: mergeGeometries([
      trunk(0.32, 0.2, 3.4, bark),
      blob(1.9, 1, 0.8, 1, 0.5, 0x4d7a2e).translate(0, 4.6, 0),
      blob(1.5, 1, 0.8, 1, 0.5, 0x5d8a34).translate(1.1, 4.1, 0.6),
      blob(1.4, 1, 0.8, 1, 0.5, 0x456f2a).translate(-0.9, 4.3, -0.7),
    ]),
    // A conifer: Canary pine or mountain fir, tiers of dark cones.
    pine: mergeGeometries([
      trunk(0.3, 0.15, 4, bark),
      ...[0, 1, 2, 3].map((i) => paint(new THREE.ConeGeometry(2.6 - i * 0.55, 3.6, 7).translate(0, 4 + i * 2.1, 0), [0x2f5a2e, 0x35632f, 0x3a6a33, 0x41723a][i])),
    ]),
    // A stone pine: a long bare reddish trunk under a flat umbrella.
    umbrella: mergeGeometries([
      trunk(0.35, 0.22, 7, red),
      blob(3.4, 1, 0.38, 1, 0.45, 0x3e5f2c).translate(0, 7.6, 0),
      blob(2.2, 1, 0.4, 1, 0.45, 0x46682f).translate(1.6, 7.1, -0.8),
    ]),
    cypress: mergeGeometries([trunk(0.3, 0.2, 1.2, bark), blob(1, 1.1, 4.6, 1.1, 0.3, 0x2c4a26).translate(0, 5.2, 0)]),
    // A Canary palm: a thick ringed trunk and a crown of drooping fronds.
    palm: mergeGeometries([
      trunk(0.42, 0.34, 8, 0x8a7458, 7),
      blob(0.65, 1, 0.8, 1, 0.3, 0x7a6a3c, 0).translate(0, 8.1, 0),
      ...Array.from({ length: 14 }, (_, i) => frond(i * 2.399, 3.4 + 0.6 * noise(i, 1, 2), 0.42, 0.9 + noise(i, 3, 4), 3.2, 0x58792c, 0x7c9a3a, 8.1)),
    ]),
    // A tabaiba or broom: a low lumpy mound.
    bush: mergeGeometries([
      blob(0.7, 1.2, 0.75, 1.1, 0.6, 0x5f7238).translate(0, 0.45, 0),
      blob(0.5, 1, 0.8, 1, 0.6, 0x6d7d40).translate(0.55, 0.35, 0.2),
    ]),
    // A prickly pear (tunera): flat pads on pads.
    cactus: mergeGeometries([
      blob(0.32, 1, 1.3, 0.35, 0.2, 0x5f8a45, 0).translate(0, 0.42, 0),
      blob(0.28, 1, 1.25, 0.35, 0.2, 0x6a9450, 0).rotateZ(0.6).translate(0.38, 0.95, 0),
      blob(0.26, 1, 1.25, 0.35, 0.2, 0x5a8442, 0).rotateZ(-0.5).rotateY(0.7).translate(-0.3, 0.92, 0.1),
      blob(0.22, 1, 1.25, 0.35, 0.2, 0x6a9450, 0).rotateZ(0.2).translate(0.5, 1.45, 0),
    ]),
    // A tuft: a fan of tapering blades, pale at the tips.
    grass: mergeGeometries(Array.from({ length: 7 }, (_, i) => frond(i * 2.4, 0.35 + 0.3 * noise(i, 5, 6), 0.07, 0.55 + 0.35 * noise(i, 7, 8), 0.25, 0x56702c, 0xb8b06a, 0))),
    stone: blob(0.28, 1.2, 0.55, 1, 0.7, 0xb0aaa0, 0).translate(0, 0.08, 0),
    boulder: blob(1.1, 1.15, 0.75, 1, 0.55, 0xb0aaa0).translate(0, 0.45, 0),
  };
}

/** How the kinds are drawn: reach (m, where they have fully grown in), how much they sway, the cap, shadows. */
const LOOK: Record<ScatterKind, { reach: number; sway: number; cap: number; leafy?: boolean; shadow?: boolean }> = {
  grass: { reach: 110, sway: 0.12, cap: 14000, leafy: true },
  stone: { reach: 150, sway: 0, cap: 4000 },
  bush: { reach: 220, sway: 0.02, cap: 4000, shadow: true },
  cactus: { reach: 220, sway: 0, cap: 4000, shadow: true },
  boulder: { reach: 450, sway: 0, cap: 2000, shadow: true },
  broadleaf: { reach: 640, sway: 0.004, cap: 9000, shadow: true },
  pine: { reach: 640, sway: 0.003, cap: 9000, shadow: true },
  umbrella: { reach: 640, sway: 0.003, cap: 9000, shadow: true },
  cypress: { reach: 640, sway: 0.004, cap: 9000, shadow: true },
  palm: { reach: 640, sway: 0.006, cap: 9000, leafy: true, shadow: true },
};

/** Shared by every scatter material: the clock and the wind. */
const shared = { scatterTime: { value: 0 }, scatterWind: { value: 0.3 } };

/** Grows each instance in over the last quarter of `reach` and sways it with the square of its height. */
function scatterMaterial(reach: number, sway: number, leafy: boolean): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: !leafy, side: leafy ? THREE.DoubleSide : THREE.FrontSide });
  const own = { scatterReach: { value: reach }, scatterSway: { value: sway } };
  m.customProgramCacheKey = () => 'scatter';
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, own);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float scatterTime, scatterWind, scatterReach, scatterSway;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
vec3 scatterAt = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
float scatterPhase = scatterTime * 1.6 + scatterAt.x * 0.23 + scatterAt.z * 0.19;
float scatterBend = scatterSway * scatterWind * position.y * position.y;
transformed.x += scatterBend * sin(scatterPhase);
transformed.z += scatterBend * 0.6 * cos(scatterPhase * 1.3);
transformed *= smoothstep(scatterReach, scatterReach * 0.75, distance(scatterAt, cameraPosition));
#endif`);
  };
  return shadeByClouds(m);
}

/** The island's photo, read once, for what grows where. */
export class GroundPhoto {
  private readonly data: Uint8ClampedArray;
  private readonly size: number;

  constructor(image: CanvasImageSource, private readonly extent: number, size = 2048) {
    const c = document.createElement('canvas');
    c.width = c.height = this.size = size;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(image, 0, 0, size, size);
    this.data = g.getImageData(0, 0, size, size).data;
  }

  /** The ground at a point of the site frame (row 0 of the photo is the north edge). */
  at(x: number, y: number): Ground | null {
    const n = this.size, col = Math.floor((x / this.extent) * n), row = Math.floor((1 - y / this.extent) * n);
    if (col < 0 || row < 0 || col >= n || row >= n) return null;
    const i = (row * n + col) * 4;
    if (this.data[i + 3] < 128) return null;
    return groundOf(this.data[i] / 255, this.data[i + 1] / 255, this.data[i + 2] / 255);
  }
}

/** Per cell, its instances' matrices and colours by kind, worked out once. */
type Baked = Map<ScatterKind, { matrices: Float32Array; colors: Float32Array }>;

export class ScatterView {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<ScatterKind, THREE.InstancedMesh>();
  private readonly baked = new WeakMap<ScatterItem[], Baked>();
  private versions: number[] = [];
  private sinceFill = Infinity;

  constructor(private readonly fields: ScatterField[], private readonly extent: number) {
    const geos = models();
    for (const kind of Object.keys(LOOK) as ScatterKind[]) {
      const look = LOOK[kind];
      const mesh = new THREE.InstancedMesh(geos[kind], scatterMaterial(look.reach, look.sway, !!look.leafy), look.cap);
      mesh.count = 0;
      mesh.castShadow = !!look.shadow;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // the instances are spread round the car, not round the mesh's origin
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(look.cap * 3), 3);
      this.meshes.set(kind, mesh);
      this.group.add(mesh);
    }
  }

  /** The wind's strength (m/s) for the sway. */
  setWind(speed: number): void {
    shared.scatterWind.value = 0.3 + Math.min(speed / 8, 1.5);
  }

  /** Advances the sway, and refills the instance lists (at most a few times a second) when the cells round `at` (camera, sim frame) changed. */
  update(dt: number, at: { x: number; y: number }): void {
    shared.scatterTime.value += dt;
    this.sinceFill += dt;
    const versions = this.fields.map((f) => f.version);
    if (this.sinceFill < 0.25 || versions.every((v, i) => v === this.versions[i])) return;
    this.versions = versions;
    this.sinceFill = 0;
    const counts = new Map<ScatterKind, number>();
    const cells = this.fields.flatMap((f) => [...f.cells.values()].map((c) => ({ c, d: Math.hypot((c.cx + 0.5) * f.cellM - at.x, (c.cy + 0.5) * f.cellM - at.y), half: f.cellM * 0.71 })));
    cells.sort((a, b) => a.d - b.d); // nearest first, so a full cap drops the far end
    for (const { c, d, half } of cells) {
      for (const [kind, b] of this.bake(c.items)) {
        if (d - half > LOOK[kind].reach) continue;
        const mesh = this.meshes.get(kind)!, n = counts.get(kind) ?? 0, k = Math.min(b.colors.length / 3, LOOK[kind].cap - n);
        if (k <= 0) continue;
        (mesh.instanceMatrix.array as Float32Array).set(b.matrices.subarray(0, k * 16), n * 16);
        (mesh.instanceColor!.array as Float32Array).set(b.colors.subarray(0, k * 3), n * 3);
        counts.set(kind, n + k);
      }
    }
    for (const [kind, mesh] of this.meshes) {
      mesh.count = counts.get(kind) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
    }
  }

  private bake(items: ScatterItem[]): Baked {
    let b = this.baked.get(items);
    if (b) return b;
    const byKind = new Map<ScatterKind, ScatterItem[]>();
    for (const it of items) {
      let list = byKind.get(it.kind);
      if (!list) byKind.set(it.kind, (list = []));
      list.push(it);
    }
    b = new Map();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const e = this.extent;
    for (const [kind, list] of byKind) {
      const matrices = new Float32Array(list.length * 16), colors = new Float32Array(list.length * 3);
      list.forEach((it, i) => {
        // Sunk a little, so a slope doesn't show daylight under the downhill side.
        m.compose(p.set(it.x - e / 2, it.z - 0.15 * it.size, e / 2 - it.y), q.setFromAxisAngle(up, it.turn), s.setScalar(it.size));
        m.toArray(matrices, i * 16);
        colors.set(it.tint, i * 3);
      });
      b.set(kind, { matrices, colors });
    }
    this.baked.set(items, b);
    return b;
  }
}
