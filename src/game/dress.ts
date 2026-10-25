// What stands on a detail tile once it is close: its buildings and street furniture (from
// objects/<col>_<row>.json, see src/sim/objects.ts) and, at the finest level, the road surfaces.
// Buildings have flat roofs and the woodwork green, blue or brown, varied in window style, massing
// and what stands on the roof; their walls and roofs take the zone's colours (site.json's
// `buildings`: Lanzarote's lime-white by default), one picked per building and carried as vertex
// colours over a white texture. Each tile's buildings are merged into a few meshes (one per
// material), and the furniture is instanced, so a town costs a handful of draw calls.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { area, inside, roofline, type Building } from '../sim/buildings';
import type { BuildingStyle, TileObjects } from '../sim/objects';
import type { Heightmap } from '../sim/terrain';
import type { RoadView } from './road-view';
import type { DetailTile } from './site';

/** Storey height (m): one window bay of the wall texture is a storey tall. */
const BAY_H = 3.2;
const WOODWORK = ['#2f6b4f', '#24527d', '#6e4a2c'];
/** Window styles, with the width (m) of one bay of each: the white walls stay, the openings vary. */
const WINDOWS = [
  { style: 'shutters', bay: 3.2 },
  { style: 'small', bay: 2.6 },
  { style: 'arched', bay: 3.6 },
  { style: 'pair', bay: 3.8 },
] as const;
type WindowStyle = (typeof WINDOWS)[number]['style'];
/** Below this height a building is a garage, shed or the like: a plain box. */
const HOUSE_MIN = 3.5;
/** Above it, a church: a plain box too, the towers being taller than any house. */
const HOUSE_MAX = 8;

/** A white wall (the building's colour multiplies it) with one window per bay, in one of the window styles. */
function wallTexture(wood: string, style: WindowStyle, anisotropy: number): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(120, 110, 95, ${Math.random() * 0.06})`;
    g.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  const glass = '#1d2326';
  // The texture's top is the top of a storey (v runs down from the roofline).
  if (style === 'shutters') {
    const wx = S * 0.36, ww = S * 0.28, wy = S * 0.28, wh = S * 0.4;
    g.fillStyle = wood;
    g.fillRect(wx - S * 0.1, wy - 2, S * 0.1, wh + 4); // shutters either side
    g.fillRect(wx + ww, wy - 2, S * 0.1, wh + 4);
    g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6); // frame
    g.fillStyle = glass;
    g.fillRect(wx, wy, ww, wh);
    g.fillStyle = wood;
    g.fillRect(wx + ww / 2 - 1.5, wy, 3, wh); // mullion
  } else if (style === 'small') {
    // A deep-set square window, its frame and sill thick with paint.
    const wx = S * 0.36, ww = S * 0.28, wy = S * 0.32, wh = S * 0.3;
    g.fillStyle = wood;
    g.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
    g.fillStyle = glass;
    g.fillRect(wx, wy, ww, wh);
    g.fillStyle = wood;
    g.fillRect(wx, wy + wh / 2 - 1.5, ww, 3);
    g.fillStyle = 'rgba(0, 0, 0, 0.12)';
    g.fillRect(wx - 8, wy + wh + 5, ww + 16, 4); // sill shadow
  } else if (style === 'arched') {
    // A tall window under a round arch, the kind on older town houses.
    const cx = S * 0.5, r = S * 0.15, wy = S * 0.36, bottom = S * 0.74;
    const arch = (grow: number) => {
      g.beginPath();
      g.moveTo(cx - r - grow, bottom + grow);
      g.lineTo(cx - r - grow, wy);
      g.arc(cx, wy, r + grow, Math.PI, 0);
      g.lineTo(cx + r + grow, bottom + grow);
      g.closePath();
      g.fill();
    };
    g.fillStyle = wood;
    arch(4);
    g.fillStyle = glass;
    arch(0);
    g.fillStyle = wood;
    g.fillRect(cx - 1.5, wy - r, 3, bottom - wy + r);
  } else {
    // Two narrow windows side by side, each with its pair of shutters folded back.
    for (const wx of [S * 0.2, S * 0.62]) {
      const ww = S * 0.18, wy = S * 0.28, wh = S * 0.42;
      g.fillStyle = wood;
      g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
      g.fillStyle = glass;
      g.fillRect(wx, wy, ww, wh);
      g.fillStyle = wood;
      g.fillRect(wx, wy + wh * 0.35, ww, 3);
    }
  }
  g.fillStyle = 'rgba(0, 0, 0, 0.08)';
  g.fillRect(0, S - 6, S, 6); // a little grime at the floor line
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

/** A stable 0..1 sequence per building, from where it stands, so it looks the same on every load. */
function seeded(p: number[]): () => number {
  let a = (Math.round(p[0] * 10) * 73856093) ^ (Math.round(p[1] * 10) * 19349663);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

/** Geometry being gathered: positions, normals and texture coordinates, three vertices a triangle. */
interface Mesh {
  pos: number[];
  nor: number[];
  uv: number[];
}

const mesh = (): Mesh => ({ pos: [], nor: [], uv: [] });

/** The gathered triangles, every vertex in one colour. */
function toGeometry(m: Mesh, color: THREE.Color): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(m.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(m.uv, 2));
  const rgb = new Float32Array(m.pos.length);
  for (let i = 0; i < rgb.length; i += 3) [rgb[i], rgb[i + 1], rgb[i + 2]] = [color.r, color.g, color.b];
  g.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
  return g;
}

/**
 * The walls of a ring from `base` to `top`, facing out (or in, for a parapet's inner face) whichever
 * way the ring runs. The texture's top sits at `top`, one bay every `bay` metres along, and only
 * `rows` storeys get windows: below them, where the ground falls away, the wall is plain.
 */
function walls(out: Mesh, p: number[], base: number, top: number, e: number, bay: number, rows: number, inward = false): void {
  const sill = Math.max(base, top - rows * BAY_H);
  const n = p.length / 2;
  const ccw = area(p) > 0 !== inward;
  let run = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [ax, ay, bx, by] = ccw ? [p[2 * i], p[2 * i + 1], p[2 * j], p[2 * j + 1]] : [p[2 * j], p[2 * j + 1], p[2 * i], p[2 * i + 1]];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 0.05) continue;
    // Outward normal of an anticlockwise ring is to the right of the edge.
    const nx = (by - ay) / len, ny = -(bx - ax) / len;
    const u0 = run / bay, u1 = (run + len) / bay;
    run += len;
    const A = [ax - e / 2, e / 2 - ay], B = [bx - e / 2, e / 2 - by];
    // Counter-clockwise seen from outside: the storeys, then the plain wall below (a strip of the
    // texture above the windows, stretched).
    const quad = (hi: number, lo: number, v0: number, v1: number) => {
      out.pos.push(A[0], hi, A[1], A[0], lo, A[1], B[0], hi, B[1], B[0], hi, B[1], A[0], lo, A[1], B[0], lo, B[1]);
      out.uv.push(u0, v0, u0, v1, u1, v0, u1, v0, u0, v1, u1, v1);
      for (let k = 0; k < 6; k++) out.nor.push(nx, 0, -ny);
    };
    quad(top, sill, 0, (top - sill) / BAY_H);
    if (sill - base > 0.05) quad(sill, base, 0.04, 0.2);
  }
}

/** A flat roof over a ring at height `z`. */
function slab(out: Mesh, p: number[], z: number, e: number): void {
  const contour = [];
  for (let i = 0; i < p.length; i += 2) contour.push(new THREE.Vector2(p[i], p[i + 1]));
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, [])) {
    // Anticlockwise in the site frame (seen from above) is what faces up in three.js.
    const A = contour[a], B = contour[b], C = contour[c];
    const order = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x) > 0 ? [A, B, C] : [A, C, B];
    for (const v of order) {
      out.pos.push(v.x - e / 2, z, e / 2 - v.y);
      out.nor.push(0, 1, 0);
      out.uv.push(0, 0);
    }
  }
}

/** A box `w` × `d` (along and across `angle`, radians from site east) standing on `z0` at (x, y). */
function box(out: Mesh, x: number, y: number, angle: number, w: number, d: number, z0: number, h: number, e: number): void {
  const g = new THREE.BoxGeometry(w, h, d).rotateY(angle).translate(x - e / 2, z0 + h / 2, e / 2 - y).toNonIndexed();
  out.pos.push(...g.attributes.position.array);
  out.nor.push(...g.attributes.normal.array);
  out.uv.push(...new Array(g.attributes.position.count * 2).fill(0));
  g.dispose();
}

/** The footprint in the frame of its longest wall: that wall's direction, and the extents along and across it. */
function frame(p: number[]) {
  const n = p.length / 2;
  let best = 0, ux = 1, uy = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, dx = p[2 * j] - p[2 * i], dy = p[2 * j + 1] - p[2 * i + 1], len = Math.hypot(dx, dy);
    if (len > best) [best, ux, uy] = [len, dx / len, dy / len];
  }
  let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const s = p[2 * i] * ux + p[2 * i + 1] * uy, t = -p[2 * i] * uy + p[2 * i + 1] * ux;
    s0 = Math.min(s0, s); s1 = Math.max(s1, s); t0 = Math.min(t0, t); t1 = Math.max(t1, t);
  }
  /** A point given along and across the longest wall, back in the site frame. */
  const at = (s: number, t: number): [number, number] => [s * ux - t * uy, s * uy + t * ux];
  return { angle: Math.atan2(uy, ux), s0, s1, t0, t1, at };
}

/**
 * One house: walls and roof seated on the lowest ground under it, varied the way the island's are.
 * Most have a low parapet round the roof; some two-storey ones have the upper floor over only part
 * of the plan, the rest a roof terrace; and roofs carry a chimney or a little stair room.
 */
function buildingGeometry(b: Building, terrain: Heightmap, e: number, bay: number, style: BuildingStyle): { walls: THREE.BufferGeometry; roof: THREE.BufferGeometry } {
  const p = b.pts;
  // Its colours from a sequence of their own, so the massing below stays as it was.
  const tint = seeded(p.slice(2));
  const wallColor = new THREE.Color(style.walls[Math.floor(tint() * style.walls.length)]);
  const roofColor = new THREE.Color(style.roofs[Math.floor(tint() * style.roofs.length)]);
  const done = () => ({ walls: toGeometry(w, wallColor), roof: toGeometry(r, roofColor) });
  // Measured from the low side, so a house on a slope doesn't gain a storey.
  const { low, high, top } = roofline(b, (x, y) => terrain.heightAt(x, y));
  const base = low - 0.5;
  const w = mesh(), r = mesh();
  const house = b.height > HOUSE_MIN && b.height < HOUSE_MAX;
  const rows = Math.max(1, Math.round((b.height - 0.6) / BAY_H));
  if (!house) {
    walls(w, p, base, top, e, bay, rows);
    slab(r, p, top, e);
    return done();
  }

  const rand = seeded(p);
  const parapet = rand() < 0.75 ? 0.3 + rand() * 0.5 : 0;
  const f = frame(p);
  const len = f.s1 - f.s0, wide = f.t1 - f.t0;
  /** Walls and a parapeted roof over a ring, its roof surface returned. */
  const block = (ring: number[], from: number, to: number, storeys: number) => {
    walls(w, ring, from, to, e, bay, storeys);
    if (parapet) walls(r, ring, to - parapet, to, e, bay, 1, true);
    slab(r, ring, to - parapet, e);
    return to - parapet;
  };

  // Two storeys over part of the plan: the upper floor at one end, a terrace over the rest.
  const ground = Math.max(low + BAY_H + 0.6, high + 2.6);
  let roof: number, upper: number[] | null = null;
  if (b.height > BAY_H * 1.5 && top - ground > 2.6 && Math.abs(area(p)) > 50 && rand() < 0.55) {
    const share = 0.45 + rand() * 0.2, inset = Math.min(0.8, wide * 0.1);
    const [sa, sb] = rand() < 0.5 ? [f.s0 + 0.4, f.s0 + len * share] : [f.s1 - len * share, f.s1 - 0.4];
    const ring = [f.at(sa, f.t0 + inset), f.at(sb, f.t0 + inset), f.at(sb, f.t1 - inset), f.at(sa, f.t1 - inset)];
    const mid = f.at((sa + sb) / 2, (f.t0 + f.t1) / 2);
    if ([...ring, mid].every(([x, y]) => inside(p, x, y))) upper = ring.flat();
  }
  if (upper) {
    block(p, base, ground, 1);
    roof = block(upper, ground - parapet, top, 1);
  } else {
    roof = block(p, base, top, rows);
  }

  // On the roof: a chimney, the island's white one with a little cap; or a stair room on a
  // single-storey house; set in from a corner of the plan, and only where the roof is.
  const onRoof = upper ?? p;
  const extra = rand();
  if (extra < 0.45) {
    const [x, y] = f.at(f.s0 + Math.min(1.2, len * 0.2), f.t1 - Math.min(1, wide * 0.2));
    if (inside(onRoof, x, y)) {
      const h = 0.9 + rand() * 0.6;
      box(r, x, y, f.angle, 0.55, 0.55, roof, h, e);
      box(r, x, y, f.angle, 0.8, 0.8, roof + h, 0.1, e);
      box(r, x, y, f.angle, 0.3, 0.3, roof + h + 0.1, 0.25, e);
    }
  } else if (extra < 0.7 && !upper && b.height < BAY_H * 1.5 && len > 6 && wide > 5) {
    const [x, y] = f.at(f.s1 - 1.8, f.t0 + 1.6);
    if (inside(p, x, y)) box(r, x, y, f.angle, 2.4, 2.2, roof, 2.3, e);
  }
  return done();
}

/** A street lamp, arm along +X: a galvanised pole, the arm, and the lantern. */
function lampGeometry(): THREE.BufferGeometry {
  const pole = new THREE.CylinderGeometry(0.07, 0.11, 7, 8).translate(0, 3.5, 0);
  const arm = new THREE.BoxGeometry(1.6, 0.08, 0.08).translate(0.8, 6.9, 0);
  const head = new THREE.BoxGeometry(0.6, 0.14, 0.28).translate(1.55, 6.85, 0);
  return mergeGeometries([pole, arm, head].map((g) => g.toNonIndexed()));
}

/** A hito: white post, black band, amber reflector, coloured per vertex. */
function postGeometry(): THREE.BufferGeometry {
  const paint = (g: THREE.BufferGeometry, hex: number) => {
    const c = new THREE.Color(hex), n = g.attributes.position.count;
    g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => [c.r, c.g, c.b][i % 3]), 3));
    return g.toNonIndexed();
  };
  const white = paint(new THREE.CylinderGeometry(0.08, 0.09, 0.85, 8).translate(0, 0.425, 0), 0xf2f2ee);
  const band = paint(new THREE.CylinderGeometry(0.083, 0.083, 0.16, 8).translate(0, 0.72, 0), 0x151515);
  const eye = paint(new THREE.BoxGeometry(0.03, 0.07, 0.05).translate(0.085, 0.72, 0), 0xffa21a);
  return mergeGeometries([white, band, eye]);
}

export class TileDresser {
  private readonly walls: THREE.MeshStandardMaterial[];
  private readonly roofMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  private readonly lampMat = new THREE.MeshStandardMaterial({ color: 0x8f949a, roughness: 0.5, metalness: 0.6 });
  private readonly postMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  private readonly lampGeo = lampGeometry();
  private readonly postGeo = postGeometry();
  /** Per tile: its buildings and furniture (built once), and with the road surfaces (finest level). */
  private readonly cache = new Map<DetailTile, { objects: THREE.Group; full?: THREE.Group }>();

  constructor(private readonly terrain: Heightmap, private readonly roads: RoadView, private readonly tileM: number, anisotropy: number, private readonly style: BuildingStyle) {
    this.walls = WINDOWS.flatMap(({ style }) =>
      WOODWORK.map((wood) => new THREE.MeshStandardMaterial({ map: wallTexture(wood, style, anisotropy), vertexColors: true, roughness: 0.92 })),
    );
  }

  dress(tile: DetailTile, level: number): THREE.Object3D | null {
    if (!tile.objects) return null;
    let c = this.cache.get(tile);
    if (!c) this.cache.set(tile, (c = { objects: this.objects(tile.objects) }));
    if (level < 2) return c.objects;
    if (!c.full) {
      c.full = new THREE.Group();
      c.full.add(c.objects);
      const surfaces = this.roads.build(tile.col * this.tileM, tile.row * this.tileM, this.tileM);
      if (surfaces) c.full.add(surfaces);
    }
    return c.full;
  }

  free(tile: DetailTile): void {
    const c = this.cache.get(tile);
    if (!c) return;
    this.cache.delete(tile);
    (c.full ?? c.objects).traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
      else if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }

  private objects(o: TileObjects): THREE.Group {
    const group = new THREE.Group();
    const e = this.terrain.extent;
    const walls: THREE.BufferGeometry[][] = this.walls.map(() => []);
    const roofs: THREE.BufferGeometry[] = [];
    o.buildings.forEach((b, i) => {
      const k = (b.pts.length * 7 + i * 13) % walls.length; // a stable mix of window styles and woodwork
      const { walls: w, roof } = buildingGeometry(b, this.terrain, e, WINDOWS[Math.floor(k / WOODWORK.length)].bay, this.style);
      walls[k].push(w);
      roofs.push(roof);
    });
    const add = (parts: THREE.BufferGeometry[], material: THREE.Material) => {
      if (!parts.length) return;
      const mesh = new THREE.Mesh(mergeGeometries(parts), material);
      for (const p of parts) p.dispose();
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    };
    walls.forEach((parts, i) => add(parts, this.walls[i]));
    add(roofs, this.roofMat);

    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    const place = (geo: THREE.BufferGeometry, mat: THREE.Material, items: { x: number; y: number; heading?: number }[]) => {
      if (!items.length) return;
      const mesh = new THREE.InstancedMesh(geo, mat, items.length);
      items.forEach((it, k) => {
        q.setFromAxisAngle(up, Math.PI / 2 - (it.heading ?? 0)); // +X onto the compass heading
        m.compose(new THREE.Vector3(it.x - e / 2, this.terrain.heightAt(it.x, it.y), e / 2 - it.y), q, one);
        mesh.setMatrixAt(k, m);
      });
      mesh.castShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    };
    place(this.lampGeo, this.lampMat, o.lamps);
    place(this.postGeo, this.postMat, o.posts);
    return group;
  }
}
