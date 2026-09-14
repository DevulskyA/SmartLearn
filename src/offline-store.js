// T40: private, owned, versioned offline agenda cache — the client half of
// T39's server snapshot contract. Two responsibilities kept structurally
// separate (design.md §8's own cache-vs-network split):
//   - registerServiceWorker(): the static app-shell cache (public/service-
//     worker.js), so a cold reopen with no network still loads the app.
//   - syncSnapshot()/loadSnapshot()/purgeAllAccounts(): the "explicit owned
//     snapshot store" itself, in IndexedDB (not the SW's Cache Storage —
//     the SW never touches /v1 responses at all, so a mutation response or
//     auth material is never at risk of being cached generically).
import { apiRequest, NetworkError, ApiError } from './api-client.js';

const DB_NAME = 'smartlearn-offline';
const DB_VERSION = 1;
const STORE_NAME = 'agenda-snapshots';

// Bumped only if T39's response envelope shape changes incompatibly. A
// snapshot page whose schemaVersion we don't recognize is never trusted
// into storage — same "explicit cache migration" contract as the SW's own
// versioned shell cache below, just for the data cache instead of assets.
const SUPPORTED_SCHEMA_VERSION = 1;
const MAX_REVISION_RETRIES = 3;
const LAST_ACCOUNT_KEY = 'smartlearn-last-account-id';

// A bare id pointer only (never any account content) — lets a cold offline
// reopen know WHICH IndexedDB row to read before the server is reachable
// to confirm identity via /v1/auth/me. localStorage, not IndexedDB: this
// needs to be readable synchronously and is not itself sensitive data.
export function getLastAccountId() {
  try { return localStorage.getItem(LAST_ACCOUNT_KEY); } catch { return null; }
}

function setLastAccountId(accountId) {
  try { localStorage.setItem(LAST_ACCOUNT_KEY, String(accountId)); } catch { /* best-effort */ }
}

function clearLastAccountId() {
  try { localStorage.removeItem(LAST_ACCOUNT_KEY); } catch { /* best-effort */ }
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME, { keyPath: 'accountId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const result = fn(store);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Last successfully synced generation for one owned account, or null if
 * none exists yet (never synced, or every sync attempt since has failed —
 * a failed/partial sync deliberately never overwrites a prior good save,
 * see syncSnapshot below). */
export async function loadSnapshot(accountId) {
  if (!accountId) return null;
  return withStore('readonly', (store) => new Promise((resolve, reject) => {
    // Keyed as a string always (see syncSnapshot) — accountId may arrive
    // here as either a number (a live session's user.id) or a string
    // (getLastAccountId(), read back from localStorage) depending on the
    // caller; IndexedDB key lookups are NOT type-coercive, so a stray
    // number/string mismatch would silently miss an existing row.
    const req = store.get(String(accountId));
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  }));
}

/** AC-23: clears every account's private cached snapshot, not just the
 * current one — logout/account-switch must never leave a NEXT account able
 * to read a PREVIOUS one's rows out of the same origin-scoped store. */
export async function purgeAllAccounts() {
  clearLastAccountId();
  try {
    await withStore('readwrite', (store) => { store.clear(); });
  } catch {
    // Best-effort: an IndexedDB failure here must never block a real logout.
  }
}

/**
 * Fetches every page of the caller's current agenda-snapshot generation
 * (T39's /v1/agenda-snapshot, cursor-paginated) and only replaces the
 * stored snapshot once a COMPLETE, single-revision generation has been
 * assembled. A concurrent server-side change mid-fetch (REVISION_CHANGED,
 * 409) restarts the whole fetch, up to MAX_REVISION_RETRIES times; running
 * out of retries, an unrecognized schemaVersion, or any network/API error
 * leaves the previously stored snapshot untouched and returns {ok:false} —
 * "corrupt or partial new cache does not replace good old snapshot".
 */
export async function syncSnapshot(accountId) {
  if (!accountId) return { ok: false, reason: 'NO_ACCOUNT' };

  for (let attempt = 0; attempt < MAX_REVISION_RETRIES; attempt++) {
    try {
      const items = [];
      let cursor;
      let revision;
      let envelope;
      do {
        const qs = new URLSearchParams();
        if (cursor !== undefined) { qs.set('cursor', String(cursor)); qs.set('revision', revision); }
        const path = `/v1/agenda-snapshot${qs.toString() ? `?${qs}` : ''}`;
        envelope = await apiRequest(path);
        items.push(...envelope.items);
        cursor = envelope.nextCursor;
        revision = envelope.dataRevision;
      } while (cursor !== null && cursor !== undefined);

      if (envelope.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
        return { ok: false, reason: 'UNSUPPORTED_SCHEMA' };
      }

      const snapshot = {
        accountId: String(accountId),
        schemaVersion: envelope.schemaVersion,
        generatedAt: envelope.generatedAt,
        dataRevision: envelope.dataRevision,
        timezone: envelope.timezone,
        items,
        syncedAt: new Date().toISOString(),
      };
      await withStore('readwrite', (store) => { store.put(snapshot); });
      setLastAccountId(accountId);
      return { ok: true, snapshot };
    } catch (err) {
      const isRevisionConflict = err instanceof ApiError && err.status === 409;
      if (isRevisionConflict && attempt < MAX_REVISION_RETRIES - 1) continue; // restart from page one
      if (err instanceof NetworkError || isRevisionConflict) return { ok: false, reason: 'UNAVAILABLE' };
      return { ok: false, reason: 'ERROR' };
    }
  }
  return { ok: false, reason: 'REVISION_UNSTABLE' };
}

let reloadedOnce = false;

/**
 * Registers the app-shell service worker (no-op, resolves null, if the
 * browser doesn't support it or REMOTE_MODE's single-origin static+API
 * server isn't in play). "Controlled update activation": a newly installed
 * worker sits in `waiting` until this client explicitly tells it to take
 * over — never an SW-initiated silent hijack of an open tab — and the page
 * reloads itself exactly once when that handoff completes.
 */
export async function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register('/service-worker.js');
    if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          installing.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadedOnce) return;
      reloadedOnce = true;
      window.location.reload();
    });
    return registration;
  } catch {
    return null; // never blocks the app — same best-effort contract as T30's client wiring
  }
}
