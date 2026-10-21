// The car's look: a small hatchback built from extruded side profiles, with wheels that steer,
// spin and ride their struts as the sim says. Built in the sim's body frame turned into three.js
// axes: forward +X, up +Y, left −Z, origin at the centre of mass.

import * as THREE from 'three';
import type { CarSpec, CarState } from '../sim/car';

const PAINT = 0xc2532b; // Timanfaya rust

/**
 * A side profile (x forward, y up) extruded `width` across, centred. `taper` narrows it with
 * height (a share of the width per metre up from y = 0), the tumblehome that stops it reading as a box.
 */
function slab(profile: [number, number][], width: number, bevel: number, taper = 0): THREE.BufferGeometry {
  const shape = new THREE.Shape(profile.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 4,
  });
  g.translate(0, 0, -(width - 2 * bevel) / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) * (1 - taper * Math.max(pos.getY(i), 0)));
  g.computeVertexNormals();
  return g;
}

function wheel(radius: number): { group: THREE.Group; spinner: THREE.Group } {
  const group = new THREE.Group();
  const spinner = new THREE.Group();
  const tyre = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 0.21, 28, 1).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }),
  );
  const metal = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.35, metalness: 0.8 });
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.66, radius * 0.66, 0.215, 20).rotateX(Math.PI / 2), metal);
  spinner.add(tyre, rim);
  // Five dark gaps between spokes, so the eye can see the wheel turn.
  for (let i = 0; i < 5; i++) {
    const gap = new THREE.Mesh(new THREE.BoxGeometry(0.07, radius * 0.4, 0.22), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    gap.position.set(0, radius * 0.38, 0);
    const arm = new THREE.Group();
    arm.rotation.z = (i / 5) * Math.PI * 2;
    arm.add(gap);
    spinner.add(arm);
  }
  group.add(spinner);
  for (const m of [tyre, rim]) m.castShadow = true;
  return { group, spinner };
}

export interface CarModel {
  group: THREE.Group;
  /** `extent`: the site's size, whose centre is the scene origin. */
  update(s: CarState, braking: boolean, extent: number): void;
}

export function createCarModel(spec: CarSpec): CarModel {
  const group = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: PAINT, roughness: 0.38, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0d1418, roughness: 0.08, metalness: 0.2, clearcoat: 1 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });

  // Lower body to the waistline, then the glasshouse, then the roof skin over it.
  const lower = new THREE.Mesh(slab([
    [-1.98, -0.36], [1.9, -0.36], [2.04, -0.2], [2.02, 0.08], [1.0, 0.27], [-1.86, 0.3], [-2.02, 0.08], [-2.02, -0.22],
  ], 1.76, 0.08, 0.08), paint);
  const cabin = new THREE.Mesh(slab([[-1.84, 0.28], [0.98, 0.28], [0.12, 0.82], [-1.45, 0.84], [-1.88, 0.48]], 1.6, 0.05, 0.3), glass);
  const roof = new THREE.Mesh(slab([[-1.5, 0.81], [0.16, 0.81], [0.06, 0.88], [-1.43, 0.89]], 1.6, 0.03, 0.3), paint);
  const bumper = (x: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 1.7), trim);
    m.position.set(x, -0.26, 0);
    return m;
  };
  for (const m of [lower, cabin, roof]) m.castShadow = true;
  group.add(lower, cabin, roof, bumper(2.0), bumper(-2.0));

  const headMat = new THREE.MeshStandardMaterial({ color: 0xf6f3e8, emissive: 0xfff4d6, emissiveIntensity: 0.6 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x5a0a08, emissive: 0xff1a0a, emissiveIntensity: 0.3 });
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.32), headMat);
    head.position.set(2.0, 0.04, side * 0.6);
    head.rotation.z = -0.5;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.3), tailMat);
    tail.position.set(-2.03, 0.12, side * 0.62);
    group.add(head, tail);
  }

  const wheels = [0, 1, 2, 3].map(() => wheel(spec.wheelRadius));
  for (const w of wheels) group.add(w.group);

  const q = new THREE.Quaternion();
  return {
    group,
    update(s, braking, extent) {
      // Sim quaternion [w, x, y, z] in (east, north, up) → three.js (x, up, −north).
      q.set(s.q[1], s.q[3], -s.q[2], s.q[0]);
      group.quaternion.copy(q);
      group.position.set(s.pos[0] - extent / 2, s.pos[2], extent / 2 - s.pos[1]);
      s.wheels.forEach((w, i) => {
        const m = wheels[i];
        m.group.position.set(w.mount[0], w.mount[2] - w.strut, -w.mount[1]);
        m.group.rotation.y = w.front ? s.steer : 0;
        m.spinner.rotation.z = -w.spin;
      });
      tailMat.emissiveIntensity = braking ? 2.2 : 0.3;
    },
  };
}
