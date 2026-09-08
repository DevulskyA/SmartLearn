// T41: enforces "offline is read-only" VISIBLY (an app-wide connectivity
// indicator, shown regardless of which screen is active) on top of T40's
// snapshot read path and api-client.js's OfflineError choke point, which
// enforces it TECHNICALLY. Also owns reconnect handling (session
// revalidation + a fresh sync) and session-expiry UI (a 401 mid-session
// locks protected operations and clears stale identity — see
// onUnauthenticated below).
import * as OfflineStore from './offline-store.js';
import * as AuthUI from './auth-ui.js';

let indicatorEl = null;

function ensureIndicator() {
  if (indicatorEl) return indicatorEl;
  indicatorEl = document.createElement('div');
  indicatorEl.id = 'connectivity-banner';
  indicatorEl.setAttribute('role', 'status');
  indicatorEl.hidden = true;
  indicatorEl.style.cssText = 'position:sticky;top:0;z-index:200;padding:.5rem 1rem;font-size:.8125rem;text-align:center;background:#92400e;color:#fff;';
  document.body.prepend(indicatorEl);
  return indicatorEl;
}

/** Re-derives and shows/hides the connectivity banner from the CURRENT
 * `navigator.onLine` state — safe to call any time (offline/online
 * transitions, screen navigation, after a sync attempt). Exported so
 * screens that build their own more specific offline messaging (T40's
 * `renderOfflineToday`) can still trigger a refresh of this one after
 * their own render, keeping both in sync. */
export async function refreshIndicator() {
  const el = ensureIndicator();
  if (typeof navigator === 'undefined' || navigator.onLine !== false) {
    el.hidden = true;
    return;
  }
  const accountId = AuthUI.getCurrentUser()?.id ?? OfflineStore.getLastAccountId();
  const snapshot = accountId ? await OfflineStore.loadSnapshot(accountId) : null;
  el.hidden = false;
  el.textContent = snapshot
    ? `Você está offline — somente leitura. Última sincronização: ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(snapshot.syncedAt))}.`
    : 'Você está offline — nenhuma agenda sincronizada neste dispositivo ainda; ações não estão disponíveis.';
}

let reconnecting = false;

/** On the browser's `online` event: revalidate the session against the
 * real server (never trust the client's own guess that it's "still
 * logged in") and pull a fresh snapshot, THEN let the caller refresh
 * whatever screen is currently showing. Re-entrant-safe: a burst of
 * online/offline flapping collapses to one in-flight reconnect. */
async function handleReconnect(onReconnect) {
  if (reconnecting) return;
  reconnecting = true;
  try {
    const user = await AuthUI.bootstrap();
    if (user) await OfflineStore.syncSnapshot(user.id);
    await refreshIndicator();
    if (typeof onReconnect === 'function') await onReconnect();
  } finally {
    reconnecting = false;
  }
}

let mounted = false;

/** Call once, at REMOTE_MODE boot. `onReconnect` is invoked after a
 * successful reconnect's session-revalidation + resync (e.g. to
 * re-render the active screen with fresh data). */
export function mount({ onReconnect } = {}) {
  if (mounted || typeof window === 'undefined') return;
  mounted = true;
  refreshIndicator();
  window.addEventListener('offline', () => refreshIndicator());
  window.addEventListener('online', () => handleReconnect(onReconnect));
}

/** T41: a 401 from any authenticated /v1 call (dispatched by
 * api-client.js's handleResponse) means the server-side session expired
 * or was revoked while this tab still thought it was logged in. Registers
 * `handler`, called with no arguments — the caller (app.js) owns what
 * "lock protected operations, clear stale identity" means for its own UI
 * state; this module only owns detecting and broadcasting the condition. */
export function onUnauthenticated(handler) {
  if (typeof window === 'undefined') return;
  window.addEventListener('smartlearn:unauthenticated', handler);
}
