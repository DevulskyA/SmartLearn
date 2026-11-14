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
import { BURST_WINDOW_MS } from '../src/services/draft-summary-versions.js';
import { CODEX_PROVIDER_NAME } from '../src/ai/codex-provider.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// P1-4: every replaced summary text is kept, so the student can list, compare and restore an earlier one and never loses what they wrote.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };
const GENERATED = '## Filtracao glomerular\n\nA filtracao depende da pressao hidrostatica.';

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-summary-versions-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { db, sourcesDir: join(dir, 'sources'), cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function makeUser(db, email = 'a@example.com') {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid;
}

const generator = () => ({
  name: CODEX_PROVIDER_NAME, live: false,
  async generate() {
    return { summary: GENERATED, summarySourceSpans: [{ pageIndex: 1 }], summaryEvidence: [], questions: [], modelVersion: 'codex:test', promptVersion: '10', language: 'pt-BR' };
  },
});

async function draftFor(db, userId, sourcesDir) {
  const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(['Filtracao glomerular depende da pressao hidrostatica e oncotica.', 'Segunda pagina da aula.']), originalName: 'aula.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
  await extractSource(db, userId, source.id, { sourcesDir });
  const proposal = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 10 })[0];
  return drafts.createDraft(db, userId, proposal.id, { providerImpl: generator(), codex: { deferQuestions: true }, generationLocaleOverride: 'pt-BR' });
}

const clock = (start = Date.parse('2026-11-14T10:00:00Z')) => { let t = start; return { now: () => new Date(t), advance: (ms) => { t += ms; } }; };

test('the AI text and the student text that replaced it are both kept, newest first, and the current text is not duplicated', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db);
    const draft = await draftFor(db, userId, sourcesDir);
    const c = clock();
    const own = '## Filtracao glomerular\n\nMeu resumo: a filtracao depende da pressao hidrostatica e da oncotica.';
    const first = drafts.reviseSummary(db, userId, draft.id, { summary: own, expectedVersion: draft.summaryVersion }, c.now);
    assert.equal(first.summaryVersion, draft.summaryVersion + 1);
    c.advance(BURST_WINDOW_MS + 1000);
    const own2 = `${own}\n\nAcrescentei uma frase.`;
    drafts.reviseSummary(db, userId, draft.id, { summary: own2, expectedVersion: first.summaryVersion }, c.now);

    const list = drafts.listDraftSummaryVersions(db, userId, draft.id);
    assert.deepEqual(list.map((v) => [v.version, v.origin]), [[2, 'HUMAN_EDITED'], [1, 'GENERATED']]);
    assert.equal(list[0].summary, undefined, 'the list carries no text');
    assert.equal(drafts.readDraftSummaryVersion(db, userId, draft.id, 1).summary, GENERATED, 'the AI text is not lost');
    assert.equal(drafts.readDraftSummaryVersion(db, userId, draft.id, 2).summary, own, 'the first student text is not lost');
    assert.equal(drafts.getDraft(db, userId, draft.id).summary, own2);
  } finally { cleanup(); }
});

test('an autosave burst of the student own text folds into one version; the AI text is still kept', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db);
    const draft = await draftFor(db, userId, sourcesDir);
    const c = clock();
    let v = draft.summaryVersion;
    for (const text of ['## T\n\nUm.', '## T\n\nUm dois.', '## T\n\nUm dois tres.', '## T\n\nUm dois tres quatro.']) {
      v = drafts.reviseSummary(db, userId, draft.id, { summary: text, expectedVersion: v }, c.now).summaryVersion;
      c.advance(2000);
    }
    const list = drafts.listDraftSummaryVersions(db, userId, draft.id);
    assert.deepEqual(list.map((x) => x.origin), ['GENERATED'], 'only the AI text; the intermediate saves were seconds apart');
    assert.equal(drafts.readDraftSummaryVersion(db, userId, draft.id, 1).summary, GENERATED);
  } finally { cleanup(); }
});

test('restore puts an earlier text back, keeps the text it replaced and is refused for another user or an unknown version', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db);
    const other = makeUser(db, 'b@example.com');
    const draft = await draftFor(db, userId, sourcesDir);
    const c = clock();
    const own = '## Filtracao glomerular\n\nTexto do aluno que nao pode se perder.';
    const edited = drafts.reviseSummary(db, userId, draft.id, { summary: own, expectedVersion: draft.summaryVersion }, c.now);

    const restored = drafts.restoreSummaryVersion(db, userId, draft.id, 1, c.now);
    assert.equal(restored.summary, GENERATED);
    assert.ok(restored.summaryVersion > edited.summaryVersion);
    assert.ok(drafts.listDraftSummaryVersions(db, userId, draft.id).some((v) => drafts.readDraftSummaryVersion(db, userId, draft.id, v.version).summary === own), 'the student text it replaced is kept even inside the burst window');

    assert.throws(() => drafts.restoreSummaryVersion(db, userId, draft.id, 99, c.now), (err) => err.code === 'NOT_FOUND');
    assert.throws(() => drafts.listDraftSummaryVersions(db, other, draft.id), (err) => err.code === 'NOT_FOUND');
    assert.throws(() => drafts.readDraftSummaryVersion(db, other, draft.id, 1), (err) => err.code === 'NOT_FOUND');
    assert.throws(() => drafts.restoreSummaryVersion(db, other, draft.id, 1, c.now), (err) => err.code === 'NOT_FOUND');
  } finally { cleanup(); }
});

test('summaryFidelity reads the source of the draft and reports only, for the owner only', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db);
    const other = makeUser(db, 'b@example.com');
    const draft = await draftFor(db, userId, sourcesDir);
    const result = drafts.summaryFidelity(db, userId, draft.id);
    assert.equal(typeof result.checked, 'number');
    assert.ok(Array.isArray(result.lost));
    assert.equal(drafts.getDraft(db, userId, draft.id).revision, draft.revision, 'read-only');
    assert.throws(() => drafts.summaryFidelity(db, other, draft.id), (err) => err.code === 'NOT_FOUND');
  } finally { cleanup(); }
});

test('discarding the draft discards its history', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db);
    const draft = await draftFor(db, userId, sourcesDir);
    drafts.reviseSummary(db, userId, draft.id, { summary: '## T\n\nOutro texto.', expectedVersion: draft.summaryVersion });
    assert.equal(db.prepare('SELECT COUNT(*) n FROM draft_summary_versions').get().n, 1);
    db.prepare('DELETE FROM generated_drafts WHERE user_id = ? AND id = ?').run(userId, draft.id);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM draft_summary_versions').get().n, 0);
  } finally { cleanup(); }
});
