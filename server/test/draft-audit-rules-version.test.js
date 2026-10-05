import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import * as sourceStorage from '../src/services/source-storage.js';
import { extractSource } from '../src/services/source-extraction.js';
import * as proposals from '../src/services/content-proposals.js';
import * as drafts from '../src/services/generated-drafts.js';
import { AUDIT_RULES_VERSION } from '../src/ai/draft-audit.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };

// T-F2-03 bump rule: the rule set is draft-audit.js + language-detect.js. Changing either changes this hash; when it does, bump
// AUDIT_RULES_VERSION (draft-audit.js) and record the new pair here. A rule changed without a new version fails below.
const RULES_FILES = ['../src/ai/draft-audit.js', '../src/ai/language-detect.js'];
const PINNED = { version: 'audit-rules-1', hash: '09df983d9d718418f40160dee5882464d657246d9adc7371f379f663eb6e20c8' };
const rulesHash = () => createHash('sha256').update(RULES_FILES.map((f) => readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8').replace(/\r\n/g, '\n')).join('\n--\n')).digest('hex');

test('the audit rule set cannot change without a new AUDIT_RULES_VERSION', () => {
  if (rulesHash() === PINNED.hash) {
    assert.equal(AUDIT_RULES_VERSION, PINNED.version);
  } else {
    assert.notEqual(AUDIT_RULES_VERSION, PINNED.version, `rules changed (hash ${rulesHash()}): bump AUDIT_RULES_VERSION and update PINNED in this test`);
    assert.fail(`AUDIT_RULES_VERSION was bumped to ${AUDIT_RULES_VERSION}: record { version, hash: '${rulesHash()}' } in PINNED`);
  }
});

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-reaudit-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { db, sourcesDir: join(dir, 'sources'), cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

async function draftWithOldAudit(db, sourcesDir) {
  const now = new Date().toISOString();
  const userId = db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES ('r@example.com', 'r@example.com', 'h', 's', 'scrypt', '{}', ?, ?)`).run(now, now).lastInsertRowid;
  const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(['conteudo de teste da aula']), originalName: 'aula.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
  await extractSource(db, userId, source.id, { sourcesDir });
  const [proposal] = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 10 });
  const generated = await drafts.createDraft(db, userId, proposal.id, {});
  const withQ = drafts.replaceDraftContent(db, userId, generated.id, {
    summary: 'Resumo inicial',
    questions: ['A', 'B'].map((x) => ({ question: `Pergunta ${x}?`, answer: `Resposta ${x}`, explanation: null, hint: null, sourceSpans: [{ pageIndex: 1 }] })),
  });
  // simulate an audit written by an older rule set: no rulesVersion, a finding the current rules would not raise
  const row = db.prepare('SELECT draft_json FROM generated_drafts WHERE id = ?').get(generated.id);
  const json = JSON.parse(row.draft_json);
  delete json.audit.rulesVersion; delete json.audit.auditedAt;
  json.audit.findings = [{ issue: 'OLD_RULE_THAT_NO_LONGER_EXISTS', severity: 'LOW', scope: 'summary', generatedClaim: 'x', sourceEvidence: 'y', repair: 'z', source: 'DETERMINISTIC' }];
  db.prepare('UPDATE generated_drafts SET draft_json = ? WHERE id = ?').run(JSON.stringify(json), generated.id);
  return { userId, draftId: generated.id, withQ };
}

const rowOf = (db, id) => db.prepare('SELECT * FROM generated_drafts WHERE id = ?').get(id);

test('a freshly generated or edited draft carries the current rulesVersion and auditedAt and is not stale', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, draftId, withQ } = await draftWithOldAudit(db, sourcesDir);
    assert.equal(withQ.audit.rulesVersion, AUDIT_RULES_VERSION);
    assert.ok(withQ.audit.auditedAt);
    assert.equal(withQ.auditStale, false);
    assert.equal(drafts.getDraft(db, userId, draftId).auditStale, true, 'the simulated old audit is stale');
  } finally { cleanup(); }
});

test('opening a draft with an old audit reports auditStale and writes NOTHING (row byte-identical)', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, draftId } = await draftWithOldAudit(db, sourcesDir);
    const before = JSON.stringify(rowOf(db, draftId));
    const a = drafts.getDraft(db, userId, draftId);
    const list = drafts.listDrafts(db, userId, a.proposalId);
    assert.equal(a.auditStale, true);
    assert.equal(list[0].auditStale, true);
    assert.equal(a.audit.findings[0].issue, 'OLD_RULE_THAT_NO_LONGER_EXISTS', 'not recalculated on open');
    assert.equal(JSON.stringify(rowOf(db, draftId)), before);
  } finally { cleanup(); }
});

test('reaudit changes ONLY audit: content, versions and revision are byte-identical; reports how many findings changed', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, draftId } = await draftWithOldAudit(db, sourcesDir);
    const beforeRow = rowOf(db, draftId);
    const beforeJson = JSON.parse(beforeRow.draft_json);
    const out = drafts.reauditDraft(db, userId, draftId, () => new Date('2026-10-05T10:00:00.000Z'));
    const afterRow = rowOf(db, draftId);
    const afterJson = JSON.parse(afterRow.draft_json);
    const { audit: _oldAudit, ...beforeRest } = beforeJson;
    const { audit: newAudit, ...afterRest } = afterJson;
    assert.deepEqual(afterRest, beforeRest, 'summary, questions, versions, provenance untouched');
    assert.equal(afterRow.revision, beforeRow.revision);
    assert.equal(afterRow.updated_at, beforeRow.updated_at);
    assert.equal(afterRow.status, 'DRAFT');
    assert.equal(newAudit.rulesVersion, AUDIT_RULES_VERSION);
    assert.equal(newAudit.auditedAt, '2026-10-05T10:00:00.000Z');
    assert.ok(!newAudit.findings.some((f) => f.issue === 'OLD_RULE_THAT_NO_LONGER_EXISTS'));
    assert.equal(out.draft.auditStale, false);
    assert.equal(out.reaudit.removed, 1);
    assert.equal(out.reaudit.before, 1);
    assert.equal(out.reaudit.after, out.reaudit.added + out.reaudit.unchanged);
    // idempotent: a second run changes no findings
    const again = drafts.reauditDraft(db, userId, draftId);
    assert.deepEqual([again.reaudit.added, again.reaudit.removed], [0, 0]);
  } finally { cleanup(); }
});

test('reaudit is refused for an accepted draft and for a draft of another user', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, draftId } = await draftWithOldAudit(db, sourcesDir);
    assert.throws(() => drafts.reauditDraft(db, userId + 99, draftId), (e) => e.code === 'NOT_FOUND');
    db.prepare("UPDATE generated_drafts SET status = 'ACCEPTED' WHERE id = ?").run(draftId);
    assert.throws(() => drafts.reauditDraft(db, userId, draftId), (e) => e.code === 'INVALID_STATE');
  } finally { cleanup(); }
});
