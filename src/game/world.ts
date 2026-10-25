// Scene dressing: the sea, the sky and the sun (the terrain itself is in terrain-view.ts). Sim frame (x east, y north, z up) maps to
// three.js as X = x − e/2, Y = z, Z = e/2 − y, so the site is centred on the origin.

import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { shadeByClouds } from './cloud-shadow';

export function toScene(extent: number, x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(x - extent / 2, z, extent / 2 - y);
}

/**
 * What surrounds the site out to the horizon: sea at 0 m under everything (an island has
 * water inside its bbox too), or dry farmland at `plainM` with a hole for the site, so a
 * valley floor below the plain's height is never covered.
 */
export function createSurround(extent: number, plainM?: number): THREE.Mesh {
  // Out past the horizon even from Starship's 100 km (about 1,100 km away).
  const R = 1.2e6;
  let geometry: THREE.BufferGeometry;
  if (plainM === undefined) {
    geometry = new THREE.PlaneGeometry(2 * R, 2 * R);
  } else {
    const shape = new THREE.Shape([new THREE.Vector2(-R, -R), new THREE.Vector2(R, -R), new THREE.Vector2(R, R), new THREE.Vector2(-R, R)]);
    const e = extent / 2;
    shape.holes.push(new THREE.Path([new THREE.Vector2(-e, -e), new THREE.Vector2(-e, e), new THREE.Vector2(e, e), new THREE.Vector2(e, -e)]));
    geometry = new THREE.ShapeGeometry(shape);
  }
  geometry.rotateX(-Math.PI / 2);
  const material = plainM === undefined
    ? new THREE.MeshStandardMaterial({ color: 0x0a2a3d, roughness: 0.32, metalness: 0 })
    : new THREE.MeshStandardMaterial({ color: 0x8c7a5c, roughness: 1, metalness: 0 });
  const surround = new THREE.Mesh(geometry, shadeByClouds(material));
  // A plain sits a metre low so the terrain's faded edge meets it without z-fighting.
  surround.position.y = plainM === undefined ? 0 : plainM - 1;
  return surround;
}

const DAY_LIGHT = new THREE.Color(0xfff1dc);
const LOW_SUN_LIGHT = new THREE.Color(0xffb27a);
const HORIZON_LIGHT = new THREE.Color(0xff8a50);
const DAY_FOG = new THREE.Color(0xbfd3e0);
const LOW_SUN_FOG = new THREE.Color(0xd8a184);
const NIGHT_FOG = new THREE.Color(0x1b2130);

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

/** Fog density at low level (FogExp2). */
const HAZE = 0.000032;
/** The least haze seen from the edge of space, so the sea fades out well before its edge. */
const FAR_HAZE = 3e-6;
/** Deep in a cloud: about 150 m to see by. */
const CLOUD_FOG = 0.012;

/** What the weather does to the light: the sun's strength, and the haze's thickness and colour (calima). */
export interface SkyWeather {
  light: number;
  haze: number;
  hazeColor: THREE.Color | null;
}

export const CLEAR_SKY: SkyWeather = { light: 1, haze: 1, hazeColor: null };


/**
 * The sky, the sun's light, the fog and the ambient light, all set from where the sun is.
 * Near the horizon the sky shader's own scattering turns it orange; the light, fog and exposure
 * follow so the scene reads as one sunset. The light casts shadows in a small box that follows
 * the car, so the car sits on the ground.
 */
export class Sunlight {
  private readonly sky = new Sky();
  private readonly envSky = new Sky();
  private readonly envScene = new THREE.Scene();
  private readonly pmrem: THREE.PMREMGenerator;
  private readonly light = new THREE.DirectionalLight(0xffffff, 3.2);
  private readonly fog = new THREE.FogExp2(0xbfd3e0, HAZE);
  private env: THREE.WebGLRenderTarget | null = null;
  /** Unit vector towards the light, in scene axes. */
  readonly toLight = new THREE.Vector3(0, 1, 0);
  /** A cloud's sunlit side and its shaded underside, for this sun. */
  readonly cloudLit = new THREE.Color();
  readonly cloudShade = new THREE.Color();
  /** 0..1: how far into daylight it is (for the cloud shadows). */
  daylight = 1;
  private weather = CLEAR_SKY;
  private readonly clearFog = new THREE.Color();
  /** The fog's colour as three hands it to the shaders (in the output's colour space), for the sky. */
  private readonly skyTint = new THREE.Color();

  constructor(private readonly scene: THREE.Scene, private readonly renderer: THREE.WebGLRenderer) {
    this.sky.scale.setScalar(450000);
    // Thick haze (calima) veils the low sky too: towards the horizon it fades to the fog's colour,
    // mixed where three mixes its fog, so land and sky meet in the same dust without a line.
    const m = this.sky.material;
    m.uniforms.hazeAmount = { value: 0 };
    m.uniforms.hazeTint = { value: this.skyTint };
    // High up the air above runs out and the sky goes black, from the zenith down towards the horizon's thin blue line.
    m.uniforms.space = { value: 0 };
    m.fragmentShader = m.fragmentShader
      .replace('void main() {', 'uniform float hazeAmount;\nuniform vec3 hazeTint;\nuniform float space;\nvoid main() {')
      .replace('#include <colorspace_fragment>', `#include <colorspace_fragment>
gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeTint, hazeAmount * (1.0 - smoothstep(-0.1, 0.6, direction.y)));
gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.004, 0.006, 0.016), space * smoothstep(-0.2, 0.3, direction.y));`);
    this.envSky.scale.setScalar(450000);
    // The environment shares the sky's uniforms, so reflections and ambient light match it.
    this.envSky.material = this.sky.material;
    this.envScene.add(this.envSky);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(2048, 2048);
    const cam = this.light.shadow.camera;
    cam.left = cam.bottom = -40;
    cam.right = cam.top = 40;
    cam.near = 1;
    cam.far = 800;
    this.light.shadow.bias = -0.0005;
    this.light.shadow.normalBias = 0.05;
    scene.add(this.sky, this.light, this.light.target);
    scene.fog = this.fog;
  }

  /** Sun as a sim-frame unit vector (east, north, up) and its elevation in degrees. */
  set(dir: [number, number, number], elevationDeg: number, weather = this.weather): void {
    this.weather = weather;
    const low = 1 - smoothstep(0, 22, elevationDeg); // 0 high sun … 1 on the horizon
    const day = smoothstep(-5, 1, elevationDeg); // 0 dusk … 1 sun up
    this.daylight = day;
    const u = this.sky.material.uniforms;
    u.turbidity.value = 5 + 7 * low;
    u.hazeAmount.value = Math.min(Math.max(weather.haze - 1, 0) * 0.6, 0.8);
    u.rayleigh.value = 1.4 + 3 * low;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.8 + 0.1 * low;
    u.sunPosition.value.set(dir[0], dir[2], -dir[1]);

    // The light keeps a grazing angle even once the disc is down, so the terrain isn't lit from below.
    const lift = Math.max(elevationDeg, 2) * Math.PI / 180;
    const flat = Math.hypot(dir[0], dir[1]) || 1;
    this.toLight.set((dir[0] / flat) * Math.cos(lift), Math.sin(lift), (-dir[1] / flat) * Math.cos(lift));
    this.light.color.copy(DAY_LIGHT).lerp(LOW_SUN_LIGHT, low ** 1.5).lerp(HORIZON_LIGHT, 1 - smoothstep(0, 4, elevationDeg));
    this.light.intensity = 3.2 * (0.55 + 0.45 * smoothstep(2, 25, elevationDeg)) * day * weather.light;

    this.clearFog.copy(weather.hazeColor ?? DAY_FOG).lerp(LOW_SUN_FOG, low ** 2).lerp(NIGHT_FOG, 1 - day);
    this.fog.color.copy(this.clearFog);
    // Clouds take the sun's colour on top and the sky's underneath, darkening with it at dusk.
    // (Bright: the exposure is low, so white has to be well over 1 here.)
    this.cloudLit.copy(this.light.color).multiplyScalar(0.95 * this.light.intensity).add(new THREE.Color(0.3, 0.33, 0.38).multiplyScalar(day));
    this.cloudShade.copy(DAY_FOG).lerp(NIGHT_FOG, 1 - day).multiplyScalar(0.95 + 0.2 * weather.light);
    this.renderer.toneMappingExposure = 0.5 + 0.15 * low;

    this.env?.dispose();
    this.env = this.pmrem.fromScene(this.envScene);
    this.scene.environment = this.env.texture;
    this.scene.environmentIntensity = 0.3 + 0.3 * low;
  }

  /**
   * Thins the haze for a camera `height` metres above the sea: the haze lies in the low air, so
   * from high up the view down through it is clearer. Unchanged below 1,000 m. Above 15 km the sky
   * darkens to black by 70 km (Starship). `inCloud` (0..1) is how deep the camera is in a cloud.
   */
  setViewHeight(height: number, inCloud = 0): void {
    this.sky.material.uniforms.space.value = smoothstep(15e3, 70e3, height);
    // From very high the far sea would end in an edge; a thin haze over hundreds of kilometres hides it in the horizon's glow.
    const clear = Math.max(HAZE * this.weather.haze * Math.min(1, 1500 / (Math.max(height, 0) + 500)), FAR_HAZE * smoothstep(5e3, 40e3, height));
    // In a cloud the haze closes in to a grey-white wall, lit like the cloud around the camera.
    this.fog.density = clear + (CLOUD_FOG - clear) * inCloud * inCloud;
    const k = Math.min(inCloud * 1.5, 1);
    this.fog.color.copy(this.clearFog).lerp(this.cloudShade, k * 0.65).lerp(this.cloudLit, k * 0.3);
    this.fog.color.getRGB(this.skyTint, THREE.SRGBColorSpace);
  }

  /** Keeps the shadow box centred on a scene point (the car). */
  follow(p: THREE.Vector3): void {
    this.light.target.position.copy(p);
    this.light.position.copy(p).addScaledVector(this.toLight, 400);
  }
}
