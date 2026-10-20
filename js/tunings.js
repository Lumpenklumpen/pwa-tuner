'use strict';

// Stimmungen werden aus Mustern erzeugt: ein Intervall-Muster (Halbtöne ab der tiefsten Saite)
// mal einer Liste von Grundtönen. Saiten in Spielreihenfolge von der tiefsten (dicksten) Saite aus,
// bei der Ukulele in physischer Reihenfolge (re-entrant: G4 C4 E4 A4).
//
// IDs sind gespeichert (Auswahl, Favoriten) und dürfen sich nicht ändern.

const PITCH_CLASS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
// Dur-Tonarten mit b-Vorzeichen (C zählt dazu, weil Quartenstimmungen nach "b" wandern: C F B♭ E♭)
const FLAT_KEYS = new Set([0, 5, 10, 3, 8, 1, 6]);

/** "Eb2" -> { name: "E♭", octave: 2, midi: 39 } */
function parseNote(note) {
  const m = /^([A-G])([#b]?)(\d)$/.exec(note);
  if (!m) throw new Error(`Ungültige Note: ${note}`);
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const octave = Number(m[3]);
  return {
    name: m[1] + (m[2] === '#' ? '♯' : m[2] === 'b' ? '♭' : ''),
    octave,
    midi: 12 * (octave + 1) + PITCH_CLASS[m[1]] + acc,
  };
}

function midiToFreq(midi, a4 = 440) {
  return a4 * 2 ** ((midi - 69) / 12);
}

function pitchClassOf(rootName) {
  const acc = rootName[1] === '#' ? 1 : rootName[1] === 'b' ? -1 : 0;
  return (PITCH_CLASS[rootName[0]] + acc + 12) % 12;
}

/** b oder ♯? Nach dem Grundton-Namen, bei Stammtönen nach der Tonart (Moll: Paralleltonart). */
function useFlats(rootName, minor) {
  if (rootName.includes('b')) return true;
  if (rootName.includes('#')) return false;
  const pc = pitchClassOf(rootName);
  return FLAT_KEYS.has(minor ? (pc + 3) % 12 : pc);
}

function midiToNote(midi, flats) {
  return (flats ? FLAT_NAMES : SHARP_NAMES)[midi % 12] + (Math.floor(midi / 12) - 1);
}

const pretty = (name) => name.replace('#', '♯').replace(/^([A-G])b/, '$1♭');
const slug = (name) => name.toLowerCase().replace('#', '-sharp');

/**
 * Erzeugt eine Familie von Stimmungen.
 * roots: Liste der tiefsten Saite ("D2") oder [tiefste Saite, Grundton-Name] wenn der Akkord-Grundton
 * nicht die tiefste Saite ist (Open G: tiefste Saite D2, Grundton G).
 * name/group sind Übersetzungsschlüssel (locales/*.json); name liefert [Schlüssel, Platzhalter].
 */
function family({ group, shape, roots, name, id, minor = false }) {
  return roots.map((root) => {
    const [low, rootName] = Array.isArray(root) ? root : [root, root.replace(/\d/, '')];
    const lowMidi = parseNote(low).midi;
    const flats = useFlats(rootName, minor);
    return {
      id: id(slug(rootName), rootName),
      name: name(pretty(rootName), rootName),
      group,
      notes: shape.map((step) => midiToNote(lowMidi + step, flats)),
    };
  });
}

function single(group, id, nameKey, notes) {
  return { id, name: [nameKey], group, notes };
}

/** Standard, E♭ (Halbton tiefer), D (Ganzton tiefer), sonst "{root} Standard". */
function standardName(r, raw) {
  if (raw === 'E') return ['tuning.name.standard'];
  if (raw === 'Eb') return ['tuning.name.halfStepDown', { root: r }];
  if (raw === 'D') return ['tuning.name.wholeStepDown', { root: r }];
  return ['tuning.name.rootStandard', { root: r }];
}

const TUNINGS = {
  guitar: [
    ...family({
      group: 'tuning.group.standard',
      shape: [0, 5, 10, 15, 19, 24],
      roots: ['E2', 'Eb2', 'D2', 'C#2', 'C2', 'B1', 'Bb1', 'A1'],
      name: standardName,
      id: (s) => (s === 'e' ? 'standard' : `${s}-standard`),
    }),
    ...family({
      group: 'tuning.group.drop',
      shape: [0, 7, 12, 17, 21, 26],
      roots: ['Eb2', 'D2', 'C#2', 'C2', 'B1', 'A#1', 'A1', 'G#1', 'G1'],
      name: (r) => ['tuning.name.drop', { root: r }],
      id: (s) => `drop-${s}`,
    }),
    ...family({
      group: 'tuning.group.doubleDrop',
      shape: [0, 7, 12, 17, 21, 24],
      roots: ['D2', 'C#2', 'C2'],
      name: (r) => ['tuning.name.doubleDrop', { root: r }],
      id: (s) => `double-drop-${s}`,
    }),
    // Dur, Grundton auf der tiefsten Saite (Form von Open D: 1-5-1-3-5-1)
    ...family({
      group: 'tuning.group.openMajor',
      shape: [0, 7, 12, 16, 19, 24],
      roots: ['E2', 'Eb2', 'D2', 'C#2', 'B1', 'Bb1'],
      name: (r) => ['tuning.name.open', { root: r }],
      id: (s) => `open-${s}`,
    }),
    // Open C hat eine eigene, weite Form: C G C G C E
    ...family({
      group: 'tuning.group.openMajor',
      shape: [0, 7, 12, 19, 24, 28],
      roots: ['C2'],
      name: (r) => ['tuning.name.open', { root: r }],
      id: (s) => `open-${s}`,
    }),
    // Dur, Quinte auf der tiefsten Saite (Form von Open G: 5-1-5-1-3-5)
    ...family({
      group: 'tuning.group.openMajor',
      shape: [0, 5, 12, 17, 21, 24],
      roots: [['C2', 'F'], ['C#2', 'F#'], ['D2', 'G'], ['Eb2', 'Ab'], ['E2', 'A']],
      name: (r) => ['tuning.name.open', { root: r }],
      id: (s) => `open-${s}`,
    }),
    ...family({
      group: 'tuning.group.openMinor',
      shape: [0, 7, 12, 15, 19, 24],
      roots: ['E2', 'Eb2', 'D2', 'C#2', 'C2'],
      minor: true,
      name: (r) => ['tuning.name.openMinor', { root: r }],
      id: (s) => `open-${s}-minor`,
    }),
    ...family({
      group: 'tuning.group.openMinor',
      shape: [0, 5, 12, 17, 20, 24],
      roots: [['D2', 'G'], ['E2', 'A']],
      minor: true,
      name: (r) => ['tuning.name.openMinor', { root: r }],
      id: (s) => `open-${s}-minor`,
    }),
    ...family({
      group: 'tuning.group.sus4',
      shape: [0, 7, 12, 17, 19, 24],
      roots: ['D2', 'Eb2', 'C#2', 'C2'],
      name: (r, raw) => (raw === 'D' ? ['tuning.name.dadgad'] : ['tuning.name.sus4', { root: r }]),
      id: (s, raw) => (raw === 'D' ? 'dadgad' : `sus4-${s}`),
    }),
    single('tuning.group.other', 'all-fourths', 'tuning.name.allFourths', ['E2', 'A2', 'D3', 'G3', 'C4', 'F4']),
    single('tuning.group.other', 'open-c6', 'tuning.name.openC6', ['C2', 'A2', 'C3', 'G3', 'C4', 'E4']),
    single('tuning.group.other', 'new-standard', 'tuning.name.newStandard', ['C2', 'G2', 'D3', 'A3', 'E4', 'G4']),
    ...family({
      group: 'tuning.group.7string',
      shape: [0, 5, 10, 15, 20, 24, 29],
      roots: ['B1', 'Bb1', 'A1'],
      name: (r, raw) => (raw === 'B' ? ['tuning.name.7standard'] : ['tuning.name.7rootStandard', { root: r }]),
      id: (s, raw) => (raw === 'B' ? '7-standard' : `7-${s}-standard`),
    }),
    ...family({
      group: 'tuning.group.7string',
      shape: [0, 7, 12, 17, 22, 26, 31],
      roots: ['A1', 'G#1', 'G1'],
      name: (r) => ['tuning.name.7drop', { root: r }],
      id: (s) => `7-drop-${s}`,
    }),
  ],

  bass: [
    ...family({
      group: 'tuning.group.4string',
      shape: [0, 5, 10, 15],
      roots: ['E1', 'Eb1', 'D1', 'C#1', 'C1', 'B0'],
      name: standardName,
      id: (s) => (s === 'e' ? 'standard' : `${s}-standard`),
    }),
    ...family({
      group: 'tuning.group.4stringDrop',
      shape: [0, 7, 12, 17],
      roots: ['D1', 'C#1', 'C1', 'B0', 'A#0', 'A0'],
      name: (r) => ['tuning.name.drop', { root: r }],
      id: (s) => `drop-${s}`,
    }),
    ...family({
      group: 'tuning.group.5string',
      shape: [0, 5, 10, 15, 20],
      roots: ['B0', 'Bb0', 'A0'],
      name: (r, raw) => (raw === 'B' ? ['tuning.name.5standard'] : ['tuning.name.5rootStandard', { root: r }]),
      id: (s, raw) => (raw === 'B' ? '5-standard' : `5-${s}-standard`),
    }),
    single('tuning.group.5string', '5-drop-a', 'tuning.name.5dropA', ['A0', 'E1', 'A1', 'D2', 'G2']),
    single('tuning.group.5string', '5-high-c', 'tuning.name.5highC', ['E1', 'A1', 'D2', 'G2', 'C3']),
    single('tuning.group.6string', '6-standard', 'tuning.name.6standard', ['B0', 'E1', 'A1', 'D2', 'G2', 'C3']),
  ],

  ukulele: [
    // Re-entrant: die "oberste" Saite (4.) liegt eine Quinte über dem Grundton
    ...family({
      group: 'tuning.group.ukeReentrant',
      shape: [7, 0, 4, 9],
      roots: ['C4', 'D4', 'Bb3', 'B3'],
      name: (r, raw) => ({
        C: ['tuning.name.ukeStandard'],
        D: ['tuning.name.ukeD'],
        B: ['tuning.name.ukeB'],
      })[raw] || ['tuning.name.ukeRoot', { root: r }],
      id: (s, raw) => ({ C: 'standard', D: 'd-tuning' })[raw] || `${s}-tuning`,
    }),
    // Linear: tiefe 4. Saite (eine Quarte unter dem Grundton)
    ...family({
      group: 'tuning.group.ukeLow',
      shape: [-5, 0, 4, 9],
      roots: ['C4', 'D4', 'Bb3'],
      name: (r, raw) => ({ C: ['tuning.name.lowG'], D: ['tuning.name.lowA'] })[raw]
        || ['tuning.name.lowF', { root: r }],
      id: (s, raw) => ({ C: 'low-g', D: 'low-a' })[raw] || 'low-f',
    }),
    single('tuning.group.ukeBaritone', 'baritone', 'tuning.name.baritone', ['D3', 'G3', 'B3', 'E4']),
    single('tuning.group.ukeBaritone', 'u-bass', 'tuning.name.uBass', ['E1', 'A1', 'D2', 'G2']),
    single('tuning.group.other', 'open-c', 'tuning.name.slackKey', ['G4', 'C4', 'E4', 'G4']),
  ],
};

if (typeof module !== 'undefined') module.exports = { TUNINGS, parseNote, midiToFreq };
