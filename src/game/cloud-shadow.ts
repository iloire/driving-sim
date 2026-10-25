// The clouds' shadows on the ground: one soft texture of the whole repeating sky, drawn from above
// along the sun's rays, and a few lines in each lit material that dim the sun's light (not the sky's)
// where it falls. The wind slides the texture with the clouds, so the shadows run over the hills.

import * as THREE from 'three';
import type { CloudField } from '../sim/weather';

const SIZE = 1024;

const canvas = document.createElement('canvas');
canvas.width = canvas.height = SIZE;
const texture = new THREE.CanvasTexture(canvas);
texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
texture.colorSpace = THREE.NoColorSpace;

/** Shared by every material that takes the shadows: set here, seen by all. */
const uniforms = {
  cloudShadowMap: { value: texture as THREE.Texture },
  /** The sky square's south-west corner (sim x, y), 1 / its side, and half the site's side. */
  cloudShadowFrame: { value: new THREE.Vector4(0, 0, 1, 0) },
  cloudShadowDrift: { value: new THREE.Vector2() },
  cloudShadowStrength: { value: 0 },
};

/** A soft disc, drawn once and stamped for every puff. */
const disc = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
})();

/**
 * Draws the shadows of `field` (null: none) for a sun along `sun` (sim frame, unit vector), the
 * ground taken to be `groundM` high. Redraw when the sun or the clouds change.
 */
export function drawCloudShadows(field: CloudField | null, extent: number, sun: readonly [number, number, number], groundM: number): void {
  const g = canvas.getContext('2d')!;
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.fillStyle = '#000';
  g.fillRect(0, 0, SIZE, SIZE);
  uniforms.cloudShadowFrame.value.set(field?.origin[0] ?? 0, field?.origin[1] ?? 0, 1 / (field?.period ?? 1), extent / 2);
  if (field && sun[2] > 0.02) {
    const k = SIZE / field.period;
    // Down the sun's rays to the ground, no further than a few kilometres at a low sun.
    const lean = Math.min(1 / Math.max(sun[2], 0.1), 6);
    g.globalAlpha = 0.6;
    for (const p of field.puffs) {
      const h = p.z - groundM;
      const sx = p.x - field.origin[0] - sun[0] * lean * h, sy = p.y - field.origin[1] - sun[1] * lean * h;
      const u = (((sx * k) % SIZE) + SIZE) % SIZE, v = SIZE - ((((sy * k) % SIZE) + SIZE) % SIZE);
      const d = 2.2 * p.r * k;
      // Near an edge, the copy on the other side too, so the texture tiles without a seam.
      for (const ox of [0, -SIZE, SIZE]) {
        for (const oy of [0, -SIZE, SIZE]) {
          const x = u + ox, y = v + oy;
          if (x + d / 2 < 0 || x - d / 2 > SIZE || y + d / 2 < 0 || y - d / 2 > SIZE) continue;
          g.drawImage(disc, x - d / 2, y - d / 2, d, d);
        }
      }
    }
  }
  texture.needsUpdate = true;
}

/** How dark the shadows are (0 none … 1 black) and how far the wind has carried them. */
export function setCloudShadows(strength: number, drift: readonly [number, number]): void {
  uniforms.cloudShadowStrength.value = strength;
  uniforms.cloudShadowDrift.value.set(drift[0], drift[1]);
}

const LIGHTS = THREE.ShaderChunk.lights_fragment_begin.replace(
  'getDirectionalLightInfo( directionalLight, directLight );',
  'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= cloudSun;',
);

const shaded = new WeakSet<THREE.Material>();

/** Makes a lit material take the cloud shadows, on top of whatever it already does to its shader (once, however often it's asked). */
export function shadeByClouds<M extends THREE.Material>(material: M): M {
  if (shaded.has(material)) return material;
  shaded.add(material);
  const before = material.onBeforeCompile.bind(material);
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => `${key}+clouds`;
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCloudWorld;')
      .replace('#include <project_vertex>', `#include <project_vertex>
vec4 cloudWorld = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
cloudWorld = instanceMatrix * cloudWorld;
#endif
vCloudWorld = (modelMatrix * cloudWorld).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vCloudWorld;
uniform sampler2D cloudShadowMap;
uniform vec4 cloudShadowFrame;
uniform vec2 cloudShadowDrift;
uniform float cloudShadowStrength;`)
      .replace('#include <lights_fragment_begin>', `
vec2 cloudSite = vec2(vCloudWorld.x + cloudShadowFrame.w, cloudShadowFrame.w - vCloudWorld.z);
float cloudSun = 1.0 - cloudShadowStrength * texture2D(cloudShadowMap, (cloudSite - cloudShadowDrift - cloudShadowFrame.xy) * cloudShadowFrame.z).r;
${LIGHTS}`);
  };
  return material;
}
