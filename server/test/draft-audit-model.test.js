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
import { parseModelAudit, buildAuditPrompt, buildRepairPrompt } from '../src/ai/draft-audit-model.js';
import { acceptDraft } from '../src/services/accept-draft.js';

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
  explanation: 'A filtracao glomerular e determinada por essas pressoes: 60 mmHg a favor e 32 mmHg mais 18 mmHg contra.',
  hint: null,
  sourceSpans: [{ pageIndex: 1 }],
};
const good = (o = {}) => ({ summary: GOOD_SUMMARY, summarySourceSpans: [{ pageIndex: 1 }, { pageIndex: 2 }], questions: [GOOD_Q], modelVersion: 'm-1', promptVersion: '10', ...o });

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
    assert.match(genPrompt, /Source is the ONLY authority|Use the supplied source alone\. Never invent/, 'the source-only rule survives in v10 (MED-SUM SEMANTIC FIDELITY wording)');
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

test('the repair keeps the ORIGINAL text and says which parts it rewrote; a human edit afterwards keeps them too', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'keep@example.com');
    const proposal = await makeProposal(db, userId, sourcesDir);
    const bad = good({ summary: GOOD_SUMMARY.replace('cerca de 125 mL/min', 'cerca de 300 mL/min') });
    const { fetchImpl } = scriptedFetch([bad, { result: 'PASS', findings: [] }, good()]);
    const draft = await create(db, userId, proposal.id, fetchImpl);
    assert.equal(draft.audit.repaired, true);
    assert.ok(draft.audit.original.summary.includes('300 mL/min'), 'the text the model wrote before the repair is kept');
    assert.ok(!draft.summary.includes('300'), 'while the draft itself carries the repaired text');
    assert.deepEqual(draft.audit.repairChanges, ['summary'], 'only the summary was rewritten, not the question');
    const edited = drafts.replaceDraftContent(db, userId, draft.id, { summary: `${draft.summary} Fim.`, questions: draft.questions.map((q) => ({ question: q.question, answer: q.answer, explanation: q.explanation, hint: q.hint, sourceSpans: q.sourceSpans })) });
    assert.ok(edited.audit.original.summary.includes('300 mL/min'));
    assert.deepEqual(edited.audit.repairChanges, ['summary']);
  } finally { cleanup(); }
});

test('a draft whose only findings are word-level signals is NOT sent to repair: 2 calls, text untouched, no original stored', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'lex@example.com');
    const proposal = await makeProposal(db, userId, sourcesDir);
    const paraphrase = good({ summary: `${GOOD_SUMMARY} A furosemida nao esta na fonte.` });
    const { fetchImpl, calls } = scriptedFetch([paraphrase, { result: 'PASS', findings: [] }]);
    const draft = await create(db, userId, proposal.id, fetchImpl);
    assert.equal(calls.length, 2, 'generation + audit, no repair call');
    assert.ok(draft.audit.findings.some((f) => f.issue === 'SUMMARY_UNSUPPORTED_TERM'), 'the signal is still shown to the reviewer');
    assert.equal(draft.audit.result, 'PASS');
    assert.equal(draft.audit.repaired, false);
    assert.equal(draft.audit.original, undefined);
    assert.ok(draft.summary.includes('furosemida'), 'the model text is not overwritten');
  } finally { cleanup(); }
});

test('a semantic contradiction the deterministic screen cannot see is caught by the model audit and repaired', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'd@example.com');
    const proposal = await makeProposal(db, userId, sourcesDir);
    const wrongQ = { question: 'O que a angiotensina II faz na arteriola eferente?', answer: 'Dilata a arteriola eferente, reduzindo a taxa de filtracao glomerular, segundo a pagina.', hint: null, sourceSpans: [{ pageIndex: 2 }] };
    const rightQ = { ...wrongQ, answer: 'Contrai a arteriola eferente, o que mantem a pressao hidrostatica glomerular e sustenta a taxa de filtracao glomerular.' };
    const modelFinding = { issue: 'ANSWER_CONTRADICTS_SOURCE', severity: 'HIGH', scope: 'question:1', verdict: 'CONTRADICTED', evidencePage: 2, evidenceQuote: 'A angiotensina II contrai preferencialmente a arteriola eferente', generatedClaim: 'Dilata a arteriola eferente', sourceEvidence: 'A angiotensina II contrai preferencialmente a arteriola eferente.', repair: 'A angiotensina II contrai a arteriola eferente.' };
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
    const edited = drafts.replaceDraftContent(db, userId, draft.id, { summary: `${GOOD_SUMMARY} A dose usual e 300 mg por dia.` });
    assert.equal(edited.audit.editedByHuman, true);
    assert.equal(edited.audit.result, 'REPAIR');
    assert.ok(edited.audit.findings.some((f) => f.issue === 'SUMMARY_UNSUPPORTED_VALUE'));
    assert.equal(edited.revision, draft.revision + 1);
    assert.equal(edited.status, 'DRAFT');
  } finally { cleanup(); }
});

test('the model endpoint is operator-configurable, defaults to the real API, and a stored draft is labelled with the CURRENT prompt version', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'url@example.com');
    const proposal = await makeProposal(db, userId, sourcesDir);
    const urls = [];
    const prompts = [];
    const fetchImpl = async (url, init) => {
      urls.push(url);
      prompts.push(JSON.parse(init.body).messages[0].content);
      return { ok: true, json: async () => ({ content: [{ text: JSON.stringify(urls.length === 1 ? good() : { result: 'PASS', findings: [] }) }] }) };
    };
    const draft = await drafts.createDraft(db, userId, proposal.id, { ...LIVE, fetchImpl, apiUrl: 'http://127.0.0.1:9/stub' });
    assert.deepEqual(urls, ['http://127.0.0.1:9/stub', 'http://127.0.0.1:9/stub']);
    assert.match(prompts[0], /promptVersion exactly "10"/, 'no explicit promptVersion -> the current one, not a stale default');
    assert.equal(draft.promptVersion, '10');

    urls.length = 0;
    await drafts.createDraft(db, userId, proposal.id, { ...LIVE, fetchImpl });
    assert.ok(urls.every((u) => u === 'https://api.anthropic.com/v1/messages'), 'default endpoint is the real API');
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
  const { findings, malformed } = parseModelAudit(raw, { questionCount: 2, segments: PAGES.map((text, i) => ({ pageIndex: i + 1, text })) });
  assert.equal(malformed, false);
  assert.deepEqual(findings.map((f) => [f.issue, f.severity, f.source]), [['OK_ONE', 'HIGH', 'MODEL'], ['BAD_SEVERITY', 'MEDIUM', 'MODEL']]);
  assert.equal(parseModelAudit({ result: 'PASS' }, { questionCount: 1 }).malformed, true);
  assert.equal(parseModelAudit(null, { questionCount: 1 }).malformed, true);
});

// ---------------------------------------------------------------------------------------------------------------------
// R-3 step 3: a verdict per claim, with evidence that can be located; only a located contradiction may trigger the repair
// ---------------------------------------------------------------------------------------------------------------------

const SEGMENTS = PAGES.map((text, i) => ({ pageIndex: i + 1, text }));
const QUOTE_P2 = 'A angiotensina II contrai preferencialmente a arteriola eferente';
const finding = (o = {}) => ({ issue: 'ANSWER_CONTRADICTS_SOURCE', severity: 'HIGH', scope: 'summary', verdict: 'CONTRADICTED', generatedClaim: 'c', evidencePage: 2, evidenceQuote: QUOTE_P2, sourceEvidence: 'prose of the model', repair: 'r', ...o });
const parse = (findings, segments = SEGMENTS) => parseModelAudit({ result: 'REPAIR', findings }, { questionCount: 1, segments });

test('parseModelAudit: a CONTRADICTED finding is kept only with a quote found on a page that was sent, and shows that quote as its evidence', () => {
  const { findings, discarded } = parse([finding()]);
  assert.equal(discarded, 0);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].verdict, 'CONTRADICTED');
  assert.equal(findings[0].evidencePage, 2);
  assert.equal(findings[0].sourceEvidence, `p. 2: ${QUOTE_P2}`, "the evidence shown is the located quote, not the model's own prose");
  assert.equal(findings[0].blocksRepair, undefined, 'a located contradiction may trigger the repair');
  // case, accents and punctuation are not part of a quotation
  assert.equal(parse([finding({ evidenceQuote: 'a ANGIOTENSINA ii, contrai preferencialmente a arteríola eferente.' })]).findings.length, 1);
});

test('parseModelAudit: a CONTRADICTED finding with a quote that is nowhere in the pages (invented, too short, or no pages sent) is discarded and counted', () => {
  const out = parse([
    finding({ evidenceQuote: 'A angiotensina II dilata a arteriola eferente' }),
    finding({ evidenceQuote: 'angiotensina' }),
    finding({ evidenceQuote: '' }),
  ]);
  assert.deepEqual(out.findings, []);
  assert.equal(out.discarded, 3);
  assert.deepEqual(parse([finding()], []).findings, [], 'with no pages to check against nothing can be proven, so nothing survives');
});

test('parseModelAudit: a quote that is on another page than the one the model named is accepted with the REAL page', () => {
  const { findings } = parse([finding({ evidencePage: 1 })]);
  assert.equal(findings[0].evidencePage, 2);
  assert.match(findings[0].sourceEvidence, /^p\. 2: /);
});

test('parseModelAudit: NOT_FOUND, NOT_EVALUABLE and a reply with no verdict stay visible with their severity but can never trigger the repair; SUPPORTED is not a problem', () => {
  const { findings } = parse([
    finding({ verdict: 'NOT_FOUND', evidencePage: null, evidenceQuote: '' }),
    finding({ verdict: 'NOT_EVALUABLE', severity: 'MEDIUM', evidencePage: null, evidenceQuote: '' }),
    finding({ verdict: undefined }),
    finding({ verdict: 'SUPPORTED' }),
  ]);
  assert.deepEqual(findings.map((f) => [f.verdict, f.severity, f.blocksRepair]), [['NOT_FOUND', 'HIGH', false], ['NOT_EVALUABLE', 'MEDIUM', false], ['NOT_EVALUABLE', 'HIGH', false]]);
});

test('prompts: the auditor judges meaning and asks for verbatim evidence; the repair no longer bans every term the source does not repeat', () => {
  const audit = buildAuditPrompt({ summary: 's', questions: [] }, SEGMENTS);
  assert.match(audit, /Judge MEANING, never wording/);
  assert.match(audit, /paraphrase, a synonym or a faithful translation is NOT a problem/);
  assert.match(audit, /VERBATIM excerpt/);
  assert.match(audit, /CONTRADICTED[\s\S]*NOT_FOUND[\s\S]*NOT_EVALUABLE/);
  const repair = buildRepairPrompt({ summary: 's', summarySourceSpans: [], questions: [], modelVersion: 'm', promptVersion: '10' }, [], SEGMENTS, '10');
  assert.doesNotMatch(repair, /value or term the source does not contain/);
  assert.match(repair, /never introduce a fact, mechanism, causal relation, value or condition/);
  assert.match(repair, /Paraphrases, synonyms and faithful translations are allowed/);
});

test('end to end: a HIGH claim the model could only call NOT_FOUND is shown to the reviewer but costs no repair and rewrites nothing', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'nf@example.com');
    const proposal = await makeProposal(db, userId, sourcesDir);
    const notFound = finding({ issue: 'CLAIM_NOT_IN_SOURCE', verdict: 'NOT_FOUND', evidencePage: null, evidenceQuote: '' });
    const { fetchImpl, calls } = scriptedFetch([good(), { result: 'REPAIR', findings: [notFound] }]);
    const draft = await create(db, userId, proposal.id, fetchImpl);
    assert.equal(calls.length, 2, 'generation + audit, no repair call');
    assert.equal(draft.audit.repaired, false);
    assert.equal(draft.summary, GOOD_SUMMARY, 'the model text is untouched');
    const shown = draft.audit.findings.find((f) => f.issue === 'CLAIM_NOT_IN_SOURCE');
    assert.equal(shown.severity, 'HIGH', 'the human gate on HIGH findings still applies');
    assert.equal(draft.audit.result, 'PASS');
  } finally { cleanup(); }
});

test('end to end: a contradiction whose quote is invented is discarded (no repair, no finding); one whose quote is real triggers exactly one repair', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'inv@example.com');
    const proposal = await makeProposal(db, userId, sourcesDir);
    const invented = finding({ issue: 'INVENTED_QUOTE', evidenceQuote: 'A angiotensina II dilata a arteriola eferente' });
    const first = scriptedFetch([good(), { result: 'REPAIR', findings: [invented] }]);
    const a = await create(db, userId, proposal.id, first.fetchImpl);
    assert.equal(first.calls.length, 2);
    assert.ok(!a.audit.findings.some((f) => f.issue === 'INVENTED_QUOTE'));
    const secondUser = makeUser(db, 'real@example.com');
    const secondProposal = await makeProposal(db, secondUser, sourcesDir);
    const second = scriptedFetch([good(), { result: 'REPAIR', findings: [finding({ issue: 'REAL_QUOTE' })] }, good()]);
    const b = await create(db, secondUser, secondProposal.id, second.fetchImpl);
    assert.equal(second.calls.length, 3);
    assert.match(second.calls[2], /REAL_QUOTE/);
    assert.equal(b.audit.repaired, true);
  } finally { cleanup(); }
});

test('guard: EVERY human edit route and the reaudit keep audit.original and audit.repairChanges of an automatic repair', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'routes@example.com');
    const proposal = await makeProposal(db, userId, sourcesDir);
    const bad = good({ summary: GOOD_SUMMARY.replace('cerca de 125 mL/min', 'cerca de 300 mL/min') });
    const { fetchImpl } = scriptedFetch([bad, { result: 'PASS', findings: [] }, good()]);
    let draft = await create(db, userId, proposal.id, fetchImpl);
    const kept = { original: draft.audit.original, repairChanges: draft.audit.repairChanges };
    assert.ok(kept.original.summary.includes('300 mL/min'), 'the repair stored what it replaced');
    const fields = (q) => ({ question: q.question, answer: q.answer, explanation: q.explanation, hint: q.hint, sourceSpans: q.sourceSpans });
    const routes = [
      ['reviseSummary', () => drafts.reviseSummary(db, userId, draft.id, { summary: `${draft.summary} Fim.` })],
      ['reviseQuestion', () => drafts.reviseQuestion(db, userId, draft.id, draft.questions[0].id, { hint: 'Pense no balanco das pressoes.' })],
      ['acceptQuestion', () => drafts.reviseQuestion(db, userId, draft.id, draft.questions[0].id, { status: 'ACCEPTED' })],
      ['addQuestion', () => drafts.addQuestion(db, userId, draft.id, { question: 'Qual pressao se opoe a filtracao?', answer: 'A pressao oncotica e a da capsula de Bowman.', explanation: null, hint: null, sourceSpans: [{ pageIndex: 1 }] })],
      ['reorderQuestions', () => drafts.reorderQuestions(db, userId, draft.id, draft.questions.map((q) => q.id).reverse())],
      ['deleteQuestion', () => drafts.deleteQuestion(db, userId, draft.id, draft.questions[0].id)],
      ['replaceDraftContent', () => drafts.replaceDraftContent(db, userId, draft.id, { summary: `${draft.summary} Mais.`, questions: draft.questions.map(fields) })],
      ['reauditDraft', () => drafts.reauditDraft(db, userId, draft.id).draft],
    ];
    for (const [name, run] of routes) {
      draft = run();
      assert.deepEqual(draft.audit.original, kept.original, `${name} kept audit.original`);
      assert.deepEqual(draft.audit.repairChanges, kept.repairChanges, `${name} kept audit.repairChanges`);
      const reread = drafts.getDraft(db, userId, draft.id);
      assert.deepEqual(reread.audit.original, kept.original, `${name}: still there when the draft is read back from the database`);
    }
    // accepting the lesson changes its status, never the history kept with the draft
    acceptDraft(db, userId, draft.id, { newSubjectName: "Farmacologia", studyDate: "2026-03-01", expectedRevision: draft.revision });
    const accepted = drafts.getDraft(db, userId, draft.id);
    assert.equal(accepted.status, "ACCEPTED");
    assert.deepEqual(accepted.audit.original, kept.original, "accepting kept audit.original");
    assert.deepEqual(accepted.audit.repairChanges, kept.repairChanges, "accepting kept audit.repairChanges");
    const stored = JSON.parse(db.prepare("SELECT draft_json FROM generated_drafts WHERE id = ?").get(draft.id).draft_json);
    assert.deepEqual(stored.audit.original, kept.original, "the stored row still has it");
  } finally { cleanup(); }
});
