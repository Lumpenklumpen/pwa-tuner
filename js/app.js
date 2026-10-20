'use strict';

const STORAGE_KEY = 'pwa-tuner';
const DEG_PER_CENT = 1.8; // ±50 ct = ±90°: Halbkreis
const PIVOT = { x: 150, y: 158 };

const PREVIEW_PATH = 'M10 120 A90 90 0 0 1 190 120 Z'; // Halbkreis für die Theme-Vorschau

const THEMES = [
  { id: 'light', key: 'theme.light', bg: '#f3f4f8', accent: '#5b4ff5' },
  { id: 'dark', key: 'theme.dark', bg: '#0b0c10', accent: '#8b80ff' },
  { id: 'led', key: 'theme.led', bg: '#040404', accent: '#ffb000' },
];

const STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>';
const SVG_NS_APP = 'http://www.w3.org/2000/svg';

const $ = (sel) => document.querySelector(sel);
// Dezimaltrennzeichen nach Sprache: 82.41 (en) bzw. 82,41 (de)
const fmtHz = (hz, digits = 2) => hz.toFixed(digits).replace('.', i18n.lang === 'de' ? ',' : '.');

// --- Persistenz ------------------------------------------------------------

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

const state = Object.assign(
  { theme: document.documentElement.dataset.theme || 'dark', instrument: 'guitar', a4: 440, lang: DEFAULT_LANGUAGE },
  loadState(),
);
state.tuning = Object.assign({ guitar: 'standard', bass: 'standard', ukulele: 'standard' }, state.tuning);
state.favorites = Object.assign({ guitar: [], bass: [], ukulele: [] }, state.favorites);

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // privater Modus o. Ä.: App funktioniert trotzdem, nur ohne Speichern
  }
}

// Laufzeitzustand, wird nicht gespeichert
const ui = {
  auto: true, // Saite automatisch erkennen
  activeString: 0, // erkannte bzw. manuell gewählte Saite
};

// --- Theme -----------------------------------------------------------------

function applyTheme(id) {
  // Alte Themes (Acid, Blueorange) fallen auf Dunkel zurück
  const theme = THEMES.find((t) => t.id === id) || THEMES[1];
  state.theme = theme.id;
  document.documentElement.dataset.theme = theme.id;
  document.querySelector('meta[name="theme-color"]').content = theme.bg;
  for (const el of document.querySelectorAll('.theme-option')) {
    el.setAttribute('aria-checked', String(el.dataset.themeId === theme.id));
  }
  saveState();
  lastDrawn.note = lastDrawn.freq = null; // LED-Matrix neu zeichnen
  renderTarget();
}

function renderThemeList() {
  const list = $('#themeList');
  list.innerHTML = '';
  for (const t of THEMES) {
    const led = t.id === 'led';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-option';
    btn.dataset.themeId = t.id;
    btn.setAttribute('role', 'radio');
    btn.innerHTML = `
      <span class="theme-preview" style="background:${t.bg}">
        <svg viewBox="0 0 200 130" aria-hidden="true">
          <path d="${PREVIEW_PATH}" fill="${led ? 'none' : t.accent}" stroke="${t.accent}"
                stroke-width="${led ? 14 : 0}" stroke-linecap="round" stroke-dasharray="${led ? '0 26' : 'none'}"/>
        </svg>
      </span>
      <span>${tr(t.key)}</span>`;
    btn.addEventListener('click', () => applyTheme(t.id));
    list.append(btn);
  }
}

// --- Kammerton -------------------------------------------------------------

const A4_MIN = 420;
const A4_MAX = 460;

function setA4(hz) {
  state.a4 = Math.max(A4_MIN, Math.min(A4_MAX, Math.round(hz) || 440));
  saveState();
  $('#a4Value').textContent = `${state.a4} Hz`;
  $('#a4Down').disabled = state.a4 <= A4_MIN;
  $('#a4Up').disabled = state.a4 >= A4_MAX;
  $('#a4Reset').hidden = state.a4 === 440;
  renderTuning();
}

function setupA4() {
  $('#a4Down').addEventListener('click', () => setA4(state.a4 - 1));
  $('#a4Up').addEventListener('click', () => setA4(state.a4 + 1));
  $('#a4Reset').addEventListener('click', () => setA4(440));
}

// --- Menü ------------------------------------------------------------------

function setMenuOpen(open) {
  $('#menu').hidden = !open;
  $('#scrim').hidden = !open;
  $('#menuBtn').setAttribute('aria-expanded', String(open));
  if (open) $('#menuClose').focus();
}

// --- Stimmungen ------------------------------------------------------------

function tuningsFor(instrument = state.instrument) {
  return TUNINGS[instrument];
}

function currentTuning() {
  const list = tuningsFor();
  return list.find((t) => t.id === state.tuning[state.instrument]) || list[0];
}

function isFavorite(id) {
  return state.favorites[state.instrument].includes(id);
}

function toggleFavorite(id) {
  const favs = state.favorites[state.instrument];
  const i = favs.indexOf(id);
  if (i >= 0) favs.splice(i, 1);
  else favs.push(id);
  saveState();
}

/** Angezeigter Name einer Stimmung in der aktuellen Sprache. */
function tuningLabel(tuning) {
  return tr(tuning.name[0], tuning.name[1]);
}

function noteLabels(tuning) {
  return tuning.notes.map((n) => parseNote(n).name);
}

function selectTuning(id) {
  state.tuning[state.instrument] = id;
  saveState();
  ui.auto = true;
  ui.activeString = 0;
  renderTuning();
}

// --- Stimmungsauswahl (Dropdown ohne Tastatur) ------------------------------

const picker = {
  open: false,
  options: [], // Stimmungen in Anzeigereihenfolge (Favoriten zuerst)
  active: -1,
};

function openList() {
  if (picker.open) return;
  picker.open = true;
  $('#tuningBtn').setAttribute('aria-expanded', 'true');
  const list = $('#tuningList');
  list.hidden = false;
  renderList();
  // Oben anfangen, damit die Favoriten sichtbar sind; die gewählte Stimmung ist trotzdem markiert
  list.scrollTop = 0;
  setActive(picker.options.findIndex((t) => t.id === currentTuning().id), false);
  list.focus({ preventScroll: true });
}

function closeList(returnFocus = false) {
  if (!picker.open) return;
  picker.open = false;
  picker.active = -1;
  $('#tuningBtn').setAttribute('aria-expanded', 'false');
  $('#tuningList').hidden = true;
  $('#tuningList').removeAttribute('aria-activedescendant');
  if (returnFocus) $('#tuningBtn').focus();
}

function chooseTuning(id) {
  selectTuning(id);
  closeList(true);
}

function renderList() {
  const list = $('#tuningList');
  const all = tuningsFor();
  const favs = all.filter((t) => isFavorite(t.id));
  const rest = all.filter((t) => !isFavorite(t.id));
  picker.options = [...favs, ...rest];
  list.innerHTML = '';

  const addGroup = (title) => {
    const li = document.createElement('li');
    li.className = 'group';
    li.setAttribute('role', 'presentation');
    li.textContent = title;
    list.append(li);
  };

  picker.options.forEach((t, i) => {
    // Favoriten oben, danach eine Überschrift bei jedem Gruppenwechsel (Standard, Drop, Open …)
    if (favs.length && i === 0) addGroup(tr('tuning.favorites'));
    if (i >= favs.length && (i === favs.length || t.group !== picker.options[i - 1].group)) addGroup(tr(t.group));
    const li = document.createElement('li');
    li.className = 'option';
    li.id = `opt-${t.id}`;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(t.id === currentTuning().id));
    li.innerHTML = `
      <button class="star" type="button" tabindex="-1" aria-pressed="${isFavorite(t.id)}"
              aria-label="${tr('tuning.favorite', { name: tuningLabel(t) })}">${STAR_SVG}</button>
      <span class="opt-name"></span>
      <span class="opt-notes">${noteLabels(t).join(' ')}</span>`;
    li.querySelector('.opt-name').textContent = tuningLabel(t);
    li.addEventListener('click', (e) => {
      if (e.target.closest('.star')) {
        toggleFavorite(t.id);
        const scroll = list.scrollTop;
        renderList();
        list.scrollTop = scroll;
        setActive(picker.options.findIndex((o) => o.id === t.id), false);
        return;
      }
      chooseTuning(t.id);
    });
    list.append(li);
  });
}

function setActive(index, scroll = true) {
  const list = $('#tuningList');
  for (const el of list.querySelectorAll('.option.active')) el.classList.remove('active');
  picker.active = index;
  const t = picker.options[index];
  if (!t) {
    list.removeAttribute('aria-activedescendant');
    return;
  }
  const el = document.getElementById(`opt-${t.id}`);
  el.classList.add('active');
  list.setAttribute('aria-activedescendant', el.id);
  if (scroll) el.scrollIntoView({ block: 'nearest' });
}

function setupPicker() {
  const btn = $('#tuningBtn');
  const list = $('#tuningList');

  btn.addEventListener('click', () => (picker.open ? closeList() : openList()));
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openList();
    }
  });

  list.addEventListener('keydown', (e) => {
    const n = picker.options.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((picker.active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const t = picker.options[picker.active];
      if (t) chooseTuning(t.id);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      closeList(true);
    } else if (e.key === 'Tab') {
      closeList();
    }
  });

  // Tippen außerhalb schließt die Liste
  document.addEventListener('pointerdown', (e) => {
    if (picker.open && !e.target.closest('.tuning-row')) closeList();
  });
}

// --- Skala & Anzeige -------------------------------------------------------

const SCALE_RADIUS = 128;

/** Punkt auf dem Kreis um den Drehpunkt; cents bestimmt den Winkel. */
function polar(cents, r) {
  const a = (cents * DEG_PER_CENT * Math.PI) / 180;
  return { x: PIVOT.x + r * Math.sin(a), y: PIVOT.y - r * Math.cos(a) };
}

function arcPath(fromCents, toCents, r) {
  const a = polar(fromCents, r);
  const b = polar(toCents, r);
  return `M${a.x.toFixed(2)} ${a.y.toFixed(2)} A${r} ${r} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS_APP, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function buildScale() {
  const g = $('#scale');
  g.replaceChildren(
    svgEl('path', { class: 'track', d: arcPath(-50, 50, SCALE_RADIUS) }),
    svgEl('path', { class: 'zone', d: arcPath(-IN_TUNE_CENTS, IN_TUNE_CENTS, SCALE_RADIUS) }),
  );
  for (let c = -50; c <= 50; c += 5) {
    const major = c % 25 === 0;
    const a = polar(c, SCALE_RADIUS + (c === 0 ? 3 : 5));
    const b = polar(c, SCALE_RADIUS + (c === 0 ? 17 : major ? 15 : c % 10 === 0 ? 12 : 10));
    g.append(svgEl('line', {
      class: `tick${major ? ' major' : ''}${c === 0 ? ' center' : ''}`,
      x1: a.x, y1: a.y, x2: b.x, y2: b.y,
    }));
  }
  // ±50 unter den Enden des Bogens, ±25 innen am Bogen
  for (const c of [-50, -25, 25, 50]) {
    const p = Math.abs(c) === 50 ? { ...polar(c, SCALE_RADIUS), y: PIVOT.y + 16 } : polar(c, SCALE_RADIUS - 16);
    const label = svgEl('text', { class: 'scale-label', x: p.x, y: p.y + 3.5, 'text-anchor': 'middle' });
    label.textContent = c < 0 ? `−${-c}` : `+${c}`;
    g.append(label);
  }
}

function setNeedle(cents) {
  const clamped = Math.max(-50, Math.min(50, cents));
  $('#needle').style.transform = `rotate(${clamped * DEG_PER_CENT}deg)`;
}

function setStatus(status) {
  $('#tuner').dataset.status = status;
}

// LED-Matrix nur neu zeichnen, wenn sich der Text ändert
const lastDrawn = { note: null, freq: null };

function showNote(name, octave) {
  const note = $('#note');
  note.textContent = name;
  const oct = svgEl('tspan', { class: 'oct', dx: '2' });
  oct.textContent = octave;
  note.append(oct);
  if (document.documentElement.dataset.theme === 'led' && lastDrawn.note !== name) {
    drawMatrix($('#noteLed'), name, { x: PIVOT.x, y: 104, cell: 6, anchor: 'middle' });
    lastDrawn.note = name;
  }
}

function showFreq(text) {
  $('#freq').textContent = text;
  if (document.documentElement.dataset.theme === 'led' && lastDrawn.freq !== text) {
    drawMatrixSvg($('#freqLed'), text);
    lastDrawn.freq = text;
  }
}

function renderStrings() {
  const tuning = currentTuning();
  const wrap = $('#strings');
  wrap.innerHTML = '';
  tuning.notes.forEach((n, i) => {
    const note = parseNote(n);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'string';
    btn.classList.toggle('active', i === ui.activeString);
    btn.setAttribute('aria-pressed', String(!ui.auto && i === ui.activeString));
    btn.setAttribute('aria-label', tr('strings.string', { note: `${note.name}${note.octave}` }));
    btn.innerHTML = `${note.name}<sub>${note.octave}</sub>`;
    btn.addEventListener('click', () => {
      ui.auto = false;
      ui.activeString = i;
      resetDetection();
      renderStrings();
      renderTarget();
    });
    wrap.append(btn);
  });
  $('#autoBtn').setAttribute('aria-checked', String(ui.auto));
  $('#stringMode').textContent = tr(ui.auto ? 'strings.auto' : 'strings.manual');
}

function renderTarget() {
  const note = parseNote(currentTuning().notes[ui.activeString]);
  showNote(note.name, note.octave);
  $('#targetNote').textContent = `${note.name}${note.octave}`;
  $('#targetFreq').textContent = fmtHz(midiToFreq(note.midi, state.a4));
}

function renderTuning() {
  $('#tuningName').textContent = tuningLabel(currentTuning());
  ui.activeString = Math.min(ui.activeString, currentTuning().notes.length - 1);
  const freqs = currentTuning().notes.map((n) => midiToFreq(parseNote(n).midi, state.a4));
  // Suchbereich: knapp unter der tiefsten bis deutlich über der höchsten Saite
  mic.setRange(Math.min(...freqs) * 0.75, Math.max(...freqs) * 1.6);
  resetDetection();
  renderStrings();
  renderTarget();
  showIdle();
}

// --- Tonerkennung ----------------------------------------------------------

const IN_TUNE_CENTS = 4; // gilt als gestimmt
const OUT_OF_TUNE_CENTS = 5; // Hysterese: erst ab hier wieder "nicht gestimmt", sonst flackert es
const NEAR_CENTS = 15;
const MIN_CLARITY = 0.8;
const IDLE_AFTER_MS = 1500; // so lange bleibt der letzte Wert beim Ausklingen stehen
const SMOOTHING = 0.2; // Anteil des neuen Werts pro Frame; kleiner = ruhiger, aber träger
const SWITCH_FRAMES = 3; // so viele Frames in Folge, bevor die Automatik die Saite wechselt

const mic = new MicPitch(onPitchFrame);

const detection = {
  history: [], // letzte Frequenzen für den Median
  smoothCents: null,
  lastSignal: 0,
  candidate: -1,
  candidateFrames: 0,
};

function resetDetection() {
  detection.history = [];
  detection.smoothCents = null;
  detection.candidate = -1;
  detection.candidateFrames = 0;
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function stringFreq(i) {
  return midiToFreq(parseNote(currentTuning().notes[i]).midi, state.a4);
}

function nearestString(freq) {
  let best = 0;
  currentTuning().notes.forEach((_, i) => {
    if (Math.abs(centsOff(freq, stringFreq(i))) < Math.abs(centsOff(freq, stringFreq(best)))) best = i;
  });
  return best;
}

function showIdle() {
  setStatus('idle');
  showFreq('–');
  $('#cents').textContent = tr(mic.running ? 'readout.playString' : 'readout.micOff');
  setNeedle(0);
}

function statusFor(cents) {
  const abs = Math.abs(cents);
  const wasGood = $('#tuner').dataset.status === 'good';
  if (abs <= IN_TUNE_CENTS || (wasGood && abs <= OUT_OF_TUNE_CENTS)) return 'good';
  return abs <= NEAR_CENTS ? 'near' : 'far';
}

function onPitchFrame(r) {
  const now = performance.now();
  if (!r.freq || r.clarity < MIN_CLARITY) {
    if (now - detection.lastSignal > IDLE_AFTER_MS) showIdle();
    return;
  }
  detection.lastSignal = now;

  // Median über die letzten Werte gegen Ausreißer; neuer Ton (> 50 ct weg) startet frisch
  const h = detection.history;
  if (h.length && Math.abs(centsOff(r.freq, median(h))) > 50) {
    h.length = 0;
    detection.smoothCents = null;
  }
  h.push(r.freq);
  if (h.length > 5) h.shift();
  const freq = median(h);

  if (ui.auto) {
    const idx = nearestString(freq);
    if (idx !== ui.activeString) {
      detection.candidateFrames = idx === detection.candidate ? detection.candidateFrames + 1 : 1;
      detection.candidate = idx;
      if (detection.candidateFrames >= SWITCH_FRAMES) {
        ui.activeString = idx;
        detection.smoothCents = null;
        renderStrings();
        renderTarget();
      }
    } else {
      detection.candidateFrames = 0;
    }
  }

  const cents = centsOff(freq, stringFreq(ui.activeString));
  detection.smoothCents = detection.smoothCents === null
    ? cents
    : detection.smoothCents + SMOOTHING * (cents - detection.smoothCents);
  const c = detection.smoothCents;

  setStatus(statusFor(c));
  setNeedle(c);
  showFreq(fmtHz(freq, 1));
  const rounded = Math.round(c);
  $('#cents').textContent = $('#tuner').dataset.status === 'good'
    ? tr('readout.inTune')
    : tr(rounded > 0 ? 'readout.tooHigh' : 'readout.tooLow', { cents: `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)}` });
}

// --- Mikrofon --------------------------------------------------------------

let resumeAfterHide = false;

// Fehlermeldung als Schlüssel merken, damit sie beim Sprachwechsel neu übersetzt werden kann
let micMessage = null; // [Schlüssel, Platzhalter] oder null

function showMicMessage(key = null, params = {}) {
  micMessage = key ? [key, params] : null;
  $('#micMsg').textContent = key ? tr(key, params) : '';
  $('#micMsg').hidden = !key;
}

function updateMicUi() {
  $('#micBtn').hidden = mic.running;
  if (mic.running) showMicMessage();
  setWakeLock(mic.running);
  showIdle();
}

// Bildschirm beim Stimmen anlassen. Android gibt die Sperre beim Wechsel in den
// Hintergrund selbst frei; beim Zurückkehren startet startMic() und holt sie neu.
let wakeLock = null; // Promise der Anforderung, damit parallele Aufrufe nicht doppelt sperren

function setWakeLock(on) {
  if (on && !wakeLock && 'wakeLock' in navigator) {
    wakeLock = navigator.wakeLock.request('screen').then((lock) => {
      lock.addEventListener('release', () => { wakeLock = null; });
      return lock;
    });
    // z. B. Energiesparmodus: dann geht der Bildschirm eben normal aus
    wakeLock.catch(() => { wakeLock = null; });
  } else if (!on && wakeLock) {
    wakeLock.then((lock) => lock.release()).catch(() => {});
  }
}

async function startMic() {
  try {
    await mic.start();
    mic.ctx.addEventListener('statechange', updateMicUi);
    // Ohne Nutzergeste bleibt der AudioContext pausiert, dann muss der Knopf getippt werden
    if (mic.ctx.state !== 'running') mic.resume();
  } catch (err) {
    mic.stop();
    const name = err?.name || err?.message;
    const key = { insecure: 'mic.insecure', NotAllowedError: 'mic.denied', NotFoundError: 'mic.notFound' }[name];
    showMicMessage(key || 'mic.failed', { error: name });
  }
  updateMicUi();
}

function setupMic() {
  $('#micBtn').addEventListener('click', () => (mic.ctx ? mic.resume() : startMic()));

  // Im Hintergrund das Mikrofon freigeben (Akku, Mikrofon-Anzeige), beim Zurückkehren wieder an
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && mic.ctx) {
      resumeAfterHide = true;
      mic.stop();
    } else if (!document.hidden && resumeAfterHide) {
      resumeAfterHide = false;
      startMic();
    }
  });

  // Wurde das Mikrofon schon einmal erlaubt, direkt starten
  navigator.permissions?.query({ name: 'microphone' })
    .then((p) => { if (p.state === 'granted') startMic(); })
    .catch(() => {});
}

// --- Instrument-Tabs -------------------------------------------------------

function selectInstrument(id) {
  state.instrument = id;
  for (const tab of document.querySelectorAll('.tab')) {
    tab.setAttribute('aria-selected', String(tab.dataset.instrument === id));
  }
  saveState();
  ui.auto = true;
  ui.activeString = 0;
  renderTuning();
}

// --- PWA -------------------------------------------------------------------

function setupPwa() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Chrome bietet die Installation per Event an; der Knopf im Menü löst sie aus
  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    $('#installBtn').hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    $('#installBtn').hidden = true;
  });
  $('#installBtn').addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    $('#installBtn').hidden = true;
    setMenuOpen(false);
  });
}

// --- Sprache ---------------------------------------------------------------

function renderLanguageSelect() {
  const select = $('#langSelect');
  select.replaceChildren(...LANGUAGES.map((l) => new Option(l.name, l.id, false, l.id === i18n.lang)));
}

/** Nach einem Sprachwechsel alle Texte neu setzen, auch die per JavaScript erzeugten. */
function renderTexts() {
  translateDom();
  $('#langSelect').value = i18n.lang;
  renderThemeList();
  applyTheme(state.theme);
  renderTuning();
  if (picker.open) renderList();
  if (micMessage) showMicMessage(...micMessage);
  $('#a4Value').textContent = `${state.a4} Hz`;
}

async function changeLanguage(lang) {
  state.lang = await setLanguage(lang);
  saveState();
  renderTexts();
}

// --- Start -----------------------------------------------------------------

async function init() {
  try {
    state.lang = await setLanguage(state.lang);
  } catch {
    // Sprachdatei nicht ladbar (sollte dank Offline-Cache nicht passieren): Schlüssel statt Texte
  }
  document.documentElement.classList.remove('i18n-loading');
  translateDom();
  renderLanguageSelect();
  $('#langSelect').addEventListener('change', (e) => changeLanguage(e.target.value));
  renderThemeList();
  buildScale();
  setupPicker();
  selectInstrument(TUNINGS[state.instrument] ? state.instrument : 'guitar');
  applyTheme(state.theme);
  setupA4();
  setA4(state.a4);
  setupMic();
  updateMicUi();
  setupPwa();

  $('#autoBtn').addEventListener('click', () => {
    ui.auto = !ui.auto;
    resetDetection();
    renderStrings();
  });
  $('#menuBtn').addEventListener('click', () => setMenuOpen(true));
  $('#menuClose').addEventListener('click', () => setMenuOpen(false));
  $('#scrim').addEventListener('click', () => setMenuOpen(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setMenuOpen(false);
  });
  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => selectInstrument(tab.dataset.instrument));
  }
}

init();
