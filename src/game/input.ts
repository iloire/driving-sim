// Keyboard + gamepad + touch → Controls. Keys are digital, so steering and pedals ramp towards
// their targets instead of snapping; the pad's stick and triggers are analog and used as they are.

import type { Controls } from '../sim/car';

/** Steering travel per second on keys, and faster back to centre when let go. */
const STEER_RATE = 2.2;
const CENTRE_RATE = 4;
const PEDAL_RATE = 4;

export type Action = 'reset' | 'camera' | 'mute' | 'pause' | 'help' | 'spawns' | 'next' | 'map';

const ACTION_KEYS: Record<string, Action> = {
  KeyR: 'reset', KeyC: 'camera', KeyV: 'mute', KeyP: 'pause', KeyH: 'help', KeyM: 'spawns', KeyN: 'next', KeyG: 'map',
};
// Standard-mapping gamepad buttons.
const PAD = { A: 0, B: 1, X: 2, Y: 3, LT: 6, RT: 7, BACK: 8, START: 9 };
const PAD_ACTIONS: [number, Action][] = [[PAD.Y, 'camera'], [PAD.BACK, 'reset'], [PAD.START, 'pause']];

/** What the touch layer reports: the same shape as Controls, already analog. */
export interface TouchControls {
  steer: number;
  throttle: number;
  brake: number;
}

export class Input {
  readonly controls: Controls = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  private keys = new Set<string>();
  private padPrev: boolean[] = [];
  private keySteer = 0;
  private keyThrottle = 0;
  private keyBrake = 0;
  touch: (() => TouchControls) | null = null;

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

    let padSteer = 0, padThrottle = 0, padBrake = 0, padHand = false;
    const pad = navigator.getGamepads?.().find((p) => p && p.connected);
    if (pad) {
      const stick = pad.axes[0] ?? 0;
      padSteer = Math.abs(stick) > 0.08 ? -stick : 0;
      padThrottle = pad.buttons[PAD.RT]?.value ?? 0;
      padBrake = pad.buttons[PAD.LT]?.value ?? 0;
      padHand = (pad.buttons[PAD.A]?.pressed ?? false) || (pad.buttons[PAD.B]?.pressed ?? false);
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
  }
}
