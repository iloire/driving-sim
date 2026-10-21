// The start picker (M): every spawn on the island, chosen with a click or ↑ ↓ and Enter.

import type { Spawn } from './site';

export class SpawnPicker {
  private readonly el = document.getElementById('picker')!;
  private readonly list = document.getElementById('picker-list')!;
  private index = 0;

  constructor(private readonly spawns: Spawn[], private readonly onPick: (s: Spawn) => void) {
    spawns.forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = s.spec.name;
      b.addEventListener('click', () => this.pick(i));
      this.list.append(b);
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
        e.preventDefault();
        this.focus((this.index + (e.code === 'ArrowDown' ? 1 : spawns.length - 1)) % spawns.length);
      } else if (e.code === 'Escape' || e.code === 'KeyM') {
        this.close();
      }
    });
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  toggle(current: Spawn): void {
    if (this.open) { this.close(); return; }
    this.el.hidden = false;
    this.focus(Math.max(this.spawns.indexOf(current), 0));
  }

  private focus(i: number): void {
    this.index = i;
    (this.list.children[i] as HTMLElement).focus();
  }

  private pick(i: number): void {
    this.close();
    this.onPick(this.spawns[i]);
  }

  private close(): void {
    this.el.hidden = true;
    (document.activeElement as HTMLElement | null)?.blur();
  }
}
