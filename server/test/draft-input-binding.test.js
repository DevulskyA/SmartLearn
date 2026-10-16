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
import { acceptDraft } from '../src/services/accept-draft.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// SPRINT 04 (DRAFT <-> EXTRACTION BINDING): a draft is bound to the exact source text that produced it.
// If that text changes before acceptance, accepting is an explicit conflict. Text B is never frozen as the
// support of content that was generated from text A.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };
const ACCEPT = { newSubjectName: 'Farmacologia', studyDate: '2026-01-05' };

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-binding-'));
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

async function draftFromSource(db, userId, sourcesDir) {
  const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(['A dose e 5 mg.', 'O mecanismo e a inibicao da enzima.']), originalName: 'aula.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
  await extractSource(db, userId, source.id, { sourcesDir });
  const [proposal] = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 10 });
  const draft = await drafts.createDraft(db, userId, proposal.id);
  return { source, proposal, draft };
}

/** What a re-extraction that produced different text would leave behind. */
function reextractedAs(db, userId, sourceId, pageIndex, text) {
  db.prepare('UPDATE source_pages SET text = ? WHERE user_id = ? AND source_id = ? AND page_index = ?').run(text, userId, sourceId, pageIndex);
  db.prepare('UPDATE sources SET extraction_generation = extraction_generation + 1 WHERE user_id = ? AND id = ?').run(userId, sourceId);
}

const unitCount = (db, userId) => db.prepare('SELECT COUNT(*) AS n FROM learning_units WHERE user_id = ?').get(userId).n;

test('accepting a draft after its source text changed is an explicit conflict; nothing is created and the draft stays DRAFT', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const { source, draft } = await draftFromSource(db, userId, sourcesDir);
    reextractedAs(db, userId, source.id, 1, 'A dose e 50 mg.');

    assert.throws(() => acceptDraft(db, userId, draft.id, { ...ACCEPT, expectedRevision: draft.revision }), (err) => err.code === 'SOURCE_CHANGED');
    assert.equal(unitCount(db, userId), 0);
    assert.equal(drafts.getDraft(db, userId, draft.id).status, 'DRAFT');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM exercise_source_citations WHERE user_id = ?').get(userId).n, 0, 'no citation may freeze the changed text');
  } finally { cleanup(); }
});

test('a page that disappeared after generation is a conflict too', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b@example.com');
    const { source, draft } = await draftFromSource(db, userId, sourcesDir);
    db.prepare('DELETE FROM source_pages WHERE user_id = ? AND source_id = ? AND page_index = 2').run(userId, source.id);

    assert.throws(() => acceptDraft(db, userId, draft.id, { ...ACCEPT, expectedRevision: draft.revision }), (err) => err.code === 'SOURCE_CHANGED');
    assert.equal(unitCount(db, userId), 0);
  } finally { cleanup(); }
});

test('re-extracting IDENTICAL text is not a conflict: re-uploading the same PDF must not invalidate a draft', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'c@example.com');
    const { source, draft } = await draftFromSource(db, userId, sourcesDir);
    const again = await extractSource(db, userId, source.id, { sourcesDir });
    assert.equal(again.applied, true);

    const result = acceptDraft(db, userId, draft.id, { ...ACCEPT, expectedRevision: draft.revision });
    assert.equal(result.exerciseCount, draft.questions.length);
  } finally { cleanup(); }
});

test('the draft reports it is stale before the reviewer tries to accept it', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'd@example.com');
    const { source, draft } = await draftFromSource(db, userId, sourcesDir);
    assert.equal(drafts.getDraft(db, userId, draft.id).sourceStale, false);
    reextractedAs(db, userId, source.id, 2, 'Outro mecanismo.');
    assert.equal(drafts.getDraft(db, userId, draft.id).sourceStale, true);
  } finally { cleanup(); }
});

test('regenerating after the change produces a draft bound to the NEW text, which then accepts with that text frozen', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'e@example.com');
    const { source, proposal, draft } = await draftFromSource(db, userId, sourcesDir);
    reextractedAs(db, userId, source.id, 1, 'A dose e 50 mg.');
    assert.throws(() => acceptDraft(db, userId, draft.id, { ...ACCEPT, expectedRevision: draft.revision }), (err) => err.code === 'SOURCE_CHANGED');

    const fresh = await drafts.createDraft(db, userId, proposal.id);
    acceptDraft(db, userId, fresh.id, { ...ACCEPT, expectedRevision: fresh.revision });
    const frozen = db.prepare('SELECT DISTINCT page_text_snapshot AS t FROM exercise_source_citations WHERE user_id = ? AND page_index = 1').all(userId).map((r) => r.t);
    assert.deepEqual(frozen, ['A dose e 50 mg.'], 'the citation freezes the text that actually produced the draft');
  } finally { cleanup(); }
});

test('a draft created before binding existed (no recorded input) still accepts as before: unknown is not treated as changed', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'f@example.com');
    const { draft } = await draftFromSource(db, userId, sourcesDir);
    db.prepare('UPDATE generated_drafts SET input_sha256 = NULL, source_extraction_generation = NULL WHERE user_id = ? AND id = ?').run(userId, draft.id);

    const result = acceptDraft(db, userId, draft.id, { ...ACCEPT, expectedRevision: draft.revision });
    assert.ok(result.unit.id);
    assert.equal(drafts.getDraft(db, userId, draft.id).sourceStale, false);
  } finally { cleanup(); }
});
