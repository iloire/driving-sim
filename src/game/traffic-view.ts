// The traffic (src/sim/traffic.ts) drawn: three everyday cars, a hatchback, a saloon and a van,
// low-poly from extruded side profiles. Each is two InstancedMeshes, the paintwork tinted per car
// from a palette heavy on white and silver (the island's hire cars), and the rest (glass, tyres,
// lights, bumpers) as it is: six draw calls for all of them.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TrafficCar } from '../sim/traffic';
import { shadeByClouds } from './cloud-shadow';
import { paint, slab } from './shapes';

const CAP = 32;
const PALETTE = [0xf2f2ee, 0xf2f2ee, 0xf2f2ee, 0xb9bcc0, 0xb9bcc0, 0x2a2c30, 0x9c1f1f, 0x23467a, 0x2f5a3c, 0xd8c9a0];

/** Nose along +X, up +Y, across Z, standing on y = 0. */
interface Model { paint: THREE.BufferGeometry; rest: THREE.BufferGeometry }

/** Wheels, bumpers and lamps for a car `len` long and `width` wide. */
function running(len: number, width: number, wheelbase: number, r: number): THREE.BufferGeometry[] {
  const tyre = 0x1b1b1d, half = len / 2, side = width / 2 - 0.12;
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [wheelbase / 2, -wheelbase / 2]) {
    for (const z of [side, -side]) parts.push(paint(new THREE.CylinderGeometry(r, r, 0.22, 10).rotateX(Math.PI / 2).translate(x, r, z), tyre));
  }
  parts.push(
    paint(new THREE.BoxGeometry(0.16, 0.22, width + 0.04).translate(half - 0.02, 0.42, 0), 0x3a3b3e),
    paint(new THREE.BoxGeometry(0.16, 0.22, width + 0.04).translate(-half + 0.02, 0.42, 0), 0x3a3b3e),
  );
  for (const z of [width / 2 - 0.25, -width / 2 + 0.25]) {
    parts.push(
      paint(new THREE.BoxGeometry(0.06, 0.12, 0.3).translate(half + 0.02, 0.68, z), 0xfff3cf),
      paint(new THREE.BoxGeometry(0.06, 0.14, 0.32).translate(-half - 0.02, 0.72, z), 0xb3121a),
    );
  }
  return parts;
}

function car(profile: [number, number][], cabin: [number, number][], roof: [number, number][], len: number, width: number, wheelbase: number): Model {
  return {
    paint: mergeGeometries([paint(slab(profile, width, 0.06), 0xffffff), paint(slab(roof, width - 0.14, 0.03), 0xffffff)]),
    rest: mergeGeometries([paint(slab(cabin, width - 0.18, 0.04, 0.12), 0x1d2228), ...running(len, width, wheelbase, 0.31)]),
  };
}

function models(): Model[] {
  return [
    // Hatchback: short, upright tail.
    car(
      [[-1.95, 0.22], [1.95, 0.22], [2.0, 0.55], [1.85, 0.8], [0.8, 0.92], [-1.95, 0.95], [-2.0, 0.6]],
      [[0.8, 0.9], [0.2, 1.36], [-1.55, 1.38], [-1.9, 0.92]],
      [[0.22, 1.33], [-1.55, 1.35], [-1.58, 1.43], [0.18, 1.42]],
      4.0, 1.75, 2.5,
    ),
    // Saloon: a long bonnet and a boot.
    car(
      [[-2.3, 0.22], [2.3, 0.22], [2.35, 0.55], [2.2, 0.76], [1.0, 0.88], [-1.4, 0.9], [-2.25, 0.86], [-2.35, 0.55]],
      [[1.0, 0.86], [0.35, 1.34], [-0.95, 1.36], [-1.5, 0.88]],
      [[0.37, 1.31], [-0.95, 1.33], [-1.0, 1.41], [0.33, 1.4]],
      4.7, 1.8, 2.75,
    ),
    // Van: a tall box with a short nose.
    car(
      [[-2.4, 0.25], [2.4, 0.25], [2.45, 0.6], [2.3, 0.95], [1.6, 1.1], [1.2, 1.95], [-2.4, 2.0], [-2.45, 0.6]],
      [[1.62, 1.12], [1.22, 1.72], [0.5, 1.74], [0.5, 1.1]],
      [[1.2, 1.94], [-2.38, 1.98], [-2.38, 2.02], [1.18, 2.0]],
      4.9, 1.95, 3.0,
    ),
  ];
}

export class TrafficView {
  readonly group = new THREE.Group();
  private readonly paints: THREE.InstancedMesh[] = [];
  private readonly rests: THREE.InstancedMesh[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YZX');
  private readonly p = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly c = new THREE.Color();

  constructor(private readonly extent: number, private readonly heightAt: (x: number, y: number) => number) {
    const body = shadeByClouds(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.3 }));
    const rest = shadeByClouds(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
    for (const model of models()) {
      const a = new THREE.InstancedMesh(model.paint, body, CAP), b = new THREE.InstancedMesh(model.rest, rest, CAP);
      a.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
      for (const mesh of [a, b]) {
        mesh.count = 0;
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        this.group.add(mesh);
      }
      this.paints.push(a);
      this.rests.push(b);
    }
  }

  update(cars: readonly TrafficCar[]): void {
    const counts = this.paints.map(() => 0), h = this.extent / 2;
    for (const car of cars) {
      const kind = car.look % this.paints.length, n = counts[kind];
      if (n >= CAP) continue;
      // Pitched to the ground under its axles.
      const s = Math.sin(car.heading), co = Math.cos(car.heading), wb = 1.35;
      const front = this.heightAt(car.pos[0] + s * wb, car.pos[1] + co * wb), back = this.heightAt(car.pos[0] - s * wb, car.pos[1] - co * wb);
      this.e.set(0, Math.PI / 2 - car.heading, Math.atan2(front - back, 2 * wb));
      this.m.compose(this.p.set(car.pos[0] - h, (front + back) / 2 + 0.06, h - car.pos[1]), this.q.setFromEuler(this.e), this.one);
      this.paints[kind].setMatrixAt(n, this.m);
      this.rests[kind].setMatrixAt(n, this.m);
      this.paints[kind].setColorAt(n, this.c.setHex(PALETTE[Math.floor(car.look / 3) % PALETTE.length]));
      counts[kind] = n + 1;
    }
    this.paints.forEach((mesh, i) => {
      for (const m of [mesh, this.rests[i]]) {
        m.count = counts[i];
        m.instanceMatrix.needsUpdate = true;
      }
      mesh.instanceColor!.needsUpdate = true;
    });
  }
}
