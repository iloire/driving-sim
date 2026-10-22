// The car's look: an armoured 4×4 pickup in matte black and gunmetal, on 1 m tall lugged tyres.
// It has a ram bar, slatted guards over the glass, flared arches, a roof light bar and a spare in
// the bed. The wheels steer, spin and ride their struts as the sim says. Its plane half folds away
// inside it: the wings rise from the waist as short stubs and swing out to full span, a fin and
// tailplane grow from the bed, and a jet nozzle slides out under the rear bumper, all driven by
// the sim's `wings` 0..1. Built in the sim's body frame turned into three.js axes: forward +X,
// up +Y, left −Z, origin at the centre of mass.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CarSpec, CarState } from '../sim/car';

/**
 * A side profile (x forward, y up) extruded `width` across, centred. `taper` narrows it with
 * height (a share of the width per metre up from y = 0), the tumblehome that stops it reading as a box.
 */
function slab(profile: [number, number][], width: number, bevel: number, taper = 0): THREE.BufferGeometry {
  const shape = new THREE.Shape(profile.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4,
  });
  g.translate(0, 0, -(width - 2 * bevel) / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) * (1 - taper * Math.max(pos.getY(i), 0)));
  g.computeVertexNormals();
  return g;
}

/** A non-indexed box in one call: size, then centre (ready to merge). */
function box(sx: number, sy: number, sz: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z).toNonIndexed();
}

/** A mud tyre with its axle along Z: a fat carcass and two staggered rows of angled lugs. */
function tyreGeometry(r: number, width: number): THREE.BufferGeometry {
  const parts = [new THREE.CylinderGeometry(r - 0.035, r - 0.035, width, 32).rotateX(Math.PI / 2).toNonIndexed()];
  const lugs = 20;
  for (let i = 0; i < lugs; i++) {
    for (const side of [-1, 1]) {
      const a = ((i + (side > 0 ? 0.5 : 0)) / lugs) * Math.PI * 2;
      const lug = new THREE.BoxGeometry(0.075, 0.1, width * 0.46).rotateY(side * 0.35);
      lug.translate(0, r - 0.04, side * width * 0.24).rotateZ(a);
      parts.push(lug.toNonIndexed());
    }
  }
  return mergeGeometries(parts);
}

/** A beadlock wheel, face towards +Z: open barrel, bolted outer ring, hub and six flat spokes. */
function rimGeometry(r: number, width: number): THREE.BufferGeometry {
  const parts = [
    new THREE.CylinderGeometry(r, r, width, 24, 1, true).rotateX(Math.PI / 2).toNonIndexed(),
    new THREE.TorusGeometry(r - 0.015, 0.03, 6, 28).translate(0, 0, width / 2).toNonIndexed(),
    new THREE.CylinderGeometry(0.09, 0.11, 0.08, 12).rotateX(Math.PI / 2).translate(0, 0, width / 2 - 0.04).toNonIndexed(),
  ];
  for (let i = 0; i < 6; i++) {
    parts.push(new THREE.BoxGeometry(0.07, r - 0.08, 0.04).translate(0, (r - 0.08) / 2 + 0.06, width / 2 - 0.05)
      .rotateZ((i / 6) * Math.PI * 2).toNonIndexed());
  }
  return mergeGeometries(parts);
}

/** One wheel; `side` −1 left (−Z), 1 right, so the rim's face looks outwards. */
function wheel(tyre: THREE.BufferGeometry, rim: THREE.BufferGeometry, rubber: THREE.Material, metal: THREE.Material, side: number): { group: THREE.Group; spinner: THREE.Group } {
  const group = new THREE.Group();
  const spinner = new THREE.Group();
  const t = new THREE.Mesh(tyre, rubber);
  const m = new THREE.Mesh(rim, metal);
  if (side < 0) m.rotation.y = Math.PI;
  t.castShadow = m.castShadow = true;
  spinner.add(t, m);
  group.add(spinner);
  return { group, spinner };
}

export interface CarModel {
  group: THREE.Group;
  /** `extent`: the site's size, whose centre is the scene origin; `thrust` 0..1 lights the jet; `boost` the turbo. */
  update(s: CarState, braking: boolean, extent: number, thrust: number, boost: boolean): void;
}

/** One wing, root at the origin, swept, span along +Y before it is laid out. */
function wingGeometry(span: number): THREE.BufferGeometry {
  const shape = new THREE.Shape([
    new THREE.Vector2(0.7, 0), new THREE.Vector2(-1.3, 0), new THREE.Vector2(-1.1, span), new THREE.Vector2(-0.2, span),
  ]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
  g.translate(0, 0, -0.04);
  return g;
}

const ease = (t: number) => t * t * (3 - 2 * t);
/** How far the body shell sits above where the physics puts it (m): a lift kit, for the look. */
const LIFT = 0.22;

export function createCarModel(spec: CarSpec): CarModel {
  const group = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: 0x141517, roughness: 0.62, metalness: 0.25, clearcoat: 0.15, clearcoatRoughness: 0.6 });
  const armour = new THREE.MeshStandardMaterial({ color: 0x3b3e42, roughness: 0.45, metalness: 0.75 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.85 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0a0f12, roughness: 0.1, metalness: 0.3, clearcoat: 1 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.95 });
  const red = new THREE.MeshStandardMaterial({ color: 0xb3120f, roughness: 0.5 });

  // Body: a squared-off cab-and-bed with a high, flat bonnet that drops to a short nose.
  const body = new THREE.Mesh(slab([
    [-2.32, -0.2], [2.3, -0.2], [2.46, 0.0], [2.44, 0.42], [1.15, 0.58], [-2.32, 0.6],
  ], 1.94, 0.06, 0.03), paint);
  const cab = new THREE.Mesh(slab([[-1.0, 0.56], [1.05, 0.56], [0.4, 1.2], [-0.95, 1.22]], 1.78, 0.04, 0.22), glass);
  const roof = new THREE.Mesh(slab([[-0.98, 1.19], [0.43, 1.19], [0.38, 1.27], [-0.95, 1.28]], 1.6, 0.03), paint);
  // Slatted armour over the windscreen and the side glass.
  const slats: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const h = 0.64 + i * 0.1;
    const x = 1.05 - (h - 0.56) * 1.02; // follows the windscreen's rake
    slats.push(box(0.06, 0.035, 1.5, x + 0.04, h, 0));
    for (const side of [-1, 1]) slats.push(box(1.2, 0.03, 0.04, -0.3, h, side * (0.9 - (h - 0.56) * 0.2)));
  }
  const guards = new THREE.Mesh(mergeGeometries(slats), armour);

  // Ram bar, skid plate, steps and rear bumper in gunmetal; red tow hooks the one hit of colour.
  const ram = new THREE.Mesh(mergeGeometries([
    box(0.14, 0.62, 2.0, 2.58, 0.02, 0),
    box(0.3, 0.08, 1.7, 2.5, 0.36, 0),
    ...[-0.62, -0.2, 0.2, 0.62].map((z) => box(0.1, 0.62, 0.07, 2.66, 0.02, z)),
    box(1.6, 0.06, 1.5, 1.6, -0.24, 0),
    box(2.2, 0.06, 0.24, 0, -0.22, 1.08), box(2.2, 0.06, 0.24, 0, -0.22, -1.08),
    box(0.12, 0.32, 1.96, -2.36, -0.08, 0),
  ]), armour);
  const hooks = new THREE.Mesh(mergeGeometries([box(0.16, 0.08, 0.1, 2.68, -0.18, 0.5), box(0.16, 0.08, 0.1, 2.68, -0.18, -0.5)]), red);

  // Flared arches over each wheel at its resting height, bed rails and a spare in the bed.
  const hubY = spec.wheelRadius - spec.cgHeight;
  const ax = spec.wheelbase * (1 - spec.frontWeight), bx = spec.wheelbase * spec.frontWeight;
  const arches = [ax, -bx].flatMap((x) => [-1, 1].map((side) =>
    new THREE.TorusGeometry(spec.wheelRadius + 0.1, 0.07, 6, 18, Math.PI).translate(x, hubY + 0.02, side * (spec.track / 2 + 0.05)).toNonIndexed()));
  const trim = new THREE.Mesh(mergeGeometries([
    ...arches,
    box(1.3, 0.14, 0.08, -1.65, 0.68, 0.92), box(1.3, 0.14, 0.08, -1.65, 0.68, -0.92), box(0.1, 0.14, 1.9, -2.3, 0.68, 0),
  ]), black);

  const tyre = tyreGeometry(spec.wheelRadius, 0.4);
  const rim = rimGeometry(spec.wheelRadius * 0.62, 0.4);
  const spare = new THREE.Group();
  spare.add(new THREE.Mesh(tyre, rubber), new THREE.Mesh(rim, armour));
  spare.rotation.x = Math.PI / 2;
  spare.position.set(-1.6, 0.62, 0);

  // Lights: a roof bar and square headlamps that glow, tail lamps that flare on the brakes.
  const glow = new THREE.MeshStandardMaterial({ color: 0xf6f3e8, emissive: 0xfff4d6, emissiveIntensity: 1.2 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x5a0a08, emissive: 0xff1a0a, emissiveIntensity: 0.3 });
  const lamps = new THREE.Mesh(mergeGeometries([
    box(0.12, 0.1, 1.3, 0.3, 1.36, 0), box(0.04, 0.12, 0.3, 2.45, 0.3, 0.68), box(0.04, 0.12, 0.3, 2.45, 0.3, -0.68),
  ]), glow);
  const lampHousing = new THREE.Mesh(box(0.2, 0.06, 1.5, 0.3, 1.29, 0), black);
  const tails = new THREE.Mesh(mergeGeometries([box(0.04, 0.3, 0.14, -2.34, 0.38, 0.86), box(0.04, 0.3, 0.14, -2.34, 0.38, -0.86)]), tailMat);

  for (const m of [body, cab, roof, guards, ram, trim, lampHousing]) m.castShadow = true;
  // The shell rides on a lift kit, clear of the tyres, so the wheels and axles show beneath it.
  const shell = new THREE.Group();
  shell.position.y = LIFT;
  shell.add(body, cab, roof, guards, ram, hooks, trim, spare, lamps, lampHousing, tails);
  group.add(shell);

  // Ladder frame under the shell, and a solid axle at each end that follows its two wheels.
  const frame = new THREE.Mesh(mergeGeometries([
    box(4.4, 0.16, 0.12, 0, LIFT - 0.27, 0.5), box(4.4, 0.16, 0.12, 0, LIFT - 0.27, -0.5),
    ...[-1.6, 0, 1.6].map((x) => box(0.12, 0.12, 1.0, x, LIFT - 0.27, 0)),
  ]), black);
  frame.castShadow = true;
  group.add(frame);
  const axleGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.07, 0.07, spec.track, 10).rotateX(Math.PI / 2).toNonIndexed(),
    new THREE.SphereGeometry(0.19, 12, 8).scale(1.2, 1, 1).toNonIndexed(),
  ]);
  const axles = [0, 1].map(() => {
    const m = new THREE.Mesh(axleGeo, armour);
    m.castShadow = true;
    group.add(m);
    return m;
  });

  // The sim's wheels are front-left, front-right, rear-left, rear-right (body +Y is left = −Z here).
  const wheels = [0, 1, 2, 3].map((i) => wheel(tyre, rim, rubber, armour, i % 2 === 0 ? -1 : 1));
  for (const w of wheels) group.add(w.group);

  // The plane half: hinged at the waist, in the bed and under the rear bumper.
  const half = (spec.wings.span - 2) / 2;
  const hinges = [1, -1].map((side) => {
    const hinge = new THREE.Group();
    hinge.position.set(-0.2, 0.55 + LIFT, side * 0.98);
    // The span (+Y in the shape) onto ±Z: right wing towards +Z, left towards −Z.
    const wing = new THREE.Mesh(wingGeometry(half).rotateX(side * Math.PI / 2), paint);
    wing.castShadow = true;
    hinge.add(wing);
    group.add(hinge);
    return { hinge, wing, side };
  });
  const fin = new THREE.Mesh(slab([[0, 0], [-0.9, 0], [-1.1, 1.05], [-0.65, 1.05]], 0.08, 0.02), paint);
  fin.position.set(-1.2, 0.7 + LIFT, 0);
  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 3.0), paint);
  tailplane.position.set(-2.05, 0.75 + LIFT, 0);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.55, 18, 1, true).rotateZ(Math.PI / 2), armour);
  nozzle.position.set(-2.5, 0.05 + LIFT, 0);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  // A cone with its base at the nozzle, pointing back (−X).
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1, 14).rotateZ(Math.PI / 2).translate(-0.5, 0, 0), flameMat);
  flame.position.set(-2.78, 0.05 + LIFT, 0);
  for (const m of [fin, tailplane]) m.castShadow = true;
  group.add(fin, tailplane, nozzle, flame);
  // Nitro: twin blue-white jets from under the rear bumper.
  const nitroMat = new THREE.MeshBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const nitro = [0.55, -0.55].map((z) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.11, 1, 10).rotateZ(Math.PI / 2).translate(-0.5, 0, 0), nitroMat);
    m.position.set(-2.42, LIFT - 0.12, z);
    group.add(m);
    return m;
  });
  const ORANGE = new THREE.Color(0xffa040), BLUE = new THREE.Color(0x9fd4ff);

  const q = new THREE.Quaternion();
  return {
    group,
    update(s, braking, extent, thrust, boost) {
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
      // Each axle spans its pair of hubs, tilting as one side rises.
      for (const [k, [l, r]] of [[0, [0, 1]], [1, [2, 3]]] as const) {
        const L = wheels[l].group.position, R = wheels[r].group.position;
        axles[k].position.set(L.x, (L.y + R.y) / 2, 0);
        axles[k].rotation.x = Math.atan2(L.y - R.y, R.z - L.z);
      }
      tailMat.emissiveIntensity = braking ? 2.2 : 0.3;

      // Stubs rise first, then swing down and stretch out to full span.
      const t = ease(s.wings), out = s.wings > 0.002;
      for (const { hinge, wing, side } of hinges) {
        hinge.visible = out;
        hinge.rotation.x = -side * (Math.PI / 2) * (1 - t);
        wing.scale.set(1, 1, 0.12 + 0.88 * t);
      }
      fin.visible = tailplane.visible = nozzle.visible = out;
      fin.scale.set(1, Math.max(t, 0.01), 1);
      tailplane.scale.set(1, 1, Math.max(t, 0.01));
      nozzle.scale.setScalar(Math.max(t, 0.01));
      // The afterburner doubles the flame and turns it blue-white.
      const after = boost && s.flying ? 1 : 0;
      const burn = s.flying ? thrust * t * (1 + after) : 0;
      flame.visible = burn > 0.02;
      flame.scale.set(0.6 + burn * (1.6 + Math.random() * 0.4), 0.6 + burn * 0.5, 0.6 + burn * 0.5);
      flameMat.color.copy(ORANGE).lerp(BLUE, after * 0.7);
      for (const n of nitro) {
        n.visible = boost && s.wings < 0.5;
        n.scale.set(1.2 + Math.random() * 0.8, 1, 1);
      }
    },
  };
}
