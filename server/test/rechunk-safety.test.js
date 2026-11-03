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

// SPRINT 02 (RECHUNK SAFETY): re-chunking replaces a source's proposals. A proposal that already has a
// draft is linked content: that is an explicit domain outcome, never a foreign-key crash, and nothing
// is deleted unless the caller says so and the draft is not accepted.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-rechunk-'));
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

async function sourceWithDraft(db, userId, sourcesDir) {
  const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(['um', 'dois', 'tres']), originalName: 'aula.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
  await extractSource(db, userId, source.id, { sourcesDir });
  const [proposal] = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 3 });
  const draft = await drafts.createDraft(db, userId, proposal.id);
  return { source, proposal, draft };
}

const counts = (db, userId) => ({
  proposals: db.prepare('SELECT COUNT(*) AS n FROM content_proposals WHERE user_id = ?').get(userId).n,
  drafts: db.prepare('SELECT COUNT(*) AS n FROM generated_drafts WHERE user_id = ?').get(userId).n,
});

test('re-chunking a source that has an unaccepted DRAFT is an explicit domain error and deletes nothing', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const { source, proposal, draft } = await sourceWithDraft(db, userId, sourcesDir);
    const before = counts(db, userId);

    assert.throws(() => proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 1 }), (err) => err.code === 'HAS_EXISTING_DRAFT');

    assert.deepEqual(counts(db, userId), before, 'a refused re-chunk changes nothing');
    assert.equal(proposals.listProposals(db, userId, source.id)[0].id, proposal.id);
    assert.equal(drafts.getDraft(db, userId, draft.id).status, 'DRAFT');
  } finally { cleanup(); }
});

test('discardDrafts: true is the explicit way to re-chunk: it drops only the unaccepted drafts, then re-chunks', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b@example.com');
    const { source } = await sourceWithDraft(db, userId, sourcesDir);

    const rechunked = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 1, discardDrafts: true });
    assert.equal(rechunked.length, 3);
    assert.deepEqual(counts(db, userId), { proposals: 3, drafts: 0 });
  } finally { cleanup(); }
});

test('accepted content is never discarded, not even with discardDrafts: true, and the error tells the truth about the way out', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'c@example.com');
    const { source, draft } = await sourceWithDraft(db, userId, sourcesDir);
    acceptDraft(db, userId, draft.id, { newSubjectName: 'Farmacologia', studyDate: '2026-01-05', expectedRevision: draft.revision });
    const before = counts(db, userId);

    assert.throws(
      () => proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 1, discardDrafts: true }),
      (err) => err.code === 'HAS_ACCEPTED_CONTENT' && !/como uma fonte separada/.test(err.message),
      'the old advice (upload again as a separate source) is impossible: the same bytes dedupe to this source',
    );
    assert.deepEqual(counts(db, userId), before);
    assert.equal(db.prepare("SELECT status FROM generated_drafts WHERE user_id = ?").get(userId).status, 'ACCEPTED');
  } finally { cleanup(); }
});
