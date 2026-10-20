'use strict';

// Offline-Cache. Strategie "stale-while-revalidate": sofort aus dem Cache antworten,
// im Hintergrund die neue Version holen. Änderungen sind damit ab dem nächsten Öffnen da.
// Der Cache heißt nach der App-Version (js/version.js); ein neues Release räumt den alten Cache ab.
// Kommen Dateien hinzu oder fallen weg: FILES anpassen.
importScripts('js/version.js');
const CACHE = `pwa-tuner-v${APP_VERSION}`;

const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/version.js',
  'js/i18n.js',
  'js/tunings.js',
  'js/pitch.js',
  'js/audio.js',
  'js/matrix.js',
  'locales/en.json',
  'locales/de.json',
  'js/app.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      // Query-Strings (z. B. ?source=pwa) ignorieren, damit der Start offline klappt
      const cached = await cache.match(request, { ignoreSearch: true });
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      return network;
    }),
  );
});
