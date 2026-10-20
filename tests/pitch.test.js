// Ausführen: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const { decimate, detectPitch, centsOff } = require('../js/pitch.js');

const SR = 48000;
const RAW = 8192;

/** Saitenähnlicher Klang: Grundton schwächer als die 2. Harmonische, plus Rauschen. */
function pluck(freq, { noise = 0.02, seed = 1 } = {}) {
  const buf = new Float32Array(RAW);
  const amps = [0.6, 1.0, 0.5, 0.35, 0.2, 0.1];
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < RAW; i++) {
    let v = 0;
    amps.forEach((a, h) => { v += a * Math.sin((2 * Math.PI * freq * (h + 1) * i) / SR + h); });
    buf[i] = 0.2 * v + noise * rand();
  }
  return buf;
}

function detect(freq, minFreq, maxFreq, opts) {
  const dec = new Float32Array(RAW / 2);
  const n = decimate(pluck(freq, opts), 2, dec);
  return detectPitch(dec, n, SR / 2, minFreq, maxFreq, new Float32Array(4096));
}

const cases = [
  ['Bass B0 (5-Saiter)', 30.87, 23, 147],
  ['Bass E1', 41.2, 23, 147],
  ['Gitarre Drop A A1', 55.0, 41, 527],
  ['Gitarre E2', 82.41, 41, 527],
  ['Gitarre E4', 329.63, 41, 527],
  ['Ukulele A4', 440.0, 110, 790],
  ['Ukulele D-Stimmung B4', 493.88, 110, 790],
];

for (const [name, freq, min, max] of cases) {
  test(`${name} (${freq} Hz) auf ±2 Cent`, () => {
    const r = detect(freq, min, max);
    assert.ok(r, 'kein Ton erkannt');
    const off = centsOff(r.freq, freq);
    assert.ok(Math.abs(off) < 2, `${r.freq.toFixed(2)} Hz liegt ${off.toFixed(2)} ct daneben`);
  });
}

test('leicht verstimmt (+20 ct) wird als +20 ct erkannt', () => {
  const freq = 110 * 2 ** (20 / 1200);
  const r = detect(freq, 41, 527);
  assert.ok(Math.abs(centsOff(r.freq, 110) - 20) < 2);
});

test('reines Rauschen liefert keinen Ton', () => {
  const dec = new Float32Array(RAW / 2);
  let s = 7;
  const raw = Float32Array.from({ length: RAW }, () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1);
  const n = decimate(raw, 2, dec);
  assert.strictEqual(detectPitch(dec, n, SR / 2, 41, 527, new Float32Array(4096)), null);
});
