// Ausführen: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { TUNINGS } = require('../js/tunings.js');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const locale = (lang) => JSON.parse(read(`locales/${lang}.json`));
const LANGS = ['en', 'de'];

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

/** Alle Schlüssel, die HTML, app.js und die Stimmungsdaten benutzen. */
function usedKeys() {
  const keys = new Set();
  for (const m of read('index.html').matchAll(/data-i18n(?:-label)?="([^"]+)"/g)) keys.add(m[1]);
  const prefixes = 'menu|settings|theme|tuning|gauge|readout|mic|strings|tabs';
  for (const m of read('js/app.js').matchAll(new RegExp(`'((?:${prefixes})\\.[\\w.]+)'`, 'g'))) keys.add(m[1]);
  for (const tunings of Object.values(TUNINGS)) {
    for (const t of tunings) {
      keys.add(t.name[0]);
      keys.add(t.group);
    }
  }
  return keys;
}

test('alle Sprachen haben dieselben Schlüssel', () => {
  const en = Object.keys(locale('en')).sort();
  for (const lang of LANGS) assert.deepStrictEqual(Object.keys(locale(lang)).sort(), en, lang);
});

test('Platzhalter stimmen zwischen den Sprachen überein', () => {
  const en = locale('en');
  for (const lang of LANGS) {
    const dict = locale(lang);
    for (const key of Object.keys(en)) {
      assert.deepStrictEqual(placeholders(dict[key]), placeholders(en[key]), `${lang}: ${key}`);
    }
  }
});

test('jeder benutzte Schlüssel ist übersetzt', () => {
  for (const lang of LANGS) {
    const dict = locale(lang);
    for (const key of usedKeys()) assert.ok(key in dict, `${lang}: ${key} fehlt`);
  }
});

test('keine unbenutzten Schlüssel', () => {
  const used = usedKeys();
  for (const key of Object.keys(locale('en'))) assert.ok(used.has(key), `${key} wird nirgends benutzt`);
});

test('Stimmungsnamen liefern die Platzhalter, die die Texte erwarten', () => {
  const en = locale('en');
  for (const tunings of Object.values(TUNINGS)) {
    for (const t of tunings) {
      const [key, params = {}] = t.name;
      assert.deepStrictEqual(Object.keys(params).sort(), placeholders(en[key]), `${t.id}: ${key}`);
    }
  }
});

test('jede Datei im Offline-Cache existiert', () => {
  const files = [...read('sw.js').matchAll(/^\s+'([^']+)',$/gm)].map((m) => m[1]).filter((f) => f !== './');
  assert.ok(files.length > 10);
  for (const f of files) assert.ok(fs.existsSync(path.join(root, f)), `${f} fehlt`);
  for (const lang of LANGS) assert.ok(files.includes(`locales/${lang}.json`), `locales/${lang}.json nicht im Cache`);
});
