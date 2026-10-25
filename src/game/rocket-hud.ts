// Starship's telemetry, laid out like a launch webcast: the mission clock and what is happening in
// the middle, and for each stage its speed, height, propellant and the ring of engines lit as they
// are. Flying something else, a small chip at the bottom keeps the clock, so you know when to look
// towards the tower.

import { type Launch, SHIP, type Stage, SUPER_HEAVY } from '../sim/starship';
import { t, type Key } from './i18n';

/** The mission clock as T−00:00:10 / T+00:02:05. */
export function missionClock(t: number): string {
  const s = Math.abs(Math.trunc(t));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `T${t < 0 ? '−' : '+'}${hh}:${mm}:${ss}`;
}

/** The engines as dots on a circle: rings of `[radius, count]`, lit from the middle out. */
function ring(rings: [number, number][]): string {
  const dots: string[] = [];
  for (const [r, n] of rings) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      dots.push(`<circle cx="${(Math.cos(a) * r).toFixed(2)}" cy="${(Math.sin(a) * r).toFixed(2)}" r="${n > 6 ? 0.55 : 0.8}"/>`);
    }
  }
  return `<svg viewBox="-5 -5 10 10" aria-hidden="true"><circle class="rim" r="4.7"/>${dots.join('')}</svg>`;
}

const BOOSTER_RINGS: [number, number][] = [[0.9, 3], [2.3, 10], [3.75, 20]];
const SHIP_RINGS: [number, number][] = [[1.2, 3], [3.2, 3]];

export class RocketHud {
  private readonly root = document.createElement('section');
  private readonly chip = document.createElement('div');
  private readonly clock: HTMLElement;
  private readonly phase: HTMLElement;
  private readonly mode: HTMLElement;
  private readonly sides: { el: HTMLElement; speed: HTMLElement; alt: HTMLElement; bar: HTMLElement; dots: SVGCircleElement[] }[];
  private lastChip = '';

  constructor() {
    this.root.id = 'rocket-hud';
    this.root.hidden = true;
    const side = (name: string, rings: [number, number][]) => `
      <div class="rk-stage">
        <div class="rk-ring">${ring(rings)}</div>
        <div class="rk-nums">
          <b>${name}</b>
          <div><span class="rk-speed">0</span><small>km/h</small></div>
          <div><span class="rk-alt">0</span><small>km</small></div>
          <div class="rk-tank"><i></i></div>
        </div>
      </div>`;
    this.root.innerHTML = `${side(t('rocket.booster'), BOOSTER_RINGS)}
      <div class="rk-mid"><div class="rk-clock">T−00:00:10</div><div class="rk-phase"></div><div class="rk-mode"></div></div>
      ${side(t('rocket.ship'), SHIP_RINGS)}`;
    this.clock = this.root.querySelector('.rk-clock')!;
    this.phase = this.root.querySelector('.rk-phase')!;
    this.mode = this.root.querySelector('.rk-mode')!;
    this.sides = [...this.root.querySelectorAll<HTMLElement>('.rk-stage')].map((el) => ({
      el,
      speed: el.querySelector('.rk-speed')!,
      alt: el.querySelector('.rk-alt')!,
      bar: el.querySelector('.rk-tank i')!,
      dots: [...el.querySelectorAll<SVGCircleElement>('circle:not(.rim)')],
    }));
    this.chip.id = 'rocket-chip';
    this.chip.hidden = true;
    document.body.append(this.root, this.chip);
  }

  /** `full` flying it, `chip` flying something else while a launch is on, `off` otherwise. */
  update(l: Launch | null, show: 'full' | 'chip' | 'off', warp: number): void {
    this.root.hidden = show !== 'full' || !l;
    this.chip.hidden = show !== 'chip' || !l;
    if (!l) return;
    if (show === 'chip') {
      const text = `${t('rocket.ship').toUpperCase()} · ${missionClock(l.t)} · ${t(`rocket.phase.${l.phase}` as Key)}`;
      if (text !== this.lastChip) this.chip.textContent = this.lastChip = text;
      return;
    }
    if (show !== 'full') return;
    this.clock.textContent = missionClock(l.t);
    this.phase.textContent = t(`rocket.phase.${l.phase}` as Key);
    this.mode.textContent = `${t(l.auto ? 'rocket.auto' : 'rocket.manual')}${warp > 1 ? ` · ×${warp}` : ''}`;
    this.mode.classList.toggle('manual', !l.auto);
    this.stage(this.sides[0], l.booster, l.pad[2], SUPER_HEAVY.prop);
    this.stage(this.sides[1], l.ship, l.pad[2], SHIP.prop);
  }

  private stage(side: RocketHud['sides'][number], s: Stage, ground: number, full: number): void {
    side.speed.textContent = Math.round(Math.hypot(...s.vel) * 3.6).toLocaleString('en');
    side.alt.textContent = Math.max((s.pos[2] - ground) / 1000, 0).toFixed(1);
    side.bar.style.width = `${(100 * s.prop) / full}%`;
    const lit = s.prop > 0 ? s.lit : 0;
    side.dots.forEach((d, i) => d.classList.toggle('lit', i < lit));
  }
}
