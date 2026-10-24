// Three camera modes: chase (behind and above, swinging round after the car, the default),
// bonnet (on the nose, rolling and pitching with the body) and orbit (drag the mouse round the car).
// Behind the welcome screen it circles the car slowly instead, and sweeps into the mode on leaving.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type CameraMode = 'chase' | 'bonnet' | 'orbit';
const MODES: CameraMode[] = ['chase', 'bonnet', 'orbit'];

const CHASE_BACK = 7.8;
const CHASE_UP = 2.8;
/** With the wings out the chase camera drops further back, to see the whole span. */
const FLY_BACK = 18;
const FLY_UP = 4.5;
/** Field of view at rest and at full turbo: widening it sells the speed. */
const FOV = 60;
const BOOST_FOV = 80;
/**
 * The menu's circle round the car: metres out and up (more with wings out, to fit the span),
 * radians per second, and how far the car may jump before the circle cuts there instead of gliding.
 */
const SHOWCASE = { radius: 10, wideRadius: 22, height: 2.6, wideHeight: 6, rate: 0.12, cutAt: 300 };
/** Seconds to sweep between the showcase and a driving camera. */
const BLEND_S = 1.4;

export class CameraRig {
  mode: CameraMode = 'chase';
  private readonly orbit: OrbitControls;
  private readonly lastTarget = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  /** The chase camera's own heading, lagging the car's so turns read. */
  private heading = 0;
  /** 0 car … 1 plane (more for a longer one): how far back the chase camera sits. */
  private wings = 0;
  /** 0 … 1, easing in and out with the turbo. */
  private boost = 0;
  private showing = false;
  private readonly center = new THREE.Vector3();
  private angle = 0;
  /** While blending, the camera shows a mix of `from` and the pose its mode wants (`true*`). */
  private blend = 0;
  private readonly fromPos = new THREE.Vector3();
  private readonly fromQuat = new THREE.Quaternion();
  private readonly truePos = new THREE.Vector3();
  private readonly trueQuat = new THREE.Quaternion();

  constructor(readonly camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    this.orbit = new OrbitControls(camera, dom);
    this.orbit.enabled = false;
    this.orbit.enableDamping = true;
    this.orbit.maxDistance = 400;
    this.orbit.minDistance = 3;
  }

  /**
   * Circles the car for the welcome screen, easing out from wherever the camera is. It starts
   * ahead of the car and off to one side, so the first view is of its face and the road behind.
   */
  showcase(): void {
    this.showing = true;
    this.orbit.enabled = false;
    this.center.copy(this.lastTarget);
    this.angle = Math.atan2(Math.sin(this.heading), -Math.cos(this.heading)) + 0.7;
    this.startBlend();
  }

  /** Leaves the showcase for the current mode, sweeping in over BLEND_S. */
  drive(): void {
    if (!this.showing) return;
    this.showing = false;
    this.startBlend();
    this.orbit.enabled = this.mode === 'orbit';
    if (this.mode === 'orbit') {
      this.chaseTarget(this.lastTarget);
      this.camera.position.copy(this.desired);
      this.orbit.target.copy(this.lastTarget);
      this.orbit.update();
      this.truePos.copy(this.camera.position);
      this.trueQuat.copy(this.camera.quaternion);
    }
  }

  private startBlend(): void {
    this.fromPos.copy(this.camera.position);
    this.fromQuat.copy(this.camera.quaternion);
    this.truePos.copy(this.fromPos);
    this.trueQuat.copy(this.fromQuat);
    this.blend = BLEND_S;
  }

  next(): CameraMode {
    this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    this.orbit.enabled = this.mode === 'orbit';
    this.camera.up.set(0, 1, 0);
    if (this.mode === 'orbit') {
      // Start from where the chase camera would be, not from the bonnet.
      this.chaseTarget(this.lastTarget);
      this.camera.position.copy(this.desired);
      this.orbit.target.copy(this.lastTarget);
      this.orbit.update();
    }
    return this.mode;
  }

  /** Jump straight behind the car (after a reset) instead of swinging there. */
  snap(car: THREE.Object3D, heading: number): void {
    this.heading = heading;
    this.lastTarget.copy(car.position);
    if (this.showing) {
      // A new place across the island: cut there rather than sweep over the mountains.
      if (this.center.distanceTo(car.position) > SHOWCASE.cutAt) this.center.copy(car.position);
      return;
    }
    this.chaseTarget(car.position);
    this.camera.position.copy(this.desired);
    this.camera.lookAt(this.look);
    if (this.mode === 'orbit') {
      this.orbit.target.copy(car.position);
      this.orbit.update();
    }
  }

  private chaseTarget(p: THREE.Vector3): void {
    const fx = Math.sin(this.heading), fz = -Math.cos(this.heading);
    const back = CHASE_BACK + (FLY_BACK - CHASE_BACK) * this.wings, up = CHASE_UP + (FLY_UP - CHASE_UP) * this.wings;
    this.desired.set(p.x - fx * back, p.y + up, p.z - fz * back);
    this.look.set(p.x + fx * 4, p.y + 0.9, p.z + fz * 4);
  }

  /** `heading`: compass heading to follow (the car's, or its travel when sliding); `groundY` under the camera. */
  update(dt: number, car: THREE.Object3D, heading: number, groundAt: (p: THREE.Vector3) => number, wings = 0, boosting = false): void {
    const cam = this.camera;
    this.wings = wings;
    this.boost += ((boosting ? 1 : 0) - this.boost) * (1 - Math.exp(-dt * (boosting ? 3 : 1.5)));
    const fov = FOV + (BOOST_FOV - FOV) * this.boost;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    if (this.blend > 0) {
      cam.position.copy(this.truePos);
      cam.quaternion.copy(this.trueQuat);
    }
    if (this.showing) {
      this.center.lerp(car.position, 1 - Math.exp(-dt * 2));
      this.angle += SHOWCASE.rate * dt;
      const r = SHOWCASE.radius + SHOWCASE.wideRadius * wings, h = SHOWCASE.height + SHOWCASE.wideHeight * wings;
      cam.position.set(this.center.x + Math.sin(this.angle) * r, this.center.y + h, this.center.z + Math.cos(this.angle) * r);
      cam.position.y = Math.max(cam.position.y, groundAt(cam.position) + 1.2);
      cam.up.set(0, 1, 0);
      cam.lookAt(this.center.x, this.center.y + 0.5, this.center.z);
    } else if (this.mode === 'orbit') {
      cam.position.add(new THREE.Vector3().subVectors(car.position, this.lastTarget));
      this.orbit.target.copy(car.position);
      this.orbit.update();
    } else if (this.mode === 'chase') {
      let d = heading - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * (1 - Math.exp(-dt * 4));
      this.chaseTarget(car.position);
      cam.position.lerp(this.desired, 1 - Math.exp(-dt * 10));
      // A little shake on the turbo.
      const shake = 0.06 * this.boost;
      cam.position.x += (Math.random() - 0.5) * shake;
      cam.position.y += (Math.random() - 0.5) * shake;
      cam.position.y = Math.max(cam.position.y, groundAt(cam.position) + 0.8);
      cam.up.set(0, 1, 0);
      cam.lookAt(this.look);
    } else {
      // On the bonnet, looking down the road, moving with the body.
      cam.position.copy(new THREE.Vector3(1.3, 0.95, 0).applyQuaternion(car.quaternion).add(car.position));
      cam.quaternion.copy(car.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2));
    }
    this.lastTarget.copy(car.position);
    if (this.blend > 0) {
      this.truePos.copy(cam.position);
      this.trueQuat.copy(cam.quaternion);
      this.blend = Math.max(0, this.blend - dt);
      const t = THREE.MathUtils.smootherstep(1 - this.blend / BLEND_S, 0, 1);
      cam.position.lerpVectors(this.fromPos, this.truePos, t);
      cam.quaternion.slerpQuaternions(this.fromQuat, this.trueQuat, t);
    }
  }
}
