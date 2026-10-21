// Engine and tyres, synthesised: a four-cylinder's firing note (two pulses a revolution) through
// a filter that opens with the throttle, and band-passed noise for the tyres when they slide.
// Browsers only start audio after a user gesture, so it wakes on the first key or touch.

export class CarAudio {
  private ctx: AudioContext | null = null;
  private engine?: { osc: OscillatorNode; sub: OscillatorNode; filter: BiquadFilterNode; gain: GainNode };
  private tyres?: GainNode;
  private master?: GainNode;
  muted = false;

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
    this.engine = { osc, sub, filter, gain };

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
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }

  /** `slip` 0..1 across the tyres, `speed` m/s. */
  update(rpm: number, throttle: number, slip: number, speed: number): void {
    if (!this.ctx || !this.engine || !this.tyres) return;
    const t = this.ctx.currentTime;
    const f = (rpm / 60) * 2;
    this.engine.osc.frequency.setTargetAtTime(f, t, 0.03);
    this.engine.sub.frequency.setTargetAtTime(f / 2, t, 0.03);
    this.engine.filter.frequency.setTargetAtTime(300 + throttle * 1400 + rpm * 0.15, t, 0.05);
    this.engine.gain.gain.setTargetAtTime(0.1 + throttle * 0.16, t, 0.05);
    const screech = Math.min(slip * Math.min(speed / 8, 1), 1);
    this.tyres.gain.setTargetAtTime(screech * 0.22, t, 0.04);
  }
}
