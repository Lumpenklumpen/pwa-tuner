// Ausführen: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { APP_VERSION } = require('../js/version.js');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Version ist im Format MAJOR.MINOR.PATCH', () => {
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/);
});

test('CHANGELOG hat einen Eintrag für die aktuelle Version', () => {
  assert.ok(read('CHANGELOG.md').includes(`## [${APP_VERSION}]`), `## [${APP_VERSION}] fehlt in CHANGELOG.md`);
});

test('der Service Worker benennt seinen Cache nach der Version', () => {
  const sw = read('sw.js');
  assert.ok(sw.includes("importScripts('js/version.js')"));
  assert.ok(sw.includes('APP_VERSION'));
});

test('jede Datei im Offline-Cache wird auch auf GitHub Pages veröffentlicht', () => {
  const copyLine = read('.github/workflows/deploy.yml').match(/cp -r (.+) _site\//)[1].split(/\s+/);
  const files = [...read('sw.js').matchAll(/^\s+'([^']+)',$/gm)].map((m) => m[1]).filter((f) => f !== './');
  for (const f of files) {
    assert.ok(copyLine.includes(f.split('/')[0]), `${f} wird vom Deploy nicht kopiert`);
  }
});
