'use strict';

// Mikrofon -> AnalyserNode -> YIN. Ruft onFrame(result) ~25x pro Sekunde auf:
// result = { freq, clarity, level } bei erkanntem Ton, { freq: null, level } sonst.

const RAW_SIZE = 8192; // ~170 ms bei 48 kHz: genug für das tiefe H am 5-Saiter (31 Hz)
const FRAME_MS = 40;
const MIN_LEVEL = 0.0025; // darunter gilt es als Stille (niedrig, damit ausklingende Saiten länger zählen)

class MicPitch {
  constructor(onFrame) {
    this.onFrame = onFrame;
    this.ctx = null;
    this.stream = null;
    this.range = [40, 600];
    this.timer = 0;
  }

  get running() {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  setRange(minFreq, maxFreq) {
    this.range = [minFreq, maxFreq];
  }

  /** Fordert das Mikrofon an. Wirft Fehler mit deutscher Meldung. */
  async start() {
    if (this.ctx) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('insecure');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.ctx = new AudioContext();
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = RAW_SIZE;
    source.connect(this.analyser);

    this.factor = this.ctx.sampleRate >= 44100 ? 2 : 1;
    this.raw = new Float32Array(RAW_SIZE);
    this.buf = new Float32Array(RAW_SIZE / this.factor);
    this.scratch = new Float32Array(RAW_SIZE / this.factor);
    this.timer = setInterval(() => this.analyse(), FRAME_MS);
  }

  /** Ohne vorherige Nutzergeste startet Chrome den AudioContext pausiert. */
  resume() {
    return this.ctx?.resume();
  }

  stop() {
    clearInterval(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
    this.ctx = null;
    this.stream = null;
  }

  analyse() {
    if (!this.ctx || this.ctx.state !== 'running') return;

    this.analyser.getFloatTimeDomainData(this.raw);
    const n = decimate(this.raw, this.factor, this.buf);
    const level = rms(this.buf, n);
    if (level < MIN_LEVEL) return this.onFrame({ freq: null, level });

    const sr = this.ctx.sampleRate / this.factor;
    const r = detectPitch(this.buf, n, sr, this.range[0], this.range[1], this.scratch);
    this.onFrame(r ? { ...r, level } : { freq: null, level });
  }
}
