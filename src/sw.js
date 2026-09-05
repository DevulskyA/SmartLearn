const CACHE_NAME = 'smartlearn-shell-v1';

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/src/app.js',
  '/src/db.js',
  '/src/broker-transport.js',
  '/src/theme.js',
  '/src/review-score.js',
  '/src/review-schedule.js',
  '/src/stats.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Pass broker API calls straight through to the network.
  // T3.2 will add read-cache interception for /api/query.
  if (url.hostname === '127.0.0.1' && url.pathname.startsWith('/api/')) {
    return;
  }

  // For same-origin navigation and assets: cache-first with network fallback.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((resp) => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return resp;
        });
      }),
    );
  }
});
