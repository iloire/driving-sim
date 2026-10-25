import { describe, expect, it } from 'vitest';
import { pickPlaces, placeName, type Place } from './places';

// A corner of the Maladeta massif, in metres: Aneto with its needles, and Posets 20 km off.
const ANETO: Place = { n: 'Pico Aneto', x: 0, y: 0, ele: 3404 };
const MALDITO: Place = { n: 'Pico Maldito', x: 300, y: 100, ele: 3354 };
const DAVIU: Place = { n: 'Aguja Daviu', x: 500, y: -200, ele: 3350 };
const POSETS: Place = { n: 'Pico de Posets', x: -20000, y: 1000, ele: 3369 };
const MALADETA: Place = { n: 'Pico de la Maladeta', x: -2500, y: 1200, ele: 3312 };

describe('pickPlaces', () => {
  it('keeps one label per mountain, highest first', () => {
    const picked = pickPlaces([DAVIU, MALADETA, MALDITO, POSETS, ANETO], { max: 10, spacingM: 2000 });
    expect(picked.map((p) => p.n)).toEqual(['Pico Aneto', 'Pico de Posets', 'Pico de la Maladeta']);
  });

  it('stops at max: Tenerife gets Teide alone', () => {
    const teide: Place = { n: 'Teide', x: 0, y: 0, ele: 3715 };
    const viejo: Place = { n: 'Pico Viejo', x: -3000, y: -1000, ele: 3135 };
    expect(pickPlaces([viejo, teide], { max: 1 })).toEqual([teide]);
  });

  it('without spacing it is the plain top n', () => {
    expect(pickPlaces([DAVIU, MALDITO, ANETO], { max: 2 }).map((p) => p.n)).toEqual(['Pico Aneto', 'Pico Maldito']);
  });
});

describe('placeName', () => {
  it('prefers the Spanish name, else the first of the alternatives', () => {
    expect(placeName({ name: "Tuca d'Aneto / Maladeta de Corones", 'name:es': 'Pico Aneto' })).toBe('Pico Aneto');
    expect(placeName({ name: 'Pic de Maupas / Pico de Maupás' })).toBe('Pic de Maupas');
    expect(placeName({})).toBeUndefined();
  });
});
