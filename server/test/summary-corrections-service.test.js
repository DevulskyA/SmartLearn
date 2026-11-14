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
import { CODEX_PROVIDER_NAME } from '../src/ai/codex-provider.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// P1-6: a model repair becomes per-excerpt corrections; the student accepts or dismisses each one. Fake providers only: no paid call.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };
const OWN = '## Filtracao glomerular\n\nA filtracao depende da pressao oncotica do filtrado. A taxa normal e de mL por minuto.\n\nO ritmo aumenta quando a arteriola se dilata.';
const REPAIRED = '## Filtracao glomerular\n\nA filtracao nao depende da pressao oncotica do filtrado. A taxa normal e de 125 mL por minuto.\n\nO ritmo aumenta quando a arteriola se dilata.';
const finding = { issue: 'O resumo inverte a relacao com a pressao oncotica.', severity: 'MEDIUM', scope: 'summary', verdict: 'CONTRADICTED', generatedClaim: 'A filtracao depende da pressao oncotica', evidencePage: 1, evidenceQuote: '', sourceEvidence: '', repair: '' };

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-corrections-'));
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
  async generate() { return { summary: OWN, summarySourceSpans: [{ pageIndex: 1 }], summaryEvidence: [], questions: [], modelVersion: 'codex:test', promptVersion: '10', language: 'pt-BR' }; },
});
const live = ({ audit = { findings: [finding] }, repair = { summary: REPAIRED }, calls = [] } = {}) => ({
  name: 'fake-live', live: true,
  async audit() { return audit; },
  async repair(input) { calls.push(input); return repair; },
});

async function draftWithFinding(db, userId, sourcesDir) {
  const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(['Filtracao glomerular depende da pressao hidrostatica e oncotica.', 'Segunda pagina.']), originalName: 'aula.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
  await extractSource(db, userId, source.id, { sourcesDir });
  const proposal = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 10 })[0];
  const draft = await drafts.createDraft(db, userId, proposal.id, { providerImpl: generator(), codex: { deferQuestions: true }, generationLocaleOverride: 'pt-BR' });
  return drafts.auditSummaryWithModel(db, userId, draft.id, { providerImpl: live() });
}

test('proposing keeps the summary as it is and returns only the changed excerpts; accepting one changes only that place', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db);
    const draft = await draftWithFinding(db, userId, sourcesDir);
    const calls = [];
    const proposed = await drafts.proposeSummaryCorrections(db, userId, draft.id, { providerImpl: live({ calls }) });
    assert.equal(calls.length, 1, 'one model call');
    assert.equal(proposed.summary, OWN, 'the summary is untouched');
    assert.equal(proposed.summaryVersion, draft.summaryVersion);
    assert.deepEqual(proposed.corrections.items.map((e) => [e.original, e.proposed]), [
      ['A filtracao depende da pressao oncotica do filtrado.', 'A filtracao nao depende da pressao oncotica do filtrado.'],
      ['A taxa normal e de mL por minuto.', 'A taxa normal e de 125 mL por minuto.'],
    ]);
    assert.equal(proposed.corrections.items[0].reason, finding.issue);

    const [first, second] = proposed.corrections.items;
    const accepted = drafts.applySummaryCorrection(db, userId, draft.id, first.key);
    assert.equal(accepted.summary, OWN.replace(first.original, first.proposed), 'only that excerpt changed');
    assert.deepEqual(accepted.corrections.items.map((e) => e.key), [second.key], 'the applied excerpt is gone, the other one waits');
    assert.throws(() => drafts.applySummaryCorrection(db, userId, draft.id, first.key), (err) => err.code === 'NOT_FOUND', 'a repeat finds nothing');

    const dismissed = drafts.dismissSummaryCorrection(db, userId, draft.id, second.key);
    assert.equal(dismissed.summary, accepted.summary);
    assert.deepEqual(dismissed.corrections.items, []);
  } finally { cleanup(); }
});

test('editing the text an excerpt points at drops that excerpt, never applies it to the wrong place', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db);
    const draft = await draftWithFinding(db, userId, sourcesDir);
    const proposed = await drafts.proposeSummaryCorrections(db, userId, draft.id, { providerImpl: live() });
    const [first] = proposed.corrections.items;
    const edited = drafts.reviseSummary(db, userId, draft.id, { summary: OWN.replace(first.original, 'Frase reescrita pelo aluno.'), expectedVersion: proposed.summaryVersion });
    assert.equal(edited.corrections.items.some((e) => e.key === first.key), false);
    assert.throws(() => drafts.applySummaryCorrection(db, userId, draft.id, first.key), (err) => err.code === 'NOT_FOUND');
  } finally { cleanup(); }
});

test('refuses without findings, with a provider that cannot repair, for another user and over the credit limit; changes nothing', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db);
    const other = makeUser(db, 'b@example.com');
    const draft = await draftWithFinding(db, userId, sourcesDir);
    await assert.rejects(drafts.proposeSummaryCorrections(db, userId, draft.id, { providerImpl: generator() }), (err) => err.code === 'INVALID_STATE');
    await assert.rejects(drafts.proposeSummaryCorrections(db, userId, draft.id, { providerImpl: live({ repair: { summary: '' } }) }), (err) => err.code === 'INVALID_STATE');
    await assert.rejects(drafts.proposeSummaryCorrections(db, other, draft.id, { providerImpl: live() }), (err) => err.code === 'NOT_FOUND');
    await assert.rejects(drafts.proposeSummaryCorrections(db, userId, draft.id, { providerImpl: live(), budgetLimits: { maxPerJob: 0, weekly: null, monthly: null } }), (err) => err.code === 'BUDGET_EXCEEDED');
    assert.equal(drafts.getDraft(db, userId, draft.id).revision, draft.revision);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM generation_reservations WHERE state = 'RESERVED'").get().n, 0);
  } finally { cleanup(); }
});
