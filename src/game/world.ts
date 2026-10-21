// Scene dressing: the sea, the sky and the sun (the terrain itself is in terrain-view.ts). Sim frame (x east, y north, z up) maps to
// three.js as X = x − e/2, Y = z, Z = e/2 − y, so the site is centred on the origin.

import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export function toScene(extent: number, x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(x - extent / 2, z, extent / 2 - y);
}

/**
 * What surrounds the site out to the horizon: sea at 0 m under everything (an island has
 * water inside its bbox too), or dry farmland at `plainM` with a hole for the site, so a
 * valley floor below the plain's height is never covered.
 */
export function createSurround(extent: number, plainM?: number): THREE.Mesh {
  const R = 200000;
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
  const surround = new THREE.Mesh(geometry, material);
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
  private readonly fog = new THREE.FogExp2(0xbfd3e0, 0.000032);
  private env: THREE.WebGLRenderTarget | null = null;
  /** Unit vector towards the light, in scene axes. */
  private readonly toLight = new THREE.Vector3(0, 1, 0);

  constructor(private readonly scene: THREE.Scene, private readonly renderer: THREE.WebGLRenderer) {
    this.sky.scale.setScalar(450000);
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
  set(dir: [number, number, number], elevationDeg: number): void {
    const low = 1 - smoothstep(0, 22, elevationDeg); // 0 high sun … 1 on the horizon
    const day = smoothstep(-5, 1, elevationDeg); // 0 dusk … 1 sun up
    const u = this.sky.material.uniforms;
    u.turbidity.value = 5 + 7 * low;
    u.rayleigh.value = 1.4 + 3 * low;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.8 + 0.1 * low;
    u.sunPosition.value.set(dir[0], dir[2], -dir[1]);

    // The light keeps a grazing angle even once the disc is down, so the terrain isn't lit from below.
    const lift = Math.max(elevationDeg, 2) * Math.PI / 180;
    const flat = Math.hypot(dir[0], dir[1]) || 1;
    this.toLight.set((dir[0] / flat) * Math.cos(lift), Math.sin(lift), (-dir[1] / flat) * Math.cos(lift));
    this.light.color.copy(DAY_LIGHT).lerp(LOW_SUN_LIGHT, low ** 1.5).lerp(HORIZON_LIGHT, 1 - smoothstep(0, 4, elevationDeg));
    this.light.intensity = 3.2 * (0.55 + 0.45 * smoothstep(2, 25, elevationDeg)) * day;

    this.fog.color.copy(DAY_FOG).lerp(LOW_SUN_FOG, low ** 2).lerp(NIGHT_FOG, 1 - day);
    this.renderer.toneMappingExposure = 0.5 + 0.15 * low;

    this.env?.dispose();
    this.env = this.pmrem.fromScene(this.envScene);
    this.scene.environment = this.env.texture;
    this.scene.environmentIntensity = 0.3 + 0.3 * low;
  }

  /** Keeps the shadow box centred on a scene point (the car). */
  follow(p: THREE.Vector3): void {
    this.light.target.position.copy(p);
    this.light.position.copy(p).addScaledVector(this.toLight, 400);
  }
}
