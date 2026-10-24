import { describe, expect, it } from 'vitest';
import { DICTIONARIES } from './i18n';
import { HelpFold, MODES, modeOf, PEEK_SECONDS, SETTLE_SECONDS } from './controls';

describe('controls card', () => {
  it('picks the keys for what the car is doing', () => {
    expect(modeOf(false, true, false)).toBe('drive');
    expect(modeOf(true, true, false)).toBe('hover');
    expect(modeOf(true, false, false)).toBe('wings');
    expect(modeOf(false, false, true)).toBe('jet');
  });

  it('keeps each mode short enough to read at a glance, in every language', () => {
    for (const rows of Object.values(MODES)) {
      expect(rows.length).toBeLessThanOrEqual(9);
      for (const dict of Object.values(DICTIONARIES)) {
        for (const r of rows) expect(dict[r.label].length, dict[r.label]).toBeLessThanOrEqual(28);
      }
    }
  });
});

describe('HelpFold', () => {
  it('stays open on a first visit until the car has been moving a few seconds', () => {
    const f = new HelpFold(false);
    f.update(1, 'drive', false);
    f.update(SETTLE_SECONDS - 0.5, 'drive', true);
    expect(f.folded).toBe(false);
    f.update(1, 'drive', true);
    expect(f.folded).toBe(true);
  });

  it('starts folded for a returning player', () => {
    const f = new HelpFold(true);
    f.update(0.1, 'jet', true);
    expect(f.folded).toBe(true);
  });

  it('opens for a few seconds when the keys change meaning', () => {
    const f = new HelpFold(true);
    f.update(0.1, 'drive', true);
    f.update(0.1, 'wings', true);
    expect(f.folded).toBe(false);
    f.update(PEEK_SECONDS, 'wings', true);
    expect(f.folded).toBe(true);
  });

  it('lets H override it either way', () => {
    const f = new HelpFold(true);
    f.update(0.1, 'drive', true);
    f.toggle();
    expect(f.folded).toBe(false);
    f.update(60, 'drive', true);
    expect(f.folded).toBe(false);
    f.toggle();
    f.update(0.1, 'hover', true);
    expect(f.folded).toBe(true);
  });
});
