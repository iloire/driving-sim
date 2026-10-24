// The pilot's body under g. Blood pools in the legs over seconds rather than at once, so what the
// eyes feel (`felt`) chases the load factor slowly as it builds and faster as it eases. A quick 9 g
// snap does nothing; held, the view greys from the edges in, and past the limit the pilot blacks
// out (G-LOC) and lets go of the stick until the blood comes back. Pushing negative g reddens it.

export interface PilotSpec {
  /** Seconds for the felt g to follow a rising load, and a falling one. */
  onset: number;
  recovery: number;
  /** Felt g where the grey-out starts, and where it's total. */
  greyFrom: number;
  blackAt: number;
  /** Felt negative g where the red-out starts, and where it's total. */
  redFrom: number;
  redAt: number;
  /** A blackout lasts at least this long (s), and then until the grey falls under `wakeBelow`. */
  outFor: number;
  wakeBelow: number;
}

export const PILOT: PilotSpec = {
  onset: 4,
  recovery: 1.5,
  greyFrom: 5.5,
  blackAt: 8.3,
  redFrom: -1.8,
  redAt: -3.2,
  outFor: 3,
  wakeBelow: 0.6,
};

export interface Pilot {
  felt: number;
  /** 0..1: how far the view has greyed (1 is black), and reddened. */
  grey: number;
  red: number;
  /** Blacked out: hands off the stick; and for how long yet at the least (s). */
  out: boolean;
  outLeft: number;
}

export const createPilot = (): Pilot => ({ felt: 1, grey: 0, red: 0, out: false, outLeft: 0 });

const ramp = (v: number, from: number, to: number) => Math.min(Math.max((v - from) / (to - from), 0), 1);

/** Advances the pilot by `dt` seconds under load factor `g`. */
export function stepPilot(p: Pilot, spec: PilotSpec, g: number, dt: number): void {
  // Blood leaving the head (g rising above 1 or falling below it) is slow; coming back is quicker.
  const away = Math.abs(g - 1) > Math.abs(p.felt - 1);
  p.felt += (g - p.felt) * (1 - Math.exp(-dt / (away ? spec.onset : spec.recovery)));
  const grey = ramp(p.felt, spec.greyFrom, spec.blackAt);
  p.red = ramp(-p.felt, -spec.redFrom, -spec.redAt);
  if (!p.out && grey >= 1) {
    p.out = true;
    p.outLeft = spec.outFor;
  } else if (p.out && (p.outLeft -= dt) <= 0 && grey < spec.wakeBelow) {
    p.out = false;
  }
  // Out cold the view stays black; coming round, it clears with the blood.
  p.grey = p.out ? 1 : grey;
}
