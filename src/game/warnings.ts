// The cockpit's warnings, synthesised: the ground-proximity "whoop whoop, PULL UP" (two rising
// sweeps, then the words in the browser's speech voice), a stall horn gated at 7 Hz while the wing
// is at its angle-of-attack limit, and the pilot's strained breathing as the g builds towards a
// blackout. They play into the pilot's headset, not the world, so the grey-out doesn't muffle them.

/** What the warnings react to, each frame. */
export interface WarningState {
  pullUp: boolean;
  stall: boolean;
  /** 0..1: how hard the pilot is straining against the g (0 calm, 1 about to black out). */
  strain: number;
  /** Blacked out: no breath, no horn worth hearing. */
  out: boolean;
}

/** Seconds between PULL UP calls while it holds. */
const PULL_UP_EVERY = 1.6;

/**
 * Loudness 0..1 of a strained breath at `phase` 0..1 through one cycle: a short sharp inhale,
 * then the held grunt of the anti-g strain let out in a burst.
 */
export function breath(phase: number): number {
  const bump = (from: number, to: number) => (phase < from || phase > to ? 0 : Math.sin(Math.PI * (phase - from) / (to - from)));
  return Math.max(0.55 * bump(0, 0.22), bump(0.5, 0.7));
}

/** Seconds a breath takes: slow under a light load, quick and short near the blackout. */
export const breathPeriod = (strain: number) => 1.8 - 0.8 * strain;

export class Warnings {
  private readonly hornGain: GainNode;
  private readonly breathGain: GainNode;
  private readonly breathFilter: BiquadFilterNode;
  private nextPullUp = 0;
  private breathPhase = 0;
  private lastT = 0;
  private wasPullUp = false;

  constructor(private readonly ctx: AudioContext, private readonly out: AudioNode, noise: AudioBuffer) {
    // Stall horn: a square tone through a gate opened and shut by a 7 Hz square wave.
    const tone = ctx.createOscillator();
    tone.type = 'square';
    tone.frequency.value = 760;
    const gate = ctx.createGain();
    gate.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 7;
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(gate.gain);
    this.hornGain = ctx.createGain();
    this.hornGain.gain.value = 0;
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 2400;
    tone.connect(gate).connect(soften).connect(this.hornGain).connect(out);
    tone.start();
    lfo.start();

    // Breathing: noise through a band that drops for the grunt.
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    this.breathFilter = ctx.createBiquadFilter();
    this.breathFilter.type = 'bandpass';
    this.breathFilter.Q.value = 0.9;
    this.breathFilter.frequency.value = 1100;
    this.breathGain = ctx.createGain();
    this.breathGain.gain.value = 0;
    src.connect(this.breathFilter).connect(this.breathGain).connect(out);
    src.start();
  }

  /** `muted` stops the spoken calls too (they don't go through the audio graph). */
  update(s: WarningState, muted: boolean): void {
    const t = this.ctx.currentTime;
    const dt = Math.min(Math.max(t - this.lastT, 0), 0.1);
    this.lastT = t;

    this.hornGain.gain.setTargetAtTime(s.stall && !s.out ? 0.09 : 0, t, 0.02);

    if (s.pullUp && !s.out) {
      if (!this.wasPullUp || t >= this.nextPullUp) {
        this.whoop(t);
        this.whoop(t + 0.38);
        if (!muted) this.say('Pull up', 0.8);
        this.nextPullUp = t + PULL_UP_EVERY;
      }
    } else if (this.wasPullUp) {
      globalThis.speechSynthesis?.cancel();
    }
    this.wasPullUp = s.pullUp && !s.out;

    // Breathing runs only while straining and awake.
    const strain = s.out ? 0 : s.strain;
    if (strain > 0) this.breathPhase = (this.breathPhase + dt / breathPeriod(strain)) % 1;
    const level = breath(this.breathPhase);
    const grunt = this.breathPhase > 0.45;
    this.breathGain.gain.setTargetAtTime(strain > 0 ? level * (0.12 + 0.3 * strain) : 0, t, 0.03);
    this.breathFilter.frequency.setTargetAtTime(grunt ? 520 + 300 * (1 - strain) : 1300, t, 0.05);
  }

  /** One rising siren sweep, as ground-proximity warnings open with. */
  private whoop(at: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(320, at);
    o.frequency.exponentialRampToValueAtTime(1150, at + 0.3);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.16, at + 0.04);
    g.gain.setValueAtTime(0.16, at + 0.26);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.33);
    o.connect(f).connect(g).connect(this.out);
    o.start(at);
    o.stop(at + 0.35);
  }

  /** Speaks `text` in an English voice after `delay` seconds, cutting off any call still going. */
  private say(text: string, delay: number): void {
    const synth = globalThis.speechSynthesis;
    if (!synth) return;
    setTimeout(() => {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 1.15;
      u.pitch = 0.8;
      u.voice = synth.getVoices().find((v) => v.lang.startsWith('en')) ?? null;
      synth.speak(u);
    }, delay * 1000);
  }

  /** Silences the spoken calls (pausing, leaving for the menu). */
  hush(): void {
    globalThis.speechSynthesis?.cancel();
  }
}
