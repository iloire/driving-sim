// The welcome screen, laid over the live map: the camera circles the car while you pick a
// zone, a place and a vehicle, then drive, always in the afternoon light. M or Esc on the road
// brings it back with Resume. ← → change place, Enter drives. A shared link skips it and starts where it was shared.

import { t, type Lang } from './i18n';

export interface WelcomeView {
  /** The zone's name (the title) and the line over it. */
  title: string;
  kicker: string;
  zones: { id: string; name: string }[];
  zone: string;
  places: { id: string; name: string }[];
  place: string;
  vehicles: { id: string; name: string; line: string }[];
  vehicle: string;
  /** A drive is paused under the menu and can carry on. */
  canResume: boolean;
  /** The Jet takes off from the sky rather than driving off. */
  flies: boolean;
  lang: Lang;
  langs: Lang[];
}

export interface WelcomeHandlers {
  zone(id: string): void;
  place(id: string): void;
  vehicle(id: string): void;
  drive(): void;
  resume(): void;
  lang(l: Lang): void;
}

type Tab = 'help' | 'places';

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
    /** The full list of controls, in the language of the moment. */
    private readonly helpHtml: () => string,
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
    if (d.zone) { if (d.zone !== v.zone) this.on.zone(d.zone); }
    else if (d.placeStep) this.on.place(step(v.places.map((p) => p.id), v.place, Number(d.placeStep)));
    else if (d.place) this.on.place(d.place);
    else if (d.vehicle) this.on.vehicle(d.vehicle);
    else if (d.drive !== undefined) this.on.drive();
    else if (d.resume !== undefined) this.on.resume();
    else if (d.lang) this.on.lang(d.lang as Lang);
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
    const pick = (attr: string, value: string, label: string, on: boolean) =>
      `<button type="button" class="wl-pick" ${attr}="${esc(value)}" aria-pressed="${on}">${esc(label)}</button>`;
    this.root.innerHTML = `
      <div class="wl-main">
        <h1 class="wl-title">${esc(v.title)} <span>Drive</span></h1>
        <p class="wl-kicker">${esc(v.kicker)}</p>
        <div class="wl-book">
          <div class="wl-leg">
            <span class="wl-n">1</span>
            <span class="wl-label">${esc(t('menu.zone'))}</span>
            <div class="wl-picks" role="group" aria-label="${esc(t('menu.zone'))}">
              ${v.zones.map((x) => pick('data-zone', x.id, x.name, x.id === v.zone)).join('')}
            </div>
          </div>
          <div class="wl-leg wl-start">
            <span class="wl-n">2</span>
            ${tulip(at)}
            <div class="wl-place">
              <button type="button" class="wl-arrow" data-place-step="-1" aria-label="${esc(t('menu.prev'))}">‹</button>
              <h2>${esc(v.places[at]?.name ?? '')}</h2>
              <button type="button" class="wl-arrow" data-place-step="1" aria-label="${esc(t('menu.next'))}">›</button>
              <span class="wl-count">${at + 1}/${v.places.length}</span>
            </div>
          </div>
          <div class="wl-leg">
            <span class="wl-n">3</span>
            <span class="wl-label">${esc(t('menu.ride'))}</span>
            <div class="wl-picks" role="group" aria-label="${esc(t('menu.ride'))}">
              ${v.vehicles.map((x) => pick('data-vehicle', x.id, x.name, x.id === v.vehicle)).join('')}
              <span class="wl-line">${esc(vehicle?.line ?? '')}</span>
            </div>
          </div>
        </div>
        <div class="wl-go">
          ${v.canResume ? `<button type="button" class="wl-btn primary" data-resume>${esc(t('menu.resume'))}<small>${esc(t('menu.resume.note'))}</small></button>` : ''}
          <button type="button" class="wl-btn ${v.canResume ? '' : 'primary'}" data-drive>${esc(t(v.flies ? 'menu.fly' : 'menu.drive'))} →<small>${esc(t(v.canResume ? 'menu.again' : v.flies ? 'menu.from.air' : 'menu.from.here'))}</small></button>
        </div>
      </div>
      <aside class="wl-side">
        <nav role="tablist">
          <button type="button" role="tab" data-tab="help" aria-selected="${this.tab === 'help'}">${esc(t('menu.controls'))}</button>
          <button type="button" role="tab" data-tab="places" aria-selected="${this.tab === 'places'}">${esc(t('menu.places'))}</button>
          <span class="wl-lang" role="group" aria-label="Language / Idioma">${v.langs.map((l) =>
            `<button type="button" data-lang="${l}" aria-pressed="${l === v.lang}">${l.toUpperCase()}</button>`).join('')}</span>
        </nav>
        <div class="wl-tab">${this.tab === 'help' ? `<div class="wl-help">${this.helpHtml()}</div>` : this.places(v)}</div>
      </aside>`;
    if (focused) this.root.querySelector<HTMLButtonElement>(focused)?.focus();
  }

  private places(v: WelcomeView): string {
    return `<ul class="wl-places">${v.places.map((p) => `
      <li><button type="button" data-place="${esc(p.id)}" aria-current="${p.id === v.place}">${esc(p.name)}</button></li>`).join('')}
    </ul>`;
  }
}

/** A roadbook tulip for the start box: a dot where you are, the line you take, a road you pass.
 * Places take turns at going right, straight on and left, so stepping through them redraws it. */
function tulip(at: number): string {
  const [route, side] = [
    ['M20 40V25L33 12', 'M20 25 7 14'],
    ['M20 40V8', 'M20 22H33'],
    ['M20 40V25L7 12', 'M20 25 33 14'],
  ][((at % 3) + 3) % 3];
  return `<svg class="wl-tulip" viewBox="0 0 40 48" aria-hidden="true">
    <path d="${side}" stroke-width="2"/><path d="${route}" stroke-width="3.5" marker-end="url(#wl-head)"/>
    <circle cx="20" cy="42" r="4"/>
    <defs><marker id="wl-head" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="2.6" markerHeight="2.6" orient="auto"><path d="M0 0 6 3 0 6z"/></marker></defs>
  </svg>`;
}

/** A selector that finds the same button again after a repaint: each carries one data attribute. */
function keyOf(b: HTMLButtonElement): string | null {
  const [k, val] = Object.entries(b.dataset)[0] ?? [];
  if (!k) return null;
  const attr = `data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
  return val ? `[${attr}="${CSS.escape(val)}"]` : `[${attr}]`;
}
