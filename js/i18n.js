'use strict';

// Übersetzungen: eine JSON-Datei pro Sprache in locales/ mit flachen Schlüsseln.
// Platzhalter in {geschweiften Klammern} werden beim Übersetzen ersetzt.
// Neue Sprache: locales/<id>.json anlegen und hier eintragen (Name in der eigenen Sprache).
// Notennamen werden nicht übersetzt (international C D E F G A B).

const LANGUAGES = [
  { id: 'en', name: 'English' },
  { id: 'de', name: 'Deutsch' },
];
const DEFAULT_LANGUAGE = 'en';

const i18n = {
  lang: DEFAULT_LANGUAGE,
  dict: {},
  fallback: {}, // Englisch, falls in einer Sprache ein Schlüssel fehlt
};

async function loadDict(lang) {
  const response = await fetch(`locales/${lang}.json`);
  if (!response.ok) throw new Error(`locales/${lang}.json: HTTP ${response.status}`);
  return response.json();
}

async function setLanguage(lang) {
  const id = LANGUAGES.some((l) => l.id === lang) ? lang : DEFAULT_LANGUAGE;
  const [fallback, dict] = await Promise.all([
    Object.keys(i18n.fallback).length ? i18n.fallback : loadDict(DEFAULT_LANGUAGE),
    id === DEFAULT_LANGUAGE ? null : loadDict(id),
  ]);
  i18n.fallback = fallback;
  i18n.dict = dict || fallback;
  i18n.lang = id;
  document.documentElement.lang = id;
  return id;
}

/** Übersetzt key; params ersetzen {name}-Platzhalter. Unbekannte Schlüssel kommen unverändert zurück. */
function tr(key, params = {}) {
  const text = i18n.dict[key] ?? i18n.fallback[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? params[name] : match));
}

/** Setzt alle statischen Texte im HTML: data-i18n (Textinhalt), data-i18n-label (aria-label). */
function translateDom(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = tr(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-label]')) el.setAttribute('aria-label', tr(el.dataset.i18nLabel));
}
