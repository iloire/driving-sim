// The welcome screen, laid over the live island: the camera circles the car while you pick a
// place, a vehicle and the time of day, then drive. M or Esc on the road brings it back with
// Resume. ← → change place, Enter drives. A shared link skips it and starts where it was shared.

export interface WelcomeView {
  places: { id: string; name: string }[];
  place: string;
  vehicles: { id: string; name: string; line: string }[];
  vehicle: string;
  /** Named times of day, and which one (if any) the sun is at. */
  times: string[];
  time: string;
  /** A drive is paused under the menu and can carry on. */
  canResume: boolean;
  /** The Jet takes off from the sky rather than driving off. */
  flies: boolean;
}

export interface WelcomeHandlers {
  place(id: string): void;
  vehicle(id: string): void;
  time(name: string): void;
  drive(): void;
  resume(): void;
}

type Tab = 'help' | 'places';

/** Named solar hours inside the day's daylight, in order; the ends hug sunrise and sunset. */
export function timesOfDay(first: number, last: number): Record<string, number> {
  const named: [string, number][] = [['Dawn', first], ['Morning', 9.5], ['Midday', 12.5], ['Afternoon', 16.5], ['Sunset', last]];
  return Object.fromEntries(named.map(([k, h]) => [k, Math.min(Math.max(h, first), last)]));
}

/** The neighbour of `current` in `list`, wrapping round. */
export function step<T>(list: T[], current: T, by: number): T {
  return list[(list.indexOf(current) + by + list.length) % list.length];
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

export class Welcome {
  private readonly root = document.createElement('div');
  private view: WelcomeView | null = null;
  private tab: Tab = 'help';

  constructor(
    private readonly on: WelcomeHandlers,
    /** The controls table, shared with the in-game help card. */
    private readonly helpHtml: string,
  ) {
    this.root.id = 'welcome';
    this.root.hidden = true;
    this.root.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    document.body.append(this.root);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    // The rise-in plays once as it opens, not on every repaint after a click.
    this.root.classList.add('enter');
    setTimeout(() => this.root.classList.remove('enter'), 1400);
    this.root.hidden = false;
    document.body.classList.add('in-menu');
    this.paint();
    this.root.querySelector<HTMLButtonElement>(this.view?.canResume ? '[data-resume]' : '[data-drive]')?.focus();
  }

  close(): void {
    this.root.hidden = true;
    document.body.classList.remove('in-menu');
    (document.activeElement as HTMLElement | null)?.blur(); // keys go back to the car
  }

  render(view: WelcomeView): void {
    this.view = view;
    if (this.isOpen) this.paint();
  }

  private onClick(e: Event): void {
    const t = (e.target as Element).closest<HTMLButtonElement>('button');
    const v = this.view;
    if (!t || !v) return;
    const d = t.dataset;
    if (d.placeStep) this.on.place(step(v.places.map((p) => p.id), v.place, Number(d.placeStep)));
    else if (d.place) this.on.place(d.place);
    else if (d.vehicle) this.on.vehicle(d.vehicle);
    else if (d.time) this.on.time(d.time);
    else if (d.drive !== undefined) this.on.drive();
    else if (d.resume !== undefined) this.on.resume();
    else if (d.tab) {
      this.tab = d.tab as Tab;
      this.paint();
      this.root.querySelector<HTMLElement>(`[data-tab="${this.tab}"]`)?.focus();
    }
  }

  private onKey(e: KeyboardEvent): void {
    const v = this.view;
    if (!this.isOpen || !v || e.repeat) return;
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      if ((e.target as Element).closest?.('.wl-places')) return; // the list keeps its arrows
      this.on.place(step(v.places.map((p) => p.id), v.place, e.code === 'ArrowLeft' ? -1 : 1));
    } else if (e.code === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      if (v.canResume) this.on.resume();
      else this.on.drive();
    }
  }

  private paint(): void {
    const v = this.view;
    if (!v) return;
    // Repainting replaces the buttons, so put focus back on the one that was pressed.
    const focused = document.activeElement instanceof HTMLButtonElement && this.root.contains(document.activeElement)
      ? keyOf(document.activeElement) : null;
    const at = v.places.findIndex((p) => p.id === v.place);
    const vehicle = v.vehicles.find((x) => x.id === v.vehicle);
    const chip = (attr: string, value: string, label: string, on: boolean) =>
      `<button type="button" class="wl-chip" ${attr}="${esc(value)}" aria-pressed="${on}">${esc(label)}</button>`;
    this.root.innerHTML = `
      <div class="wl-main">
        <p class="wl-kicker">Canary Islands · every road on the island</p>
        <h1 class="wl-title">Lanzarote <span>Drive</span></h1>
        <div class="wl-place">
          <button type="button" class="wl-arrow" data-place-step="-1" aria-label="Previous place">‹</button>
          <h2>${esc(v.places[at]?.name ?? '')}</h2>
          <button type="button" class="wl-arrow" data-place-step="1" aria-label="Next place">›</button>
          <span class="wl-count">${at + 1} / ${v.places.length}</span>
        </div>
        <div class="wl-row" role="group" aria-label="Vehicle">
          <span class="wl-label">Ride</span>
          ${v.vehicles.map((x) => chip('data-vehicle', x.id, x.name, x.id === v.vehicle)).join('')}
          <span class="wl-line">${esc(vehicle?.line ?? '')}</span>
        </div>
        <div class="wl-row" role="group" aria-label="Time of day">
          <span class="wl-label">Sun</span>
          ${v.times.map((t) => chip('data-time', t, t, t === v.time)).join('')}
        </div>
        <div class="wl-go">
          ${v.canResume ? '<button type="button" class="wl-btn primary" data-resume>Resume<small>carry on where you were</small></button>' : ''}
          <button type="button" class="wl-btn ${v.canResume ? '' : 'primary'}" data-drive>${v.flies ? 'Fly' : 'Drive'} →<small>${v.canResume ? 'start again from here' : v.flies ? '600 m over this place' : 'from this place'}</small></button>
        </div>
      </div>
      <aside class="wl-side">
        <nav role="tablist">
          <button type="button" role="tab" data-tab="help" aria-selected="${this.tab === 'help'}">Controls</button>
          <button type="button" role="tab" data-tab="places" aria-selected="${this.tab === 'places'}">Places</button>
        </nav>
        <div class="wl-tab">${this.tab === 'help' ? `<div class="wl-help">${this.helpHtml}</div>` : this.places(v)}</div>
      </aside>`;
    if (focused) this.root.querySelector<HTMLButtonElement>(focused)?.focus();
  }

  private places(v: WelcomeView): string {
    return `<ul class="wl-places">${v.places.map((p) => `
      <li><button type="button" data-place="${esc(p.id)}" aria-current="${p.id === v.place}">${esc(p.name)}</button></li>`).join('')}
    </ul>`;
  }
}

/** A selector that finds the same button again after a repaint: each carries one data attribute. */
function keyOf(b: HTMLButtonElement): string | null {
  const [k, val] = Object.entries(b.dataset)[0] ?? [];
  if (!k) return null;
  const attr = `data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
  return val ? `[${attr}="${CSS.escape(val)}"]` : `[${attr}]`;
}
