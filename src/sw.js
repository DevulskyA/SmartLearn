const CACHE_NAME = 'smartlearn-shell-v2';
const QUERY_CACHE_NAME = 'smartlearn-query-v1';

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/src/app.js',
  '/src/db.js',
  '/src/broker-transport.js',
  '/src/migration.js',
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
  const keep = new Set([CACHE_NAME, QUERY_CACHE_NAME]);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

async function bodyHash(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Broker API calls: cache reads, pass writes through.
  if (url.hostname === '127.0.0.1' && url.pathname.startsWith('/api/')) {
    // Cache GET /api/health and POST /api/query responses.
    if (
      (request.method === 'GET' && url.pathname === '/api/health') ||
      (request.method === 'POST' && url.pathname === '/api/query')
    ) {
      event.respondWith(
        (async () => {
          try {
            // Network first — fresher data when online.
            const resp = await fetch(request.clone());
            if (resp.ok) {
              const bodyText = request.method === 'POST' ? await request.text() : '';
              const key = `${url.pathname}|${await bodyHash(bodyText)}`;
              const cacheReq = new Request(key);
              const cache = await caches.open(QUERY_CACHE_NAME);
              cache.put(cacheReq, resp.clone());
            }
            return resp;
          } catch {
            // Offline: serve stale cache if available.
            const bodyText = request.method === 'POST' ? await request.text() : '';
            const key = `${url.pathname}|${await bodyHash(bodyText)}`;
            const cached = await caches.match(new Request(key), { cacheName: QUERY_CACHE_NAME });
            if (cached) return cached;
            return new Response(JSON.stringify({ error: 'offline' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        })(),
      );
      return;
    }
    // All other broker paths (/api/execute, /api/transaction, /api/schema, /api/migrate/import): pass through.
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
