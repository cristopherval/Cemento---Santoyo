/* Santoyo's Concrete Work — Service Worker (offline-first) */
const CACHE = 'santoyo-v26';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './assets/vendor/supabase.min.js',
  './js/config.js',
  './js/i18n.js',
  './js/data.js',
  './js/storage.js',
  './js/calc.js',
  './js/materials.js',
  './js/invoice.js',
  './js/quotes.js',
  './js/finance.js',
  './js/cloud.js',
  './js/app.js',
  './assets/logo.png',
  './assets/firma.png',
  './assets/vendor/html2canvas.min.js',
  './assets/vendor/jspdf.umd.min.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // cache each asset individually so one missing file (e.g. logo.png) never aborts install
      Promise.allSettled(ASSETS.map((url) => c.add(url)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Only handle same-origin app assets. Cross-origin requests (e.g. the Supabase
  // REST/Auth API) must always hit the network — never cache them, or sync would
  // serve stale data on every pull.
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => cached);
    })
  );
});
