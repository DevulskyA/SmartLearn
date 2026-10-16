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
import * as learningUnits from '../src/services/learning-units.js';
import { acceptDraft } from '../src/services/accept-draft.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// CONTENT-QUALITY CQ-3: the WHY of an exercise (feedback that teaches) is stored per immutable
// version, survives acceptance, is carried forward by an edit, and is absent (never invented)
// for manual exercises.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-explanation-'));
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

async function acceptedUnitWithExplanation(db, userId, sourcesDir, explanation) {
  const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(['Farmacocinetica e absorcao dos farmacos']), originalName: 'f.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
  await extractSource(db, userId, source.id, { sourcesDir });
  const [proposal] = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 10 });
  const draft = await drafts.createDraft(db, userId, proposal.id, {});
  // the fake provider has no explanation; put one where a live provider's validated draft would carry it
  const row = db.prepare('SELECT draft_json FROM generated_drafts WHERE id = ?').get(draft.id);
  const content = JSON.parse(row.draft_json);
  content.questions[0].explanation = explanation;
  db.prepare('UPDATE generated_drafts SET draft_json = ? WHERE id = ?').run(JSON.stringify(content), draft.id);
  const revision = db.prepare('SELECT revision FROM generated_drafts WHERE id = ?').get(draft.id).revision;
  const result = acceptDraft(db, userId, draft.id, { newSubjectName: 'Farmaco', studyDate: '2026-03-01', expectedRevision: revision });
  return result.unit.id;
}

test('an accepted AI exercise keeps its explanation on the immutable version and exposes it; the answer stays the concise gabarito', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const unitId = await acceptedUnitWithExplanation(db, userId, sourcesDir, 'Porque a absorcao depende da forma nao ionizada do farmaco.');
    const [ex] = exercises.list(db, userId, unitId);
    assert.equal(ex.currentVersion.provenance, 'AI_GENERATED');
    assert.equal(ex.currentVersion.explanation, 'Porque a absorcao depende da forma nao ionizada do farmaco.');
    assert.ok(ex.currentVersion.answer.length > 0);
  } finally { cleanup(); }
});

test('an exercise without an explanation exposes null, never an invented one (manual and pre-existing versions)', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b@example.com');
    const unit = learningUnits.create(db, userId, { newSubjectName: 'Manual', title: 'Aula', summaryBody: 'r', studyDate: '2026-03-02' });
    const ex = exercises.create(db, userId, { unitId: unit.unit.id, question: 'Q?', answer: 'A', provenance: 'MANUAL' });
    assert.equal(ex.currentVersion.explanation, null);
  } finally { cleanup(); }
});

test('editing appends a NEW version, carries the explanation forward unless told otherwise, and never rewrites the old version', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'c@example.com');
    const unitId = await acceptedUnitWithExplanation(db, userId, sourcesDir, 'Porque sim, segundo a fonte.');
    const [ex] = exercises.list(db, userId, unitId);
    const v1 = ex.currentVersion.id;

    const hintOnly = exercises.edit(db, userId, ex.id, { hint: 'Pense na forma ionizada.' });
    assert.equal(hintOnly.currentVersion.explanation, 'Porque sim, segundo a fonte.', 'a hint edit does not destroy the teaching text');
    assert.notEqual(hintOnly.currentVersion.id, v1);
    assert.equal(exercises.getVersion(db, userId, v1).explanation, 'Porque sim, segundo a fonte.', 'the old version is untouched');

    const changed = exercises.edit(db, userId, ex.id, { explanation: 'Nova explicacao.' });
    assert.equal(changed.currentVersion.explanation, 'Nova explicacao.');
    const cleared = exercises.edit(db, userId, ex.id, { explanation: null });
    assert.equal(cleared.currentVersion.explanation, null, 'an explicit null clears it');
  } finally { cleanup(); }
});
