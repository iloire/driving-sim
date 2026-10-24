// Engine and tyres, synthesised: a four-cylinder's firing note (two pulses a revolution) through
// a filter that opens with the throttle, band-passed noise for the tyres when they slide, and a
// low roar of the same noise while the turbo is lit. The Jet has its own turbine instead (`jet`),
// and its airbrake clunks out and rumbles in the airflow.
// Browsers only start audio after a user gesture, so it wakes on the first key or touch.
// Everything runs through a low-pass at the end that muffles it as the pilot greys out under g,
// except the cockpit warnings (`warnings.ts`), which play into the pilot's headset.

import { Warnings, type WarningState } from './warnings';

export class CarAudio {
  private ctx: AudioContext | null = null;
  private engine?: { osc: OscillatorNode; sub: OscillatorNode; subGain: GainNode; filter: BiquadFilterNode; gain: GainNode };
  /** An electric motor hums instead of firing: a purer note, no sub-octave. */
  electric = false;
  /** A turbine instead of a piston engine: roar, whine, afterburner rumble and wind. */
  jet = false;
  private turbine?: { roar: GainNode; roarFilter: BiquadFilterNode; whine: OscillatorNode[]; whineGain: GainNode; burner: GainNode; wind: GainNode; windFilter: BiquadFilterNode; buffet: GainNode };
  /** How far the airbrake was out last frame, to hear it start out or stow. */
  private brakeOut = 0;
  private tyres?: GainNode;
  private roar?: GainNode;
  private master?: GainNode;
  private muffle?: BiquadFilterNode;
  private cockpit?: GainNode;
  private warn?: Warnings;
  muted = false;
  private paused = false;

  constructor() {
    const wake = () => {
      this.start();
      window.removeEventListener('keydown', wake);
      window.removeEventListener('pointerdown', wake);
    };
    window.addEventListener('keydown', wake);
    window.addEventListener('pointerdown', wake);
  }

  private start(): void {
    if (this.ctx) return;
    const ctx = (this.ctx = new AudioContext());
    if (this.paused) void ctx.suspend();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 18000;
    this.master.connect(this.muffle).connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const sub = ctx.createOscillator();
    sub.type = 'square';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 3;
    const gain = ctx.createGain();
    const subGain = ctx.createGain();
    subGain.gain.value = 0.35;
    osc.connect(filter);
    sub.connect(subGain).connect(filter);
    filter.connect(gain).connect(this.master);
    osc.start();
    sub.start();
    this.engine = { osc, sub, subGain, filter, gain };

    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1400;
    band.Q.value = 1.2;
    this.tyres = ctx.createGain();
    this.tyres.gain.value = 0;
    src.connect(band).connect(this.tyres).connect(this.master);
    src.start();

    // The turbo's roar: the same noise, low and loud.
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 520;
    this.roar = ctx.createGain();
    this.roar.gain.value = 0;
    const roarSrc = ctx.createBufferSource();
    roarSrc.buffer = noise;
    roarSrc.loop = true;
    roarSrc.connect(low).connect(this.roar).connect(this.master);
    roarSrc.start();
    this.turbine = this.buildTurbine(ctx, noise, this.master);
    this.cockpit = ctx.createGain();
    this.cockpit.gain.value = this.muted ? 0 : 1;
    this.cockpit.connect(ctx.destination);
    this.warn = new Warnings(ctx, this.cockpit, noise);
  }

  /**
   * The Jet: the same noise three ways (a roar that opens with the thrust, a deep afterburner
   * rumble that crackles, wind that rises with airspeed) and two slightly detuned sines for the
   * turbine's whine, which beat against each other the way a real one wavers.
   */
  private buildTurbine(ctx: AudioContext, noise: AudioBuffer, out: AudioNode): NonNullable<CarAudio['turbine']> {
    const loop = (buffer: AudioBuffer) => {
      const s = ctx.createBufferSource();
      s.buffer = buffer;
      s.loop = true;
      s.start();
      return s;
    };
    const silent = () => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(out);
      return g;
    };
    const roar = silent(), burner = silent(), wind = silent(), whineGain = silent(), buffet = silent();
    const roarFilter = ctx.createBiquadFilter();
    roarFilter.type = 'lowpass';
    roarFilter.Q.value = 0.8;
    loop(noise).connect(roarFilter).connect(roar);

    // The afterburner: sparse pops over a low rumble, in a 2 s loop so the crackle never repeats audibly.
    const n = ctx.sampleRate * 2;
    const crackle = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = crackle.getChannelData(0);
    let level = 0;
    for (let i = 0; i < n; i++) {
      if (Math.random() < 0.0015) level = 0.6 + Math.random() * 0.8;
      level *= 0.9985;
      d[i] = (Math.random() * 2 - 1) * (0.45 + level);
    }
    const rumble = ctx.createBiquadFilter();
    rumble.type = 'lowpass';
    rumble.frequency.value = 260;
    loop(crackle).connect(rumble).connect(burner);

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.Q.value = 0.6;
    loop(noise).connect(windFilter).connect(wind);

    const whine = [0, 7].map((detune) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.detune.value = detune;
      o.connect(whineGain);
      o.start();
      return o;
    });
    // The airbrake's buffet: a low band of the noise fluttering at about 11 Hz as the wake breaks off the panel.
    const thud = ctx.createBiquadFilter();
    thud.type = 'bandpass';
    thud.frequency.value = 180;
    thud.Q.value = 0.9;
    const flutter = ctx.createGain();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 11;
    const depth = ctx.createGain();
    depth.gain.value = 0.45;
    lfo.connect(depth).connect(flutter.gain);
    lfo.start();
    loop(noise).connect(thud).connect(flutter).connect(buffet);
    return { roar, roarFilter, whine, whineGain, burner, wind, windFilter, buffet };
  }

  /** A balloon going: a bright snap, then a falling squeak; higher on a bigger combo. */
  pop(combo: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const n = Math.floor(ctx.sampleRate * 0.08);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (n * 0.12));
    const snap = ctx.createBufferSource();
    snap.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const sg = ctx.createGain();
    sg.gain.value = 0.9;
    snap.connect(hp).connect(sg).connect(this.master);
    snap.start(t);

    const squeak = ctx.createOscillator();
    squeak.type = 'triangle';
    const top = 700 * Math.pow(1.12, combo - 1);
    squeak.frequency.setValueAtTime(top, t);
    squeak.frequency.exponentialRampToValueAtTime(top / 3.5, t + 0.16);
    const qg = ctx.createGain();
    qg.gain.setValueAtTime(0.25, t);
    qg.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    squeak.connect(qg).connect(this.master);
    squeak.start(t);
    squeak.stop(t + 0.2);
  }

  /**
   * A sonic boom: the N-wave's two cracks a tenth of a second apart, each a low thump of noise
   * with a falling sine under it, and a long rumble after.
   */
  boom(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const n = Math.floor(ctx.sampleRate * 1.6);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    const second = Math.floor(ctx.sampleRate * 0.11);
    for (let i = 0; i < n; i++) {
      const crack = Math.exp(-i / (ctx.sampleRate * 0.02)) + (i >= second ? Math.exp(-(i - second) / (ctx.sampleRate * 0.02)) : 0);
      d[i] = (Math.random() * 2 - 1) * (crack + 0.25 * Math.exp(-i / (ctx.sampleRate * 0.5)));
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 380;
    const g = ctx.createGain();
    g.gain.value = 1.6;
    src.connect(low).connect(g).connect(this.master);
    src.start(t);

    for (const at of [0, 0.11]) {
      const thump = ctx.createOscillator();
      thump.frequency.setValueAtTime(70, t + at);
      thump.frequency.exponentialRampToValueAtTime(28, t + at + 0.25);
      const tg = ctx.createGain();
      tg.gain.setValueAtTime(0.9, t + at);
      tg.gain.exponentialRampToValueAtTime(0.001, t + at + 0.3);
      thump.connect(tg).connect(this.master);
      thump.start(t + at);
      thump.stop(t + at + 0.32);
    }
  }

  /**
   * The airbrake `out` 0..1 at airspeed `speed` (m/s): a heavy clunk as it starts out, a lighter
   * one as it stows, and a rumble while it's out that grows with the square of the speed.
   */
  airbrake(out: number, speed: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.turbine) return;
    const t = ctx.currentTime;
    if (out > 0 && this.brakeOut === 0) this.clunk(t, 1);
    else if (out === 0 && this.brakeOut > 0) this.clunk(t, 0.5);
    this.brakeOut = out;
    const air = Math.min(speed / 250, 1.2);
    this.turbine.buffet.gain.setTargetAtTime(this.jet ? out * air * air * 0.6 : 0, t, 0.08);
  }

  /** A hydraulic clunk: a short knock of low noise over a dropping sine, `weight` 0..1. */
  private clunk(t: number, weight: number): void {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * 0.12);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (n * 0.15));
    const knock = ctx.createBufferSource();
    knock.buffer = buf;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 900;
    const kg = ctx.createGain();
    kg.gain.value = 0.5 * weight;
    knock.connect(low).connect(kg).connect(this.master!);
    knock.start(t);
    const body = ctx.createOscillator();
    body.frequency.setValueAtTime(140, t);
    body.frequency.exponentialRampToValueAtTime(55, t + 0.12);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.5 * weight, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    body.connect(bg).connect(this.master!);
    body.start(t);
    body.stop(t + 0.16);
  }

  /** 0..1: how muffled everything sounds, from open (0) to a dull thud through the blood (1). */
  setMuffle(k: number): void {
    if (this.muffle && this.ctx) this.muffle.frequency.setTargetAtTime(18000 * Math.pow(300 / 18000, k), this.ctx.currentTime, 0.1);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    if (this.cockpit && this.ctx) this.cockpit.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.05);
    if (muted) this.warn?.hush();
  }

  /** The cockpit warnings for this frame: PULL UP, the stall horn and the pilot's breathing. */
  warnings(s: WarningState): void {
    this.warn?.update(s, this.muted);
  }

  /** Freezes every sound while the game is paused (the context stops its clock), and picks up again. */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    if (paused) this.warn?.hush();
    if (this.ctx) void (paused ? this.ctx.suspend() : this.ctx.resume());
  }

  /** `slip` 0..1 across the tyres, `speed` m/s, `boost` the turbo, `hiss` 0..1 the hover thrusters. */
  update(rpm: number, throttle: number, slip: number, speed: number, boost: boolean, hiss = 0): void {
    if (!this.ctx || !this.engine || !this.tyres || !this.roar) return;
    const t = this.ctx.currentTime;
    const e = this.engine;
    if (this.turbine) this.updateTurbine(t, throttle, speed, boost);
    if (this.jet) {
      e.gain.gain.setTargetAtTime(0, t, 0.05);
      this.roar.gain.setTargetAtTime(0, t, 0.05);
      this.tyres.gain.setTargetAtTime(0, t, 0.04);
      return;
    }
    if (e.osc.type !== (this.electric ? 'sine' : 'sawtooth')) e.osc.type = this.electric ? 'sine' : 'sawtooth';
    e.subGain.gain.setTargetAtTime(this.electric ? 0 : 0.35, t, 0.05);
    // A four-cylinder fires twice a revolution. The motor is a quiet sine hum, about 260 Hz flat
    // out, that sits under the tyres and wind rather than over them.
    const f = this.electric ? (rpm / 60) * 0.65 + 45 : (rpm / 60) * 2;
    this.engine.osc.frequency.setTargetAtTime(f, t, 0.03);
    this.engine.sub.frequency.setTargetAtTime(f / 2, t, 0.03);
    this.engine.filter.frequency.setTargetAtTime(this.electric ? 600 : 300 + throttle * 1400 + rpm * 0.15, t, 0.05);
    this.engine.filter.Q.setTargetAtTime(this.electric ? 0.7 : 3, t, 0.05);
    this.engine.gain.gain.setTargetAtTime(this.electric ? 0.05 + throttle * 0.05 : 0.1 + throttle * 0.16, t, 0.05);
    const screech = Math.min(slip * Math.min(speed / 8, 1), 1);
    this.tyres.gain.setTargetAtTime(screech * 0.22, t, 0.04);
    // The turbo roars; the hover thrusters hiss with their lift.
    this.roar.gain.setTargetAtTime(Math.max(boost ? 0.55 : 0, hiss * 0.4), t, boost ? 0.08 : 0.3);
  }

  /** The turbine follows the throttle slowly, as a real one spools; silent unless `jet`. */
  private updateTurbine(t: number, throttle: number, speed: number, boost: boolean): void {
    const j = this.turbine!;
    const on = this.jet ? 1 : 0;
    const spool = 1.2; // seconds: how lazily the turbine chases the throttle
    j.roar.gain.setTargetAtTime(on * (0.08 + throttle * 0.32), t, spool);
    j.roarFilter.frequency.setTargetAtTime(250 + throttle * 1500, t, spool);
    // The whine climbs from about 1.4 kHz at idle to 3.6 kHz flat out, quiet under the roar.
    for (const o of j.whine) o.frequency.setTargetAtTime(1400 + throttle * 2200, t, spool);
    j.whineGain.gain.setTargetAtTime(on * (0.012 + throttle * 0.025), t, spool);
    j.burner.gain.setTargetAtTime(on * (boost ? 0.7 : 0), t, boost ? 0.25 : 0.5);
    // Wind: nothing at a crawl, a loud hiss rising in pitch towards the speed of sound.
    const air = Math.min(speed / 300, 1.1);
    j.wind.gain.setTargetAtTime(on * air * air * 0.22, t, 0.3);
    j.windFilter.frequency.setTargetAtTime(400 + air * 1800, t, 0.3);
  }
}
