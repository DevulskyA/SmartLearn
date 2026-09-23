import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { applyDomainEnvelope, ERROR_CODES } from '../src/http-contract.js';

const TEST_ORIGIN = 'https://smartlearn.test';

function buildTestApp() {
  const app = Fastify({ logger: false });

  app.get('/health/live', async () => ({ status: 'alive' }));

  app.register(async (v1) => {
    // Test-only fixture: a header stands in for the real session lookup
    // that T09/T10 will inject as resolveActor. Never present in production.
    applyDomainEnvelope(v1, {
      resolveActor: async (request) => request.headers['x-test-actor'] || null,
      allowedOrigins: [TEST_ORIGIN],
    });

    v1.get('/whoami', async (request) => ({ actor: request.actor }));

    v1.get('/public-probe', { config: { public: true } }, async () => ({ ok: true }));

    v1.post('/echo', {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: { name: { type: 'string' } },
        },
      },
    }, async (request) => ({ received: request.body }));

    v1.get('/boom', async () => {
      throw new Error('SELECT * FROM secrets WHERE token = "abc123"; -- leaked path /etc/passwd');
    });
  }, { prefix: '/v1' });

  return app;
}

test('health stays public and outside the /v1 envelope', async () => {
  const app = buildTestApp();
  const res = await app.inject({ method: 'GET', url: '/health/live' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { status: 'alive' });
});

test('AC-07: unauthenticated /v1 request is denied by default (no actor mechanism yet)', async () => {
  const app = buildTestApp();
  const res = await app.inject({ method: 'GET', url: '/v1/whoami' });
  assert.equal(res.statusCode, 401);
  const body = JSON.parse(res.body);
  assert.equal(body.error.code, ERROR_CODES.UNAUTHENTICATED);
  assert.ok(body.error.requestId);
});

test('a route explicitly marked public bypasses the default-deny check', async () => {
  const app = buildTestApp();
  const res = await app.inject({ method: 'GET', url: '/v1/public-probe' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true });
});

test('AC-08: unknown body field is rejected, not silently stripped', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'POST',
    url: '/v1/echo',
    headers: { origin: TEST_ORIGIN },
    payload: { name: 'ok', userId: 999, extra: 'unexpected' },
  });
  assert.equal(res.statusCode, 400);
  const body = JSON.parse(res.body);
  assert.equal(body.error.code, ERROR_CODES.VALIDATION_FAILED);
});

test('AC-06/AC-08: body.userId as a would-be actor override is rejected as an unknown field', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'POST',
    url: '/v1/echo',
    headers: { origin: TEST_ORIGIN },
    payload: { name: 'ok', userId: 42 },
  });
  assert.equal(res.statusCode, 400, 'client-supplied userId must never be accepted as an access authority');
});

test('wrong primitive type is rejected, not coerced', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'POST',
    url: '/v1/echo',
    headers: { origin: TEST_ORIGIN },
    payload: { name: 12345 },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).error.code, ERROR_CODES.VALIDATION_FAILED);
});

test('anonymous 404 on /v1 still denies with 401 first (does not reveal route topology)', async () => {
  const app = buildTestApp();
  const res = await app.inject({ method: 'GET', url: '/v1/does-not-exist' });
  assert.equal(res.statusCode, 401, 'an unauthenticated caller must not learn whether a /v1 route exists');
});

test('unknown /v1 route returns JSON 404 for an authenticated actor, never SPA HTML', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'GET',
    url: '/v1/does-not-exist',
    headers: { 'x-test-actor': 'user-1' },
  });
  assert.equal(res.statusCode, 404);
  assert.match(res.headers['content-type'], /application\/json/);
  assert.equal(JSON.parse(res.body).error.code, ERROR_CODES.NOT_FOUND);
});

test('unexpected server error never leaks SQL, stack traces or paths', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'GET',
    url: '/v1/boom',
    headers: { 'x-test-actor': 'user-1' },
  });
  assert.equal(res.statusCode, 500);
  const bodyText = res.body;
  assert.doesNotMatch(bodyText, /SELECT|secrets|token|etc\/passwd/i);
  const body = JSON.parse(bodyText);
  assert.equal(body.error.code, ERROR_CODES.INTERNAL);
  assert.ok(body.error.requestId);
});

test('every /v1 response carries a request id, propagating a client-supplied one', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'GET',
    url: '/v1/public-probe',
    headers: { 'x-request-id': 'test-fixed-id-123' },
  });
  assert.equal(res.headers['x-request-id'], 'test-fixed-id-123');
});

test('a request id is generated when the client does not supply one', async () => {
  const app = buildTestApp();
  const res = await app.inject({ method: 'GET', url: '/v1/public-probe' });
  assert.ok(res.headers['x-request-id'], 'expected a generated x-request-id header');
});

test('T10: a mutating request with a missing Origin is rejected 403, even on a public route', async () => {
  const app = buildTestApp();
  const res = await app.inject({ method: 'POST', url: '/v1/echo', payload: { name: 'x' } });
  assert.equal(res.statusCode, 403);
});

test('T10: a mutating request with an unexpected Origin is rejected 403', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'POST', url: '/v1/echo',
    headers: { origin: 'https://evil.example.com' },
    payload: { name: 'x' },
  });
  assert.equal(res.statusCode, 403);
});

test('T10: GET requests are never subject to the origin/CSRF check', async () => {
  const app = buildTestApp();
  const res = await app.inject({ method: 'GET', url: '/v1/public-probe' }); // no Origin header at all
  assert.equal(res.statusCode, 200);
});
