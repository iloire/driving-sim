import { describe, expect, it } from 'vitest';
import { buffet, contrailStrength, groundWash, vortexStrength } from './jet-effects';

describe('the Jet effects', () => {
  it('leaves a contrail only in the cold air up high', () => {
    expect(contrailStrength(600)).toBe(0);
    expect(contrailStrength(7000)).toBe(0);
    expect(contrailStrength(8250)).toBeCloseTo(0.5);
    expect(contrailStrength(11000)).toBe(1);
  });

  it('trails vapour off the wingtips on a hard pull, not cruising, and not when slow', () => {
    expect(vortexStrength(1, 2, 250)).toBe(0);
    expect(vortexStrength(7.5, 12, 250)).toBe(1);
    expect(vortexStrength(1.2, 20, 250)).toBe(1);
    expect(vortexStrength(8, 20, 40)).toBe(0);
  });

  it('throws up dust or spray only fast and low', () => {
    expect(groundWash(10, 300)).toBeGreaterThan(0.8);
    expect(groundWash(100, 300)).toBe(0);
    expect(groundWash(10, 60)).toBe(0);
  });

  it('buffets hardest at the sound barrier, and calms either side of it', () => {
    expect(buffet(1, 500, 340)).toBeCloseTo(0.8);
    expect(buffet(0.8, 500, 270)).toBeLessThan(0.01);
    expect(buffet(1.2, 500, 400)).toBeLessThan(0.01);
    expect(buffet(0.8, 8, 270)).toBeGreaterThan(0.3);
  });
});
