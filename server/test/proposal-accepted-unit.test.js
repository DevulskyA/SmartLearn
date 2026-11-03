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

// R-4 "Abrir Resumo": the list of trechos tells which lesson an accepted draft became, so the screen can link to it. The link must be
// trustworthy: only while that lesson still exists, and only a lesson of the SAME user.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-accepted-unit-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { db, sourcesDir: join(dir, 'sources'), cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function makeUser(db, email) {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid;
}

async function draftOf(db, userId, sourcesDir) {
  const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(['Farmacocinética básica', 'Farmacodinâmica básica']), originalName: 'aula.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
  await extractSource(db, userId, source.id, { sourcesDir });
  const [proposal] = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 10 });
  const draft = await drafts.createDraft(db, userId, proposal.id, {});
  return { source, draft };
}
const latest = (db, userId, sourceId) => proposals.listProposals(db, userId, sourceId)[0].latestDraft;

test('latestDraft.acceptedUnitId: null before accepting, the lesson id after, null again if that lesson is gone or is not the user\'s own', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const { source, draft } = await draftOf(db, userId, sourcesDir);
    assert.equal(latest(db, userId, source.id).acceptedUnitId, null, 'a draft nobody accepted points at nothing');

    const result = acceptDraft(db, userId, draft.id, { newSubjectName: 'Farmacologia', studyDate: '2026-03-01', expectedRevision: draft.revision });
    assert.equal(latest(db, userId, source.id).acceptedUnitId, result.unit.id);
    assert.equal(latest(db, userId, source.id).status, 'ACCEPTED');

    // the lesson is gone: no link to something that is not there
    db.prepare('UPDATE generated_drafts SET accepted_unit_id = 999999 WHERE id = ?').run(draft.id);
    assert.equal(latest(db, userId, source.id).acceptedUnitId, null);

    // an id that exists but belongs to ANOTHER user is never exposed
    const other = makeUser(db, 'b@example.com');
    const now = new Date().toISOString();
    const subjectId = db.prepare("INSERT INTO subjects (user_id, name, color, created_at, updated_at) VALUES (?, 'Outra', 'DISC-BLUE', ?, ?)").run(other, now, now).lastInsertRowid;
    const foreignUnit = db.prepare("INSERT INTO learning_units (user_id, subject_id, title, study_date, created_at, updated_at) VALUES (?, ?, 'Aula alheia', '2026-03-01', ?, ?)").run(other, subjectId, now, now).lastInsertRowid;
    db.prepare('UPDATE generated_drafts SET accepted_unit_id = ? WHERE id = ?').run(foreignUnit, draft.id);
    assert.equal(latest(db, userId, source.id).acceptedUnitId, null);
  } finally { cleanup(); }
});
