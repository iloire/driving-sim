// Keyboard + gamepad + touch → Controls. Keys are digital, so steering and pedals ramp towards
// their targets instead of snapping; the pad's stick and triggers are analog and used as they are.
// The same keys fly the plane: W/S push and pull the stick, A/D roll, Q/E rudder. On wings the keys
// work the stick gently at first and harder the longer they're held (a tap is a nudge, a hold is
// full stick) while the arrows work it hard (full almost at once), and the jet has a throttle lever: Shift opens it, Ctrl closes it, 1–4 jump to idle,
// cruise, 80 % and full, and holding Shift at full lights the afterburner; Space is the airbrake.
// Hovering on thrusters, W/S tilt, A/D turn, Space climbs and Ctrl sinks. Shift is the turbo
// everywhere else: nitro on the road, tail thrusters when hovering.

import type { Controls } from '../sim/car';

/** Steering travel per second on keys, and faster back to centre when let go. */
const STEER_RATE = 2.2;
const CENTRE_RATE = 4;
const PEDAL_RATE = 4;
const STICK_RATE = 3;
/** On wings, a key's stick travel per second (it is cubed on the way out, so 0.4 s is a fifth and full takes 0.67 s). */
export const PLANE_STICK_RATE = 1.5;
/** Roll asks the fly-by-wire for a roll rate, which can't overshoot, so it goes out faster on a softer curve (squared: full in 0.5 s). */
export const PLANE_ROLL_RATE = 2;
/** A/D only ever give this much roll stick, gentle however long they're held; the arrows give it all. */
export const KEY_ROLL_MAX = 0.4;
/** On wings the arrows are the hard stick: linear, full in an eighth of a second, for snapping into a turn. */
export const PLANE_ARROW_RATE = 8;
export const CRUISE_THRUST = 0.6;
const IDLE_THRUST = 0.1;
/** Throttle lever travel per second on Shift / Ctrl, and the 1–4 presets. */
const LEVER_RATE = 0.8;
const LEVER_PRESETS: Record<string, number> = { Digit1: IDLE_THRUST, Digit2: CRUISE_THRUST, Digit3: 0.8, Digit4: 1 };

/**
 * One step of a key-driven control `v` towards `target` (−1, 0 or 1): out at `rate`, and back to
 * centre (or through it, reversing) at `back`.
 */
export function stepKey(v: number, target: number, rate: number, back: number, dt: number): number {
  const r = target === 0 || target * v < 0 ? back : rate;
  return v + Math.max(-r * dt, Math.min(r * dt, target - v));
}

/** The plane's stick curve: fine near the middle, full at the end. */
export const shapeStick = (v: number) => v * v * v;
export const shapeRoll = (v: number) => KEY_ROLL_MAX * v * Math.abs(v);

export type Action = 'reset' | 'camera' | 'mute' | 'pause' | 'help' | 'menu' | 'next' | 'map' | 'transform' | 'balloons' | 'hud' | 'replay';

const ACTION_KEYS: Record<string, Action> = {
  KeyR: 'reset', KeyC: 'camera', KeyV: 'mute', KeyP: 'pause', KeyH: 'help', KeyM: 'menu', Escape: 'menu', KeyN: 'next', KeyG: 'map', KeyF: 'transform', KeyB: 'balloons', KeyU: 'hud', KeyI: 'replay',
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
  private arrowPitch = 0;
  private arrowRoll = 0;
  touch: (() => TouchControls) | null = null;
  /** Set while the on-screen BOOST button is held. */
  boostHeld = false;
  /** Flying on wings: the keys work the throttle lever, the gentle stick and the airbrake. */
  plane = false;
  /** The jet's throttle lever, IDLE_THRUST..1. */
  lever = CRUISE_THRUST;

  constructor(private readonly onAction: (a: Action) => void) {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (!e.repeat && ACTION_KEYS[e.code]) onAction(ACTION_KEYS[e.code]);
      if (this.plane && LEVER_PRESETS[e.code] !== undefined) this.lever = LEVER_PRESETS[e.code];
      this.keys.add(e.code);
      // On the welcome screen Space and the arrows keep their jobs: pressing and scrolling.
      const inMenu = e.target instanceof Element && e.target.closest('#welcome');
      if ((e.code.startsWith('Arrow') || e.code === 'Space') && !inMenu) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private down(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  update(dt: number): void {
    const target = (this.down('KeyA', 'ArrowLeft') ? 1 : 0) - (this.down('KeyD', 'ArrowRight') ? 1 : 0);
    this.keySteer = stepKey(this.keySteer, target, STEER_RATE, CENTRE_RATE, dt);
    const ramp = (v: number, on: boolean) => Math.max(0, Math.min(1, v + (on ? PEDAL_RATE : -PEDAL_RATE * 2) * dt));
    this.keyThrottle = ramp(this.keyThrottle, this.down('KeyW', 'ArrowUp'));
    this.keyBrake = ramp(this.keyBrake, this.down('KeyS', 'ArrowDown'));

    // On wings W A S D work the stick gently (out slowly, snapping back) and the arrows hard;
    // otherwise the arrows are W A S D and the stick moves the same both ways.
    const [out, back] = this.plane ? [PLANE_STICK_RATE, CENTRE_RATE] : [STICK_RATE, STICK_RATE];
    const axis = (pos: string, neg: string) => (this.down(pos) ? 1 : 0) - (this.down(neg) ? 1 : 0);
    const pitchW = axis('KeyS', 'KeyW'), rollW = axis('KeyD', 'KeyA');
    const pitchA = axis('ArrowDown', 'ArrowUp'), rollA = axis('ArrowRight', 'ArrowLeft');
    const merge = (a: number, b: number) => Math.max(-1, Math.min(1, a + b));
    this.keyPitch = stepKey(this.keyPitch, this.plane ? pitchW : merge(pitchW, pitchA), out, back, dt);
    this.keyRoll = stepKey(this.keyRoll, this.plane ? rollW : merge(rollW, rollA), this.plane ? PLANE_ROLL_RATE : out, back, dt);
    this.arrowPitch = this.plane ? stepKey(this.arrowPitch, pitchA, PLANE_ARROW_RATE, PLANE_ARROW_RATE, dt) : 0;
    this.arrowRoll = this.plane ? stepKey(this.arrowRoll, rollA, PLANE_ARROW_RATE, PLANE_ARROW_RATE, dt) : 0;
    const [shape, shapeR] = this.plane ? [shapeStick, shapeRoll] : [(v: number) => v, (v: number) => v];

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
    const shift = this.down('ShiftLeft', 'ShiftRight');
    const ctrl = this.down('ControlLeft', 'ControlRight');
    if (this.plane) {
      // Shift and Ctrl move the lever; so do the pad's triggers, as far as they're pressed.
      const move = (shift ? 1 : 0) - (ctrl ? 1 : 0) + padThrottle - padBrake;
      this.lever = Math.max(IDLE_THRUST, Math.min(1, this.lever + move * LEVER_RATE * dt));
    }
    // On wings Shift only lights the afterburner once the lever is at full: a detent.
    c.boost = (this.plane ? shift && this.lever >= 1 : shift) || padBoost || this.boostHeld;

    const f = c.flight;
    const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));
    f.pitch = clamp1(shape(this.keyPitch) + this.arrowPitch + padPitch + (t ? t.brake - t.throttle : 0));
    f.roll = clamp1(shapeR(this.keyRoll) + this.arrowRoll - padSteer - (t?.steer ?? 0));
    f.yaw = clamp1((this.down('KeyE') ? 1 : 0) - (this.down('KeyQ') ? 1 : 0) + padYaw);
    if (this.plane) f.thrust = c.boost ? 1 : this.lever;
    else f.thrust = ctrl || padBrake > 0.5 ? IDLE_THRUST : CRUISE_THRUST + (1 - CRUISE_THRUST) * (c.boost ? 1 : padThrottle);
    f.airbrake = this.plane && this.down('Space');
    // Hovering: Space climbs, Ctrl sinks; on a pad the triggers, on a phone the left thumb up or down.
    f.lift = clamp1((this.down('Space') ? 1 : 0) - (this.down('ControlLeft', 'ControlRight') ? 1 : 0)
      + padThrottle - padBrake + (t?.lift ?? 0));
  }
}
