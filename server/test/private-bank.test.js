import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { privateBankItems, recentlyExposedIds, editionYearOf } from '../src/corpus/private-bank.js';
import { classifyFreshness, editionVerdict } from '../src/corpus/freshness.js';
import { resolveReviewNeed } from '../src/corpus/review-need.js';

// PRIVATE QUESTION BANK on a SYNTHETIC database: no model, no paid call, no real data. The student's accepted exercises feed REUSE / DERIVE /
// GENERATE; recent exposure is skipped but an old answer comes back (spaced review); problem-flagged and archived questions are not served;
// another account never sees them; time-sensitive content from an older edition is held for verification instead of shown as current.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const NOW = new Date('2026-11-13T12:00:00.000Z');
const iso = (daysAgo) => new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-bank-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}
const user = (db, email) => db.prepare("INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at) VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)").run(email, email, iso(0), iso(0)).lastInsertRowid;

/** One accepted question: subject + unit + exercise + version (+ citation on a source file named `fileName`). */
function seed(db, userId, { unit, question, answer, explanation = null, type = 'CONCEPT', fileName = null, page = 12 }) {
  const subject = db.prepare('SELECT id FROM subjects WHERE user_id = ?').get(userId)?.id
    ?? db.prepare('INSERT INTO subjects (user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(userId, 'Fisiologia', iso(0), iso(0)).lastInsertRowid;
  const unitId = db.prepare('INSERT INTO learning_units (user_id, subject_id, title, study_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(userId, subject, unit, '2026-11-01', iso(0), iso(0)).lastInsertRowid;
  const ex = db.prepare('INSERT INTO exercises (user_id, unit_id, order_index, created_at, updated_at) VALUES (?, ?, 0, ?, ?)').run(userId, unitId, iso(0), iso(0)).lastInsertRowid;
  const ver = db.prepare("INSERT INTO exercise_versions (user_id, exercise_id, question, answer, provenance, created_at, explanation, question_type) VALUES (?, ?, ?, ?, 'AI_GENERATED', ?, ?, ?)").run(userId, ex, question, answer, iso(0), explanation, type).lastInsertRowid;
  if (fileName) {
    const src = db.prepare("INSERT INTO sources (user_id, filename, original_name, content_type, byte_size, checksum, created_at) VALUES (?, ?, ?, 'application/pdf', 1, ?, ?)").run(userId, `${fileName}.bin`, fileName, `c-${fileName}-${ex}`, iso(0)).lastInsertRowid;
    db.prepare('INSERT INTO exercise_source_citations (user_id, exercise_version_id, source_id, page_index, created_at) VALUES (?, ?, ?, ?, ?)').run(userId, ver, src, page, iso(0));
  }
  return { ex, ver, unitId };
}
const attempt = (db, userId, s, daysAgo) => db.prepare('INSERT INTO exercise_attempts (user_id, unit_id, exercise_version_id, started_at) VALUES (?, ?, ?, ?)').run(userId, s.unitId, s.ver, iso(daysAgo));

test('the bank is built from the exercises with source, pages, edition and provenance, and only from this account', () => {
  const { db, cleanup } = tmpDb();
  try {
    const a = user(db, 'a@x.test'); const b = user(db, 'b@x.test');
    seed(db, a, { unit: 'Filtração glomerular', question: 'O que determina a taxa de filtração glomerular?', answer: 'Pressões de Starling e Kf.', fileName: 'Costanzo Physiology 2012.pdf', page: 33 });
    seed(db, b, { unit: 'Filtração glomerular', question: 'Pergunta privada de outra conta', answer: 'x' });
    const items = privateBankItems(db, a);
    assert.equal(items.length, 1, 'another account never contributes');
    assert.equal(items[0].topic, 'Filtração glomerular');
    assert.equal(items[0].year, 2012);
    assert.equal(items[0].source, 'Costanzo Physiology 2012.pdf');
    assert.match(items[0].source_evidence, /33/);
    assert.equal(items[0].origin, 'generated');
    assert.equal(items[0].usage_status, 'LICENSED');
  } finally { cleanup(); }
});

test('empty bank -> GENERATE; a fitting question -> REUSE with no model; the bank answers by free text', () => {
  const { db, cleanup } = tmpDb();
  try {
    const a = user(db, 'a@x.test');
    assert.equal(resolveReviewNeed(db, a, { query: 'filtração glomerular' }, { now: NOW }).action, 'GENERATE');
    seed(db, a, { unit: 'Filtração glomerular', question: 'O que determina a taxa de filtração glomerular?', answer: 'Pressões de Starling e Kf.' });
    seed(db, a, { unit: 'Anatomia do rim', question: 'Qual estrutura do rim forma o filtrado?', answer: 'O glomérulo.' });
    const hit = resolveReviewNeed(db, a, { topic: 'Filtração glomerular' }, { now: NOW });
    assert.equal(hit.action, 'REUSE');
    assert.equal(hit.bank, 2);
    assert.match(hit.item.stem, /filtração glomerular/);
    const near = resolveReviewNeed(db, a, { query: 'rim' }, { now: NOW });
    assert.equal(near.action, 'DERIVE', 'free text alone is a near match, never an exact fit');
    assert.equal(near.relationship, 'NEAR_STRUCTURE');
  } finally { cleanup(); }
});

test('recent exposure is skipped, an old answer comes back (spaced review), and the answered history is untouched', () => {
  const { db, cleanup } = tmpDb();
  try {
    const a = user(db, 'a@x.test');
    const s = seed(db, a, { unit: 'Filtração glomerular', question: 'O que determina a taxa de filtração glomerular?', answer: 'Starling.' });
    attempt(db, a, s, 2);
    assert.deepEqual(recentlyExposedIds(db, a, { now: NOW, repeatAfterDays: 14 }), [`ex${s.ex}`]);
    assert.equal(resolveReviewNeed(db, a, { topic: 'Filtração glomerular' }, { now: NOW }).action, 'GENERATE', 'seen 2 days ago: not repeated yet');
    assert.equal(resolveReviewNeed(db, a, { topic: 'Filtração glomerular' }, { now: NOW, repeatAfterDays: 1 }).action, 'REUSE', 'past the interval it is a deliberate re-encounter');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM exercise_attempts WHERE user_id = ?').get(a).n, 1, 'the history is only read');
  } finally { cleanup(); }
});

test('a problem-flagged or archived question is not served, and clearing the flag brings it back', () => {
  const { db, cleanup } = tmpDb();
  try {
    const a = user(db, 'a@x.test');
    const flagged = seed(db, a, { unit: 'Filtração glomerular', question: 'Pergunta com gabarito errado?', answer: 'errado' });
    const archived = seed(db, a, { unit: 'Filtração glomerular', question: 'Pergunta arquivada sobre filtração?', answer: 'x' });
    const att = attempt(db, a, flagged, 90).lastInsertRowid;
    db.prepare("INSERT INTO exercise_flag_events (user_id, exercise_id, attempt_id, action, reason, created_at) VALUES (?, ?, ?, 'FLAG', 'DOUBTFUL_ANSWER_KEY', ?)").run(a, flagged.ex, att, iso(1));
    db.prepare('UPDATE exercises SET archived_at = ? WHERE id = ?').run(iso(1), archived.ex);
    assert.equal(privateBankItems(db, a).length, 0);
    db.prepare("INSERT INTO exercise_flag_events (user_id, exercise_id, action, created_at) VALUES (?, ?, 'CLEAR', ?)").run(a, flagged.ex, iso(0));
    assert.deepEqual(privateBankItems(db, a).map((i) => i.id), [`ex${flagged.ex}`]);
  } finally { cleanup(); }
});

test('2012 edition then 2025: stable science carries over, a time-sensitive recommendation is held for verification, never shown as current', () => {
  const { db, cleanup } = tmpDb();
  try {
    const a = user(db, 'a@x.test');
    seed(db, a, { unit: 'Filtração glomerular', question: 'O que determina a taxa de filtração glomerular?', answer: 'Pressões de Starling e Kf.', fileName: 'Costanzo Physiology 2012.pdf' });
    seed(db, a, { unit: 'Hipertensão', question: 'Qual a terapia de primeira linha para hipertensão em adultos segundo a diretriz?', answer: 'Tiazídico (2012).', fileName: 'Costanzo Physiology 2012.pdf' });
    const stable = resolveReviewNeed(db, a, { topic: 'Filtração glomerular', studyingYear: 2025 }, { now: NOW });
    assert.equal(stable.action, 'REUSE', 'equivalent, still-correct concept is reused across editions');
    const clinical = resolveReviewNeed(db, a, { topic: 'Hipertensão', studyingYear: 2025 }, { now: NOW });
    assert.equal(clinical.action, 'DERIVE');
    assert.equal(clinical.reason, 'OLDER_EDITION_TIME_SENSITIVE');
    assert.equal(clinical.verification.required, true);
    assert.equal(clinical.copyText, false);
    const sameYear = resolveReviewNeed(db, a, { topic: 'Hipertensão', studyingYear: 2012 }, { now: NOW });
    assert.equal(sameYear.action, 'REUSE', 'same edition: nothing newer to conflict with');
  } finally { cleanup(); }
});

test('freshness and edition helpers are deterministic and conservative', () => {
  assert.equal(classifyFreshness({ stem: 'Qual a dose de amoxicilina?' }).needsVerification, true);
  assert.equal(classifyFreshness({ stem: 'Qual a função do néfron?' }).stability, 'STABLE');
  assert.equal(editionYearOf('Guyton 2025.pdf'), 2025);
  assert.equal(editionYearOf('arquivo-12345.pdf'), null);
  assert.equal(editionVerdict({ year: null, needs_verification: true }, { studyingYear: 2025 }).ok, false, 'unknown edition + time-sensitive is not "current"');
  assert.equal(editionVerdict({ year: null, needs_verification: false }, { studyingYear: 2025 }).ok, true);
});
