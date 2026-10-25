// Starship's look: the launch site (a lattice tower with its chopsticks, the launch mount over a
// steel deflector, a concrete pad and a tank farm), Super Heavy in bare stainless steel with its
// grid fins, hot-staging ring and 33 engines, and Ship with its black heat shield and four flaps.
// The plumes are additive cones that brighten with the engines lit and swell into the thin air up
// high; the pad boils over with steam at lift-off, and the low air keeps a trail behind the climb.
// Built in three.js axes with +Y up; each stage stands on its engine plane, as the sim has it.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CATCH_BASE, MOUNT, SHIP, SUPER_HEAVY, type Launch, type Stage } from '../sim/starship';
import { box } from './shapes';
import { Smoke } from './smoke';
import { toScene } from './world';

const TOWER = { height: 146, side: 12, offset: 26 };
/** The chopsticks: their height up the tower (where the booster's catch pins sit when caught), length and gap. */
const ARMS = { y: CATCH_BASE + 62, length: TOWER.offset + 10, gap: SUPER_HEAVY.diameter + 1.6 };
const R = SUPER_HEAVY.diameter / 2;

const steel = () => new THREE.MeshStandardMaterial({ color: 0xc6cacf, roughness: 0.32, metalness: 0.92 });

/** A lattice tower, `side` square: corner columns, a band every bay, and an X across each face. */
function latticeTower(height: number, side: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const h = side / 2;
  for (const [x, z] of [[-h, -h], [h, -h], [h, h], [-h, h]]) parts.push(box(1.4, height, 1.4, x, height / 2, z));
  const bay = 9;
  const diag = Math.hypot(side, bay);
  const tilt = Math.atan2(bay, side);
  for (let y = 0; y < height - 1; y += bay) {
    for (const s of [-h, h]) {
      parts.push(box(side, 0.7, 0.7, 0, y + bay, s), box(0.7, 0.7, side, s, y + bay, 0));
      for (const sign of [-1, 1]) {
        parts.push(new THREE.BoxGeometry(diag, 0.45, 0.45).rotateZ(sign * tilt).translate(0, y + bay / 2, s).toNonIndexed());
        parts.push(new THREE.BoxGeometry(0.45, 0.45, diag).rotateX(-sign * tilt).translate(s, y + bay / 2, 0).toNonIndexed());
      }
    }
  }
  // The lightning mast on top.
  parts.push(box(0.5, 14, 0.5, 0, height + 7, 0));
  return mergeGeometries(parts);
}

/** One chopstick: a long box truss, from its hinge at the origin out along +X. */
function chopstick(): THREE.BufferGeometry {
  const L = ARMS.length;
  const parts = [box(L, 0.5, 2.2, L / 2, 2.4, 0), box(L, 0.5, 2.2, L / 2, -2.4, 0)];
  for (let x = 1; x < L; x += 3) parts.push(box(0.4, 4.8, 0.4, x, 0, 0.9), box(0.4, 4.8, 0.4, x, 0, -0.9));
  // The rails the booster's pins land on, along the inside edge.
  parts.push(box(L - 6, 0.8, 0.8, L / 2 + 3, 2.9, 0));
  return mergeGeometries(parts);
}

/** The launch site: the mount at the origin on the ground, the tower off towards +Z with its chopsticks reaching back over the mount. */
function launchSite(): { group: THREE.Group; arms: [THREE.Object3D, THREE.Object3D] } {
  const group = new THREE.Group();
  const grey = new THREE.MeshStandardMaterial({ color: 0x3b3e43, roughness: 0.75, metalness: 0.5 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0xa7a39a, roughness: 0.95 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe8e6e1, roughness: 0.6, metalness: 0.2 });

  // The pad, a little proud of the sand and sunk into it so a slope never shows under the edge.
  const pad = new THREE.Mesh(new THREE.BoxGeometry(110, 6, 90), concrete);
  pad.position.set(0, -2.6, TOWER.offset / 2);
  pad.receiveShadow = true;

  // The mount: a ring on six legs over the steel deflector.
  const mount = new THREE.Mesh(mergeGeometries([
    new THREE.CylinderGeometry(R + 4, R + 4, 3, 40, 1, true).translate(0, MOUNT - 1.5, 0).toNonIndexed(),
    new THREE.RingGeometry(R + 0.3, R + 4, 40).rotateX(-Math.PI / 2).translate(0, MOUNT, 0).toNonIndexed(),
    new THREE.RingGeometry(R + 0.3, R + 4, 40).rotateX(Math.PI / 2).translate(0, MOUNT - 3, 0).toNonIndexed(),
    ...Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2;
      return box(2.4, MOUNT - 3, 2.4, Math.cos(a) * (R + 3), (MOUNT - 3) / 2, Math.sin(a) * (R + 3));
    }),
  ]), grey);
  const deflector = new THREE.Mesh(new THREE.CylinderGeometry(R + 3, R + 5, 1.2, 40), steel());
  deflector.position.y = 0.6;

  // The tower stands off the mount towards +Z, the chopsticks reaching back over it.
  const tower = new THREE.Mesh(latticeTower(TOWER.height, TOWER.side), grey);
  tower.position.z = TOWER.offset;
  const carriage = new THREE.Mesh(new THREE.BoxGeometry(TOWER.side + 3, 9, TOWER.side + 3), grey);
  carriage.position.set(0, ARMS.y, TOWER.offset);
  const armGeo = chopstick();
  const armAt = (side: number) => {
    const hinge = new THREE.Group();
    hinge.position.set(side * ARMS.gap / 2 + side * 1.1, ARMS.y, TOWER.offset - TOWER.side / 2);
    const arm = new THREE.Mesh(armGeo, grey);
    arm.rotation.y = Math.PI / 2; // along −Z, towards the mount
    hinge.add(arm);
    return hinge;
  };
  const arms: [THREE.Object3D, THREE.Object3D] = [armAt(-1), armAt(1)];

  // A tank farm off to the side, for scale.
  const tanks = new THREE.Mesh(mergeGeometries(Array.from({ length: 8 }, (_, i) =>
    new THREE.CylinderGeometry(4, 4, i < 4 ? 32 : 18, 20).translate(-90 + (i % 4) * 11, i < 4 ? 16 : 9, i < 4 ? 70 : 84).toNonIndexed())), white);

  group.add(pad, mount, deflector, tower, carriage, ...arms, tanks);
  group.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true; });
  return { group, arms };
}

/** Engine bells, opening downwards below y = 0, at these radii and counts round the middle. */
function bells(rings: [number, number, number][]): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const [r, n, size] of rings) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      parts.push(new THREE.CylinderGeometry(0.35 * size, 0.65 * size, 2.2 * size, 14, 1, true).translate(Math.cos(a) * r, -1.1 * size, Math.sin(a) * r).toNonIndexed());
    }
  }
  return mergeGeometries(parts);
}

function booster(): THREE.Group {
  const g = new THREE.Group();
  const body = steel();
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.6, metalness: 0.7 });
  const L = SUPER_HEAVY.length;
  const ring = 2.6; // the hot-staging ring on top
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L - ring - 1, 48), body);
  tank.position.y = 1 + (L - ring - 1) / 2;
  // Weld seams every few metres, and the dark engine skirt.
  const seams = new THREE.Mesh(mergeGeometries(Array.from({ length: 22 }, (_, i) =>
    new THREE.CylinderGeometry(R + 0.03, R + 0.03, 0.12, 48, 1, true).translate(0, 4 + i * 3, 0).toNonIndexed())), dark);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(R, R + 0.1, 1.2, 48), dark);
  skirt.position.y = 0.6;
  const hot = new THREE.Mesh(new THREE.CylinderGeometry(R, R, ring, 48), dark);
  hot.position.y = L - ring / 2;
  // Vents round the ring: steel posts between dark gaps.
  const posts = new THREE.Mesh(mergeGeometries(Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return box(0.5, ring, 0.5, Math.cos(a) * R, L - ring / 2, Math.sin(a) * R);
  })), body);
  // Four grid fins, a lattice each, just under the ring.
  const fin: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const parts = [box(0.25, 4, 6, 0, 0, 0)];
    for (let k = -2; k <= 2; k++) parts.push(box(1.6, 0.18, 6, 0.8, k * 0.9, 0), box(1.6, 4, 0.18, 0.8, 0, k * 1.4));
    fin.push(mergeGeometries(parts).translate(R + 0.2, L - ring - 3.5, 0).rotateY(-a));
  }
  const fins = new THREE.Mesh(mergeGeometries(fin), dark);
  // A chine down two sides, and the 33 Raptors.
  const chines = new THREE.Mesh(mergeGeometries([box(0.5, L - 10, 0.8, 0, (L - 10) / 2 + 2, R), box(0.5, L - 10, 0.8, 0, (L - 10) / 2 + 2, -R)]), body);
  const engines = new THREE.Mesh(bells([[0.9, 3, 1], [2.3, 10, 1], [3.7, 20, 1]]), dark);
  g.add(tank, seams, skirt, hot, posts, fins, chines, engines);
  g.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
  return g;
}

function ship(): THREE.Group {
  const g = new THREE.Group();
  const body = steel();
  const tiles = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.85, metalness: 0.1 });
  const L = SHIP.length;
  const barrel = 34;
  // The steel: a barrel and an ogive nose, turned on a lathe.
  const profile: THREE.Vector2[] = [new THREE.Vector2(0, 0), new THREE.Vector2(R, 0), new THREE.Vector2(R, barrel)];
  for (let i = 1; i <= 12; i++) {
    const t = i / 12;
    profile.push(new THREE.Vector2(R * Math.cos((t * Math.PI) / 2) ** 0.8, barrel + (L - barrel) * Math.sin((t * Math.PI) / 2)));
  }
  const hull = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), body);
  // The heat shield: the same shape a hair larger over the windward half.
  const shield = new THREE.Mesh(new THREE.LatheGeometry(profile.slice(1).map((p) => new THREE.Vector2(p.x * 1.012 + 0.01, p.y)), 48, Math.PI / 2, Math.PI), tiles);
  // Flaps: a big pair aft, a small pair high on the nose, on the shield's edges.
  const flap = (w: number, h: number, y: number, side: number) => {
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(w, h * 0.15), new THREE.Vector2(w, h * 0.8), new THREE.Vector2(0, h)]);
    return new THREE.ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: false }).translate(0, 0, -0.2).rotateY(side > 0 ? 0 : Math.PI).translate(side * (R - 0.2), y, 0);
  };
  const flaps = new THREE.Mesh(mergeGeometries([flap(4, 11, 1.5, 1), flap(4, 11, 1.5, -1), flap(2.6, 7, 40, 1), flap(2.6, 7, 40, -1)].map((x) => x.toNonIndexed())), tiles);
  const engines = new THREE.Mesh(bells([[1.1, 3, 1], [3, 3, 1.9]]), tiles);
  g.add(hull, shield, flaps, engines);
  g.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
  return g;
}

/** The plume's colour along its length: white-hot at the nozzles, through orange, to nothing. */
function plumeTexture(core: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  if (core) {
    grad.addColorStop(0, 'rgba(255,250,235,1)');
    grad.addColorStop(0.25, 'rgba(255,214,150,0.8)');
    grad.addColorStop(1, 'rgba(255,140,60,0)');
  } else {
    grad.addColorStop(0, 'rgba(255,170,90,0.7)');
    grad.addColorStop(0.4, 'rgba(240,110,60,0.35)');
    grad.addColorStop(1, 'rgba(200,90,70,0)');
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A plume hanging below y = 0: an inner core and a wider glow, both cones from the nozzles to a point. */
function plume(): { group: THREE.Group; set(on: number, length: number, width: number): void } {
  const group = new THREE.Group();
  const layer = (core: boolean) => {
    // Apex down at −1, base at the nozzles; the texture runs v = 0 at the base.
    const geo = new THREE.ConeGeometry(1, 1, 32, 1, true).rotateX(Math.PI).translate(0, -0.5, 0);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    const mat = new THREE.MeshBasicMaterial({ map: plumeTexture(core), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);
    return { mesh, mat };
  };
  const core = layer(true), glow = layer(false);
  return {
    group,
    set(on, length, width) {
      group.visible = on > 0.01;
      if (!group.visible) return;
      const flicker = 1 + (Math.random() - 0.5) * 0.06;
      core.mesh.scale.set(width * 0.55, length * 0.6 * flicker, width * 0.55);
      glow.mesh.scale.set(width, length * flicker, width);
      core.mat.opacity = Math.min(on * 1.2, 1);
      glow.mat.opacity = on * 0.8;
    },
  };
}

export interface LaunchView {
  /** Everything: the site, the stages, their smoke. */
  group: THREE.Group;
  /** Where the camera looks: the middle of whatever is being flown (the stack, then the booster). */
  focus: THREE.Object3D;
  update(l: Launch, camera: THREE.Camera, dt: number): void;
}

/** Turns a sim-frame direction into scene axes. */
const sceneDir = (v: [number, number, number], out = new THREE.Vector3()) => out.set(v[0], v[2], -v[1]);

export function createLaunchView(extent: number, pad: [number, number, number], azimuth: number): LaunchView {
  const group = new THREE.Group();
  const site = launchSite();
  toScene(extent, pad[0], pad[1], pad[2], site.group.position);
  // Turned so the tower stands off to the right of the way it launches, and the stack climbs away from it.
  site.group.rotation.y = -azimuth + Math.PI / 2;
  const boost = booster(), upper = ship();
  const boostPlume = plume(), shipPlume = plume();
  boost.add(boostPlume.group);
  upper.add(shipPlume.group);
  const steam = new Smoke(new THREE.Color(0xf2efe8), 0.1);
  const trail = new Smoke(new THREE.Color(0xdfe3e8), 0.12);
  const glow = new THREE.PointLight(0xffb070, 0, 4000, 1.6);
  const focus = new THREE.Object3D();
  group.add(site.group, boost, upper, steam.mesh, trail.mesh, glow, focus);

  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  const v = new THREE.Vector3();
  const p = new THREE.Vector3();
  let steamClock = 0, trailClock = 0, arms = 1;
  const place = (o: THREE.Object3D, s: Stage) => {
    toScene(extent, s.pos[0], s.pos[1], s.pos[2], o.position);
    o.quaternion.setFromUnitVectors(up, sceneDir(s.axis, dir));
  };
  /** How hard a stage's engines burn (0..1 of a full stage), and how long and wide its plume is up here. */
  const burn = (s: Stage, engines: number, pl: ReturnType<typeof plume>, radius: number) => {
    const on = s.prop > 0 ? (s.lit / engines) * (0.4 + 0.6 * s.throttle) : 0;
    // In thin air the exhaust balloons out: tight and long at the sea, a great glowing bell up high.
    const thin = THREE.MathUtils.smoothstep(s.pos[2], 8e3, 70e3);
    const share = Math.sqrt(s.lit / engines);
    pl.set(on > 0 ? Math.max(on, 0.35) * (1 - 0.6 * thin) : 0, (130 + 300 * thin) * (0.4 + 0.6 * share), radius * share * (1.5 + 14 * thin * thin));
    return on;
  };

  return {
    group, focus,
    update(l, camera, dt) {
      const b = l.booster, s = l.ship;
      place(boost, b);
      place(upper, s);
      const onB = burn(b, SUPER_HEAVY.engines, boostPlume, 4.6);
      burn(s, SHIP.engines, shipPlume, 3.2);
      // The camera rides the middle of the stack, then of the booster.
      p.copy(boost.position).addScaledVector(sceneDir(b.axis, dir), l.stacked ? (SUPER_HEAVY.length + SHIP.length) / 2 : SUPER_HEAVY.length / 2);
      focus.position.copy(p);

      // The chopsticks swing open for the launch and the way home, and close round a caught booster.
      arms += ((l.phase === 'caught' ? 0 : 1) - arms) * (1 - Math.exp(-dt * 0.8));
      site.arms[0].rotation.y = arms * 0.9;
      site.arms[1].rotation.y = -arms * 0.9;

      // Light on the ground and the pad from the engines.
      glow.position.copy(boost.position).y -= 30;
      glow.intensity = onB * 4e4;

      // Steam boils off the pad while the engines are near it.
      const low = b.pos[2] - l.pad[2];
      if (onB > 0 && low < 500 && (steamClock -= dt) <= 0) {
        steamClock = 0.06;
        toScene(extent, l.pad[0], l.pad[1], l.pad[2] + 8, p);
        const near = 1 - low / 500;
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * Math.PI * 2;
          v.set(Math.cos(a), 0.15 + Math.random() * 0.3, Math.sin(a)).multiplyScalar((30 + Math.random() * 40) * near);
          steam.emit(p, v, 14, 9 + Math.random() * 6, 9 + Math.random() * 6);
        }
      }
      // A trail through the low air, where the exhaust's water condenses behind the climb.
      if (onB > 0 && low > 200 && b.pos[2] < 18e3 && (trailClock -= dt) <= 0) {
        trailClock = 0.05;
        p.copy(boost.position).addScaledVector(sceneDir(b.axis, dir), -60);
        trail.emit(p, v.set(0, 0, 0), 30, 4, 50);
      }
      steam.update(dt, camera);
      trail.update(dt, camera);
    },
  };
}
