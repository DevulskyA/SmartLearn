import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import * as sourceStorage from '../src/services/source-storage.js';
import { extractSource } from '../src/services/source-extraction.js';
import * as proposals from '../src/services/content-proposals.js';
import * as drafts from '../src/services/generated-drafts.js';
import * as exercises from '../src/services/exercises.js';
import { acceptDraft } from '../src/services/accept-draft.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// SPRINT 10 (QUESTION MODEL): a question is an instrument of learning AND of measurement, so what it asks the
// student to demonstrate (RECALL, MECHANISM, APPLICATION...) must survive acceptance. The draft already carries
// it (and the reviewer sees it as a chip); accepting used to drop it, so no later feature could tell what a
// right/wrong answer actually measured. Never invented: a question the provider did not label stays unlabeled.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-qtype-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { db, sourcesDir: join(dir, 'sources'), cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function makeUser(db, email) {
  const now = new Date().toISOString();
  return db.prepare(`
    INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)
  `).run(email, email, now, now).lastInsertRowid;
}

async function acceptedUnit(db, userId, sourcesDir, questions) {
  const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(['a', 'b']), originalName: 'a.pdf', contentType: 'application/pdf', sourcesDir, maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 });
  await extractSource(db, userId, source.id, { sourcesDir });
  const [proposal] = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 10 });
  const draft = await drafts.createDraft(db, userId, proposal.id);
  const revised = drafts.reviseDraft(db, userId, draft.id, { questions });
  const result = acceptDraft(db, userId, draft.id, { newSubjectName: 'Imunologia', studyDate: '2026-01-05', expectedRevision: revised.revision });
  return exercises.list(db, userId, result.unit.id);
}

const q = (question, questionType, pageIndex = 1) => ({ question, answer: 'resposta', explanation: null, hint: null, questionType, sourceSpans: [{ pageIndex }] });

test('accepting a draft keeps what each question asks the student to demonstrate; an unlabeled question stays unlabeled', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const list = await acceptedUnit(db, userId, sourcesDir, [q('Q recall', 'RECALL'), q('Q mecanismo', 'MECHANISM', 2), q('Q sem tipo', null)]);
    assert.deepEqual(list.map((e) => e.currentVersion.questionType), ['RECALL', 'MECHANISM', null]);
  } finally { cleanup(); }
});

test('editing an exercise keeps its question type on the new version and never touches the earlier version', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b@example.com');
    const [first] = await acceptedUnit(db, userId, sourcesDir, [q('Q aplicacao', 'APPLICATION')]);
    const edited = exercises.edit(db, userId, first.id, { hint: 'pista nova' });

    assert.equal(edited.currentVersion.questionType, 'APPLICATION');
    assert.notEqual(edited.currentVersion.id, first.currentVersion.id);
    assert.equal(exercises.getVersion(db, userId, first.currentVersion.id).questionType, 'APPLICATION');
  } finally { cleanup(); }
});

test('a manually created exercise has no declared type, and the column only ever holds a known type', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'c@example.com');
    const [first] = await acceptedUnit(db, userId, sourcesDir, [q('Q', 'CONCEPT')]);
    const manual = exercises.create(db, userId, { unitId: first.unitId, question: 'minha pergunta', answer: 'x', provenance: 'MANUAL' });
    assert.equal(manual.currentVersion.questionType, null);

    assert.throws(() => db.prepare("UPDATE exercise_versions SET question_type = 'INVENTED' WHERE id = ?").run(manual.currentVersion.id), /CHECK|constraint/i);
  } finally { cleanup(); }
});
