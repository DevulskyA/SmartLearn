import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../server/src/db.js';
import { runMigrations } from '../server/src/migrations.js';
import { buildApp } from '../server/src/app.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../server/migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';

// Start one real server for the whole file (cheap: in-memory-speed SQLite,
// no native process spawn) and point api-client.js at it BEFORE importing
// it, since API_BASE is resolved once at module-evaluation time.
const dir = mkdtempSync(join(tmpdir(), 'sl-remotestore-'));
const dbPath = join(dir, 'test.db');
const db = openDb(dbPath);
runMigrations(db, MIGRATIONS_DIR);
const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN] });
await app.listen({ port: 0, host: '127.0.0.1' });
const { port } = app.server.address();
const REAL_API_BASE = `http://127.0.0.1:${port}`;

globalThis.window = { __SMARTLEARN_API_BASE__: REAL_API_BASE };

const { apiRequest, apiUpload, ApiError, NetworkError, OfflineError, setCsrfToken } = await import('../src/api-client.js');
const { DB, RemoteStoreError } = await import('../src/remote-store.js');

const realFetch = globalThis.fetch;

test.after(async () => {
  await app.close();
  db.close();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

// -- 1. Contract matrix: every caller found in the T20 inventory must ------
// still resolve to a callable function (or be a documented, deliberate
// removal — none are removed here, everything maps to something real).

test('contract matrix: every DB.* method the current UI calls exists and is callable', () => {
  const expected = [
    ['subjects', 'getAll'], ['subjects', 'getActive'], ['subjects', 'create'],
    ['subjects', 'update'], ['subjects', 'deactivate'], ['subjects', 'deleteIfEmpty'], ['subjects', 'delete'],
    ['learningUnits', 'getAll'], ['learningUnits', 'getByDate'], ['learningUnits', 'update'], ['learningUnits', 'createWithReviews'],
    ['reviewTasks', 'getAll'], ['reviewTasks', 'getForToday'], ['reviewTasks', 'getOverdue'],
    ['reviewTasks', 'getCompletedToday'], ['reviewTasks', 'getTomorrow'], ['reviewTasks', 'update'],
    ['exercises', 'create'], ['exercises', 'getAll'], ['exercises', 'update'], ['exercises', 'delete'],
    ['learningEvidence', 'create'], ['learningEvidence', 'getAll'],
    ['settings', 'get'], ['settings', 'update'],
  ];
  for (const [ns, method] of expected) {
    assert.equal(typeof DB[ns][method], 'function', `DB.${ns}.${method} must exist`);
  }
  assert.equal(typeof DB.init, 'function');
  assert.equal(typeof DB.completeReviewWithEvidence, 'function');
  assert.equal(typeof DB.exportAll, 'function');
  assert.equal(typeof DB.importAll, 'function');
  assert.equal(typeof DB.clearAll, 'function');
});

test('DB.init() resolves to DB itself without any network call (no local schema to run)', async () => {
  let called = false;
  globalThis.fetch = () => { called = true; throw new Error('must not be called'); };
  try {
    const result = await DB.init();
    assert.equal(result, DB);
    assert.equal(called, false);
  } finally { globalThis.fetch = realFetch; }
});

// -- 2. Mocked-transport tests: request shaping + error/DTO mapping --------

function mockFetch(responses) {
  let call = 0;
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    const r = responses[Math.min(call, responses.length - 1)];
    call += 1;
    if (r.throws) throw r.throws;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body,
    };
  };
  return calls;
}

test('apiRequest: credentials always included, Content-Type only with a body, CSRF header only on mutating methods when set', async () => {
  setCsrfToken('csrf-abc');
  const calls = mockFetch([{ status: 200, body: { ok: true } }, { status: 200, body: { ok: true } }, { status: 200, body: { ok: true } }]);
  try {
    await apiRequest('/v1/subjects');
    await apiRequest('/v1/subjects', { method: 'POST', body: { name: 'X' } });
    await apiRequest('/v1/auth/logout', { method: 'POST' });

    assert.equal(calls[0].opts.credentials, 'include');
    assert.equal(calls[0].opts.headers['X-CSRF-Token'], undefined, 'GET must never carry a CSRF header');
    assert.equal(calls[0].opts.headers['Content-Type'], undefined, 'a bodyless request must not send Content-Type');

    assert.equal(calls[1].opts.headers['Content-Type'], 'application/json');
    assert.equal(calls[1].opts.headers['X-CSRF-Token'], 'csrf-abc');
    assert.equal(calls[1].opts.body, JSON.stringify({ name: 'X' }));

    assert.equal(calls[2].opts.headers['X-CSRF-Token'], 'csrf-abc', 'POST with no body still needs CSRF');
    assert.equal(calls[2].opts.headers['Content-Type'], undefined);
  } finally { globalThis.fetch = realFetch; setCsrfToken(null); }
});

test('apiRequest throws ApiError with code/status/field/requestId from the server envelope on a non-2xx response', async () => {
  mockFetch([{ status: 409, body: { error: { code: 'SUBJECT_CONFLICT', message: 'Já existe.', field: 'name', requestId: 'req-1' } } }]);
  try {
    await assert.rejects(
      () => apiRequest('/v1/subjects', { method: 'POST', body: { name: 'X' } }),
      (err) => err instanceof ApiError && err.code === 'SUBJECT_CONFLICT' && err.status === 409 && err.field === 'name' && err.requestId === 'req-1',
    );
  } finally { globalThis.fetch = realFetch; }
});

test('apiRequest throws NetworkError (never a false success) when fetch itself rejects', async () => {
  mockFetch([{ throws: new TypeError('fetch failed') }]);
  try {
    await assert.rejects(() => apiRequest('/v1/subjects'), (err) => err instanceof NetworkError);
  } finally { globalThis.fetch = realFetch; }
});

// -- T41: offline-mutation and session-expiry guards ------------------------

function withOffline(onLine, fn) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { onLine }, configurable: true });
  return Promise.resolve(fn()).finally(() => Object.defineProperty(globalThis, 'navigator', desc));
}

test('apiRequest refuses a MUTATING call with OfflineError, without ever calling fetch, when navigator.onLine is false', () => withOffline(false, async () => {
  let called = false;
  globalThis.fetch = () => { called = true; throw new Error('must not be called'); };
  try {
    await assert.rejects(
      () => apiRequest('/v1/subjects', { method: 'POST', body: { name: 'X' } }),
      (err) => err instanceof OfflineError,
    );
    assert.equal(called, false, 'no network attempt may be made once the browser already knows it is offline');
  } finally { globalThis.fetch = realFetch; }
}));

test('apiRequest still attempts a GET while offline (only mutations are pre-flight blocked — reads have their own OfflineStore-backed path)', () => withOffline(false, async () => {
  const calls = mockFetch([{ status: 200, body: { subjects: [] } }]);
  try {
    await apiRequest('/v1/subjects');
    assert.equal(calls.length, 1);
  } finally { globalThis.fetch = realFetch; }
}));

test('apiRequest proceeds normally when navigator.onLine is true (or unknown/undefined — never fails OPEN into blocking a real online mutation)', () => withOffline(true, async () => {
  const calls = mockFetch([{ status: 200, body: { subject: { id: 1 } } }]);
  try {
    await apiRequest('/v1/subjects', { method: 'POST', body: { name: 'X' } });
    assert.equal(calls.length, 1);
  } finally { globalThis.fetch = realFetch; }
}));

test('apiUpload refuses to start while offline, without ever calling fetch', () => withOffline(false, async () => {
  let called = false;
  globalThis.fetch = () => { called = true; throw new Error('must not be called'); };
  try {
    await assert.rejects(() => apiUpload('/v1/sources', new FormData()), (err) => err instanceof OfflineError);
    assert.equal(called, false);
  } finally { globalThis.fetch = realFetch; }
}));

test('a 401 response dispatches smartlearn:unauthenticated exactly once, and the ApiError itself still propagates normally', async () => {
  const events = [];
  const originalWindow = globalThis.window;
  globalThis.window = { ...originalWindow, dispatchEvent: (e) => events.push(e.type) };
  mockFetch([{ status: 401, body: { error: { code: 'UNAUTHENTICATED' } } }]);
  try {
    await assert.rejects(() => apiRequest('/v1/subjects'), (err) => err instanceof ApiError && err.status === 401);
    assert.deepEqual(events, ['smartlearn:unauthenticated']);
  } finally { globalThis.fetch = realFetch; globalThis.window = originalWindow; }
});

test('a non-401 error response never dispatches smartlearn:unauthenticated', async () => {
  const events = [];
  const originalWindow = globalThis.window;
  globalThis.window = { ...originalWindow, dispatchEvent: (e) => events.push(e.type) };
  mockFetch([{ status: 409, body: { error: { code: 'CONFLICT' } } }]);
  try {
    await assert.rejects(() => apiRequest('/v1/subjects', { method: 'POST', body: {} }), (err) => err instanceof ApiError);
    assert.deepEqual(events, []);
  } finally { globalThis.fetch = realFetch; globalThis.window = originalWindow; }
});

test('subjects DTO passes through unchanged (server shape already matches the UI contract)', async () => {
  const row = { id: 1, name: 'Farmacologia', color: 'DISC-BLUE', isActive: true, sortOrder: 0, createdAt: 'a', updatedAt: 'b' };
  mockFetch([{ status: 200, body: { subjects: [row] } }]);
  try {
    const result = await DB.subjects.getAll();
    assert.deepEqual(result, [row]);
  } finally { globalThis.fetch = realFetch; }
});

test('subjects.delete routes to DELETE (deleteIfEmpty semantics) rather than the previously-undefined hard delete', async () => {
  const calls = mockFetch([{ status: 204, body: null }]);
  try {
    await DB.subjects.delete(42);
    assert.equal(calls[0].url, `${REAL_API_BASE}/v1/subjects/42`);
    assert.equal(calls[0].opts.method, 'DELETE');
  } finally { globalThis.fetch = realFetch; }
});

test('T22: subjects.create(name, color) matches db.js\'s real two-positional-arg signature (not a merged object) — the Cadastro screen calls it as create(name) alone', async () => {
  const calls = mockFetch([{ status: 201, body: { subject: { id: 1, name: 'X', color: 'DISC-BLUE', isActive: true, sortOrder: 0, createdAt: 'a', updatedAt: 'a' } } }]);
  try {
    await DB.subjects.create('X');
    assert.deepEqual(JSON.parse(calls[0].opts.body), { name: 'X', color: 'DISC-BLUE' }, 'color must default exactly like db.js does when the caller omits it');
  } finally { globalThis.fetch = realFetch; }
});

test('T22: exercises.create(unitId, fields) matches db.js\'s real two-arg signature (unitId is NOT merged into the fields object)', async () => {
  const calls = mockFetch([{ status: 201, body: { exercise: { id: 1, unitId: 5, orderIndex: 0, archivedAt: null, createdAt: 'a', updatedAt: 'a', currentVersion: { question: 'Q', answer: 'A', hint: null, provenance: 'MANUAL' } } } }]);
  try {
    await DB.exercises.create(5, { questionText: 'Q', answerText: 'A', provenance: 'MANUAL' });
    assert.equal(calls[0].url, `${REAL_API_BASE}/v1/learning-units/5/exercises`);
    assert.deepEqual(JSON.parse(calls[0].opts.body), { question: 'Q', answer: 'A', provenance: 'MANUAL' });
  } finally { globalThis.fetch = realFetch; }
});

test('exercises DTO flattens the versioned server shape to the old flat field names', async () => {
  const versioned = {
    id: 5, unitId: 1, orderIndex: 0, archivedAt: null, createdAt: 'a', updatedAt: 'b',
    currentVersion: { id: 9, exerciseId: 5, question: 'Q?', answer: 'A', hint: 'H', provenance: 'MANUAL', createdAt: 'a' },
  };
  mockFetch([{ status: 200, body: { exercises: [versioned] } }]);
  try {
    const [result] = await DB.exercises.getAll(1);
    assert.equal(result.questionText, 'Q?');
    assert.equal(result.answerText, 'A');
    assert.equal(result.hintText, 'H');
    assert.equal(result.position, 0);
    assert.equal(result.provenance, 'MANUAL');
  } finally { globalThis.fetch = realFetch; }
});

test('learningEvidence DTO bridges type->context and fraction score->percent, keeping unknown performance null (never 0)', async () => {
  const rows = [
    { id: 1, unitId: 1, evidenceDate: '2026-01-01', type: 'INITIAL_PRACTICE', questionsCount: 4, correctCount: 3, score: 0.75, reviewTaskId: null, createdAt: 'a' },
    { id: 2, unitId: 1, evidenceDate: '2026-01-02', type: 'EXTERNAL', questionsCount: null, correctCount: null, score: null, reviewTaskId: null, createdAt: 'b' },
  ];
  mockFetch([{ status: 200, body: { evidence: rows } }]);
  try {
    const [withScore, withoutScore] = await DB.learningEvidence.getAll();
    assert.equal(withScore.context, 'INITIAL_PRACTICE');
    assert.equal(withScore.scorePercent, 75);
    assert.equal(withoutScore.context, 'EXTERNAL');
    assert.equal(withoutScore.scorePercent, null, 'unknown performance must stay null, never become 0');
  } finally { globalThis.fetch = realFetch; }
});

test('reviewTasks DTO synthesizes reviewDone from completedAt and reviewNumber from the shared fixed-offset position, without inventing per-task question fields', async () => {
  const doneTask = { id: 1, unitId: 1, unitTitle: 'Aula', subjectId: 1, subjectName: 'Sub', dueDate: '2026-01-01', completedAt: '2026-01-01T00:00:00Z', offsetDays: 1 };
  const pendingTask = { id: 2, unitId: 1, unitTitle: 'Aula', subjectId: 1, subjectName: 'Sub', dueDate: '2026-02-01', completedAt: null, offsetDays: 30 };
  mockFetch([{ status: 200, body: { date: '2026-01-01', timezone: 'UTC', overdue: [], today: [doneTask], tomorrow: [pendingTask], completedToday: [] } }]);
  try {
    const today = await DB.reviewTasks.getForToday('2026-01-01');
    assert.equal(today[0].reviewDone, true);
    assert.equal(today[0].reviewNumber, 1, 'offsetDays=1 is the 1st entry in the fixed schedule');
  } finally { globalThis.fetch = realFetch; }

  mockFetch([{ status: 200, body: { date: '2026-01-01', timezone: 'UTC', overdue: [], today: [], tomorrow: [pendingTask], completedToday: [] } }]);
  try {
    const tomorrow = await DB.reviewTasks.getTomorrow('2026-01-02');
    assert.equal(tomorrow[0].reviewDone, false);
    assert.equal(tomorrow[0].reviewNumber, 4, 'offsetDays=30 is the 4th entry in the fixed schedule');
  } finally { globalThis.fetch = realFetch; }
});

test('reviewTasks.update maps the two coherent legacy shapes onto complete()/reopen(), and rejects the unmappable questionsDone-only shape without any network call', async () => {
  const completeCalls = mockFetch([{ status: 200, body: { reviewTaskId: 1, completedAt: 'x', reviewOnly: false, score: 1, evidenceId: 1 } }]);
  try {
    await DB.reviewTasks.update(1, { questionsCount: 2, correctCount: 2 });
    assert.ok(completeCalls[0].url.endsWith('/review-tasks/1/complete'));
  } finally { globalThis.fetch = realFetch; }

  const reopenCalls = mockFetch([{ status: 200, body: { reviewTaskId: 1, reopened: true } }]);
  try {
    await DB.reviewTasks.update(1, { reviewDone: false });
    assert.ok(reopenCalls[0].url.endsWith('/review-tasks/1/reopen'));
  } finally { globalThis.fetch = realFetch; }

  let networkCalled = false;
  globalThis.fetch = () => { networkCalled = true; throw new Error('must not be called'); };
  try {
    await assert.rejects(() => DB.reviewTasks.update(1, { questionsDone: true }), (err) => err instanceof RemoteStoreError && err.code === 'UNSUPPORTED_PARTIAL_UPDATE');
    assert.equal(networkCalled, false);
  } finally { globalThis.fetch = realFetch; }
});

test('learningUnits.update rejects studyDate/subjectId locally, before any network call', async () => {
  let called = false;
  globalThis.fetch = () => { called = true; throw new Error('must not be called'); };
  try {
    await assert.rejects(() => DB.learningUnits.update(1, { studyDate: '2030-01-01' }), (err) => err instanceof RemoteStoreError && err.code === 'UNSUPPORTED_FIELD');
    await assert.rejects(() => DB.learningUnits.update(1, { subjectId: 2 }), (err) => err instanceof RemoteStoreError);
    assert.equal(called, false);
  } finally { globalThis.fetch = realFetch; }
});

test('importAll and clearAll are explicitly unsupported (loud, typed, no silent no-op) and never touch the network', async () => {
  let called = false;
  globalThis.fetch = () => { called = true; throw new Error('must not be called'); };
  try {
    await assert.rejects(() => DB.importAll({}), (err) => err instanceof RemoteStoreError && err.code === 'NOT_YET_SUPPORTED');
    await assert.rejects(() => DB.clearAll(), (err) => err instanceof RemoteStoreError && err.code === 'NOT_YET_SUPPORTED');
    assert.equal(called, false);
  } finally { globalThis.fetch = realFetch; }
});

test('learningEvidence.create rejects a direct REVIEW-type submission locally, before any network call', async () => {
  let called = false;
  globalThis.fetch = () => { called = true; throw new Error('must not be called'); };
  try {
    await assert.rejects(
      () => DB.learningEvidence.create({ unitId: 1, context: 'REVIEW', evidenceDate: '2026-01-01' }),
      (err) => err instanceof RemoteStoreError && err.code === 'UNSUPPORTED_DIRECT_REVIEW_EVIDENCE',
    );
    assert.equal(called, false);
  } finally { globalThis.fetch = realFetch; }
});

test('settings.update rejects any field other than timezone locally, before any network call', async () => {
  let called = false;
  globalThis.fetch = () => { called = true; throw new Error('must not be called'); };
  try {
    await assert.rejects(() => DB.settings.update({ appVersion: '9.9.9' }), (err) => err instanceof RemoteStoreError && err.code === 'UNSUPPORTED_FIELD');
    assert.equal(called, false);
  } finally { globalThis.fetch = realFetch; }
});

// -- 3. Real API tests: authority (session/CSRF/ownership) over the actual --
// listening server, not a mock. Two things a real browser does for free
// that Node's bare fetch does not: (a) send an Origin header, (b) keep a
// per-origin cookie jar across calls. This harness-only shim supplies
// both — api-client.js itself never sets Origin (a forbidden header a
// real browser would refuse to let JS override anyway) and never
// implements its own cookie jar (real `credentials:'include'` handles
// that in production, as e2e/auth.spec.js already proves against a real
// browser).
function makeBrowserlikeFetch(fetchImpl, origin) {
  let cookie = null;
  return async (url, opts = {}) => {
    const headers = { ...opts.headers, Origin: origin };
    if (cookie) headers.Cookie = cookie;
    const res = await fetchImpl(url, { ...opts, headers });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return res;
  };
}

async function bootstrapSession(email) {
  globalThis.fetch = makeBrowserlikeFetch(realFetch, TEST_ORIGIN);
  await apiRequest('/v1/auth/register', { method: 'POST', body: { email, password: 'a genuinely long test password 1' } });
  await apiRequest('/v1/auth/login', { method: 'POST', body: { email, password: 'a genuinely long test password 1' } });
  const me = await apiRequest('/v1/auth/me');
  setCsrfToken(me.csrfToken);
}

test('real API: full authority-scoped round trip — subjects, learning units, agenda, exercises, evidence, settings, export', async () => {
  await bootstrapSession('remotestore-a@example.com');
  try {
    const subject = await DB.subjects.create('RemoteStore Subject', 'DISC-GREEN');
    assert.ok(subject.id);
    const subjects = await DB.subjects.getAll();
    assert.ok(subjects.some((s) => s.id === subject.id));

    const created = await DB.learningUnits.createWithReviews({ subjectId: subject.id, title: 'Aula RemoteStore', studyDate: '2020-01-01' });
    assert.equal(created.reviewCount, 16);
    const units = await DB.learningUnits.getAll();
    assert.ok(units.some((u) => u.id === created.unit.id));

    const overdue = await DB.reviewTasks.getOverdue('2026-01-01');
    assert.ok(overdue.length > 0, 'a 2020 study date must produce overdue reviews by now');
    const task = overdue[0];
    assert.equal(task.reviewDone, false);

    const completed = await DB.completeReviewWithEvidence({ taskId: task.id, questionsCount: 4, correctCount: 3 });
    assert.equal(completed.score, 0.75);

    const exercise = await DB.exercises.create(created.unit.id, { questionText: 'O que é X?', answerText: 'É Y', provenance: 'MANUAL' });
    assert.equal(exercise.questionText, 'O que é X?');
    const exerciseList = await DB.exercises.getAll(created.unit.id);
    assert.equal(exerciseList.length, 1);
    assert.equal(exerciseList[0].answerText, 'É Y');

    const evidence = await DB.learningEvidence.create({ unitId: created.unit.id, context: 'EXTERNAL', questionsCount: 10, correctCount: 9, evidenceDate: '2026-01-01' });
    assert.equal(evidence.scorePercent, 90);
    const evidenceList = await DB.learningEvidence.getAll();
    assert.ok(evidenceList.some((e) => e.id === evidence.id));

    const settingsBefore = await DB.settings.get();
    assert.equal(settingsBefore.timezone, 'America/Sao_Paulo');
    const settingsAfter = await DB.settings.update({ timezone: 'America/New_York' });
    assert.equal(settingsAfter.timezone, 'America/New_York');

    const exported = await DB.exportAll();
    assert.equal(exported.subjects.length, subjects.length);
  } finally { globalThis.fetch = realFetch; setCsrfToken(null); }
});

test('real API: a second account never sees the first account\'s subjects, and an unauthenticated request is rejected', async () => {
  await bootstrapSession('remotestore-b@example.com');
  try {
    const subjectsForB = await DB.subjects.getAll();
    assert.equal(subjectsForB.length, 0, 'a fresh account must never see account A\'s RemoteStore Subject from the previous test');
  } finally { globalThis.fetch = realFetch; setCsrfToken(null); }

  globalThis.fetch = realFetch;
  await assert.rejects(() => DB.subjects.getAll(), (err) => err instanceof ApiError && err.status === 401);
});
