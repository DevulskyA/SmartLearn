import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { buildApp } from '../src/app.js';
import { runMigrations } from '../src/migrations.js';
import * as sourceStorage from '../src/services/source-storage.js';
import { extractSource } from '../src/services/source-extraction.js';
import * as proposals from '../src/services/content-proposals.js';
import * as drafts from '../src/services/generated-drafts.js';
import { CODEX_PROVIDER_NAME } from '../src/ai/codex-provider.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// GAP (P1 audit 2026-11-14): the independent model check of a summary only ran once, at generation. A student who writes or edits the
// summary (the recommended path) got only the deterministic screen. `auditSummaryWithModel` checks the summary AS IT IS and REPORTS:
// it never rewrites the student's text, replaces older model findings, and goes through the credit ledger. Fake providers only: no paid call.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-summary-audit-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { db, sourcesDir: join(dir, 'sources'), cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function makeUser(db) {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES ('a@example.com', 'a@example.com', 'h', 's', 'scrypt', '{}', ?, ?)`).run(now, now).lastInsertRowid;
}

const generator = () => ({
  name: CODEX_PROVIDER_NAME, live: false,
  async generate() {
    return { summary: '## Filtracao glomerular\n\nA filtracao depende da pressao hidrostatica.', summarySourceSpans: [{ pageIndex: 1 }], summaryEvidence: [], questions: [], modelVersion: 'codex:test', promptVersion: '10', language: 'pt-BR' };
  },
});
const finding = { issue: 'O resumo omite que a pressao oncotica se opoe a filtracao.', severity: 'MEDIUM', scope: 'summary', verdict: 'NOT_FOUND', generatedClaim: 'A filtracao depende da pressao hidrostatica.', evidencePage: 1, evidenceQuote: '', sourceEvidence: '', repair: '' };
const liveAuditor = (result, calls = []) => ({ name: 'fake-live', live: true, async audit(input) { calls.push(input); return result; } });

async function draftWithSummary(db, userId, sourcesDir) {
  const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(['Filtracao glomerular depende da pressao hidrostatica e oncotica.', 'Segunda pagina da aula.']), originalName: 'aula.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
  await extractSource(db, userId, source.id, { sourcesDir });
  const proposal = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 10 })[0];
  return drafts.createDraft(db, userId, proposal.id, { providerImpl: generator(), codex: { deferQuestions: true }, generationLocaleOverride: 'pt-BR' });
}

test('checks the summary as it is now, reports MODEL findings and never rewrites the student text', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db);
    const draft = await draftWithSummary(db, userId, sourcesDir);
    const own = '## Filtracao glomerular\n\nTexto escrito pelo aluno: a filtracao depende so da pressao hidrostatica.';
    const edited = drafts.reviseSummary(db, userId, draft.id, { summary: own, expectedVersion: draft.summaryVersion });

    const calls = [];
    const after = await drafts.auditSummaryWithModel(db, userId, draft.id, { providerImpl: liveAuditor({ findings: [finding] }, calls) });
    assert.equal(calls.length, 1, 'one model call');
    assert.equal(calls[0].draft.summary, own, 'the model judges the student text, not the old generated one');
    assert.equal(after.summary, own, 'the student text is untouched');
    assert.equal(after.summaryVersion, edited.summaryVersion);
    assert.equal(after.status, 'DRAFT');
    const model = after.audit.findings.filter((f) => f.source === 'MODEL');
    assert.equal(model.length, 1);
    assert.equal(model[0].issue, finding.issue);
    assert.equal(after.audit.modelAudit, 'OK');
    assert.ok(after.audit.auditedBy.includes('MODEL'));
    assert.ok(after.revision > edited.revision, 'the new result reaches the client as a new revision');

    // asking again replaces the earlier MODEL findings (they judged an older answer), it does not pile them up
    const again = await drafts.auditSummaryWithModel(db, userId, draft.id, { providerImpl: liveAuditor({ findings: [] }) });
    assert.equal(again.audit.findings.filter((f) => f.source === 'MODEL').length, 0);
  } finally { cleanup(); }
});

test('a provider that cannot check, or a malformed answer, changes nothing', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db);
    const draft = await draftWithSummary(db, userId, sourcesDir);
    await assert.rejects(drafts.auditSummaryWithModel(db, userId, draft.id, { providerImpl: generator() }), (err) => err.code === 'INVALID_STATE');
    await assert.rejects(drafts.auditSummaryWithModel(db, userId, draft.id, { providerImpl: liveAuditor({ malformed: true }) }), (err) => err.code === 'INVALID_STATE');
    const unchanged = drafts.getDraft(db, userId, draft.id);
    assert.equal(unchanged.revision, draft.revision);
    assert.equal(unchanged.summary, draft.summary);
  } finally { cleanup(); }
});

test('the call is held in the credit ledger and refused when the limit is reached', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db);
    const draft = await draftWithSummary(db, userId, sourcesDir);
    await drafts.auditSummaryWithModel(db, userId, draft.id, { providerImpl: liveAuditor({ findings: [] }) });
    const rows = db.prepare("SELECT state FROM generation_reservations WHERE user_id = ? AND state = 'SETTLED'").all(userId);
    assert.equal(rows.length, 1, 'one reservation, settled (the call happened)');
    assert.equal(db.prepare("SELECT COUNT(*) n FROM generation_reservations WHERE state = 'RESERVED'").get().n, 0, 'nothing is left held');
    await assert.rejects(
      drafts.auditSummaryWithModel(db, userId, draft.id, { providerImpl: liveAuditor({ findings: [] }), budgetLimits: { maxPerJob: 0, weekly: null, monthly: null } }),
      (err) => err.code === 'BUDGET_EXCEEDED',
    );
  } finally { cleanup(); }
});

test('HTTP: the route needs a session, and with a generator that cannot check it refuses clearly and changes nothing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-summary-audit-http-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  const origin = 'https://smartlearn.test';
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [origin], sources: { sourcesDir: join(dir, 'sources'), ...UPLOAD_DEFAULTS } });
  try {
    const credentials = { email: 'audit-route@example.com', password: 'a genuinely long test password 1' };
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin }, payload: credentials });
    const login = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin }, payload: credentials });
    const cookie = login.headers['set-cookie'].split(';')[0];
    const csrfToken = JSON.parse((await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } })).body).csrfToken;
    const write = { origin, cookie, 'x-csrf-token': csrfToken, 'content-type': 'application/json' };

    const boundary = 'sl-audit-route-boundary';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.pdf"\r\nContent-Type: application/pdf\r\n\r\n`, 'utf8'),
      buildFixturePdf(['Filtracao glomerular depende da pressao hidrostatica.']),
      Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
    ]);
    const upload = await app.inject({ method: 'POST', url: '/v1/sources', headers: { ...write, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: body });
    const sourceId = JSON.parse(upload.body).source.id;
    await app.inject({ method: 'POST', url: `/v1/sources/${sourceId}/extract`, headers: { origin, cookie, "x-csrf-token": csrfToken } });
    const chunk = await app.inject({ method: 'POST', url: `/v1/sources/${sourceId}/proposals`, headers: write, payload: {} });
    const proposalId = JSON.parse(chunk.body).proposals[0].id;
    const created = await app.inject({ method: 'POST', url: `/v1/proposals/${proposalId}/drafts`, headers: write, payload: {} });
    const draft = JSON.parse(created.body).draft;

    const anonymous = await app.inject({ method: 'POST', url: `/v1/drafts/${draft.id}/audit-summary`, headers: { origin, 'content-type': 'application/json' }, payload: {} });
    assert.equal(anonymous.statusCode, 401);

    const refused = await app.inject({ method: 'POST', url: `/v1/drafts/${draft.id}/audit-summary`, headers: write, payload: {} });
    assert.ok(refused.statusCode >= 400 && refused.statusCode < 500, `refused, got ${refused.statusCode}`);
    assert.equal(JSON.parse(refused.body).error.code, 'INVALID_STATE');
    const after = JSON.parse((await app.inject({ method: 'GET', url: `/v1/drafts/${draft.id}`, headers: { cookie } })).body).draft;
    assert.equal(after.revision, draft.revision);
    assert.equal(after.summary, draft.summary);
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
