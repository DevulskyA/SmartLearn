// T40: minimal, hand-rolled app-shell service worker. Deliberately does
// NOT touch /v1/* responses at all (no generic response cache) — the
// "explicit owned snapshot store" is src/offline-store.js's IndexedDB
// cache instead, so a mutation response or authentication material is
// structurally never at risk of being cached generically here.
//
// Served from public/ (not src/) on purpose: a service worker's default
// max scope is its own directory, and Chrome refuses a registration whose
// requested scope exceeds that unless the server sends a
// `Service-Worker-Allowed` header. Living at the origin root gives it
// root scope with zero extra server configuration, in dev AND in a real
// build (public/ files are copied to the dist root verbatim).
const SHELL_CACHE_VERSION = 'v1';
const SHELL_CACHE_NAME = `smartlearn-shell-${SHELL_CACHE_VERSION}`;
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)),
  );
  // No self.skipWaiting() here — activation is client-driven (see the
  // 'message' handler below), not an SW-initiated silent hijack of tabs
  // that are already open ("controlled update activation").
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        // Cache migration: drop every prior shell-cache version. Only the
        // static shell is versioned this way — the data snapshot has its
        // own independent schemaVersion/dataRevision, owned by offline-store.js.
        names.filter((name) => name.startsWith('smartlearn-shell-') && name !== SHELL_CACHE_NAME)
          .map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Only ever intercept same-origin GETs. Every mutation (POST/PATCH/
  // PUT/DELETE) and every cross-origin request passes straight through —
  // this worker never has an opinion about them.
  if (request.method !== 'GET') return;

  // Navigations: network-first (always prefer the freshest shell/build
  // when online), falling back to the cached shell when offline — this is
  // what lets a cold reopen with no network still load the app at all.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html')),
    );
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // /v1/* (and /health) reads are NEVER cached here, generically or
  // otherwise — see file header. offline-store.js's IndexedDB store is the
  // one place that data is retained for offline use.
  if (url.pathname.startsWith('/v1/') || url.pathname.startsWith('/health')) return;

  // Every other same-origin static GET (JS modules, CSS, the manifest,
  // icons, ...): network-first, opportunistically caching each successful
  // response. A fixed precache manifest isn't practical here — Vite's dev
  // server serves an UNBUNDLED ES module graph (one request per import),
  // so this instead caches exactly the set of files this app actually
  // loaded while last online, which is also correct against a real
  // content-hashed production build (a stale hashed URL is simply never
  // requested again once the shell's own HTML points at a new one).
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(SHELL_CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request)),
  );
});
