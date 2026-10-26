// The car's look: a desert buggy in matte black and gunmetal, on 1.16 m paddle tyres with steel spikes. An open
// roll cage over two bucket seats, a short nose with the Piratas Aéreos badge on it, a V8 out in the open at the
// back, and long-travel arms and coilovers you can watch work. The wheels steer, spin and ride their struts as the sim says. Its plane half folds away
// inside it: swept fighter wings rise from the waist as short stubs and swing out to full span, twin
// canted fins and a swept tailplane grow over the engine, and a jet nozzle slides out under the rear bumper, all driven by
// the sim's `wings` 0..1. Built in the sim's body frame turned into three.js axes: forward +X,
// up +Y, left −Z, origin at the centre of mass.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CarSpec, CarState } from '../sim/car';
import { logoTexture } from './logo';
import { box, slab } from './shapes';

/** A paddle tyre with its axle along Z: a fat carcass and two staggered rows of tall, angled lugs. */
function tyreGeometry(r: number, width: number): THREE.BufferGeometry {
  const parts = [new THREE.CylinderGeometry(r - 0.05, r - 0.05, width, 32).rotateX(Math.PI / 2).toNonIndexed()];
  const lugs = 18;
  for (let i = 0; i < lugs; i++) {
    for (const side of [-1, 1]) {
      const a = ((i + (side > 0 ? 0.5 : 0)) / lugs) * Math.PI * 2;
      const lug = new THREE.BoxGeometry(0.1, 0.13, width * 0.5).rotateY(side * 0.4);
      lug.translate(0, r - 0.065, side * width * 0.26).rotateZ(a);
      parts.push(lug.toNonIndexed());
    }
  }
  return mergeGeometries(parts);
}

/** A beadlock wheel, face towards +Z: open barrel, bolted outer ring, hub and six flat spokes. */
function rimGeometry(r: number, width: number): THREE.BufferGeometry {
  const parts = [
    new THREE.CylinderGeometry(r, r, width, 24, 1, true).rotateX(Math.PI / 2).toNonIndexed(),
    new THREE.TorusGeometry(r - 0.015, 0.035, 6, 28).translate(0, 0, width / 2).toNonIndexed(),
    new THREE.CylinderGeometry(0.11, 0.14, 0.1, 12).rotateX(Math.PI / 2).translate(0, 0, width / 2 - 0.04).toNonIndexed(),
  ];
  for (let i = 0; i < 6; i++) {
    parts.push(new THREE.BoxGeometry(0.08, r - 0.1, 0.05).translate(0, (r - 0.1) / 2 + 0.07, width / 2 - 0.05)
      .rotateZ((i / 6) * Math.PI * 2).toNonIndexed());
  }
  return mergeGeometries(parts);
}

/**
 * The wheel's steel, face towards +Z: a long spike from the hub, a crown of short ones round the
 * beadlock ring, and studs out of every second lug's shoulder.
 */
function spikeGeometry(r: number, rimR: number, width: number): THREE.BufferGeometry {
  const cone = (radius: number, h: number) => new THREE.ConeGeometry(radius, h, 8).translate(0, h / 2, 0);
  const parts = [cone(0.08, 0.34).rotateX(Math.PI / 2).translate(0, 0, width / 2 + 0.01).toNonIndexed()];
  for (let i = 0; i < 10; i++) {
    parts.push(cone(0.03, 0.11).rotateX(Math.PI / 2).translate(0, rimR - 0.015, width / 2).rotateZ((i / 10) * Math.PI * 2).toNonIndexed());
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    parts.push(cone(0.03, 0.09).rotateX(Math.PI * 0.3).translate(0, r - 0.06, width / 2 - 0.02).rotateZ(a).toNonIndexed());
  }
  return mergeGeometries(parts);
}

/** A round tube between two points (ready to merge). */
function tube(a: THREE.Vector3, b: THREE.Vector3, r = 0.045): THREE.BufferGeometry {
  const d = new THREE.Vector3().subVectors(b, a);
  return new THREE.CylinderGeometry(r, r, d.length(), 8)
    .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()))
    .translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2).toNonIndexed();
}

/** One wheel; `side` −1 left (−Z), 1 right, so the rim's face looks outwards. */
function wheel(tyre: THREE.BufferGeometry, rim: THREE.BufferGeometry, spikes: THREE.BufferGeometry, rubber: THREE.Material, metal: THREE.Material, steel: THREE.Material, side: number): { group: THREE.Group; spinner: THREE.Group } {
  const group = new THREE.Group();
  const spinner = new THREE.Group();
  const t = new THREE.Mesh(tyre, rubber);
  const m = new THREE.Mesh(rim, metal);
  const k = new THREE.Mesh(spikes, steel);
  if (side < 0) m.rotation.y = k.rotation.y = Math.PI;
  t.castShadow = m.castShadow = k.castShadow = true;
  spinner.add(t, m, k);
  group.add(spinner);
  return { group, spinner };
}

export interface CarModel {
  group: THREE.Group;
  /** Effects that live in the scene rather than on the car (thruster smoke), if any. */
  world?: THREE.Object3D;
  /**
   * `extent`: the site's size, whose centre is the scene origin; `thrust` 0..1 lights the jet;
   * `boost` the turbo; `camera` and `dt` for effects that face the view and move with time.
   */
  update(s: CarState, braking: boolean, extent: number, thrust: number, boost: boolean, camera?: THREE.Camera, dt?: number): void;
}

/** A flat planform (x forward, y out along the span) extruded `depth` thick, centred on z = 0. */
function plate(points: [number, number][], depth: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
  return g.translate(0, 0, -depth / 2);
}

/**
 * One wing, root at the origin, span along +Y before it is laid out: a fighter's planform, a
 * root extension running forward along the tub, a hard-swept leading edge and a clipped tip.
 */
function wingGeometry(span: number): THREE.BufferGeometry {
  return plate([[1.7, 0], [0.5, 0.6], [-1.55, span], [-2.15, span], [-1.75, span * 0.6], [-1.4, 0]], 0.08);
}

/** The red stripe along the wing's swept leading edge, standing just proud of it. */
function wingStripe(span: number): THREE.BufferGeometry {
  const [x0, y0, x1, y1] = [0.5, 0.6, -1.55, span];
  return plate([[x0, y0], [x1, y1], [x1 - 0.22, y1], [x0 - 0.3, y0]], 0.1);
}

const ease = (t: number) => t * t * (3 - 2 * t);
/** How far the body shell sits above where the physics puts it (m): none, the buggy sits low between its wheels. */
const LIFT = 0;

export function createCarModel(spec: CarSpec): CarModel {
  const group = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: 0x141517, roughness: 0.62, metalness: 0.25, clearcoat: 0.15, clearcoatRoughness: 0.6 });
  const armour = new THREE.MeshStandardMaterial({ color: 0x3b3e42, roughness: 0.45, metalness: 0.75 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.85 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.95 });
  const red = new THREE.MeshStandardMaterial({ color: 0xb3120f, roughness: 0.5 });

  const cage = new THREE.MeshStandardMaterial({ color: 0x55595e, roughness: 0.35, metalness: 0.8 });
  const logo = new THREE.MeshStandardMaterial({
    map: logoTexture(), alphaTest: 0.4, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2,
  });

  // Tub: a low floor pan with thin side panels, open on top so the seats show, and a short
  // sloping nose ahead of it. Wheels stand outboard, uncovered.
  const panel = (z: number) => slab([[-0.95, 0.05], [0.7, 0.05], [0.7, 0.35], [0.45, 0.55], [-0.95, 0.6]], 0.06, 0.01)
    .translate(0, 0, z).toNonIndexed();
  const body = new THREE.Mesh(mergeGeometries([
    slab([[-0.95, -0.25], [0.7, -0.25], [0.7, 0.1], [-0.95, 0.1]], 1.7, 0.03).toNonIndexed(),
    panel(0.93), panel(-0.93),
    slab([[0.65, -0.2], [2.1, -0.15], [2.35, 0.05], [2.3, 0.22], [0.65, 0.45]], 1.4, 0.06, 0.05).toNonIndexed(),
    slab([[-2.15, -0.2], [-0.95, -0.2], [-0.95, 0.1], [-2.15, 0.05]], 1.3, 0.03).toNonIndexed(),
  ]), paint);

  // The Piratas Aéreos badge on the bonnet, top towards the nose, and on each side panel.
  const slope = Math.atan(0.23 / 1.65);
  const decals = new THREE.Mesh(mergeGeometries([
    new THREE.PlaneGeometry(0.95, 0.95).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2).rotateZ(-slope)
      .translate(1.45, 0.45 - 0.8 * Math.tan(slope) + 0.065, 0),
    new THREE.PlaneGeometry(0.5, 0.5).translate(-0.3, 0.31, 0.966),
    new THREE.PlaneGeometry(0.5, 0.5).rotateY(Math.PI).translate(-0.3, 0.31, -0.966),
  ]), logo);

  // Two bucket seats and a wheel for the driver on the left.
  const seat = (z: number) => [
    box(0.5, 0.12, 0.46, -0.45, 0.18, z),
    new THREE.BoxGeometry(0.1, 0.72, 0.46).rotateZ(0.2).translate(-0.74, 0.55, z).toNonIndexed(),
    box(0.5, 0.18, 0.06, -0.45, 0.3, z - 0.23), box(0.5, 0.18, 0.06, -0.45, 0.3, z + 0.23),
  ];
  const seats = new THREE.Mesh(mergeGeometries([
    ...seat(0.42), ...seat(-0.42),
    new THREE.TorusGeometry(0.17, 0.025, 6, 20).rotateY(Math.PI / 2).rotateZ(-0.4).translate(0.2, 0.68, -0.42).toNonIndexed(),
    tube(new THREE.Vector3(0.2, 0.68, -0.42), new THREE.Vector3(0.6, 0.42, -0.42), 0.025),
  ]), paint);

  // Roll cage: main hoop behind the seats, raked A-pillars, roof rails, stays down to the nose
  // and back over the engine, tube bumpers at both ends.
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const bars: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    bars.push(
      tube(v(-0.85, 0.1, s * 0.92), v(-0.85, 1.25, s * 0.75)),
      tube(v(0.65, 0.4, s * 0.92), v(0.1, 1.25, s * 0.75)),
      tube(v(0.1, 1.25, s * 0.75), v(-0.85, 1.25, s * 0.75)),
      tube(v(0.65, 0.4, s * 0.92), v(2.2, 0.25, s * 0.55)),
      tube(v(2.4, -0.05, s * 0.85), v(2.1, -0.15, s * 0.62)),
      tube(v(2.4, -0.05, s * 0.58), v(2.2, 0.25, s * 0.55)),
      tube(v(-0.85, 1.25, s * 0.75), v(-2.1, 0.35, s * 0.68)),
      tube(v(-2.1, 0.35, s * 0.68), v(-2.2, -0.1, s * 0.68)),
    );
  }
  bars.push(
    tube(v(-0.85, 1.25, -0.75), v(-0.85, 1.25, 0.75)), tube(v(0.1, 1.25, -0.75), v(0.1, 1.25, 0.75)),
    tube(v(-0.85, 0.1, -0.92), v(-0.85, 1.25, 0.75)),
    tube(v(2.4, -0.05, -0.85), v(2.4, -0.05, 0.85), 0.055), tube(v(-2.1, 0.35, -0.68), v(-2.1, 0.35, 0.68)),
    tube(v(-2.2, -0.1, -0.85), v(-2.2, -0.1, 0.85), 0.055),
  );
  const cageMesh = new THREE.Mesh(mergeGeometries(bars), cage);

  // A V8 out in the open behind the cockpit: block, rocker covers, red air filter, two stacks.
  const engine = new THREE.Mesh(box(0.8, 0.36, 0.5, -1.55, 0.25, 0), paint);
  const rockers = new THREE.Mesh(mergeGeometries([
    box(0.76, 0.1, 0.14, -1.55, 0.46, 0.2), box(0.76, 0.1, 0.14, -1.55, 0.46, -0.2),
    ...[-1, 1].map((s) => tube(v(-1.75, 0.3, s * 0.32), v(-2.0, 0.75, s * 0.36), 0.05)),
  ]), armour);
  const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 18).translate(-1.4, 0.56, 0), red);

  // Tube hoops over the wheels at their resting height.
  const hubY = spec.wheelRadius - spec.cgHeight;
  const ax = spec.wheelbase * (1 - spec.frontWeight), bx = spec.wheelbase * spec.frontWeight;
  const arches = [ax, -bx].flatMap((x) => [-1, 1].map((side) =>
    new THREE.TorusGeometry(spec.wheelRadius + 0.14, 0.035, 6, 18, Math.PI * 0.8).rotateZ(Math.PI * 0.1)
      .translate(x, hubY - LIFT + 0.04, side * (spec.track / 2)).toNonIndexed()));
  const trim = new THREE.Mesh(mergeGeometries(arches), cage);

  const tyre = tyreGeometry(spec.wheelRadius, 0.5);
  const rim = rimGeometry(spec.wheelRadius * 0.62, 0.5);
  const spikes = spikeGeometry(spec.wheelRadius, spec.wheelRadius * 0.62, 0.5);
  const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.22, metalness: 1 });

  // Lights: a bar on the cage and round lamps on the nose that glow, tail lamps that flare on the brakes.
  const glow = new THREE.MeshStandardMaterial({ color: 0xf6f3e8, emissive: 0xfff4d6, emissiveIntensity: 1.2 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x5a0a08, emissive: 0xff1a0a, emissiveIntensity: 0.3 });
  const lamps = new THREE.Mesh(mergeGeometries([
    box(0.12, 0.1, 1.3, 0.17, 1.37, 0),
    ...[-1, 1].map((s) => new THREE.CylinderGeometry(0.09, 0.09, 0.04, 16).rotateZ(Math.PI / 2).translate(2.38, 0.12, s * 0.36).toNonIndexed()),
  ]), glow);
  const lampHousing = new THREE.Mesh(box(0.2, 0.06, 1.5, 0.15, 1.3, 0), black);
  const tails = new THREE.Mesh(mergeGeometries([box(0.04, 0.14, 0.14, -2.2, 0.1, 0.68), box(0.04, 0.14, 0.14, -2.2, 0.1, -0.68)]), tailMat);

  for (const m of [body, seats, cageMesh, engine, rockers, filter, trim, lampHousing]) m.castShadow = true;
  // The shell rides high on long-travel arms, so the wheels and suspension show beneath it.
  const shell = new THREE.Group();
  shell.position.y = LIFT;
  shell.add(body, decals, seats, cageMesh, engine, rockers, filter, trim, lamps, lampHousing, tails);
  group.add(shell);

  // Long-travel suspension: an upper and lower arm from the chassis to each hub, and a red
  // coilover, all re-aimed every frame as the wheels ride their struts.
  const linkGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
  const link = (mat: THREE.Material, r: number) => {
    const m = new THREE.Mesh(linkGeo, mat);
    m.userData.r = r;
    m.castShadow = true;
    group.add(m);
    return m;
  };
  const arms = [0, 1, 2, 3].map(() => ({ upper: link(armour, 0.035), lower: link(armour, 0.045), shock: link(red, 0.06) }));
  // The sim's wheels are front-left, front-right, rear-left, rear-right (body +Y is left = −Z here).
  const wheels = [0, 1, 2, 3].map((i) => wheel(tyre, rim, spikes, rubber, armour, steel, i % 2 === 0 ? -1 : 1));
  for (const w of wheels) group.add(w.group);

  // The plane half: hinged at the waist, in the bed and under the rear bumper.
  const half = ((spec.wings?.span ?? 9.4) - 2) / 2;
  const hinges = [1, -1].map((side) => {
    const hinge = new THREE.Group();
    hinge.position.set(-0.2, 0.55 + LIFT, side * 0.96);
    // The span (+Y in the shape) onto ±Z: right wing towards +Z, left towards −Z.
    const wing = new THREE.Mesh(wingGeometry(half).rotateX(side * Math.PI / 2), paint);
    wing.add(new THREE.Mesh(wingStripe(half).rotateX(side * Math.PI / 2), red));
    wing.castShadow = true;
    hinge.add(wing);
    group.add(hinge);
    return { hinge, wing, side };
  });
  // Twin fins canted out over the engine, swept hard, with red tips.
  const finGeo = slab([[0, 0], [-1.0, 0], [-1.35, 1.15], [-0.95, 1.15]], 0.07, 0.015);
  const finTip = slab([[-0.95, 1.0], [-1.31, 1.0], [-1.35, 1.15], [-0.95, 1.15]], 0.09, 0.01);
  const fin = new THREE.Group();
  for (const side of [1, -1]) {
    const f = new THREE.Mesh(finGeo, paint);
    f.add(new THREE.Mesh(finTip, red));
    f.position.z = side * 0.55;
    f.rotation.x = side * 0.38;
    f.castShadow = true;
    fin.add(f);
  }
  fin.position.set(-1.1, 0.7 + LIFT, 0);
  // A swept tailplane, its planform drawn flat and laid across the car (span onto ±Z).
  const tailplane = new THREE.Mesh(plate([
    [0.25, 0], [-0.5, 1.6], [-0.85, 1.6], [-0.7, 0.35], [-0.7, -0.35], [-0.85, -1.6], [-0.5, -1.6],
  ], 0.06).rotateX(Math.PI / 2), paint);
  tailplane.position.set(-1.85, 0.75 + LIFT, 0);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.55, 18, 1, true).rotateZ(Math.PI / 2), armour);
  nozzle.position.set(-2.5, 0.05 + LIFT, 0);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  // A cone with its base at the nozzle, pointing back (−X).
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1, 14).rotateZ(Math.PI / 2).translate(-0.5, 0, 0), flameMat);
  flame.position.set(-2.78, 0.05 + LIFT, 0);
  tailplane.castShadow = true;
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
  const A = new THREE.Vector3(), B = new THREE.Vector3(), D = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  /** Stretches a unit link between two points. */
  const aim = (m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) => {
    D.subVectors(b, a);
    const len = D.length();
    m.position.addVectors(a, b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(UP, D.divideScalar(len || 1));
    m.scale.set(m.userData.r, len, m.userData.r);
  };
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
      // Arms from fixed chassis points to the hub, shock from high on the cage to the lower arm.
      wheels.forEach((m, i) => {
        const hub = m.group.position, side = Math.sign(hub.z), x = hub.x;
        const { upper, lower, shock } = arms[i];
        aim(lower, A.set(x, LIFT - 0.32, side * 0.4), B.set(x, hub.y - 0.1, hub.z - side * 0.16));
        aim(upper, A.set(x, LIFT - 0.02, side * 0.4), B.set(x, hub.y + 0.12, hub.z - side * 0.16));
        aim(shock, A.set(x - Math.sign(x) * 0.25, LIFT + 0.45, side * 0.62), B.set(x, hub.y - 0.05, hub.z - side * 0.3));
      });
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
