// Road surfaces: an asphalt ribbon laid on each paved road's carved strip, built per terrain chunk
// once that chunk is at its finest level (see terrain-view.ts). Main roads get Spanish markings
// (solid white edges, a dashed centre line); minor roads are bare, worn tarmac. Tracks are left to
// the photo: the ribbon would only hide the real dirt.

import * as THREE from 'three';
import { isPaved, resample, ROAD_WIDTH, type Road, type RoadKind } from '../sim/roads';
import type { Heightmap } from '../sim/terrain';
import { shadeByClouds } from './cloud-shadow';

/** Metres of road one repeat of the texture covers (one dash and its gap). */
const REPEAT_M = 12;
const LIFT = 0.06;
const MARKED: RoadKind[] = ['highway', 'primary', 'secondary', 'tertiary', 'runway'];

function asphalt(marked: boolean, anisotropy: number): THREE.CanvasTexture {
  const w = 128, h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  const img = g.createImageData(w, h);
  // Aggregate speckle, a darker band where the wheels run, and soft crumbling edges.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const track = Math.exp(-(((u - 0.3) / 0.08) ** 2)) + Math.exp(-(((u - 0.7) / 0.08) ** 2));
      const v = (marked ? 62 : 74) + (Math.random() - 0.5) * 26 - track * 8;
      const edge = Math.min(u, 1 - u);
      const k = (y * w + x) * 4;
      img.data[k] = v;
      img.data[k + 1] = v;
      img.data[k + 2] = v + 2;
      img.data[k + 3] = Math.round(255 * Math.min(edge / 0.06, 1) * (marked ? 1 : 0.92));
    }
  }
  g.putImageData(img, 0, 0);
  if (marked) {
    g.fillStyle = 'rgba(236, 236, 228, 0.92)';
    g.fillRect(w * 0.07, 0, w * 0.035, h); // edge lines
    g.fillRect(w * (1 - 0.105), 0, w * 0.035, h);
    g.fillRect(w * 0.4825, 0, w * 0.035, h * 0.38); // centre dash: 4.5 m on, 7.5 m off
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

interface Prepared {
  kind: RoadKind;
  pts: number[];
  /** Distance along the road at each point (m). */
  along: number[];
  bbox: [number, number, number, number];
}

export class RoadView {
  private readonly roads: Prepared[];
  private readonly materials: Record<'marked' | 'plain', THREE.MeshStandardMaterial>;

  constructor(roads: Road[], private readonly terrain: Heightmap, anisotropy: number) {
    this.roads = roads.filter((r) => isPaved(r.kind)).map((r) => {
      const pts = resample(r.pts, 4);
      const along = [0];
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < pts.length; i += 2) {
        if (i) along.push(along[along.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]));
        x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]);
        y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]);
      }
      return { kind: r.kind, pts, along, bbox: [x0, y0, x1, y1] };
    });
    const material = (marked: boolean) => shadeByClouds(new THREE.MeshStandardMaterial({
      map: asphalt(marked, anisotropy), roughness: 0.86, metalness: 0, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    }));
    this.materials = { marked: material(true), plain: material(false) };
  }

  /** The ribbons over one square of the site, or null when no paved road crosses it. */
  build(x0: number, y0: number, size: number): THREE.Object3D | null {
    const e = this.terrain.extent;
    const parts = { marked: new Builder(), plain: new Builder() };
    for (const road of this.roads) {
      const [bx0, by0, bx1, by1] = road.bbox;
      if (bx1 < x0 || by1 < y0 || bx0 > x0 + size || by0 > y0 + size) continue;
      const half = ROAD_WIDTH[road.kind] / 2;
      const out = parts[MARKED.includes(road.kind) ? 'marked' : 'plain'];
      const p = road.pts, n = p.length / 2;
      let open = false;
      for (let i = 0; i < n; i++) {
        // A segment belongs to the chunk holding its start, so neighbouring chunks never double up.
        const x = p[2 * i], y = p[2 * i + 1];
        const inside = x >= x0 && x < x0 + size && y >= y0 && y < y0 + size;
        const prevInside = i > 0 && open;
        if (!inside && !prevInside) { open = false; continue; }
        const a = Math.max(i - 1, 0), b = Math.min(i + 1, n - 1);
        const dx = p[2 * b] - p[2 * a], dy = p[2 * b + 1] - p[2 * a + 1];
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len; // to the left
        const v = road.along[i] / REPEAT_M;
        const lx = x + nx * half, ly = y + ny * half, rx = x - nx * half, ry = y - ny * half;
        out.vertex(lx - e / 2, this.terrain.heightAt(lx, ly) + LIFT, e / 2 - ly, 0, v);
        out.vertex(rx - e / 2, this.terrain.heightAt(rx, ry) + LIFT, e / 2 - ry, 1, v);
        if (open) out.quad();
        open = inside;
      }
    }
    const group = new THREE.Group();
    for (const key of ['marked', 'plain'] as const) {
      const geometry = parts[key].geometry();
      if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, this.materials[key]);
      mesh.receiveShadow = true;
      mesh.renderOrder = 1;
      group.add(mesh);
    }
    return group.children.length ? group : null;
  }
}

/** Accumulates a triangle strip as pairs of (left, right) vertices. */
class Builder {
  private pos: number[] = [];
  private uv: number[] = [];
  private index: number[] = [];

  vertex(x: number, y: number, z: number, u: number, v: number): void {
    this.pos.push(x, y, z);
    this.uv.push(u, v);
  }

  /** Joins the last two vertex pairs. */
  quad(): void {
    const k = this.pos.length / 3 - 4;
    this.index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }

  geometry(): THREE.BufferGeometry | null {
    if (!this.index.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.index);
    g.computeVertexNormals();
    return g;
  }
}
