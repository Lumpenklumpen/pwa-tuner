'use strict';

// Tonhöhenerkennung nach YIN (de Cheveigné & Kawahara 2002).
// Rein rechnerisch, ohne Web-Audio-Abhängigkeit, damit sie sich isoliert testen lässt.

const YIN_THRESHOLD = 0.12;

/**
 * Halbiert die Abtastrate (Mittelwert aus Paaren als grober Tiefpass).
 * Für Saiteninstrumente reichen ~24 kHz locker und YIN wird ~4x schneller.
 */
function decimate(input, factor, out) {
  const n = Math.floor(input.length / factor);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = 0; k < factor; k++) sum += input[i * factor + k];
    out[i] = sum / factor;
  }
  return n;
}

function rms(buf, n = buf.length) {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / n);
}

/**
 * Erkennt die Grundfrequenz in buf[0..n).
 * @returns {{freq:number, clarity:number}|null} clarity 0..1 (1 = sauberer Ton)
 */
function detectPitch(buf, n, sampleRate, minFreq, maxFreq, scratch) {
  const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));
  const tauMax = Math.min(Math.ceil(sampleRate / minFreq), Math.floor(n / 2));
  // Fenster mindestens 1,5 Perioden der tiefsten Frequenz, Rest des Puffers als Verschiebung
  const W = Math.min(n - tauMax, Math.max(1024, Math.floor(tauMax * 1.5)));
  if (W <= 0 || tauMax <= tauMin) return null;

  const d = scratch.length > tauMax ? scratch : new Float32Array(tauMax + 1);

  // Differenzfunktion + kumulativ normierte Differenz (cmnd)
  d[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < W; j++) {
      const delta = buf[j] - buf[j + tau];
      sum += delta * delta;
    }
    running += sum;
    d[tau] = running > 0 ? (sum * tau) / running : 1;
  }

  // Erstes Minimum unter der Schwelle (verhindert Oktavfehler nach unten)
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (d[t] < YIN_THRESHOLD) {
      while (t + 1 <= tauMax && d[t + 1] < d[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    // Keins unter der Schwelle: globales Minimum, wenn es noch halbwegs klar ist
    let best = tauMin;
    for (let t = tauMin + 1; t <= tauMax; t++) if (d[t] < d[best]) best = t;
    if (d[best] > 0.3) return null;
    tau = best;
  }

  // Parabolische Interpolation für Sub-Sample-Genauigkeit
  let better = tau;
  if (tau > tauMin && tau < tauMax) {
    const a = d[tau - 1];
    const b = d[tau];
    const c = d[tau + 1];
    const denom = a - 2 * b + c;
    if (denom !== 0) better = tau + (a - c) / (2 * denom);
  }

  return { freq: sampleRate / better, clarity: 1 - d[tau] };
}

/** Abstand in Cent von freq zu ref. */
function centsOff(freq, ref) {
  return 1200 * Math.log2(freq / ref);
}

if (typeof module !== 'undefined') module.exports = { decimate, rms, detectPitch, centsOff };
