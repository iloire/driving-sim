// Engine and tyres, synthesised: a four-cylinder's firing note (two pulses a revolution) through
// a filter that opens with the throttle, band-passed noise for the tyres when they slide, and a
// low roar of the same noise while the turbo is lit.
// Browsers only start audio after a user gesture, so it wakes on the first key or touch.

export class CarAudio {
  private ctx: AudioContext | null = null;
  private engine?: { osc: OscillatorNode; sub: OscillatorNode; subGain: GainNode; filter: BiquadFilterNode; gain: GainNode };
  /** An electric motor hums instead of firing: a purer note, no sub-octave. */
  electric = false;
  private tyres?: GainNode;
  private roar?: GainNode;
  private master?: GainNode;
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
    this.master.connect(ctx.destination);

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

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }

  /** Freezes every sound while the game is paused (the context stops its clock), and picks up again. */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    if (this.ctx) void (paused ? this.ctx.suspend() : this.ctx.resume());
  }

  /** `slip` 0..1 across the tyres, `speed` m/s, `boost` the turbo, `hiss` 0..1 the hover thrusters. */
  update(rpm: number, throttle: number, slip: number, speed: number, boost: boolean, hiss = 0): void {
    if (!this.ctx || !this.engine || !this.tyres || !this.roar) return;
    const t = this.ctx.currentTime;
    const e = this.engine;
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
}
