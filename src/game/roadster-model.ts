// The Roadster's look: an original white wedge hypercar, low and sharp. It has a tinted glass
// canopy, a black lower body, a light bar across the nose and a red one across the tail, a black
// diffuser with four round nozzles, and star-spoked wheels. Its flying half is four gas
// thrusters in the floor: they drop out of the underbody and blast straight down, sized by the
// sim's lift, with smoke billowing away under the car; the tail nozzles fire on the boost.
// Built in the sim's body frame turned into three.js axes: forward +X, up +Y, left −Z, origin at
// the centre of mass.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CarSpec, CarState } from '../sim/car';
import type { CarModel } from './car-model';
import { box, slab } from './shapes';
import { Smoke } from './smoke';

/** A low-profile tyre with its axle along Z. */
function tyreGeometry(r: number, width: number): THREE.BufferGeometry {
  return mergeGeometries([
    new THREE.CylinderGeometry(r, r, width, 40).rotateX(Math.PI / 2).toNonIndexed(),
    new THREE.TorusGeometry(r - 0.03, 0.03, 6, 40).translate(0, 0, width / 2 - 0.02).toNonIndexed(),
  ]);
}

/** A dark aero wheel, face towards +Z: a five-point star of blades on a dished disc. */
function rimGeometry(r: number, width: number): THREE.BufferGeometry {
  const parts = [
    new THREE.CylinderGeometry(r, r, 0.04, 32).rotateX(Math.PI / 2).translate(0, 0, width / 2 - 0.04).toNonIndexed(),
    new THREE.CylinderGeometry(0.06, 0.06, 0.06, 12).rotateX(Math.PI / 2).translate(0, 0, width / 2 - 0.01).toNonIndexed(),
  ];
  for (let i = 0; i < 5; i++) {
    // Each point of the star is two thin blades meeting at the rim.
    for (const lean of [-0.22, 0.22]) {
      parts.push(new THREE.BoxGeometry(0.035, r * 0.92, 0.03).translate(0, r * 0.46, 0).rotateZ(lean)
        .translate(0, 0, width / 2).rotateZ((i / 5) * Math.PI * 2).toNonIndexed());
    }
  }
  return mergeGeometries(parts);
}

export function createRoadsterModel(spec: CarSpec): CarModel {
  const group = new THREE.Group();
  const white = new THREE.MeshPhysicalMaterial({ color: 0xeef0f2, roughness: 0.3, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08 });
  const black = new THREE.MeshPhysicalMaterial({ color: 0x0c0d0f, roughness: 0.45, metalness: 0.3, clearcoat: 0.6 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x2a1d16, roughness: 0.06, metalness: 0.5, clearcoat: 1 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.5, metalness: 0.6 });
  const silver = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.3, metalness: 0.9 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });

  // Body: a short, knife-edged nose, the windscreen's base well forward, a long glass dome running
  // back to a cut-off tail. The body sits between the wheels, which stand proud of it.
  const body = new THREE.Mesh(slab([
    [-2.2, -0.12], [2.15, -0.12], [2.3, -0.02], [2.3, 0.05], [1.35, 0.24], [-1.95, 0.42], [-2.24, 0.4], [-2.28, 0.08],
  ], 1.74, 0.06, 0.1), white);
  const canopy = new THREE.Mesh(slab([[1.38, 0.22], [0.05, 0.74], [-1.05, 0.66], [-1.98, 0.42], [-0.6, 0.3]], 1.56, 0.05, 0.42), glass);
  // The black lower body: a sill line between the wheels, front and rear valances.
  const sills = new THREE.Mesh(slab([[-1.2, -0.26], [1.15, -0.26], [1.2, -0.1], [-1.25, -0.06]], 1.78, 0.02), black);
  // Ducktail lip and the diffuser with its four round nozzles.
  const tail = new THREE.Mesh(mergeGeometries([
    slab([[-1.85, 0.43], [-2.33, 0.47], [-2.33, 0.51], [-1.85, 0.46]], 1.9, 0.01),
    box(0.22, 0.3, 1.72, -2.2, -0.1, 0),
    ...[-0.24, 0.24].map((z) => box(0.4, 0.22, 0.03, -2.0, -0.2, z)),
  ].map((g) => (g.index ? g.toNonIndexed() : g))), black);
  const NOZZLES_Z = [-0.6, -0.2, 0.2, 0.6];
  const rearNozzles = new THREE.Mesh(mergeGeometries(NOZZLES_Z.map((z) =>
    new THREE.CylinderGeometry(0.075, 0.085, 0.12, 16, 1, true).rotateZ(Math.PI / 2).translate(-2.33, -0.06, z).toNonIndexed())), metal);

  const glow = new THREE.MeshStandardMaterial({ color: 0xf6f6f2, emissive: 0xffffff, emissiveIntensity: 1.6 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x5a0a08, emissive: 0xff1a12, emissiveIntensity: 0.9 });
  const lightBar = new THREE.Mesh(box(0.03, 0.022, 1.75, 2.3, -0.01, 0), glow);
  const tailBar = new THREE.Mesh(box(0.03, 0.045, 1.86, -2.26, 0.36, 0), tailMat);
  for (const m of [body, canopy, sills, tail]) m.castShadow = true;
  group.add(body, canopy, sills, tail, rearNozzles, lightBar, tailBar);

  // Wheels: the sim's order is front-left, front-right, rear-left, rear-right (body +Y = −Z here).
  const tyre = tyreGeometry(spec.wheelRadius, 0.3);
  const rim = rimGeometry(spec.wheelRadius * 0.74, 0.3);
  const lip = new THREE.TorusGeometry(spec.wheelRadius * 0.74, 0.012, 6, 40).translate(0, 0, 0.15);
  const wheels = [0, 1, 2, 3].map((i) => {
    const g = new THREE.Group(), spinner = new THREE.Group();
    const t = new THREE.Mesh(tyre, rubber), m = new THREE.Mesh(rim, metal), l = new THREE.Mesh(lip, silver);
    if (i % 2 === 0) m.rotation.y = l.rotation.y = Math.PI; // the face looks out on the left
    t.castShadow = m.castShadow = true;
    spinner.add(t, m, l);
    g.add(spinner);
    group.add(g);
    return { group: g, spinner };
  });

  // Floor thrusters, just inside each wheel, and their downward flames.
  const a = spec.wheelbase * (1 - spec.frontWeight), b = spec.wheelbase * spec.frontWeight;
  const floor = [[a - 0.55, 0.55], [a - 0.55, -0.55], [-b + 0.55, 0.55], [-b + 0.55, -0.55]];
  const nozzleGeo = new THREE.CylinderGeometry(0.11, 0.14, 0.16, 16, 1, true);
  const flameGeo = new THREE.ConeGeometry(0.13, 1, 14).rotateX(Math.PI).translate(0, -0.5, 0); // tip down
  const flameMat = new THREE.MeshBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const thrusters = floor.map(([x, z]) => {
    const nozzle = new THREE.Mesh(nozzleGeo, metal);
    const flame = new THREE.Mesh(flameGeo, flameMat);
    nozzle.position.set(x, -0.26, z);
    flame.position.set(x, -0.34, z);
    group.add(nozzle, flame);
    return { nozzle, flame, local: new THREE.Vector3(x, -0.4, z) };
  });
  const rearFlames = NOZZLES_Z.map((z) => {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.07, 1, 12).rotateZ(Math.PI / 2).translate(-0.5, 0, 0), flameMat);
    f.position.set(-2.4, -0.06, z);
    group.add(f);
    return { flame: f, local: new THREE.Vector3(-2.45, -0.06, z) };
  });

  const smoke = new Smoke();
  const q = new THREE.Quaternion();
  const at = new THREE.Vector3(), v = new THREE.Vector3(), carVel = new THREE.Vector3(), down = new THREE.Vector3(), back = new THREE.Vector3();
  return {
    group,
    world: smoke.mesh,
    update(s: CarState, braking: boolean, extent: number, _thrust: number, boost: boolean, camera?: THREE.Camera, dt = 1 / 60) {
      q.set(s.q[1], s.q[3], -s.q[2], s.q[0]);
      group.quaternion.copy(q);
      group.position.set(s.pos[0] - extent / 2, s.pos[2], extent / 2 - s.pos[1]);
      group.updateMatrixWorld();
      s.wheels.forEach((w, i) => {
        wheels[i].group.position.set(w.mount[0], w.mount[2] - w.strut, -w.mount[1]);
        wheels[i].group.rotation.y = w.front ? s.steer : 0;
        wheels[i].spinner.rotation.z = -w.spin;
      });
      tailMat.emissiveIntensity = braking ? 3 : 0.9;

      // Nozzles drop out of the floor as the thrusters spool; flames and smoke scale with the lift.
      const out = s.wings, lift = s.flying ? s.lift : 0;
      carVel.set(s.vel[0], s.vel[2], -s.vel[1]);
      down.set(0, -1, 0).applyQuaternion(q);
      back.set(-1, 0, 0).applyQuaternion(q);
      for (const t of thrusters) {
        t.nozzle.visible = out > 0.01;
        t.nozzle.position.y = -0.2 - 0.08 * out;
        t.flame.visible = lift > 0.02;
        t.flame.scale.set(1 + lift, 0.4 + lift * (2.2 + Math.random() * 0.6), 1 + lift);
        if (lift > 0.02) {
          for (let k = 0; k < Math.ceil(lift * 3); k++) {
            at.copy(t.local).applyMatrix4(group.matrixWorld);
            v.copy(down).multiplyScalar(18 + 20 * lift).add(carVel.clone().multiplyScalar(0.4))
              .add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(5));
            smoke.emit(at, v, 0.6, 3.5, 1.1 + Math.random() * 0.7);
          }
        }
      }
      for (const r of rearFlames) {
        r.flame.visible = boost;
        r.flame.scale.set(1.4 + Math.random() * 0.8, 1, 1);
        if (boost) {
          at.copy(r.local).applyMatrix4(group.matrixWorld);
          v.copy(back).multiplyScalar(30).add(carVel.clone().multiplyScalar(0.5))
            .add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(3));
          smoke.emit(at, v, 0.4, 2.5, 0.9 + Math.random() * 0.5);
        }
      }
      if (camera) smoke.update(dt, camera);
    },
  };
}
