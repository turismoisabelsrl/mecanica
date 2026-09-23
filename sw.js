/* Taller TI — Service Worker */
const VERSION = 'v4';
const CACHE = `taller-ti-${VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './offline.html',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(err => console.warn('[sw] no se pudo precachear todo el app-shell', err))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('taller-ti-') && k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// La página pide activar la versión nueva recién cuando el usuario confirma
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING' || (event.data && event.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const req = event.request;

  // Solo GET, y solo mismo origen: Supabase (API + Realtime), Google Fonts y el CDN
  // de supabase-js quedan totalmente afuera del SW y van directo a red.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navegación (abrir/recargar la app): red primero, con la copia cacheada
  // del shell como respaldo y offline.html como último recurso.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copia = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copia));
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./offline.html')))
    );
    return;
  }

  // Resto de assets propios (manifest, íconos): cache-first con
  // actualización en segundo plano (stale-while-revalidate).
  event.respondWith(
    caches.match(req).then(cached => {
      const enRed = fetch(req)
        .then(res => {
          if (res && res.ok) {
            const copia = res.clone();
            caches.open(CACHE).then(c => c.put(req, copia));
          }
          return res;
        })
        .catch(() => cached);
      return cached || enRed;
    })
  );
});
