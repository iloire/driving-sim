// The Jet's look: an original single-seat delta in two-tone grey. A long fuselage with a pointed
// nose and a bubble canopy, a cropped delta wing, small tailplanes, twin fins canted outwards, and
// one round nozzle whose flame grows with the throttle and turns blue-white on the afterburner.
// The landing gear only shows when it is slow enough to need it. Around Mach 1 a vapour cone
// wraps the fuselage from the canopy back, thickest right at the sound barrier. The airbrake is a
// panel on the spine behind the canopy, hinged at its front edge, that swings up to 55° and
// shudders in the airflow, opening a dark well beneath it. The control surfaces follow what the
// fly-by-wire gives the wing: the all-moving tailplanes tilt together to pitch and against each
// other to roll, ailerons on the wing's trailing edge roll, and a rudder on each fin yaws.
// Built in the sim's body frame turned into three.js axes: forward +X, up +Y, left −Z, origin at
// the centre of mass.

import * as THREE from 'three';
import type { CarSpec } from '../sim/car';
import type { CarModel } from './car-model';
import { slab } from './shapes';

/** Below this airspeed (m/s) the gear is down. */
const GEAR_DOWN = 110;
/** The vapour cone: Mach number where it's thickest, and how far either side it fades out. */
const VAPOUR = { mach: 0.99, width: 0.035 };
/** The airbrake panel fully up (rad), and how much it shudders at speed. */
const AIRBRAKE = { angle: 0.95, shudder: 0.04 };
/** Full travel of the tailplanes, ailerons and rudders (rad), and how fast they get there (1/s). */
const SURFACES = { travel: 0.35, rate: 12 };

/** The nose narrows from full width at `from` (m forward) to a point at `tip`, in `steps` along each edge. */
const NOSE = { from: 2.5, tip: 7.72, steps: 8 };

/** The profile with extra points along every edge ahead of `from`, so the nose can bend smoothly. */
function subdivide(profile: [number, number][], from: number): [number, number][] {
  return profile.flatMap(([x0, y0], i) => {
    const [x1, y1] = profile[(i + 1) % profile.length];
    if (Math.max(x0, x1) <= from) return [[x0, y0]];
    return Array.from({ length: NOSE.steps }, (_, k): [number, number] => [x0 + (x1 - x0) * k / NOSE.steps, y0 + (y1 - y0) * k / NOSE.steps]);
  });
}

/** Pinches a slab's width ahead of NOSE.from into an ogive, so from above the nose is a point, not a chisel. */
function pointNose(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(Math.max((pos.getX(i) - NOSE.from) / (NOSE.tip - NOSE.from), 0), 1);
    pos.setZ(i, pos.getZ(i) * Math.max(1 - t * t, 0.03));
  }
  g.computeVertexNormals();
  return g;
}

/**
 * A cone of condensation, apex at the canopy opening back over the wings: clear at the tip, densest
 * a third of the way back, feathered at the rim (alpha in the vertex colours).
 */
function vapourCone(): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
  const length = 7, radius = 4.2;
  const g = new THREE.CylinderGeometry(radius, 0.4, length, 40, 12, true).rotateZ(Math.PI / 2);
  const pos = g.getAttribute('position');
  const colours = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const t = 0.5 - pos.getX(i) / length; // 0 at the apex (front), 1 at the rim
    colours.set([1, 1, 1, Math.sin(Math.PI * Math.min(t * 1.5, 1)) * (1 - t * 0.6)], i * 4);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colours, 4));
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const cone = new THREE.Mesh(g, m);
  cone.position.set(2.5 - length / 2, 0.1, 0);
  return cone;
}

/** A flat plan-form (x forward, `y` out along the span) laid in the wing plane, span towards +Z (right) or −Z (left). */
function planform(points: [number, number][], thickness: number, side: 1 | -1): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y * side)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  g.translate(0, 0, -thickness / 2);
  return g.rotateX(Math.PI / 2);
}

/** A control surface hinged along the line `hinge` of a planform, swinging about it via `swing(angle)`; positive is trailing edge down (or, on a fin, towards the right). */
function hinged(points: [number, number][], hinge: [[number, number], [number, number]], thickness: number, side: 1 | -1, material: THREE.Material) {
  const [[x0, y0], [x1, y1]] = hinge;
  const pivot = new THREE.Group();
  pivot.position.set(x0, 0, y0 * side);
  pivot.add(new THREE.Mesh(planform(points, thickness, side).translate(-x0, 0, -y0 * side), material));
  // Pointing right on either side, so the same angle drops either trailing edge.
  const axis = new THREE.Vector3(x1 - x0, 0, (y1 - y0) * side).normalize().multiplyScalar(side);
  return { pivot, swing: (angle: number) => pivot.setRotationFromAxisAngle(axis, angle) };
}

export function createJetModel(spec: CarSpec): CarModel {
  const group = new THREE.Group();
  const grey = new THREE.MeshStandardMaterial({ color: 0x8a939c, roughness: 0.55, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a525a, roughness: 0.6, metalness: 0.3 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x3a2c12, roughness: 0.05, metalness: 0.6, clearcoat: 1 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.4, metalness: 0.8 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });

  // Fuselage: a side profile from the nose tip back to the nozzle, tapered in towards the spine,
  // then pinched to a point ahead of the cockpit.
  const fuselage = new THREE.Mesh(pointNose(slab(subdivide([
    [7.6, 0.05], [5.2, -0.45], [1, -0.7], [-6, -0.65], [-7, -0.35], [-7, 0.45], [-3, 0.75], [2.5, 0.65], [5.4, 0.35],
  ], NOSE.from), 1.7, 0.12, 0.35)), grey);
  const canopy = new THREE.Mesh(slab([[4.8, 0.4], [3.4, 1.15], [1.6, 1.05], [0.6, 0.7]], 0.85, 0.08, 0.3), glass);
  // Intakes either side under the wing root.
  const intakes = new THREE.Mesh(slab([[2.2, -0.65], [-3.5, -0.7], [-3.5, 0], [2.6, -0.05]], 2.5, 0.1), dark);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 1.1, 20, 1, true).rotateZ(Math.PI / 2), metal);
  nozzle.position.set(-7.4, 0.05, 0);

  // The wing and fins have a notch cut out of the trailing edge where the aileron and rudder sit.
  const wing: [number, number][] = [[2.2, 0], [-5.8, 0], [-5.87, 0.9], [-5.07, 0.9], [-5.37, 4.6], [-6.17, 4.6], [-6.2, 4.9], [-4.6, 4.9]];
  const aileron: [number, number][] = [[-5.07, 0.9], [-5.87, 0.9], [-6.17, 4.6], [-5.37, 4.6]];
  const tail: [number, number][] = [[-5.6, 0], [-7.6, 0], [-7.8, 2.6], [-7.0, 2.6]];
  const fin: [number, number][] = [[-4.2, 0], [-7.4, 0], [-7.46, 0.3], [-6.76, 0.3], [-7.07, 2.3], [-7.84, 2.3], [-7.9, 2.6], [-6.8, 2.6]];
  const rudder: [number, number][] = [[-6.76, 0.3], [-7.46, 0.3], [-7.84, 2.3], [-7.07, 2.3]];
  const movers: { tail: (a: number) => void; aileron: (a: number) => void; rudder: (a: number) => void; side: 1 | -1 }[] = [];
  for (const side of [1, -1] as const) {
    const w = new THREE.Mesh(planform(wing, 0.18, side), grey);
    w.position.y = -0.15;
    const a = hinged(aileron, [[-5.07, 0.9], [-5.37, 4.6]], 0.12, side, grey);
    w.add(a.pivot);
    // The tailplane pivots whole about a spanwise shaft a little behind its middle.
    const t = hinged(tail, [[-6.7, 0], [-6.7, 1]], 0.12, side, grey);
    t.pivot.position.y = -0.2;
    // Fins stand on the spine either side, canted out about 20°.
    const f = new THREE.Mesh(planform(fin, 0.12, 1), dark);
    f.rotation.x = -(Math.PI / 2 - 0.35 * side);
    f.position.set(0, 0.5, side * 0.55);
    const r = hinged(rudder, [[-6.76, 0.3], [-7.07, 2.3]], 0.1, 1, dark);
    f.add(r.pivot);
    group.add(w, t.pivot, f);
    movers.push({ tail: t.swing, aileron: a.swing, rudder: r.swing, side });
  }
  const surfaces = { pitch: 0, roll: 0, yaw: 0 };

  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 16).rotateZ(Math.PI / 2).translate(-0.5, 0, 0), flameMat);
  flame.position.set(-7.9, 0.05, 0);
  for (const m of [fuselage, canopy, intakes]) group.add(m);
  const vapour = vapourCone();
  group.add(nozzle, flame, vapour);

  // Airbrake: a panel on the spine hinged at its front edge, over a dark well it uncovers.
  const brakeHinge = new THREE.Group();
  brakeHinge.position.set(-0.3, 0.76, 0);
  const brakePanel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.95).translate(-1.1, 0, 0), grey);
  brakeHinge.add(brakePanel);
  const well = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.04, 0.85).translate(-1.15, 0, 0), metal);
  well.position.set(-0.3, 0.73, 0);
  group.add(brakeHinge, well);

  // Landing gear: a leg and a wheel at each of the sim's wheel mounts.
  const gear = new THREE.Group();
  const wheelGeo = new THREE.CylinderGeometry(spec.wheelRadius, spec.wheelRadius, 0.25, 20).rotateX(Math.PI / 2);
  const legs = new THREE.Group();
  const hubs: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const hub = new THREE.Mesh(wheelGeo, rubber);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 8), metal);
    hubs.push(hub);
    legs.add(leg);
    gear.add(hub);
  }
  gear.add(legs);
  group.add(gear);
  group.traverse((o) => { if (o instanceof THREE.Mesh && o !== flame && o !== vapour) o.castShadow = true; });

  const ORANGE = new THREE.Color(0xffa040), BLUE = new THREE.Color(0x9fd4ff);
  const q = new THREE.Quaternion();
  return {
    group,
    update(s, _braking, extent, thrust, boost, _camera, dt = 0) {
      // Sim quaternion [w, x, y, z] in (east, north, up) → three.js (x, up, −north).
      q.set(s.q[1], s.q[3], -s.q[2], s.q[0]);
      group.quaternion.copy(q);
      group.position.set(s.pos[0] - extent / 2, s.pos[2], extent / 2 - s.pos[1]);

      gear.visible = s.airspeed < GEAR_DOWN;
      s.wheels.forEach((w, i) => {
        const hubY = w.mount[2] - w.strut;
        hubs[i].position.set(w.mount[0], hubY, -w.mount[1]);
        hubs[i].rotation.z = -w.spin;
        const leg = legs.children[i];
        // From the hub up to the belly.
        const top = -0.6;
        leg.position.set(w.mount[0], (hubY + top) / 2, -w.mount[1]);
        leg.scale.y = top - hubY;
      });

      const after = boost ? 1 : 0;
      const burn = thrust * (1 + after);
      flame.visible = burn > 0.05;
      flame.scale.set(0.8 + burn * (2.2 + Math.random() * 0.5), 0.7 + burn * 0.3, 0.7 + burn * 0.3);
      flameMat.color.copy(ORANGE).lerp(BLUE, after * 0.7);

      const shudder = s.airbrake * AIRBRAKE.shudder * Math.min(s.airspeed / 200, 1) * (Math.random() - 0.5);
      brakeHinge.rotation.z = -(s.airbrake * AIRBRAKE.angle + shudder);
      well.visible = s.airbrake > 0.01;

      // The surfaces chase the sim's at a servo's pace (dt is 0 on a still frame: snap).
      const k = dt > 0 ? 1 - Math.exp(-SURFACES.rate * dt) : 1;
      for (const key of ['pitch', 'roll', 'yaw'] as const) surfaces[key] += (s.surfaces[key] - surfaces[key]) * k;
      const { pitch, roll, yaw } = surfaces, T = SURFACES.travel;
      for (const m of movers) {
        // Pull or roll away from a side raises its trailing edges (−); the right fin's leads the yaw.
        m.tail(-T * Math.max(-1, Math.min(1, pitch + roll * m.side)));
        m.aileron(-T * roll * m.side);
        m.rudder(T * yaw);
      }

      // The cone flickers as the shock shifts.
      const near = Math.exp(-(((s.mach - VAPOUR.mach) / VAPOUR.width) ** 2));
      vapour.visible = near > 0.02;
      vapour.material.opacity = near * (0.55 + Math.random() * 0.2);
      vapour.scale.set(1, 0.95 + Math.random() * 0.1, 0.95 + Math.random() * 0.1);
    },
  };
}
