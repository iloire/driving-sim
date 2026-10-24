// The controls, written once: the in-game card shows only the keys for what you're doing now
// (driving, hovering, on wings, the Jet) and a line of the keys that work everywhere; the menu's
// Controls tab shows them all, with the longer notes. The words are in i18n.ts.

import { t, type Key } from './i18n';

export type Mode = 'drive' | 'hover' | 'wings' | 'jet';

export interface Row {
  keys: string[];
  label: Key;
  /** Said only in the menu's full list. */
  more?: Key;
}

const THROTTLE: Row[] = [
  { keys: ['Shift', 'Ctrl'], label: 'ctl.throttle' },
  { keys: ['1–4'], label: 'ctl.presets' },
  { keys: ['Shift'], label: 'ctl.afterburner', more: 'ctl.afterburner.more' },
];

export const MODES: Record<Mode, Row[]> = {
  drive: [
    { keys: ['W'], label: 'ctl.accelerate' },
    { keys: ['S'], label: 'ctl.brake', more: 'ctl.brake.more' },
    { keys: ['A', 'D'], label: 'ctl.steer' },
    { keys: ['Space'], label: 'ctl.handbrake' },
    { keys: ['Shift'], label: 'ctl.nitro' },
    { keys: ['F'], label: 'ctl.fly', more: 'ctl.fly.more' },
  ],
  hover: [
    { keys: ['Space'], label: 'ctl.climb' },
    { keys: ['Ctrl'], label: 'ctl.sink' },
    { keys: ['W', 'S'], label: 'ctl.tilt' },
    { keys: ['A', 'D'], label: 'ctl.turn' },
    { keys: ['Shift'], label: 'ctl.boost' },
    { keys: ['F'], label: 'ctl.land' },
  ],
  wings: [
    { keys: ['W', 'S'], label: 'ctl.pitch', more: 'ctl.pitch.more' },
    { keys: ['A', 'D'], label: 'ctl.roll' },
    { keys: ['Q', 'E'], label: 'ctl.rudder' },
    ...THROTTLE,
    { keys: ['F'], label: 'ctl.fold' },
  ],
  jet: [
    { keys: ['W', 'S'], label: 'ctl.pitch', more: 'ctl.pitch.jet.more' },
    { keys: ['A', 'D'], label: 'ctl.roll' },
    { keys: ['Q', 'E'], label: 'ctl.rudder' },
    ...THROTTLE,
    { keys: ['Space'], label: 'ctl.airbrake' },
  ],
};

/** Keys that work whatever you're in. */
export const GENERAL: Row[] = [
  { keys: ['R'], label: 'ctl.road', more: 'ctl.road.more' },
  { keys: ['B'], label: 'ctl.balloons', more: 'ctl.balloons.more' },
  { keys: ['C'], label: 'ctl.camera' },
  { keys: ['G'], label: 'ctl.map' },
  { keys: ['V'], label: 'ctl.mute' },
  { keys: ['P'], label: 'ctl.pause' },
  { keys: ['M'], label: 'ctl.menu', more: 'ctl.menu.more' },
  { keys: ['H'], label: 'ctl.hide' },
];

/** What the keys are doing right now. */
export function modeOf(flying: boolean, thrusters: boolean, jet: boolean): Mode {
  if (jet) return 'jet';
  if (!flying) return 'drive';
  return thrusters ? 'hover' : 'wings';
}

export const modeName = (mode: Mode) => t(`mode.${mode}`);

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const keys = (r: Row) => r.keys.map((k) => `<kbd>${esc(k)}</kbd>`).join('');
const table = (rows: Row[], full: boolean) => `<table>${rows.map((r) =>
  `<tr><td>${keys(r)}</td><td>${esc(t(r.label))}${full && r.more ? `<small> — ${esc(t(r.more))}</small>` : ''}</td></tr>`).join('')}</table>`;

/** The in-game card: this mode's keys, then the general ones on a line, and the pad if one is plugged in. */
export function cardHtml(mode: Mode, gamepad: boolean): string {
  const general = GENERAL.filter((r) => r.keys[0] !== 'H').map((r) => `<span>${keys(r)} ${esc(t(r.label))}</span>`).join('');
  const pad = gamepad ? `<p>${esc(t('ctl.gamepad'))}: ${esc(t('ctl.gamepad.keys'))}</p>` : '';
  return `${table(MODES[mode], false)}<p class="help-general">${general}</p>${pad}`;
}

/** The menu's full list: every mode, the general keys and the pad, with the notes. */
export function referenceHtml(): string {
  const section = (title: string, rows: Row[]) => `<h3>${esc(title)}</h3>${table(rows, true)}`;
  return [
    ...(Object.keys(MODES) as Mode[]).map((m) => section(modeName(m), MODES[m])),
    section(t('ctl.anywhere'), GENERAL),
    `<p>${esc(t('ctl.arrows'))}</p><h3>${esc(t('ctl.gamepad'))}</h3><p>${esc(t('ctl.gamepad.keys'))}</p>`,
  ].join('');
}

/** How long the card shows itself again when the keys change meaning (taking off, landing). */
export const PEEK_SECONDS = 6;
/** How long the car has to be on the move before the card first folds (the Jet starts moving). */
export const SETTLE_SECONDS = 4;

/**
 * Whether the card is folded. It starts open on a first visit and folds once the car has been moving a few seconds; each
 * change of mode opens it for a few seconds to show the new keys. H overrides all of that.
 */
export class HelpFold {
  private moving = 0;
  private peek = 0;
  private mode: Mode | null = null;
  /** Set by H: the player's own choice, kept until they press it again. */
  private pinnedOpen: boolean | null = null;

  constructor(seenBefore: boolean) {
    if (seenBefore) this.moving = SETTLE_SECONDS;
  }

  toggle(): void {
    this.pinnedOpen = this.folded;
  }

  update(dt: number, mode: Mode, moving: boolean): void {
    if (this.mode !== null && mode !== this.mode) this.peek = PEEK_SECONDS;
    this.mode = mode;
    this.peek = Math.max(0, this.peek - dt);
    if (moving) this.moving += dt;
  }

  get folded(): boolean {
    if (this.pinnedOpen !== null) return !this.pinnedOpen;
    return this.moving >= SETTLE_SECONDS && this.peek === 0;
  }
}
