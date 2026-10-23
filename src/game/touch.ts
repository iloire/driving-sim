// Phones held sideways: the left thumb steers (slide it left or right from where it landed) and,
// hovering, climbs or sinks (up or down); the right thumb is the pedals (push up to accelerate,
// pull down to brake or back up).

import type { TouchControls } from './input';

/** Thumb travel (px) for full lock or a full pedal. */
const FULL = 70;

/** Pure: one thumb's drag from where it landed → its share of the controls. */
export function thumb(side: 'left' | 'right', dx: number, dy: number): TouchControls {
  const clamp = (v: number) => Math.max(-1, Math.min(1, v / FULL));
  if (side === 'left') return { steer: -clamp(dx), throttle: 0, brake: 0, lift: -clamp(dy) };
  const pedal = -clamp(dy);
  return { steer: 0, throttle: Math.max(pedal, 0), brake: Math.max(-pedal, 0), lift: 0 };
}

export class TouchPad {
  private readonly thumbs = new Map<number, { side: 'left' | 'right'; x0: number; y0: number; x: number; y: number }>();

  constructor(el: HTMLElement) {
    const opts = { passive: false } as const;
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        const side = t.clientX < window.innerWidth / 2 ? 'left' : 'right';
        this.thumbs.set(t.identifier, { side, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY });
      }
    }, opts);
    el.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        const th = this.thumbs.get(t.identifier);
        if (th) { th.x = t.clientX; th.y = t.clientY; }
      }
    }, opts);
    const end = (e: TouchEvent) => { for (const t of Array.from(e.changedTouches)) this.thumbs.delete(t.identifier); };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
  }

  read(): TouchControls {
    const out = { steer: 0, throttle: 0, brake: 0, lift: 0 };
    for (const th of this.thumbs.values()) {
      const c = thumb(th.side, th.x - th.x0, th.y - th.y0);
      out.steer += c.steer;
      out.throttle = Math.max(out.throttle, c.throttle);
      out.brake = Math.max(out.brake, c.brake);
      out.lift += c.lift;
    }
    return out;
  }
}
