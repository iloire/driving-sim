// Waves on the sea: the surface stays a flat plane, but a few lines in its material tilt the normal
// with a sum of travelling waves, so the sky's reflection and the sun's glitter move like water.
// The weather's wind sets which way they run and how rough they are; a calm day still has some
// Atlantic swell. Each wave fades out where it gets smaller than a pixel, and the roughness rises
// there instead, so the far sea doesn't shimmer and the sun's path on it widens with the chop.

import * as THREE from 'three';

/** One wave: off the wind by this much (rad), its length (m) and its steepness (peak slope). */
const WAVES: readonly [number, number, number][] = [
  [0, 60, 0.04],
  [0.35, 37, 0.05],
  [-0.45, 23, 0.06],
  [0.8, 14, 0.06],
  [-1.0, 8.7, 0.06],
  [0.15, 5.4, 0.05],
  [1.2, 3.3, 0.05],
  [-0.6, 2.1, 0.04],
  [0.55, 1.3, 0.035],
  [-1.3, 0.8, 0.03],
];

const G = 9.81;
/** The swell on a still day, as a share of a windy one's roughness. */
const CALM = 0.3;
/** Wind (m/s) at which the sea is as rough as it gets here. */
const ROUGH_WIND = 10;

/** How rough the sea is (CALM … 1) for a wind of [east, north] m/s. */
export function roughness(wind: readonly [number, number]): number {
  return CALM + (1 - CALM) * Math.min(Math.hypot(wind[0], wind[1]) / ROUGH_WIND, 1);
}

/**
 * The waves for a wind, in scene axes (X east, Z south): for each, its wavenumber vector along
 * the way it runs (downwind, give or take its spread), its angular frequency in deep water and its
 * slope. With no wind the swell comes from the north-west.
 */
export function waves(wind: readonly [number, number]): THREE.Vector4[] {
  const calm = Math.hypot(wind[0], wind[1]) < 0.1;
  const heading = calm ? Math.atan2(-1, 1) : Math.atan2(wind[1], wind[0]);
  const rough = roughness(wind);
  return WAVES.map(([off, length, slope]) => {
    const k = (2 * Math.PI) / length, a = heading + off;
    return new THREE.Vector4(k * Math.cos(a), -k * Math.sin(a), Math.sqrt(G * k), slope * rough);
  });
}

const uniforms = {
  seaWaves: { value: waves([0, 0]) },
  seaTime: { value: 0 },
};

/** Sets the waves for the weather's wind, [east, north] m/s. */
export function setSeaWind(wind: readonly [number, number]): void {
  uniforms.seaWaves.value = waves(wind);
}

/** Moves the waves on by `dt` seconds. */
export function stepSea(dt: number): void {
  // Wrapped well past the longest wave's period, before float precision blurs the phase.
  uniforms.seaTime.value = (uniforms.seaTime.value + dt) % 3600;
}

/** Makes `material` (a flat, level sea) carry the waves. Call before shadeByClouds, which builds on it. */
export function waveSea(material: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  material.customProgramCacheKey = () => 'sea';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSea;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvSea = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vSea;
uniform vec4 seaWaves[${WAVES.length}];
uniform float seaTime;
float seaHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float seaNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(seaHash(i), seaHash(i + vec2(1, 0)), u.x), mix(seaHash(i + vec2(0, 1)), seaHash(i + vec2(1, 1)), u.x), u.y);
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
// The slope of the summed waves, each faded as it shrinks towards a pixel; what fades roughens.
// Each wave comes in groups (its height swells and dies over a few of its lengths) and the crests
// bend a little, so the sea doesn't read as ruled lines.
vec2 seaSlope = vec2(0.0);
float seaLost = 0.0;
float seaPx = length(fwidth(vSea.xz));
for (int i = 0; i < ${WAVES.length}; i++) {
  vec4 w = seaWaves[i];
  float len = 6.2832 / length(w.xy);
  float shown = 1.0 - smoothstep(len * 0.12, len * 0.5, seaPx);
  vec2 at = vSea.xz / (len * 3.0) + float(i) * 7.3;
  float group = 0.25 + 1.5 * seaNoise(at - w.xy / length(w.xy) * seaTime * w.z / length(w.xy) / (len * 6.0));
  float bend = 3.0 * seaNoise(at * 0.7 + 3.1);
  seaSlope += w.xy / length(w.xy) * w.w * shown * group * cos(dot(w.xy, vSea.xz) - w.z * seaTime + float(i) * 2.4 + bend);
  seaLost += w.w * (1.0 - shown);
}
roughnessFactor = min(roughnessFactor + 0.8 * seaLost, 0.6);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize((viewMatrix * vec4(-seaSlope.x, 1.0, -seaSlope.y, 0.0)).xyz);`);
  };
  return material;
}
