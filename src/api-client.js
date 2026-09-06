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

const API_BASE = (typeof window !== 'undefined' && window.__SMARTLEARN_API_BASE__) || 'http://localhost:3000';

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
export async function apiRequest(path, { method = 'GET', body } = {}) {
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

  // 204 No Content (e.g. DELETE) has no body to parse.
  const json = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    const err = json?.error ?? {};
    throw new ApiError(err.code ?? 'UNKNOWN_ERROR', err.message, { status: res.status, field: err.field, requestId: err.requestId });
  }
  return json;
}
