import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as authUi from '../src/auth-ui.js';

let originalFetch;
let calls;

function mockFetch(responses) {
  let i = 0;
  return async (url, opts) => {
    calls.push({ url, opts });
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body,
    };
  };
}

beforeEach(() => {
  originalFetch = global.fetch;
  calls = [];
});

afterEach(() => {
  global.fetch = originalFetch;
});

test('register success returns the safe user DTO', async () => {
  global.fetch = mockFetch([{ status: 201, body: { user: { id: 1, email: 'a@b.com' } } }]);
  const result = await authUi.register('a@b.com', 'a long enough password 123');
  assert.equal(result.ok, true);
  assert.equal(result.user.email, 'a@b.com');
});

test('register failure maps EMAIL_CONFLICT to a pt-BR message', async () => {
  global.fetch = mockFetch([{ status: 409, body: { error: { code: 'EMAIL_CONFLICT' } } }]);
  const result = await authUi.register('a@b.com', 'a long enough password 123');
  assert.equal(result.ok, false);
  assert.match(result.message, /já existe/i);
});

test('login failure maps INVALID_CREDENTIALS to a pt-BR message without leaking which field was wrong', async () => {
  global.fetch = mockFetch([{ status: 401, body: { error: { code: 'INVALID_CREDENTIALS' } } }]);
  const result = await authUi.login('a@b.com', 'wrong');
  assert.equal(result.ok, false);
  assert.match(result.message, /incorretos/i);
  assert.doesNotMatch(result.message, /email|senha existe/i);
});

test('login success triggers bootstrap (a second fetch to /auth/me) and stores csrfToken/user', async () => {
  global.fetch = mockFetch([
    { status: 200, body: { user: { id: 1, email: 'a@b.com' } } }, // login
    { status: 200, body: { user: { id: 1, email: 'a@b.com' }, csrfToken: 'tok-123' } }, // me
  ]);
  const result = await authUi.login('a@b.com', 'a long enough password 123');
  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /\/auth\/me$/);
});

test('logout sends the CSRF token header when one is known', async () => {
  global.fetch = mockFetch([
    { status: 200, body: { user: { id: 1 } } },
    { status: 200, body: { user: { id: 1 }, csrfToken: 'tok-abc' } },
    { status: 204, body: null },
  ]);
  await authUi.login('a@b.com', 'a long enough password 123');
  await authUi.logout();
  const logoutCall = calls[2];
  assert.equal(logoutCall.opts.headers['X-CSRF-Token'], 'tok-abc');
});

test('unknown error code falls back to a generic pt-BR message, not the raw code', async () => {
  global.fetch = mockFetch([{ status: 500, body: { error: { code: 'SOME_UNMAPPED_CODE' } } }]);
  const result = await authUi.login('a@b.com', 'a long enough password 123');
  assert.equal(result.ok, false);
  assert.doesNotMatch(result.message, /SOME_UNMAPPED_CODE/);
});

test('every fetch call includes credentials:"include" so the session cookie is sent/received', async () => {
  global.fetch = mockFetch([{ status: 200, body: { user: null } }]);
  await authUi.bootstrap();
  assert.equal(calls[0].opts.credentials, 'include');
});
