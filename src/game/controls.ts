// The controls, written once: the in-game card shows only the keys for what you're doing now
// (driving, hovering, on wings, the Jet) and a line of the keys that work everywhere; the menu's
// Controls tab shows them all, with the longer notes.

export type Mode = 'drive' | 'hover' | 'wings' | 'jet';

export interface Row {
  keys: string[];
  label: string;
  /** Said only in the menu's full list. */
  more?: string;
}

const THROTTLE: Row[] = [
  { keys: ['Shift', 'Ctrl'], label: 'Throttle' },
  { keys: ['1–4'], label: 'Idle · cruise · 80 % · full' },
  { keys: ['Shift'], label: 'Afterburner', more: 'hold it with the throttle at full' },
];

export const MODES: Record<Mode, { title: string; rows: Row[] }> = {
  drive: {
    title: 'Driving',
    rows: [
      { keys: ['W'], label: 'Accelerate' },
      { keys: ['S'], label: 'Brake · reverse', more: 'reverses once stopped' },
      { keys: ['A', 'D'], label: 'Steer' },
      { keys: ['Space'], label: 'Handbrake' },
      { keys: ['Shift'], label: 'Nitro' },
      { keys: ['F'], label: 'Fly', more: 'the Roadster lights its thrusters, the 4×4 unfolds wings' },
    ],
  },
  hover: {
    title: 'Hovering',
    rows: [
      { keys: ['Space'], label: 'Climb' },
      { keys: ['Ctrl'], label: 'Sink' },
      { keys: ['W', 'S'], label: 'Tilt to fly' },
      { keys: ['A', 'D'], label: 'Turn' },
      { keys: ['Shift'], label: 'Boost' },
      { keys: ['F'], label: 'Land' },
    ],
  },
  wings: {
    title: 'On wings',
    rows: [
      { keys: ['W', 'S'], label: 'Pitch', more: 'a tap nudges the stick, a hold pulls harder' },
      { keys: ['A', 'D'], label: 'Roll' },
      { keys: ['Q', 'E'], label: 'Rudder' },
      ...THROTTLE,
      { keys: ['F'], label: 'Fold the wings' },
    ],
  },
  jet: {
    title: 'Jet',
    rows: [
      { keys: ['W', 'S'], label: 'Pitch', more: 'up to 9 g — hold it too long and you black out' },
      { keys: ['A', 'D'], label: 'Roll' },
      { keys: ['Q', 'E'], label: 'Rudder' },
      ...THROTTLE,
      { keys: ['Space'], label: 'Airbrake' },
    ],
  },
};

/** Keys that work whatever you're in. */
export const GENERAL: Row[] = [
  { keys: ['R'], label: 'Road', more: 'back on the nearest road' },
  { keys: ['B'], label: 'Balloons', more: 'fly through them; chain pops for a combo' },
  { keys: ['C'], label: 'Camera' },
  { keys: ['G'], label: 'Map' },
  { keys: ['V'], label: 'Mute' },
  { keys: ['P'], label: 'Pause' },
  { keys: ['M'], label: 'Menu', more: 'or Esc; N jumps to the next place' },
  { keys: ['H'], label: 'Hide' },
];

export const GAMEPAD = 'RT throttle · LT brake · stick steers · A handbrake · X fly · stick click turbo · Y camera';

/** What the keys are doing right now. */
export function modeOf(flying: boolean, thrusters: boolean, jet: boolean): Mode {
  if (jet) return 'jet';
  if (!flying) return 'drive';
  return thrusters ? 'hover' : 'wings';
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const keys = (r: Row) => r.keys.map((k) => `<kbd>${esc(k)}</kbd>`).join('');
const table = (rows: Row[], full: boolean) => `<table>${rows.map((r) =>
  `<tr><td>${keys(r)}</td><td>${esc(r.label)}${full && r.more ? `<small> — ${esc(r.more)}</small>` : ''}</td></tr>`).join('')}</table>`;

/** The in-game card: this mode's keys, then the general ones on a line, and the pad if one is plugged in. */
export function cardHtml(mode: Mode, gamepad: boolean): string {
  const general = GENERAL.filter((r) => r.keys[0] !== 'H').map((r) => `<span>${keys(r)} ${esc(r.label)}</span>`).join('');
  return `${table(MODES[mode].rows, false)}<p class="help-general">${general}</p>${gamepad ? `<p>Gamepad: ${esc(GAMEPAD)}</p>` : ''}`;
}

/** The menu's full list: every mode, the general keys and the pad, with the notes. */
export function referenceHtml(): string {
  const section = (title: string, rows: Row[]) => `<h3>${esc(title)}</h3>${table(rows, true)}`;
  return [
    ...Object.values(MODES).map((m) => section(m.title, m.rows)),
    section('Anywhere', GENERAL),
    `<p>Arrow keys work as W A S D.</p><h3>Gamepad</h3><p>${esc(GAMEPAD)}</p>`,
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
