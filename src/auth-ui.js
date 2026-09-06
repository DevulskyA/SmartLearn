// T11: minimal account experience (login/register/logout/me/password-change)
// against the real central server's /v1/auth/* endpoints. This module is
// self-contained and testable end-to-end today, independent of the rest of
// the app — the learning screens (Hoje/Plano/etc.) still read/write
// BrowserStore and do not yet consume this session (that cutover is T20-T24).
// Session expiry here never touches or clears any unsent local learning-form
// draft; the two are fully independent state.
import { t } from './i18n/index.js';

const API_BASE = (typeof window !== 'undefined' && window.__SMARTLEARN_API_BASE__) || 'http://localhost:3000';

let csrfToken = null;
let currentUser = null;

function errorMessage(code) {
  return t(`auth.error.${code}`) === `auth.error.${code}` ? t('auth.error.generic') : t(`auth.error.${code}`);
}

async function apiFetch(path, { method = 'GET', body, csrf = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (csrf && csrfToken) headers['X-CSRF-Token'] = csrfToken;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: 'include', // send/receive the HttpOnly session cookie
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body: json };
}

export function getCurrentUser() {
  return currentUser;
}

export async function bootstrap() {
  const res = await apiFetch('/v1/auth/me');
  if (res.ok) {
    currentUser = res.body.user;
    csrfToken = res.body.csrfToken;
  } else {
    currentUser = null;
    csrfToken = null;
  }
  return currentUser;
}

export async function register(email, password) {
  const res = await apiFetch('/v1/auth/register', { method: 'POST', body: { email, password } });
  if (!res.ok) return { ok: false, message: errorMessage(res.body?.error?.code) };
  return { ok: true, user: res.body.user };
}

export async function login(email, password) {
  const res = await apiFetch('/v1/auth/login', { method: 'POST', body: { email, password } });
  if (!res.ok) return { ok: false, message: errorMessage(res.body?.error?.code) };
  await bootstrap();
  return { ok: true, user: currentUser };
}

export async function logout() {
  await apiFetch('/v1/auth/logout', { method: 'POST', csrf: true });
  currentUser = null;
  csrfToken = null;
}

export async function changePassword(currentPassword, newPassword) {
  const res = await apiFetch('/v1/auth/password', { method: 'POST', csrf: true, body: { currentPassword, newPassword } });
  if (!res.ok) return { ok: false, message: errorMessage(res.body?.error?.code) };
  return { ok: true };
}

export async function resetPassword(token, newPassword) {
  const res = await apiFetch('/v1/auth/reset-password', { method: 'POST', body: { token, newPassword } });
  if (!res.ok) return { ok: false, message: errorMessage(res.body?.error?.code) };
  return { ok: true };
}
