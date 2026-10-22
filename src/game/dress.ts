// What stands on a detail tile once it is close: its buildings and street furniture (from
// objects/<col>_<row>.json, see src/sim/objects.ts) and, at the finest level, the road surfaces.
// Buildings follow the island's own rules: lime-white walls and flat roofs, the woodwork green,
// blue or brown. Each tile's buildings are merged into a few meshes (one per material), and the
// furniture is instanced, so a town costs a handful of draw calls.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { area, type Building } from '../sim/buildings';
import type { TileObjects } from '../sim/objects';
import type { Heightmap } from '../sim/terrain';
import type { RoadView } from './road-view';
import type { DetailTile } from './site';

/** One window bay of the wall texture: width and storey height (m). */
const BAY_W = 3.2;
const BAY_H = 3.2;
const WOODWORK = ['#2f6b4f', '#24527d', '#6e4a2c'];

/** Lime-washed wall with one window per bay: dark glass behind painted frame and shutters. */
function wallTexture(wood: string, anisotropy: number): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f3f1ea';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(120, 110, 95, ${Math.random() * 0.06})`;
    g.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  // The texture's top is the top of a storey (v runs down from the roofline).
  const wx = S * 0.36, ww = S * 0.28, wy = S * 0.28, wh = S * 0.4;
  g.fillStyle = wood;
  g.fillRect(wx - S * 0.1, wy - 2, S * 0.1, wh + 4); // shutters either side
  g.fillRect(wx + ww, wy - 2, S * 0.1, wh + 4);
  g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6); // frame
  g.fillStyle = '#1d2326';
  g.fillRect(wx, wy, ww, wh);
  g.fillStyle = wood;
  g.fillRect(wx + ww / 2 - 1.5, wy, 3, wh); // mullion
  g.fillStyle = 'rgba(0, 0, 0, 0.08)';
  g.fillRect(0, S - 6, S, 6); // a little grime at the floor line
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

/** Walls and flat roof of one building, seated on the lowest ground under it. */
function buildingGeometry(b: Building, terrain: Heightmap, e: number): { walls: THREE.BufferGeometry; roof: THREE.BufferGeometry } {
  const p = b.pts, n = p.length / 2;
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < n; i++) {
    const z = terrain.heightAt(p[2 * i], p[2 * i + 1]);
    low = Math.min(low, z);
    high = Math.max(high, z);
  }
  const base = low - 0.5;
  const top = high + b.height;
  // Walls face out whichever way the ring runs.
  const ccw = area(p) > 0;
  const pos: number[] = [], uv: number[] = [], nor: number[] = [];
  let run = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [ax, ay, bx, by] = ccw ? [p[2 * i], p[2 * i + 1], p[2 * j], p[2 * j + 1]] : [p[2 * j], p[2 * j + 1], p[2 * i], p[2 * i + 1]];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 0.05) continue;
    // Outward normal of an anticlockwise ring is to the right of the edge.
    const nx = (by - ay) / len, ny = -(bx - ax) / len;
    const u0 = run / BAY_W, u1 = (run + len) / BAY_W, vb = (top - base) / BAY_H;
    run += len;
    const A = [ax - e / 2, e / 2 - ay], B = [bx - e / 2, e / 2 - by];
    // Counter-clockwise seen from outside.
    pos.push(A[0], top, A[1], A[0], base, A[1], B[0], top, B[1], B[0], top, B[1], A[0], base, A[1], B[0], base, B[1]);
    uv.push(u0, 0, u0, vb, u1, 0, u1, 0, u0, vb, u1, vb);
    for (let k = 0; k < 6; k++) nor.push(nx, 0, -ny);
  }
  const walls = new THREE.BufferGeometry();
  walls.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  walls.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  walls.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));

  const contour = [];
  for (let i = 0; i < n; i++) contour.push(new THREE.Vector2(p[2 * i], p[2 * i + 1]));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const rpos: number[] = [];
  for (const [a, b2, c] of tris) {
    // Anticlockwise in the site frame (seen from above) is what faces up in three.js.
    const A = contour[a], B = contour[b2], C = contour[c];
    const order = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x) > 0 ? [A, B, C] : [A, C, B];
    for (const v of order) rpos.push(v.x - e / 2, top, e / 2 - v.y);
  }
  const roof = new THREE.BufferGeometry();
  roof.setAttribute('position', new THREE.Float32BufferAttribute(rpos, 3));
  roof.setAttribute('normal', new THREE.Float32BufferAttribute(rpos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  roof.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((rpos.length / 3) * 2).fill(0), 2));
  return { walls, roof };
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
  private readonly roofMat = new THREE.MeshStandardMaterial({ color: 0xe6e2d8, roughness: 0.95 });
  private readonly lampMat = new THREE.MeshStandardMaterial({ color: 0x8f949a, roughness: 0.5, metalness: 0.6 });
  private readonly postMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  private readonly lampGeo = lampGeometry();
  private readonly postGeo = postGeometry();
  /** Per tile: its buildings and furniture (built once), and with the road surfaces (finest level). */
  private readonly cache = new Map<DetailTile, { objects: THREE.Group; full?: THREE.Group }>();

  constructor(private readonly terrain: Heightmap, private readonly roads: RoadView, private readonly tileM: number, anisotropy: number) {
    this.walls = WOODWORK.map((wood) => new THREE.MeshStandardMaterial({ map: wallTexture(wood, anisotropy), roughness: 0.92 }));
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
      const { walls: w, roof } = buildingGeometry(b, this.terrain, e);
      walls[(b.pts.length * 7 + i) % walls.length].push(w); // a stable mix of woodwork colours
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
