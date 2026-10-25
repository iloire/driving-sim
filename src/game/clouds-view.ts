// The clouds, drawn: every puff of the field (src/sim/weather.ts) is a soft camera-facing disc in
// one instanced draw. Each disc is lit as a ball (bright towards the sun, grey underneath, a silver
// rim with the sun behind it), cut flat at its layer's base, and faded where the sky repeats and
// where the camera is about to go into it. The wind and the wrap-round happen in the shader. The
// puffs are sorted far to near a few times a second, so they blend in the right order.

import * as THREE from 'three';
import type { CloudField } from '../sim/weather';
import { wrapNear } from '../sim/weather';

const vertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
attribute vec4 aPuff;   // x, y, z, r (sim frame)
attribute vec4 aShape;  // from the cloud's middle: dx, dy, dz; seed
attribute vec2 aLayer;  // base, top
uniform vec2 uDrift;
uniform vec2 uCam;
uniform float uPeriod;
uniform float uHalf;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vFacing;
varying float vFade;
varying float vSeed;
varying vec2 vLayer;
void main() {
  vec2 p = aPuff.xy + uDrift;
  p = uCam + mod(p - uCam + 0.5 * uPeriod, uPeriod) - 0.5 * uPeriod;
  vec3 centre = vec3(p.x - uHalf, aPuff.z, uHalf - p.y);
  float r = aPuff.w;
  vec4 mvPosition = viewMatrix * vec4(centre, 1.0);
  float dist = length(mvPosition.xyz);
  vec2 corner = position.xy * 2.0;
  mvPosition.xy += corner * r;
  gl_Position = projectionMatrix * mvPosition;
  // The view's axes in the world, to light the disc as a ball and find each pixel's height.
  mat3 toWorld = transpose(mat3(viewMatrix));
  vWorld = centre + toWorld * vec3(corner * r, 0.0);
  vFacing = normalize(vec3(aShape.x, aShape.z + 0.25 * r, -aShape.y));
  vUv = corner;
  vSeed = aShape.w;
  vLayer = aLayer;
  float edge = length(p - uCam);
  vFade = smoothstep(0.3 * r, 1.4 * r, dist) * (1.0 - smoothstep(0.36 * uPeriod, 0.48 * uPeriod, edge));
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}`;

const fragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
uniform vec3 uSun;
uniform vec3 uLit;
uniform vec3 uShade;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vFacing;
varying float vFade;
varying float vSeed;
varying vec2 vLayer;
float cHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float cNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(cHash(i), cHash(i + vec2(1, 0)), u.x), mix(cHash(i + vec2(0, 1)), cHash(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  #include <logdepthbuf_fragment>
  float d = length(vUv);
  if (d > 1.0) discard;
  vec2 q = vUv * 2.2 + vSeed * 37.0;
  float n = cNoise(q) * 0.6 + cNoise(q * 2.3) * 0.4;
  float body = 1.0 - smoothstep(0.5, 1.0, d + 0.4 * (n - 0.5));
  float thick = max(vLayer.y - vLayer.x, 1.0);
  float cut = smoothstep(vLayer.x - 0.02 * thick - 10.0, vLayer.x + 0.1 * thick + 30.0, vWorld.y);
  float alpha = body * cut * vFade * 0.9;
  if (alpha < 0.01) discard;
  // As a ball: the disc's own bulge towards the camera, leaning the way its cloud faces.
  vec3 ball = transpose(mat3(viewMatrix)) * vec3(vUv, sqrt(max(1.0 - d * d, 0.0)));
  vec3 normal = normalize(mix(vFacing, ball, 0.5));
  float lit = clamp(dot(normal, uSun) * 0.5 + 0.5, 0.0, 1.0);
  float high = clamp((vWorld.y - vLayer.x) / thick, 0.0, 1.0);
  vec3 colour = mix(uShade, uLit, smoothstep(0.15, 0.95, lit * 0.55 + high * 0.55)) * (0.9 + 0.2 * n);
  // The sun behind the cloud lights its thin edges.
  vec3 look = normalize(vWorld - cameraPosition);
  colour += uLit * 0.5 * pow(max(dot(look, uSun), 0.0), 10.0) * (1.0 - body);
  gl_FragColor = vec4(colour, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** How often the puffs are re-sorted (s), and how far the camera may move before they must be (m). */
const SORT_EVERY = 0.25;
const SORT_MOVE = 150;

export class CloudsView {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private field: CloudField | null = null;
  private puff = new Float32Array(0);
  private shape = new Float32Array(0);
  private layer = new Float32Array(0);
  private order = new Uint32Array(0);
  private keys = new Float64Array(0);
  private sinceSort = Infinity;
  private readonly sortedAt = new THREE.Vector2(Infinity, Infinity);

  constructor(private readonly extent: number) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute('position', quad.getAttribute('position'));
    const material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader, transparent: true, depthWrite: false, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uDrift: { value: new THREE.Vector2() }, uCam: { value: new THREE.Vector2() },
        uPeriod: { value: 1 }, uHalf: { value: extent / 2 },
        uSun: { value: new THREE.Vector3(0, 1, 0) }, uLit: { value: new THREE.Color(1, 1, 1) }, uShade: { value: new THREE.Color(0.5, 0.5, 0.5) },
      }]),
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    // After the land and the roads, before the effects drawn over the car.
    this.mesh.renderOrder = 1;
    this.setField(null);
  }

  /** Shows these clouds (null: a clear sky). */
  setField(field: CloudField | null): void {
    this.field = field;
    const n = field?.puffs.length ?? 0;
    this.puff = new Float32Array(n * 4);
    this.shape = new Float32Array(n * 4);
    this.layer = new Float32Array(n * 2);
    this.order = new Uint32Array(n).map((_, i) => i);
    this.keys = new Float64Array(n);
    const g = this.mesh.geometry;
    g.setAttribute('aPuff', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aShape', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aLayer', new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = n;
    field?.puffs.forEach((p, i) => {
      this.puff.set([p.x, p.y, p.z, p.r], i * 4);
      this.shape.set([p.dx, p.dy, p.dz, p.seed], i * 4);
      this.layer.set([p.base, p.top], i * 2);
    });
    this.mesh.material.uniforms.uPeriod.value = field?.period ?? 1;
    this.mesh.visible = n > 0;
    this.sinceSort = Infinity;
  }

  /** The sun (scene axes, unit), and the colours of a cloud's lit side and its shaded underside. */
  setLight(sun: THREE.Vector3, lit: THREE.Color, shade: THREE.Color): void {
    const u = this.mesh.material.uniforms;
    u.uSun.value.copy(sun);
    u.uLit.value.copy(lit);
    u.uShade.value.copy(shade);
  }

  update(dt: number, camera: THREE.Camera): void {
    const f = this.field;
    if (!f) return;
    const h = this.extent / 2;
    const cx = camera.position.x + h, cy = h - camera.position.z;
    const u = this.mesh.material.uniforms;
    u.uDrift.value.set(f.drift[0], f.drift[1]);
    u.uCam.value.set(cx, cy);
    this.sinceSort += dt;
    if (this.sinceSort < SORT_EVERY && this.sortedAt.distanceTo(new THREE.Vector2(cx, cy)) < SORT_MOVE) return;
    this.sinceSort = 0;
    this.sortedAt.set(cx, cy);
    // Far to near, from where each puff is now.
    const cz = camera.position.y;
    for (let i = 0; i < this.keys.length; i++) {
      const x = wrapNear(this.puff[i * 4] + f.drift[0], cx, f.period), y = wrapNear(this.puff[i * 4 + 1] + f.drift[1], cy, f.period);
      this.keys[i] = (x - cx) ** 2 + (y - cy) ** 2 + (this.puff[i * 4 + 2] - cz) ** 2;
    }
    this.order.sort((a, b) => this.keys[b] - this.keys[a]);
    const g = this.mesh.geometry;
    const puff = g.getAttribute('aPuff') as THREE.InstancedBufferAttribute;
    const shape = g.getAttribute('aShape') as THREE.InstancedBufferAttribute;
    const layer = g.getAttribute('aLayer') as THREE.InstancedBufferAttribute;
    const pa = puff.array as Float32Array, sa = shape.array as Float32Array, la = layer.array as Float32Array;
    this.order.forEach((src, dst) => {
      pa.set(this.puff.subarray(src * 4, src * 4 + 4), dst * 4);
      sa.set(this.shape.subarray(src * 4, src * 4 + 4), dst * 4);
      la.set(this.layer.subarray(src * 2, src * 2 + 2), dst * 2);
    });
    puff.needsUpdate = shape.needsUpdate = layer.needsUpdate = true;
  }
}
