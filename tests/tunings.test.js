// Ausführen: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const { TUNINGS, parseNote, midiToFreq } = require('../js/tunings.js');

const STRING_COUNTS = { guitar: [6, 7], bass: [4, 5, 6], ukulele: [4] };

const byId = (instrument, id) => TUNINGS[instrument].find((t) => t.id === id);

test('alle früheren IDs gibt es noch (gespeicherte Auswahl und Favoriten)', () => {
  const legacy = {
    guitar: ['standard', 'eb-standard', 'd-standard', 'c-standard', 'drop-d', 'double-drop-d', 'drop-c-sharp',
      'drop-c', 'drop-b', 'drop-a', 'open-d', 'open-d-minor', 'open-e', 'open-g', 'open-a', 'open-c', 'dadgad'],
    bass: ['standard', 'eb-standard', 'd-standard', 'drop-d', 'drop-c', 'drop-b', '5-standard', '5-drop-a', '5-high-c'],
    ukulele: ['standard', 'low-g', 'd-tuning', 'baritone'],
  };
  for (const [instrument, ids] of Object.entries(legacy)) {
    for (const id of ids) assert.ok(byId(instrument, id), `${instrument}/${id} fehlt`);
  }
});

test('erzeugte Stimmungen haben die richtigen Töne und Schreibweisen', () => {
  const notes = (instrument, id) => byId(instrument, id).notes.join(' ');
  assert.strictEqual(notes('guitar', 'standard'), 'E2 A2 D3 G3 B3 E4');
  assert.strictEqual(notes('guitar', 'eb-standard'), 'Eb2 Ab2 Db3 Gb3 Bb3 Eb4');
  assert.strictEqual(notes('guitar', 'c-standard'), 'C2 F2 Bb2 Eb3 G3 C4');
  assert.strictEqual(notes('guitar', 'b-standard'), 'B1 E2 A2 D3 F#3 B3');
  assert.strictEqual(notes('guitar', 'drop-d'), 'D2 A2 D3 G3 B3 E4');
  assert.strictEqual(notes('guitar', 'drop-c-sharp'), 'C#2 G#2 C#3 F#3 A#3 D#4');
  assert.strictEqual(notes('guitar', 'drop-a-sharp'), 'A#1 F2 A#2 D#3 G3 C4');
  assert.strictEqual(notes('guitar', 'open-e'), 'E2 B2 E3 G#3 B3 E4');
  assert.strictEqual(notes('guitar', 'open-eb'), 'Eb2 Bb2 Eb3 G3 Bb3 Eb4');
  assert.strictEqual(notes('guitar', 'open-c'), 'C2 G2 C3 G3 C4 E4');
  assert.strictEqual(notes('guitar', 'open-g'), 'D2 G2 D3 G3 B3 D4');
  assert.strictEqual(notes('guitar', 'open-a'), 'E2 A2 E3 A3 C#4 E4');
  assert.strictEqual(notes('guitar', 'open-d-minor'), 'D2 A2 D3 F3 A3 D4');
  assert.strictEqual(notes('guitar', 'open-g-minor'), 'D2 G2 D3 G3 Bb3 D4');
  assert.strictEqual(notes('guitar', 'dadgad'), 'D2 A2 D3 G3 A3 D4');
  assert.strictEqual(notes('guitar', '7-standard'), 'B1 E2 A2 D3 G3 B3 E4');
  assert.strictEqual(notes('bass', 'drop-b'), 'B0 F#1 B1 E2');
  assert.strictEqual(notes('bass', '5-standard'), 'B0 E1 A1 D2 G2');
  assert.strictEqual(notes('ukulele', 'standard'), 'G4 C4 E4 A4');
  assert.strictEqual(notes('ukulele', 'd-tuning'), 'A4 D4 F#4 B4');
  assert.strictEqual(notes('ukulele', 'bb-tuning'), 'F4 Bb3 D4 G4');
  assert.strictEqual(notes('ukulele', 'low-g'), 'G3 C4 E4 A4');
});

test('keine Saite unter A0 (27,5 Hz), darunter wird die Erkennung unzuverlässig', () => {
  for (const [instrument, tunings] of Object.entries(TUNINGS)) {
    for (const t of tunings) {
      for (const n of t.notes) assert.ok(parseNote(n).midi >= 21, `${instrument} ${t.name}: ${n}`);
    }
  }
});

for (const [instrument, tunings] of Object.entries(TUNINGS)) {
  test(`${instrument}: IDs eindeutig, Saitenzahl passt, alle Noten gültig`, () => {
    const ids = tunings.map((t) => t.id);
    assert.strictEqual(new Set(ids).size, ids.length, 'doppelte ID');
    assert.strictEqual(tunings[0].id, 'standard', 'Standard muss zuerst kommen (Default)');
    for (const t of tunings) {
      assert.ok(STRING_COUNTS[instrument].includes(t.notes.length), `${t.name}: ${t.notes.length} Saiten`);
      for (const n of t.notes) assert.doesNotThrow(() => parseNote(n), `${t.name}: ${n}`);
    }
  });
}

test('Gitarren- und Bassstimmungen steigen von Saite zu Saite an', () => {
  for (const instrument of ['guitar', 'bass']) {
    for (const t of TUNINGS[instrument]) {
      const midis = t.notes.map((n) => parseNote(n).midi);
      for (let i = 1; i < midis.length; i++) {
        assert.ok(midis[i] > midis[i - 1], `${instrument} ${t.name}: ${t.notes[i - 1]} -> ${t.notes[i]}`);
      }
    }
  }
});

test('Notenumrechnung', () => {
  assert.deepStrictEqual(parseNote('Eb2'), { name: 'E♭', octave: 2, midi: 39 });
  assert.strictEqual(parseNote('C#2').name, 'C♯');
  assert.strictEqual(parseNote('B0').midi, 23);
  assert.throws(() => parseNote('H2'));
});

test('Frequenzen bei 440 Hz und anderem Kammerton', () => {
  const hz = (note, a4) => midiToFreq(parseNote(note).midi, a4);
  assert.strictEqual(hz('A4'), 440);
  assert.ok(Math.abs(hz('E2') - 82.407) < 0.001);
  assert.ok(Math.abs(hz('B0') - 30.868) < 0.001);
  assert.ok(Math.abs(hz('A2', 432) - 108) < 1e-9);
  assert.ok(Math.abs(hz('A4', 442) - 442) < 1e-9);
});
