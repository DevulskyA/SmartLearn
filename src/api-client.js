// T20: thin, typed HTTP client for the /v1 domain API. remote-store.js is
// the only intended consumer — this module knows nothing about subjects,
// units, reviews, etc., only how to talk to the server honestly.
//
// Two failure shapes are deliberately kept distinct, because RemoteStore
// (and its callers) must never treat "the server said no" the same as
// "we don't know what happened":
//   - ApiError: the server responded with a non-2xx status and a real
//     {error:{code,...}} body — the request DID reach the server.
//   - NetworkError: fetch itself rejected (offline, DNS, CORS block,
//     server unreachable) — we have NO idea whether any write landed.
// A caller that catches generically and treats either as "did nothing"
// risks reporting local success for an uncertain remote write — that is
// exactly what design.md/T20 forbid ("API errors never create local
// success"). Every write path in remote-store.js must let both propagate.

// Relative by default (T21 "one origin"): the Vite dev proxy and the
// production static+API server both make '/v1/...' resolve to the right
// place without needing an absolute host. Tests/staging that genuinely
// run the API on a different origin override via window.__SMARTLEARN_API_BASE__
// (same mechanism src/auth-ui.js already uses for its own auth/* calls).
const API_BASE = (typeof window !== 'undefined' && window.__SMARTLEARN_API_BASE__) || '';

export class ApiError extends Error {
  constructor(code, message, { status, field, requestId } = {}) {
    super(message || code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.field = field;
    this.requestId = requestId;
  }
}

export class NetworkError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * T41: thrown for a MUTATING request while the browser already knows it
 * has no network (`navigator.onLine === false`) — checked BEFORE calling
 * `fetch()` at all, not discovered by letting the request fail. Kept
 * distinct from NetworkError (which means "we tried and don't know what
 * happened") because this one is unambiguous: nothing was ever sent, so
 * every caller can say so plainly instead of guessing at an uncertain
 * write. This is the ONE place T41's "no authoritative mutation can be
 * started offline" is enforced — remote-store.js is api-client.js's only
 * consumer (verified: no other file calls fetch() against /v1), so this
 * single guard covers every create/complete/edit/import/accept-draft
 * entrypoint in the app, not just the ones an audit happened to visit.
 */
export class OfflineError extends Error {
  constructor(message = 'Sem conexão — esta ação requer internet.') {
    super(message);
    this.name = 'OfflineError';
  }
}

let csrfToken = null;

/** Set once auth-ui.js's bootstrap/login resolves — see src/auth-ui.js's
 * own (independent) csrf handling for the auth/* routes themselves; this
 * is the copy the domain routes below use. */
export function setCsrfToken(token) {
  csrfToken = token;
}

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Performs one request against `${API_BASE}${path}` with credentials
 * included (the httpOnly session cookie) and, for mutating methods, the
 * CSRF header attached. Returns the parsed JSON body on 2xx. Throws
 * ApiError on any non-2xx response (using the server's own {error:{code,
 * field,message,requestId}} envelope when present) and NetworkError when
 * the request never reached the server at all.
 */
async function handleResponse(res) {
  // 204 No Content (e.g. DELETE) has no body to parse.
  const json = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    const err = json?.error ?? {};
    // T41: a 401 through the authenticated /v1 domain means the
    // server-side session expired or was revoked under us (every /v1
    // route already requires request.actor — see server/src/http-
    // contract.js's default-deny hook — so this is never "not logged in
    // yet", only "was logged in, now isn't"). Broadcast it rather than
    // importing app.js's state here — this module stays domain-agnostic
    // (see file header); app.js is the one place that knows what "lock
    // protected operations, clear stale identity" means for the UI.
    if (res.status === 401 && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('smartlearn:unauthenticated'));
    }
    throw new ApiError(err.code ?? 'UNKNOWN_ERROR', err.message, { status: res.status, field: err.field, requestId: err.requestId });
  }
  return json;
}

/** T41: true only when the browser is CERTAIN it has no network. Checked
 * only for mutating methods — a stale GET is fine to attempt (T39/T40's
 * offline reads already go through OfflineStore, never a live GET). */
function isDefinitelyOffline(method) {
  return MUTATING_METHODS.has(method) && typeof navigator !== 'undefined' && navigator.onLine === false;
}

export async function apiRequest(path, { method = 'GET', body } = {}) {
  if (isDefinitelyOffline(method)) throw new OfflineError();

  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (MUTATING_METHODS.has(method) && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new NetworkError(`Falha de rede ao acessar ${path}: ${err.message}`);
  }

  return handleResponse(res);
}

/**
 * Multipart upload (T34's /v1/sources, and any future file-upload route).
 * Deliberately NOT `apiRequest` with a FormData body: this never sets
 * Content-Type itself, so the browser attaches its own `multipart/
 * form-data; boundary=...` header — setting it manually here would omit
 * the boundary and break parsing server-side.
 */
export async function apiUpload(path, formData) {
  if (isDefinitelyOffline('POST')) throw new OfflineError();

  const headers = {};
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, credentials: 'include', body: formData });
  } catch (err) {
    throw new NetworkError(`Falha de rede ao acessar ${path}: ${err.message}`);
  }

  return handleResponse(res);
}
