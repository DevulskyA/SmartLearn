// Subtopics from the source's own sections (experimental, read-only): a question is linked to a section ONLY when its frozen citation pages fall
// inside exactly one section; no citation = UNKNOWN, several sections or a page where two sections start = AMBIGUOUS. Observed evidence only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import * as learningUnits from '../src/services/learning-units.js';
import * as exercises from '../src/services/exercises.js';
import * as attempts from '../src/services/attempts.js';
import * as knowledge from '../src/services/knowledge-map.js';
import { buildApp } from '../src/app.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const ORIGIN = 'https://smartlearn.test';

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-knowledge-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}
const makeUser = (db, email) => {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid;
};
const answer = (db, userId, exerciseId, outcome, reveal = false) => {
  const a = attempts.start(db, userId, { exerciseId });
  if (reveal) attempts.revealSolution(db, userId, a.id);
  attempts.submit(db, userId, a.id, { outcome, assessmentMethod: 'SELF_REPORT' });
};

function seed(db) {
  const userId = makeUser(db, 'k@example.com');
  const now = new Date().toISOString();
  const sourceId = db.prepare(`INSERT INTO sources (user_id, filename, original_name, content_type, byte_size, checksum, status, created_at, page_count)
    VALUES (?, 'f.pdf', 'Costanzo.pdf', 'application/pdf', 100, 'abc', 'UPLOADED', ?, 20)`).run(userId, now).lastInsertRowid;
  // sections: A starts p1, B starts p5, C and D BOTH start p9 (a page that belongs to two sections)
  const outline = db.prepare('INSERT INTO source_outline (user_id, source_id, ordinal, level, title, page_index) VALUES (?, ?, ?, 1, ?, ?)');
  [['Seção A', 1], ['Seção B', 5], ['Seção C', 9], ['Seção D', 9]].forEach(([title, page], ordinal) => outline.run(userId, sourceId, ordinal, title, page));
  const unit = learningUnits.create(db, userId, { newSubjectName: 'Fisiologia', title: 'Aula', studyDate: '2026-01-01' }).unit;
  const mk = (name, pages) => {
    const ex = exercises.create(db, userId, { unitId: unit.id, question: `${name}?`, answer: 'R', provenance: 'MANUAL' });
    for (const p of pages) db.prepare('INSERT INTO exercise_source_citations (user_id, exercise_version_id, source_id, page_index, created_at) VALUES (?, ?, ?, ?, ?)').run(userId, ex.currentVersion.id, sourceId, p, now);
    return ex;
  };
  return { userId, unit, sourceId, mk };
}

test('links a question to a section only with sustained identification; unknown and ambiguous are kept apart; evidence is observed only', () => {
  const { db, cleanup } = tmpDb();
  try {
    const { userId, unit, mk } = seed(db);
    const inA = [mk('A1', [2]), mk('A2', [3]), mk('A3', [4])];
    const inB = [mk('B1', [6]), mk('B2', [7]), mk('B3', [8])];
    const spans = mk('S', [2, 6]);        // cites two sections
    const twoStart = mk('T', [9]);         // page 9 is where two sections start
    const none = mk('N', []);              // no citation
    for (const ex of inA) answer(db, userId, ex.id, 'INCORRECT');
    answer(db, userId, inA[0].id, 'INCORRECT'); answer(db, userId, inA[1].id, 'INCORRECT');
    for (const ex of inB) answer(db, userId, ex.id, 'CORRECT', true); // all with the solution shown: assisted, not evidence
    answer(db, userId, spans.id, 'INCORRECT'); answer(db, userId, twoStart.id, 'INCORRECT'); answer(db, userId, none.id, 'INCORRECT');
    const digest = JSON.stringify(db.prepare('SELECT * FROM learning_events ORDER BY id').all());
    const out = knowledge.knowledgeMap(db, userId);
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM learning_events ORDER BY id').all()), digest, 'read-only');
    const u = out.units.find((x) => x.unitId === unit.id);
    const a = u.sections.find((s) => s.title === 'Seção A');
    const b = u.sections.find((s) => s.title === 'Seção B');
    assert.equal(a.signal, 'GAP_SIGNAL'); assert.deepEqual(a.independent, { attempts: 5, correct: 0, distinctQuestions: 3 });
    assert.equal(b.signal, 'INSUFFICIENT'); assert.equal(b.assisted, 3, 'answers with the solution shown are not evidence');
    assert.equal(a.basis, 'CITATION_PAGE_IN_OUTLINE'); assert.equal(a.pageFrom, 1);
    assert.deepEqual(u.notLinked, { ambiguousQuestions: 2, unknownQuestions: 1 });
    assert.equal(u.sections.some((s) => /C|D/.test(s.title.slice(-1)) && s.attempts > 0), false, 'nothing is attributed to the two-start page');
    for (const s of u.sections) assert.ok(!('mastery' in s) && !('level' in s && typeof s.level === 'string'));
  } finally { cleanup(); }
});

test('GET /v1/knowledge-map is owner-only; a user without outline or citations simply gets no sections', async () => {
  const { db, cleanup } = tmpDb();
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [ORIGIN] });
  try {
    const pw = 'a genuinely long test password 1';
    const session = async (email) => {
      await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: ORIGIN }, payload: { email, password: pw } });
      const res = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: ORIGIN }, payload: { email, password: pw } });
      return res.headers['set-cookie'].split(';')[0];
    };
    const alice = await session('alice@example.com');
    const bob = await session('bob@example.com');
    assert.equal((await app.inject({ method: 'GET', url: '/v1/knowledge-map' })).statusCode, 401);
    assert.deepEqual(JSON.parse((await app.inject({ method: 'GET', url: '/v1/knowledge-map', headers: { cookie: alice } })).body), { units: [] });
    assert.deepEqual(JSON.parse((await app.inject({ method: 'GET', url: '/v1/knowledge-map', headers: { cookie: bob } })).body), { units: [] });
  } finally { await app.close(); cleanup(); }
});
