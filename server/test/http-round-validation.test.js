import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import * as exercises from '../src/services/exercises.js';
import * as learningUnits from '../src/services/learning-units.js';

// REVIEW-1: request-body contracts added this round are enforced at the wire (they were only exercised through
// the service layer before): POST /v1/exams takes exactly one of unitId/subjectId; the chunking size is bounded.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';

test('POST /v1/exams accepts exactly one of unitId / subjectId; proposals chunk size is range-checked', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-http-round-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN] });
  try {
    const email = 'round@example.com';
    const password = 'a genuinely long test password 1';
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
    const login = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
    const cookie = login.headers['set-cookie'].split(';')[0];
    const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } })).body).csrfToken;
    const post = (url, payload) => app.inject({ method: 'POST', url, headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, payload });

    const userId = db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
    const unit = learningUnits.create(db, userId, { newSubjectName: 'Disciplina', title: 'Aula', summaryBody: 'r', studyDate: '2026-03-01' }).unit;
    exercises.create(db, userId, { unitId: unit.id, question: 'Q?', answer: 'A', provenance: 'MANUAL' });

    assert.equal((await post('/v1/exams', {})).statusCode, 400, 'neither key');
    assert.equal((await post('/v1/exams', { unitId: unit.id, subjectId: unit.subjectId })).statusCode, 400, 'both keys');
    const bySubject = await post('/v1/exams', { subjectId: unit.subjectId });
    assert.equal(bySubject.statusCode, 201);
    assert.equal(JSON.parse(bySubject.body).exam.scope, 'SUBJECT');
    assert.equal((await post('/v1/exams', { unitId: unit.id })).statusCode, 201, 'the classic single-unit exam still works alongside');

    // the body schema is checked before the source is even looked up, so a bogus id is enough to prove the 400
    const source = 999999;
    for (const bad of [0, -3, 101]) {
      assert.equal((await post(`/v1/sources/${source}/proposals`, { maxPagesPerChunk: bad })).statusCode, 400, `maxPagesPerChunk=${bad}`);
    }
  } finally { await app.close(); db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
