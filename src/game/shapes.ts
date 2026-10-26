// Shape helpers shared by the models: bodies drawn as extruded side profiles, boxes and painted parts
// ready to merge.

import * as THREE from 'three';

/**
 * A side profile (x forward, y up) extruded `width` across, centred. `taper` narrows it with
 * height (a share of the width per metre up from y = 0), the tumblehome that stops it reading as a box.
 */
export function slab(profile: [number, number][], width: number, bevel: number, taper = 0): THREE.BufferGeometry {
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
export function box(sx: number, sy: number, sz: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z).toNonIndexed();
}

/** One colour on every vertex, the UVs dropped and the faces unshared: ready to merge with other painted parts. */
export function paint(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex), n = g.attributes.position.count;
  g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => [c.r, c.g, c.b][i % 3]), 3));
  g.deleteAttribute('uv');
  return g.index ? g.toNonIndexed() : g;
}
