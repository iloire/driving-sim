// The Jet's look: an original single-seat delta in two-tone grey. A long fuselage with a pointed
// nose and a bubble canopy, a cropped delta wing, small tailplanes, twin fins canted outwards, and
// one round nozzle whose flame grows with the throttle and turns blue-white on the afterburner.
// The landing gear only shows when it is slow enough to need it. Around Mach 1 a vapour cone
// wraps the fuselage from the canopy back, thickest right at the sound barrier. The airbrake is a
// panel on the spine behind the canopy, hinged at its front edge, that swings up to 55° and
// shudders in the airflow, opening a dark well beneath it.
// Built in the sim's body frame turned into three.js axes: forward +X, up +Y, left −Z, origin at
// the centre of mass.

import * as THREE from 'three';
import type { CarSpec } from '../sim/car';
import type { CarModel } from './car-model';
import { slab } from './shapes';

/** Below this airspeed (m/s) the gear is down. */
const GEAR_DOWN = 110;
const SPEED_OF_SOUND = 340;
/** The vapour cone: Mach number where it's thickest, and how far either side it fades out. */
const VAPOUR = { mach: 0.99, width: 0.035 };
/** The airbrake panel fully up (rad), and how much it shudders at speed. */
const AIRBRAKE = { angle: 0.95, shudder: 0.04 };

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

export function createJetModel(spec: CarSpec): CarModel {
  const group = new THREE.Group();
  const grey = new THREE.MeshStandardMaterial({ color: 0x8a939c, roughness: 0.55, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a525a, roughness: 0.6, metalness: 0.3 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x3a2c12, roughness: 0.05, metalness: 0.6, clearcoat: 1 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.4, metalness: 0.8 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });

  // Fuselage: a side profile from the nose tip back to the nozzle, tapered in towards the spine.
  const fuselage = new THREE.Mesh(slab([
    [7.6, 0.05], [5.2, -0.45], [1, -0.7], [-6, -0.65], [-7, -0.35], [-7, 0.45], [-3, 0.75], [2.5, 0.65], [5.4, 0.35],
  ], 1.7, 0.12, 0.35), grey);
  const canopy = new THREE.Mesh(slab([[4.8, 0.4], [3.4, 1.15], [1.6, 1.05], [0.6, 0.7]], 0.85, 0.08, 0.3), glass);
  // Intakes either side under the wing root.
  const intakes = new THREE.Mesh(slab([[2.2, -0.65], [-3.5, -0.7], [-3.5, 0], [2.6, -0.05]], 2.5, 0.1), dark);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 1.1, 20, 1, true).rotateZ(Math.PI / 2), metal);
  nozzle.position.set(-7.4, 0.05, 0);

  const wing: [number, number][] = [[2.2, 0], [-5.8, 0], [-6.2, 4.9], [-4.6, 4.9]];
  const tail: [number, number][] = [[-5.6, 0], [-7.6, 0], [-7.8, 2.6], [-7.0, 2.6]];
  const fin: [number, number][] = [[-4.2, 0], [-7.4, 0], [-7.9, 2.6], [-6.8, 2.6]];
  for (const side of [1, -1] as const) {
    const w = new THREE.Mesh(planform(wing, 0.18, side), grey);
    w.position.y = -0.15;
    const t = new THREE.Mesh(planform(tail, 0.12, side), grey);
    t.position.y = -0.2;
    // Fins stand on the spine either side, canted out about 20°.
    const f = new THREE.Mesh(planform(fin, 0.12, 1), dark);
    f.rotation.x = -(Math.PI / 2 - 0.35 * side);
    f.position.set(0, 0.5, side * 0.55);
    group.add(w, t, f);
  }

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
    update(s, _braking, extent, thrust, boost) {
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

      // The cone flickers as the shock shifts.
      const near = Math.exp(-(((s.airspeed / SPEED_OF_SOUND - VAPOUR.mach) / VAPOUR.width) ** 2));
      vapour.visible = near > 0.02;
      vapour.material.opacity = near * (0.55 + Math.random() * 0.2);
      vapour.scale.set(1, 0.95 + Math.random() * 0.1, 0.95 + Math.random() * 0.1);
    },
  };
}
