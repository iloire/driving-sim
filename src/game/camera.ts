// Three camera modes: chase (behind and above, swinging round after the car, the default),
// bonnet (on the nose, rolling and pitching with the body) and orbit (drag the mouse round the car).

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

  constructor(readonly camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    this.orbit = new OrbitControls(camera, dom);
    this.orbit.enabled = false;
    this.orbit.enableDamping = true;
    this.orbit.maxDistance = 400;
    this.orbit.minDistance = 3;
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
    if (this.mode === 'orbit') {
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
  }
}
