// Keyboard + gamepad + touch → Controls. Keys are digital, so steering and pedals ramp towards
// their targets instead of snapping; the pad's stick and triggers are analog and used as they are.
// The same keys fly the plane: W/S push and pull the stick, A/D roll, Q/E rudder; the jet sits at
// cruise thrust, Ctrl for idle. Hovering on thrusters, W/S tilt, A/D turn, Space climbs and Ctrl
// sinks. Shift is the turbo every way: nitro on the road, afterburner or tail thrusters in the air.

import type { Controls } from '../sim/car';

/** Steering travel per second on keys, and faster back to centre when let go. */
const STEER_RATE = 2.2;
const CENTRE_RATE = 4;
const PEDAL_RATE = 4;
const STICK_RATE = 3;
const CRUISE_THRUST = 0.6;

export type Action = 'reset' | 'camera' | 'mute' | 'pause' | 'help' | 'spawns' | 'next' | 'map' | 'transform' | 'balloons';

const ACTION_KEYS: Record<string, Action> = {
  KeyR: 'reset', KeyC: 'camera', KeyV: 'mute', KeyP: 'pause', KeyH: 'help', KeyM: 'spawns', KeyN: 'next', KeyG: 'map', KeyF: 'transform', KeyB: 'balloons',
};
// Standard-mapping gamepad buttons.
const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11 };
const PAD_ACTIONS: [number, Action][] = [[PAD.Y, 'camera'], [PAD.X, 'transform'], [PAD.BACK, 'reset'], [PAD.START, 'pause']];

/** What the touch layer reports: the same shape as Controls, already analog. */
export interface TouchControls {
  steer: number;
  throttle: number;
  brake: number;
  /** −1..1: sink or climb while hovering. */
  lift: number;
}

export class Input {
  readonly controls: Controls = {
    throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false, flight: { pitch: 0, roll: 0, yaw: 0, thrust: CRUISE_THRUST, lift: 0 },
  };
  private keys = new Set<string>();
  private padPrev: boolean[] = [];
  private keySteer = 0;
  private keyThrottle = 0;
  private keyBrake = 0;
  private keyPitch = 0;
  private keyRoll = 0;
  touch: (() => TouchControls) | null = null;
  /** Set while the on-screen BOOST button is held. */
  boostHeld = false;

  constructor(private readonly onAction: (a: Action) => void) {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.target instanceof Element && e.target.closest('#picker')) return; // the picker reads its own keys
      if (!e.repeat && ACTION_KEYS[e.code]) onAction(ACTION_KEYS[e.code]);
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private down(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  update(dt: number): void {
    const target = (this.down('KeyA', 'ArrowLeft') ? 1 : 0) - (this.down('KeyD', 'ArrowRight') ? 1 : 0);
    const rate = target === 0 || Math.sign(target) !== Math.sign(this.keySteer) ? CENTRE_RATE : STEER_RATE;
    this.keySteer += Math.max(-rate * dt, Math.min(rate * dt, target - this.keySteer));
    const ramp = (v: number, on: boolean) => Math.max(0, Math.min(1, v + (on ? PEDAL_RATE : -PEDAL_RATE * 2) * dt));
    this.keyThrottle = ramp(this.keyThrottle, this.down('KeyW', 'ArrowUp'));
    this.keyBrake = ramp(this.keyBrake, this.down('KeyS', 'ArrowDown'));

    const toward = (v: number, t: number) => v + Math.max(-STICK_RATE * dt, Math.min(STICK_RATE * dt, t - v));
    this.keyPitch = toward(this.keyPitch, (this.down('KeyS', 'ArrowDown') ? 1 : 0) - (this.down('KeyW', 'ArrowUp') ? 1 : 0));
    this.keyRoll = toward(this.keyRoll, (this.down('KeyD', 'ArrowRight') ? 1 : 0) - (this.down('KeyA', 'ArrowLeft') ? 1 : 0));

    let padSteer = 0, padThrottle = 0, padBrake = 0, padHand = false, padPitch = 0, padYaw = 0, padBoost = false;
    const pad = navigator.getGamepads?.().find((p) => p && p.connected);
    if (pad) {
      const stick = pad.axes[0] ?? 0;
      padSteer = Math.abs(stick) > 0.08 ? -stick : 0;
      padThrottle = pad.buttons[PAD.RT]?.value ?? 0;
      padBrake = pad.buttons[PAD.LT]?.value ?? 0;
      padHand = (pad.buttons[PAD.A]?.pressed ?? false) || (pad.buttons[PAD.B]?.pressed ?? false);
      const y = pad.axes[1] ?? 0;
      padPitch = Math.abs(y) > 0.08 ? y : 0; // stick back (down) pulls up
      padYaw = (pad.buttons[PAD.RB]?.pressed ? 1 : 0) - (pad.buttons[PAD.LB]?.pressed ? 1 : 0);
      padBoost = (pad.buttons[PAD.R3]?.pressed ?? false) || (pad.buttons[PAD.L3]?.pressed ?? false);
      for (const [b, action] of PAD_ACTIONS) {
        const pressed = pad.buttons[b]?.pressed ?? false;
        if (pressed && !this.padPrev[b]) this.onAction(action);
        this.padPrev[b] = pressed;
      }
    }
    const t = this.touch?.();

    const c = this.controls;
    const steer = this.keySteer + padSteer + (t?.steer ?? 0);
    c.steer = Math.max(-1, Math.min(1, steer));
    c.throttle = Math.max(this.keyThrottle, padThrottle, t?.throttle ?? 0);
    c.brake = Math.max(this.keyBrake, padBrake, t?.brake ?? 0);
    c.handbrake = this.down('Space') || padHand;
    c.boost = this.down('ShiftLeft', 'ShiftRight') || padBoost || this.boostHeld;

    const f = c.flight;
    const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));
    f.pitch = clamp1(this.keyPitch + padPitch + (t ? t.brake - t.throttle : 0));
    f.roll = clamp1(this.keyRoll - padSteer - (t?.steer ?? 0));
    f.yaw = clamp1((this.down('KeyE') ? 1 : 0) - (this.down('KeyQ') ? 1 : 0) + padYaw);
    const boost = c.boost ? 1 : padThrottle;
    const idle = this.down('ControlLeft', 'ControlRight') || padBrake > 0.5;
    f.thrust = idle ? 0.1 : CRUISE_THRUST + (1 - CRUISE_THRUST) * boost;
    // Hovering: Space climbs, Ctrl sinks; on a pad the triggers, on a phone the left thumb up or down.
    f.lift = clamp1((this.down('Space') ? 1 : 0) - (this.down('ControlLeft', 'ControlRight') ? 1 : 0)
      + padThrottle - padBrake + (t?.lift ?? 0));
  }
}
