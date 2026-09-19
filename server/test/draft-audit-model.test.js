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
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';
import { parseModelAudit } from '../src/ai/draft-audit-model.js';

// CONTENT-QUALITY CQ-2/CQ-3: the production-time gate around a LIVE provider, driven by a scripted
// fetch (no network, no key). 1 generation -> deterministic screen + 1 independent model audit ->
// at most ONE targeted repair -> re-validate. Always DRAFT; a model failure never fails the draft.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };
const LIVE = { apiKey: 'k', model: 'm', consentGranted: true, budgetCapUsd: 5 };

const PAGES = [
  'A filtracao glomerular e determinada pela pressao hidrostatica capilar de 60 mmHg, que favorece a filtracao, e pela pressao oncotica de 32 mmHg e pela pressao da capsula de Bowman de 18 mmHg, que se opoem. A taxa de filtracao glomerular normal e cerca de 125 mL/min.',
  'A arteriola aferente dilata e a eferente contrai para aumentar a taxa de filtracao glomerular. A angiotensina II contrai preferencialmente a arteriola eferente, mantendo a pressao hidrostatica glomerular.',
];

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-audit-'));
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

async function makeProposal(db, userId, sourcesDir) {
  const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(PAGES), originalName: 'renal.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
  await extractSource(db, userId, source.id, { sourcesDir });
  return proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 10 })[0];
}

const GOOD_SUMMARY = 'A filtracao glomerular resulta do balanco entre a pressao hidrostatica capilar de 60 mmHg, que favorece a filtracao, e as pressoes oncotica de 32 mmHg e da capsula de Bowman de 18 mmHg, que se opoem. A taxa de filtracao glomerular normal e cerca de 125 mL/min. A arteriola eferente, contraida pela angiotensina II, mantem a pressao glomerular.';
const GOOD_Q = {
  question: 'Qual e a taxa de filtracao glomerular normal?',
  answer: 'Cerca de 125 mL/min, resultado do balanco entre a pressao hidrostatica capilar, que favorece a filtracao, e as pressoes oncotica e da capsula de Bowman, que se opoem.',
  hint: null,
  sourceSpans: [{ pageIndex: 1 }],
};
const good = (o = {}) => ({ summary: GOOD_SUMMARY, summarySourceSpans: [{ pageIndex: 1 }, { pageIndex: 2 }], questions: [GOOD_Q], modelVersion: 'm-1', promptVersion: '3', ...o });

/** A fetch that answers the n-th call with the n-th scripted body (or throws it, if it is an Error). */
function scriptedFetch(script) {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    const step = script[calls.length];
    calls.push(JSON.parse(init.body).messages[0].content);
    if (step === undefined) throw new Error(`unexpected extra model call #${calls.length}`);
    if (step instanceof Error) throw step;
    const text = typeof step === 'string' ? step : JSON.stringify(step);
    return { ok: true, json: async () => ({ content: [{ text }] }) };
  };
  return { fetchImpl, calls };
}

const create = (db, userId, proposalId, fetchImpl) => drafts.createDraft(db, userId, proposalId, { ...LIVE, fetchImpl });
const blocking = (a) => a.findings.filter((f) => f.severity === 'HIGH' || f.severity === 'MEDIUM');

test('faithful draft: 1 generation + 1 independent audit, no repair, audit PASS, still DRAFT', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const proposal = await makeProposal(db, userId, sourcesDir);
    const { fetchImpl, calls } = scriptedFetch([good(), { result: 'PASS', findings: [] }]);
    const draft = await create(db, userId, proposal.id, fetchImpl);
    assert.equal(calls.length, 2, 'generation + audit only');
    assert.equal(draft.status, 'DRAFT');
    assert.equal(draft.audit.result, 'PASS');
    assert.deepEqual(draft.audit.auditedBy, ['DETERMINISTIC', 'MODEL']);
    assert.equal(draft.audit.repaired, false);
    assert.deepEqual(draft.summarySourceSpans, [{ pageIndex: 1 }, { pageIndex: 2 }]);
    assert.deepEqual(draft.pages.map((p) => p.pageIndex), [1, 2], 'the cited source pages travel with the draft so a reviewer can verify next to it');
    assert.match(draft.pages[0].text, /filtracao glomerular/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM learning_units').get().n, 0, 'nothing is published by generation');
  } finally { cleanup(); }
});

test('the auditor receives the source pages and the draft, and treats both as untrusted data', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b@example.com');
    const proposal = await makeProposal(db, userId, sourcesDir);
    const { fetchImpl, calls } = scriptedFetch([good(), { result: 'PASS', findings: [] }]);
    await create(db, userId, proposal.id, fetchImpl);
    const auditPrompt = calls[1];
    assert.match(auditPrompt, /UNTRUSTED DATA/);
    assert.match(auditPrompt, /PAGE 1/);
    assert.match(auditPrompt, /MEDICAL_FIDELITY/);
    assert.match(auditPrompt, /ANSWER_CORRECT/);
    assert.match(auditPrompt, /Do NOT give a score/);
    assert.ok(auditPrompt.includes('Qual e a taxa de filtracao glomerular normal?'), 'the draft under audit is in the prompt');

    // CQ-3: the generation prompt asks for what the audit then checks — separate explanation, question type,
    // one defensible answer, no give-away, the exam targets as editorial orientation (never invented weights).
    const genPrompt = calls[0];
    assert.match(genPrompt, /"explanation": string/);
    assert.match(genPrompt, /"questionType": "RECALL"/);
    assert.match(genPrompt, /ONLY facts, values and terms present in the cited page/);
    assert.match(genPrompt, /ONE defensible answer/);
    assert.match(genPrompt, /REVALIDA/);
    assert.match(genPrompt, /never invent official exam weights/);
    assert.match(genPrompt, /Source is the ONLY authority/);
    assert.match(auditPrompt, /DISTRACTOR_QUALITY does not apply/);
    assert.match(auditPrompt, /"explanation":null|"explanation":"/, 'the explanation is part of what the auditor sees');
  } finally { cleanup(); }
});

test('an invented value is caught, ONE targeted repair fixes it, and the repaired draft replaces it (3 calls, never more)', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'c@example.com');
    const proposal = await makeProposal(db, userId, sourcesDir);
    const bad = good({ summary: GOOD_SUMMARY.replace('cerca de 125 mL/min', 'cerca de 300 mL/min') });
    const { fetchImpl, calls } = scriptedFetch([bad, { result: 'PASS', findings: [] }, good()]);
    const draft = await create(db, userId, proposal.id, fetchImpl);
    assert.equal(calls.length, 3, 'generation, audit, ONE repair');
    assert.match(calls[2], /FINDINGS/);
    assert.match(calls[2], /300/, 'the repair prompt names the unsupported value');
    assert.equal(draft.audit.repaired, true);
    assert.ok(draft.audit.addressed.some((a) => a.issue === 'SUMMARY_UNSUPPORTED_VALUE'));
    assert.ok(draft.summary.includes('125 mL/min') && !draft.summary.includes('300'));
    assert.equal(draft.audit.result, 'PASS');
    assert.equal(draft.status, 'DRAFT');
  } finally { cleanup(); }
});

test('a semantic contradiction the deterministic screen cannot see is caught by the model audit and repaired', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'd@example.com');
    const proposal = await makeProposal(db, userId, sourcesDir);
    const wrongQ = { question: 'O que a angiotensina II faz na arteriola eferente?', answer: 'Dilata a arteriola eferente, reduzindo a taxa de filtracao glomerular, segundo a pagina.', hint: null, sourceSpans: [{ pageIndex: 2 }] };
    const rightQ = { ...wrongQ, answer: 'Contrai a arteriola eferente, o que mantem a pressao hidrostatica glomerular e sustenta a taxa de filtracao glomerular.' };
    const modelFinding = { issue: 'ANSWER_CONTRADICTS_SOURCE', severity: 'HIGH', scope: 'question:1', generatedClaim: 'Dilata a arteriola eferente', sourceEvidence: 'A angiotensina II contrai preferencialmente a arteriola eferente.', repair: 'A angiotensina II contrai a arteriola eferente.' };
    const { fetchImpl } = scriptedFetch([
      good({ questions: [GOOD_Q, wrongQ] }),
      { result: 'REPAIR', findings: [modelFinding] },
      good({ questions: [GOOD_Q, rightQ] }),
    ]);
    const draft = await create(db, userId, proposal.id, fetchImpl);
    assert.equal(draft.audit.repaired, true);
    assert.ok(draft.audit.addressed.some((a) => a.issue === 'ANSWER_CONTRADICTS_SOURCE' && a.scope === 'question:1'));
    assert.match(draft.questions[1].answer, /^Contrai/);
    assert.equal(draft.status, 'DRAFT');
  } finally { cleanup(); }
});

test('if the repair does not fix it the draft is NOT retried: it stays DRAFT and says REPAIR with the remaining findings', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'e@example.com');
    const proposal = await makeProposal(db, userId, sourcesDir);
    const bad = good({ summary: GOOD_SUMMARY.replace('cerca de 125 mL/min', 'cerca de 300 mL/min') });
    const { fetchImpl, calls } = scriptedFetch([bad, { result: 'PASS', findings: [] }, bad]);
    const draft = await create(db, userId, proposal.id, fetchImpl);
    assert.equal(calls.length, 3, 'no fourth call: bounded, not a generate/audit loop');
    assert.equal(draft.audit.result, 'REPAIR');
    assert.ok(blocking(draft.audit).some((f) => f.issue === 'SUMMARY_UNSUPPORTED_VALUE'), 'the reviewer is told what is still wrong');
    assert.equal(draft.status, 'DRAFT');
  } finally { cleanup(); }
});

test('a repair that cites a page that was never sent (or is not a valid draft) is rejected: the original draft is kept and flagged', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'f@example.com');
    const proposal = await makeProposal(db, userId, sourcesDir);
    const bad = good({ summary: GOOD_SUMMARY.replace('cerca de 125 mL/min', 'cerca de 300 mL/min') });
    const badRepair = good({ questions: [{ ...GOOD_Q, sourceSpans: [{ pageIndex: 99 }] }] });
    const { fetchImpl } = scriptedFetch([bad, { result: 'PASS', findings: [] }, badRepair]);
    const draft = await create(db, userId, proposal.id, fetchImpl);
    assert.equal(draft.audit.repairRejected, true);
    assert.equal(draft.audit.repaired, false);
    assert.ok(draft.summary.includes('300'), 'the unrepaired original is kept, not silently replaced by an invalid repair');
    assert.equal(draft.audit.result, 'REPAIR');
  } finally { cleanup(); }
});

test('a model that is down, slow or malformed at audit time never fails the draft: it degrades to the deterministic screen', async () => {
  for (const [label, second, expected] of [
    ['audit call fails', new Error('network down'), 'UNAVAILABLE'],
    ['audit is not JSON', 'sorry, cannot do that', 'UNAVAILABLE'],
    ['audit JSON has the wrong shape', { verdict: 'fine' }, 'MALFORMED'],
  ]) {
    const { db, sourcesDir, cleanup } = tmpDb();
    try {
      const userId = makeUser(db, `${label.replace(/\W/g, '')}@example.com`);
      const proposal = await makeProposal(db, userId, sourcesDir);
      const { fetchImpl } = scriptedFetch([good(), second]);
      const draft = await create(db, userId, proposal.id, fetchImpl);
      assert.equal(draft.modelAudit ?? draft.audit.modelAudit, expected, label);
      assert.deepEqual(draft.audit.auditedBy, ['DETERMINISTIC'], label);
      assert.equal(draft.status, 'DRAFT', label);
    } finally { cleanup(); }
  }
});

test('the default (no credentials) path never calls a model and still screens deterministically', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'g@example.com');
    const proposal = await makeProposal(db, userId, sourcesDir);
    const fetchImpl = () => { throw new Error('a model must never be called on the fake path'); };
    const draft = await drafts.createDraft(db, userId, proposal.id, { fetchImpl });
    assert.equal(draft.live, false);
    assert.equal(draft.audit.modelAudit, 'NOT_RUN');
    assert.deepEqual(draft.audit.auditedBy, ['DETERMINISTIC']);
    assert.equal(draft.status, 'DRAFT');
  } finally { cleanup(); }
});

test('a human edit re-screens the new text (deterministic only) and marks the audit as human-edited; acceptance is never blocked by REPAIR', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'h@example.com');
    const proposal = await makeProposal(db, userId, sourcesDir);
    const { fetchImpl } = scriptedFetch([good(), { result: 'PASS', findings: [] }]);
    const draft = await create(db, userId, proposal.id, fetchImpl);
    const edited = drafts.reviseDraft(db, userId, draft.id, { summary: `${GOOD_SUMMARY} A dose usual e 300 mg por dia.` });
    assert.equal(edited.audit.editedByHuman, true);
    assert.equal(edited.audit.result, 'REPAIR');
    assert.ok(edited.audit.findings.some((f) => f.issue === 'SUMMARY_UNSUPPORTED_VALUE'));
    assert.equal(edited.revision, draft.revision + 1);
    assert.equal(edited.status, 'DRAFT');
  } finally { cleanup(); }
});

test('parseModelAudit: drops unknown scopes and out-of-range questions, clamps severity, never trusts the model\'s own verdict', () => {
  const raw = {
    result: 'PASS',
    findings: [
      { issue: 'OK_ONE', severity: 'HIGH', scope: 'summary', generatedClaim: 'x', sourceEvidence: 'y', repair: 'z' },
      { issue: 'BAD_SEVERITY', severity: 'CATASTROPHIC', scope: 'question:0', generatedClaim: 'x', sourceEvidence: 'y', repair: 'z' },
      { issue: 'OUT_OF_RANGE', severity: 'HIGH', scope: 'question:7' },
      { issue: 'NO_SCOPE', severity: 'HIGH', scope: 'everywhere' },
      { severity: 'HIGH', scope: 'summary' },
      'garbage',
    ],
  };
  const { findings, malformed } = parseModelAudit(raw, { questionCount: 2 });
  assert.equal(malformed, false);
  assert.deepEqual(findings.map((f) => [f.issue, f.severity, f.source]), [['OK_ONE', 'HIGH', 'MODEL'], ['BAD_SEVERITY', 'MEDIUM', 'MODEL']]);
  assert.equal(parseModelAudit({ result: 'PASS' }, { questionCount: 1 }).malformed, true);
  assert.equal(parseModelAudit(null, { questionCount: 1 }).malformed, true);
});
