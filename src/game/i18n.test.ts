import { describe, expect, it } from 'vitest';
import { DICTIONARIES, pickLang, t } from './i18n';

describe('i18n', () => {
  it('follows the browser on a first visit, and the player once they choose', () => {
    expect(pickLang(null, ['es-ES', 'en'])).toBe('es');
    expect(pickLang(null, ['de-DE', 'es'])).toBe('es');
    expect(pickLang(null, ['de-DE', 'fr'])).toBe('en');
    expect(pickLang('en', ['es-ES'])).toBe('en');
    expect(pickLang('xx', ['es-419'])).toBe('es');
  });

  it('says the same things in every language: same placeholders, nothing left blank', () => {
    const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [key, text] of Object.entries(DICTIONARIES.en)) {
      for (const dict of Object.values(DICTIONARIES)) {
        const other = dict[key as keyof typeof dict];
        expect(other.trim(), key).not.toBe('');
        expect(holes(other), key).toEqual(holes(text));
      }
    }
  });

  it('fills placeholders', () => {
    expect(t('say.camera', { name: 'chase' })).toMatch(/: chase$/);
  });
});
