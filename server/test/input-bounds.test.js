import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';

// P1-VAL1 (family: numbers and texts at the door): what the route schema must refuse BEFORE any service runs. A field that is "a number"
// is not enough: page numbers start at 1 and stop at a sane book size, offsets are never negative, names have a length.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';

async function freshApp() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-bounds-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN] });
  return { app, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

const send = (app, method, url, payload, headers) => app.inject({ method, url, payload, headers: { origin: TEST_ORIGIN, ...headers } });

async function session(app, email) {
  const body = { email, password: 'a genuinely long test password 1' };
  await send(app, 'POST', '/v1/auth/register', body);
  const login = await send(app, 'POST', '/v1/auth/login', body);
  const cookie = login.headers['set-cookie'].split(';')[0];
  const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });
  return { cookie, 'x-csrf-token': JSON.parse(me.body).csrfToken };
}

test('a page range outside 1..100000, a negative offset or a negative section number is refused at the door with 400', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const headers = await session(app, 'bounds-pages@example.com');
    const bad = [
      { range: { pageStart: 0, pageEnd: 5 } },
      { range: { pageStart: -3, pageEnd: 5 } },
      { range: { pageStart: 1, pageEnd: 100001 } },
      { range: { pageStart: 1, pageEnd: 5, startOffset: -1 } },
      { range: { pageStart: 1, pageEnd: 5, endOffset: -10 } },
      { ordinal: -1 },
    ];
    for (const body of bad) {
      const res = await send(app, 'POST', '/v1/sources/1/scopes', body, headers);
      assert.equal(res.statusCode, 400, `${JSON.stringify(body)} -> ${res.statusCode} ${res.body}`);
      assert.equal(JSON.parse(res.body).error.code, 'VALIDATION_FAILED');
    }
  } finally { cleanup(); }
});

test('a lesson with a 5000-character title, a 5000-character source or a 40-million-character summary is refused with 400', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const headers = await session(app, 'bounds-unit@example.com');
    const base = { newSubjectName: 'Anatomia', title: 'Plexo braquial', studyDate: '2026-11-14' };
    for (const extra of [{ title: 'x'.repeat(5000) }, { sourceText: 'x'.repeat(5000) }, { summaryBody: 'x'.repeat(200001) }, { newSubjectName: 'x'.repeat(5000) }]) {
      const res = await send(app, 'POST', '/v1/learning-units', { ...base, ...extra }, headers);
      assert.equal(res.statusCode, 400, `${Object.keys(extra)[0]} -> ${res.statusCode} ${res.body.slice(0, 120)}`);
    }
    const ok = await send(app, 'POST', '/v1/learning-units', base, headers);
    assert.ok(ok.statusCode === 200 || ok.statusCode === 201, `a normal lesson is accepted (${ok.statusCode})`);
  } finally { cleanup(); }
});

test('an impossible study date (31 February) is refused with 400 and the study-date message, never a 500', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const headers = await session(app, 'bounds-date@example.com');
    const res = await send(app, 'POST', '/v1/learning-units', { newSubjectName: 'Anatomia', title: 'Plexo braquial', studyDate: '2026-02-31' }, headers);
    assert.equal(res.statusCode, 400, `${res.statusCode} ${res.body.slice(0, 120)}`);
    assert.equal(JSON.parse(res.body).error.field, 'studyDate');
  } finally { cleanup(); }
});

test('a draft summary above 200000 characters and a question above 5000 are refused at the door with 400', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const headers = await session(app, 'bounds-draft@example.com');
    const summary = await send(app, 'PATCH', '/v1/drafts/1/summary', { summary: 'x'.repeat(200001) }, headers);
    assert.equal(summary.statusCode, 400, `summary -> ${summary.statusCode}`);
    const question = await send(app, 'PATCH', '/v1/drafts/1/questions/1', { question: 'x'.repeat(5001), answer: 'a' }, headers);
    assert.equal(question.statusCode, 400, `question -> ${question.statusCode}`);
  } finally { cleanup(); }
});

test('an exam answer above 5000 characters, a 5000-character timezone or locale and a 5000-character e-mail or password are refused with 400', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const headers = await session(app, 'bounds-misc@example.com');
    const checks = [
      ['PUT', '/v1/exams/1/items/1/answer', { answer: 'x'.repeat(5001) }, 'exam answer'],
      ['PATCH', '/v1/settings', { timezone: 'x'.repeat(5000) }, 'timezone'],
      ['PATCH', '/v1/settings', { uiLocale: 'x'.repeat(5000) }, 'uiLocale'],
      ['PATCH', '/v1/settings', { generationLocale: 'x'.repeat(5000) }, 'generationLocale'],
      ['POST', '/v1/auth/login', { email: `${'x'.repeat(5000)}@example.com`, password: 'a genuinely long test password 1' }, 'login e-mail'],
      ['POST', '/v1/auth/register', { email: 'big@example.com', password: 'x'.repeat(5000) }, 'register password'],
    ];
    for (const [method, url, payload, label] of checks) {
      const res = await send(app, method, url, payload, headers);
      assert.equal(res.statusCode, 400, `${label} -> ${res.statusCode} ${res.body.slice(0, 100)}`);
    }
  } finally { cleanup(); }
});

test('a subject name of 5000 characters or an empty one is refused with 400; a normal medical name is accepted', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const headers = await session(app, 'bounds-subject@example.com');
    for (const name of ['x'.repeat(5000), '']) {
      const res = await send(app, 'POST', '/v1/subjects', { name }, headers);
      assert.equal(res.statusCode, 400, `name length ${name.length} -> ${res.statusCode}`);
    }
    // the refusal says what was wrong, in a coded sentence the screen can translate (never just "VALIDATION_FAILED")
    const long = JSON.parse((await send(app, 'POST', '/v1/subjects', { name: 'x'.repeat(5000) }, headers)).body).error;
    assert.equal(long.msg.code, 'INPUT_TOO_LONG');
    assert.deepEqual(long.msg.params, { field: 'name', limit: 100 });
    assert.match(long.message, /"name".*100 caracteres/);
    const range = JSON.parse((await send(app, 'POST', '/v1/sources/1/scopes', { range: { pageStart: 0, pageEnd: 3 } }, headers)).body).error;
    assert.equal(range.msg.code, 'INPUT_OUT_OF_RANGE');
    const ok = await send(app, 'POST', '/v1/subjects', { name: 'Farmacologia' }, headers);
    assert.equal(ok.statusCode, 200);
  } finally { cleanup(); }
});
