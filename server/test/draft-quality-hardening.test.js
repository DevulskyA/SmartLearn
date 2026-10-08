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
import { auditDraft, AUDIT_RESULT } from '../src/ai/draft-audit.js';
import { buildDraftPrompt } from '../src/ai/draft-prompt.js';
import { buildAuditPrompt, buildRepairPrompt } from '../src/ai/draft-audit-model.js';

// REALMODEL-1 content-quality closure. The first real Codex canary produced a faithful draft but four concrete
// DIDACTIC defects: (A) circular explanations that only restate the question/answer, (B) hints that give the answer
// away, (C) an answer copied from the source wholesale, (D) an answer that dropped the clinically meaningful condition
// its own question names ("em depleção de volume"). Each class gets protection where it can be detected RELIABLY:
//   deterministic = narrow, exact comparisons (nothing new in the explanation; the answer's value inside the hint);
//   prompt + independent MODEL audit = everything semantic (qualifiers, causal logic, binary-choice hints).
// Every rule has a counterexample that SHOULD PASS, so the screen does not teach reviewers to ignore it.

const SEGMENTS = [
  { pageIndex: 1, text: 'A pressão líquida de filtração é, portanto, de cerca de 16 mmHg: a pressão hidrostática do capilar glomerular (60 mmHg) favorece a filtração, enquanto a pressão hidrostática da cápsula de Bowman (15 mmHg) e a pressão oncótica do capilar (29 mmHg) se opõem. A TFG normal do adulto é de cerca de 120 mL/min.' },
  { pageIndex: 2, text: 'Quando a perfusão renal cai, a angiotensina II contrai preferencialmente a arteríola eferente e ajuda a manter a pressão de filtração. Os inibidores da ECA reduzem a angiotensina II e podem diminuir a TFG em pacientes com estenose bilateral da artéria renal. Os anti-inflamatórios não esteroides reduzem as prostaglandinas vasodilatadoras da arteríola aferente e podem precipitar lesão renal aguda em pacientes com depleção de volume.' },
];
const SUMMARY = 'A pressão líquida de filtração é de cerca de 16 mmHg, resultado da pressão hidrostática do capilar glomerular (60 mmHg) contra a pressão da cápsula de Bowman (15 mmHg) e a pressão oncótica (29 mmHg). A TFG normal do adulto é de cerca de 120 mL/min. Quando a perfusão renal cai, a angiotensina II contrai preferencialmente a arteríola eferente e ajuda a manter a pressão de filtração.';
const draftOf = (...questions) => ({ summary: SUMMARY, questions });
const audit = (...questions) => auditDraft(draftOf(...questions), { segments: SEGMENTS });
const issues = (r, index) => r.findings.filter((f) => f.scope === `question:${index}`).map((f) => f.issue);
const finding = (r, issue) => r.findings.find((f) => f.issue === issue);

// --- the OBSERVED questions of the real canary ----------------------------------------------------------------------
const NSAID = {
  question: 'Por que os anti-inflamatórios não esteroides podem precipitar lesão renal aguda em pacientes com depleção de volume?',
  answer: 'Porque reduzem as prostaglandinas vasodilatadoras da arteríola aferente.',
  explanation: 'Os anti-inflamatórios não esteroides reduzem as prostaglandinas vasodilatadoras da arteríola aferente. Em pacientes com depleção de volume, os anti-inflamatórios não esteroides podem, por esse mecanismo, precipitar lesão renal aguda.',
  hint: 'Pense nos mediadores envolvidos no tônus da arteríola aferente.',
  sourceSpans: [{ pageIndex: 2 }],
};
const ACE = {
  question: 'Em pacientes com estenose bilateral da artéria renal, qual efeito os inibidores da ECA podem ter sobre a TFG e por quê?',
  answer: 'Podem diminuir a TFG ao reduzir a angiotensina II, que ajuda a manter a pressão de filtração por contração preferencial da arteríola eferente quando a perfusão renal cai.',
  explanation: 'Os inibidores da ECA reduzem a angiotensina II e podem diminuir a TFG em pacientes com estenose bilateral da artéria renal.',
  hint: null,
  sourceSpans: [{ pageIndex: 2 }],
};
const PRESSURE = {
  question: 'Considerando 60 mmHg no capilar glomerular, 15 mmHg na cápsula de Bowman e 29 mmHg de pressão oncótica, qual é a pressão líquida de filtração?',
  answer: 'Cerca de 16 mmHg: 60 − 15 − 29.',
  explanation: 'A pressão hidrostática do capilar glomerular favorece a filtração, e a pressão da cápsula de Bowman e a pressão oncótica se opõem a ela: o que sobra é a pressão líquida de filtração.',
  hint: 'Some algebricamente as três pressões, com o sinal de cada uma.',
  sourceSpans: [{ pageIndex: 1 }],
};

// =====================================================================================================================
// A. circular explanation
// =====================================================================================================================

test('A: an explanation that adds no information beyond the question and the answer is flagged (the observed NSAID and ECA cases)', () => {
  for (const [name, q] of [['NSAID', NSAID], ['ECA', ACE]]) {
    const r = audit(q);
    const f = finding(r, 'EXPLANATION_ADDS_NOTHING');
    assert.ok(f, `${name}: circular explanation must be flagged`);
    assert.equal(f.scope, 'question:0');
    assert.equal(f.severity, 'MEDIUM', 'a defect worth one bounded repair, not an advisory');
    assert.equal(r.result, AUDIT_RESULT.REPAIR);
  }
});

test('A: an explanation that is just the answer again is flagged', () => {
  const same = { ...NSAID, explanation: NSAID.answer.replace(/^Porque /, 'Eles ') };
  assert.ok(issues(audit(same), 0).includes('EXPLANATION_ADDS_NOTHING'));
});

test('A (should PASS): an explanation that adds a causal link, a contrast or a value is not flagged', () => {
  const withMechanism = { ...ACE, explanation: 'Sem a angiotensina II, a eferente deixa de se contrair: a pressão no capilar glomerular cai e a filtração diminui. Na estenose bilateral a filtração depende dela.' };
  assert.ok(!issues(audit(withMechanism), 0).includes('EXPLANATION_ADDS_NOTHING'));
  const withNewValue = { ...PRESSURE, explanation: 'A pressão líquida resulta do que sobra da pressão do capilar (60 mmHg) depois de subtrair as duas que se opõem; 16 mmHg é um valor positivo, por isso há filtração.' };
  assert.ok(!issues(audit(withNewValue), 0).includes('EXPLANATION_ADDS_NOTHING'));
  assert.ok(!issues(audit(PRESSURE), 0).includes('EXPLANATION_ADDS_NOTHING'), 'a good explanation of the canary draft stays clean');
  // the ONLY new thing is a number the question and the answer do not contain: that is still new information
  const onlyANumber = { ...NSAID, explanation: `${NSAID.explanation} Em 40%.` };
  assert.ok(!issues(audit(onlyANumber), 0).includes('EXPLANATION_ADDS_NOTHING'), 'a new number counts as information');
  assert.ok(issues(audit(NSAID), 0).includes('EXPLANATION_ADDS_NOTHING'), 'while the same explanation without it is circular');
});

test('A (should PASS): no explanation, or a short one, is the existing thin-feedback rule — not this one', () => {
  assert.ok(!issues(audit({ ...ACE, explanation: null }), 0).includes('EXPLANATION_ADDS_NOTHING'));
  assert.ok(!issues(audit({ ...ACE, explanation: undefined }), 0).includes('EXPLANATION_ADDS_NOTHING'));
  // too few content terms to compare reliably: left to the model audit, never guessed at here
  const nothingToCompare = { ...ACE, explanation: 'Ele faz isso com elas, de um modo que cai.' };
  assert.ok(!issues(audit(nothingToCompare), 0).includes('EXPLANATION_ADDS_NOTHING'), 'narrow by design');
});

// =====================================================================================================================
// B. hint that gives the answer away
// =====================================================================================================================

test('B: a hint that exposes the answer\'s value is HIGH, even when it does not repeat the whole answer', () => {
  for (const hint of ['É um valor próximo de 16', 'Cerca de 16, dizem as pressões.', 'O resultado é 16.']) {
    const r = audit({ ...PRESSURE, hint });
    const f = finding(r, 'HINT_REVEALS_VALUE');
    assert.ok(f, `"${hint}" gives the value away`);
    assert.equal(f.severity, 'HIGH');
  }
  const tfg = { question: 'Qual é a TFG normal do adulto?', answer: '120 mL/min', explanation: 'É o ritmo com que os rins filtram o plasma por minuto, em um adulto saudável.', hint: 'Mais de cem, menos de duzentos: 120.', sourceSpans: [{ pageIndex: 1 }] };
  assert.ok(issues(audit(tfg), 0).includes('HINT_REVEALS_VALUE'));
});

test('B (should PASS): a hint that points to the method, a category or a number the QUESTION already gave is not flagged', () => {
  assert.ok(!issues(audit(PRESSURE), 0).some((i) => i.startsWith('HINT_')));
  const usesQuestionNumber = { ...PRESSURE, hint: 'Comece pelos 60 mmHg do capilar e subtraia o que se opõe.' };
  assert.ok(!issues(audit(usesQuestionNumber), 0).includes('HINT_REVEALS_VALUE'), 'a number that is not the answer\'s is fine');
  const oneDigit = { question: 'Quantas arteríolas controlam a pressão do capilar glomerular?', answer: '2 arteríolas (aferente e eferente)', explanation: 'A aferente regula a entrada de sangue e a eferente a saída, e juntas definem a pressão no capilar.', hint: 'Uma entra, outra sai: pense em um par.', sourceSpans: [{ pageIndex: 1 }] };
  assert.ok(!issues(audit(oneDigit), 0).includes('HINT_REVEALS_VALUE'), 'one-digit numbers are not treated as a leak');
  const oneDigitInHint = { ...oneDigit, hint: 'Comece pelas 2 extremidades do capilar.' };
  assert.ok(!issues(audit(oneDigitInHint), 0).includes('HINT_REVEALS_VALUE'), 'even when the very digit appears in the hint');
});

test('B: the existing "hint repeats the answer" rule is unchanged', () => {
  assert.ok(issues(audit({ ...PRESSURE, hint: 'Cerca de 16 mmHg: 60 − 15 − 29' }), 0).includes('HINT_REVEALS_ANSWER'));
});

// =====================================================================================================================
// C. wholesale copy of the source
// =====================================================================================================================

test('C: a long sentence copied from the source stays advisory (LOW); required exact terms and values are NEVER penalized', () => {
  const longCopy = { ...ACE, question: 'O que acontece com a pressão líquida?', answer: 'A pressão líquida de filtração é, portanto, de cerca de 16 mmHg: a pressão hidrostática do capilar glomerular (60 mmHg) favorece a filtração', sourceSpans: [{ pageIndex: 1 }] };
  const f = finding(audit(longCopy), 'QUESTION_LITERAL_COPY');
  assert.ok(f);
  assert.equal(f.severity, 'LOW');
  // exact terminology / a necessary value, even if verbatim, is not a copy problem
  for (const answer of ['Mácula densa.', 'Cerca de 120 mL/min.', 'A pressão oncótica do capilar (cerca de 29 mmHg).']) {
    const r = audit({ question: 'Qual é o termo ou valor pedido?', answer, explanation: 'É o dado que a fonte atribui a esse conceito, e ele sustenta o raciocínio sobre a filtração.', hint: null, sourceSpans: [{ pageIndex: 1 }] });
    assert.ok(!issues(r, 0).includes('QUESTION_LITERAL_COPY'), answer);
  }
});

// =====================================================================================================================
// the prompts (generation, audit, repair): where the SEMANTIC half of each class lives
// =====================================================================================================================

const SEG = [{ pageIndex: 3, text: 'Texto de origem.' }];
const generation = buildDraftPrompt(SEG, '5');

test('generation prompt: explanations must teach WHY/HOW and never merely restate the question or the answer', () => {
  assert.match(generation, /explanation[^\n]*teaches[^\n]*WHY/i);
  assert.match(generation, /never (just )?restat\w+ the question or the answer/i);
});

test('generation prompt: a hint is a partial cue — never the answer, its value or its distinctive term, never a two-way choice', () => {
  assert.match(generation, /never (state|name|contain)[^\n]*(value|number)/i);
  assert.match(generation, /two named options|binary choice|which of the two/i);
});

test('generation prompt: a condition the question names must survive in the answer (and "may/usually/only if/except" keep their force)', () => {
  assert.match(generation, /condition[^\n]*(question|stem)[^\n]*(answer)/i);
  assert.match(generation, /(^|\n)CONDITIONS:[^\n]*in volume depletion[^\n]*never silently become an unconditional claim/);
  assert.match(generation, /never turn "may" into "does" or "except X" into "all"/, 'the existing rule is kept');
});

test('generation prompt: do not copy whole sentences, but keep the exact terms, definitions and values that fidelity requires', () => {
  assert.match(generation, /do not copy (whole|long) (sentences|passages)/i);
  assert.match(generation, /exact (medical )?terms?[^\n]*(values|numbers)[^\n]*(fidelity|verbatim)|(fidelity|verbatim)[^\n]*exact (medical )?terms?/i);
});

test('audit prompt: the independent auditor is told to look for qualifier loss, circular explanations and hint leakage', () => {
  const p = buildAuditPrompt({ summary: 's', questions: [{ question: 'q?', answer: 'a', explanation: 'e', hint: 'h', sourceSpans: [{ pageIndex: 1 }] }] }, SEG);
  assert.match(p, /QUALIFIER_PRESERVATION/);
  assert.match(p, /EXPLANATION_CIRCULAR|merely restates/i);
  assert.match(p, /HINT_LEAKAGE/);
  assert.match(p, /condition[^\n]*(dropped|lost|missing)|(dropped|lost|missing)[^\n]*condition/i);
  assert.match(p, /UNTRUSTED DATA/, 'still framed as untrusted');
  assert.match(p, /do NOT invent problems|Do NOT invent problems/i, 'still must not invent problems');
});

test('repair prompt: unchanged in spirit — fix only the findings, source is the only authority', () => {
  const p = buildRepairPrompt({ summary: 's', summarySourceSpans: [{ pageIndex: 3 }], questions: [], modelVersion: 'm', promptVersion: '5' }, [{ issue: 'QUALIFIER_LOST', scope: 'question:0', generatedClaim: 'g', sourceEvidence: 'e', repair: 'r' }], SEG, '5');
  assert.match(p, /Fix ONLY the problems listed in FINDINGS/);
  assert.match(p, /QUALIFIER_LOST/);
});

// =====================================================================================================================
// end to end, with a scripted model: the four classes no longer pass through silently
// =====================================================================================================================

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };
const LIVE = { apiKey: 'k', model: 'm', consentGranted: true, budgetCapUsd: 5 };

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-quality-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { db, sourcesDir: join(dir, 'sources'), cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}
const makeUser = (db, email) => {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid;
};
async function makeProposal(db, userId, sourcesDir) {
  const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(SEGMENTS.map((s) => s.text)), originalName: 'renal.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
  await extractSource(db, userId, source.id, { sourcesDir });
  return proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 10 })[0];
}
function scriptedFetch(script) {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    const step = script[calls.length];
    calls.push(JSON.parse(init.body).messages[0].content);
    if (step === undefined) throw new Error(`unexpected extra model call #${calls.length}`);
    return { ok: true, json: async () => ({ content: [{ text: typeof step === 'string' ? step : JSON.stringify(step) }] }) };
  };
  return { fetchImpl, calls };
}
const draftJson = (question, o = {}) => ({
  summary: SUMMARY, summarySourceSpans: [{ pageIndex: 1 }, { pageIndex: 2 }],
  questions: [{ questionType: 'MECHANISM', ...question }], modelVersion: 'm-1', promptVersion: '7', ...o,
});
const PASS = { result: 'PASS', findings: [] };
const run = async (script) => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'q@example.com');
    const proposal = await makeProposal(db, userId, sourcesDir);
    const { fetchImpl, calls } = scriptedFetch(script);
    const draft = await drafts.createDraft(db, userId, proposal.id, { ...LIVE, fetchImpl });
    return { draft, calls };
  } finally { cleanup(); }
};

test('the current prompt version is 7 (the prompt changed materially, so stored drafts stay distinguishable)', async () => {
  const { calls, draft } = await run([draftJson(PRESSURE), PASS]);
  assert.match(calls[0], /promptVersion exactly "7"/);
  assert.equal(draft.promptVersion, '7');
});

test('A end to end: a circular explanation triggers ONE repair, the repaired explanation teaches, and nothing loops', async () => {
  const repaired = { ...NSAID, explanation: 'Sem as prostaglandinas, a aferente perde a dilatação que mantém o fluxo ao glomérulo. Na depleção de volume essa dilatação é o que sustenta a filtração, então o fluxo cai e a lesão renal aguda aparece.' };
  const { draft, calls } = await run([draftJson(NSAID), PASS, draftJson(repaired)]);
  assert.equal(calls.length, 3, 'generation, audit, exactly one repair');
  assert.match(calls[2], /EXPLANATION_ADDS_NOTHING/, 'the repair prompt carries the finding');
  assert.equal(draft.audit.repaired, true);
  assert.ok(draft.audit.addressed.some((a) => a.issue === 'EXPLANATION_ADDS_NOTHING'));
  assert.ok(!draft.audit.findings.some((f) => f.issue === 'EXPLANATION_ADDS_NOTHING'), 'the repaired draft re-screens clean');
  assert.equal(draft.status, 'DRAFT');
});

test('B end to end: a value-leaking hint is blocking and is repaired once', async () => {
  const leaky = { ...PRESSURE, hint: 'É um valor próximo de 16' };
  const { draft, calls } = await run([draftJson(leaky), PASS, draftJson(PRESSURE)]);
  assert.equal(calls.length, 3);
  assert.match(calls[2], /HINT_REVEALS_VALUE/);
  assert.equal(draft.questions[0].hint, PRESSURE.hint);
});

test('D end to end: a dropped clinical condition is caught by the MODEL audit (deterministic cannot see it) and repaired once', async () => {
  const dropped = { ...NSAID, answer: 'Porque reduzem as prostaglandinas vasodilatadoras da arteríola aferente.', explanation: 'Sem as prostaglandinas, a aferente perde a dilatação que mantém o fluxo ao glomérulo, e a filtração cai, com risco de lesão renal aguda.' };
  const qualifierFinding = { issue: 'QUALIFIER_LOST', severity: 'MEDIUM', scope: 'question:0', generatedClaim: 'AINEs causam lesão renal aguda (sem condição)', sourceEvidence: 'em pacientes com depleção de volume', repair: 'Restaure a condição "em pacientes com depleção de volume".' };
  const restored = { ...dropped, answer: 'Porque reduzem as prostaglandinas vasodilatadoras da arteríola aferente, e isso pesa em pacientes com depleção de volume, em que a filtração depende dessa dilatação.' };
  const { draft, calls } = await run([draftJson(dropped), { result: 'REPAIR', findings: [qualifierFinding] }, draftJson(restored)]);
  assert.equal(calls.length, 3);
  assert.match(calls[1], /QUALIFIER_PRESERVATION/, 'the auditor was asked to check qualifiers');
  assert.match(calls[2], /QUALIFIER_LOST/);
  assert.match(draft.questions[0].answer, /depleção de volume/);
  assert.equal(draft.audit.repaired, true);
});

test('NO OVERCORRECTION: a faithful draft with a teaching explanation and a good hint costs no repair', async () => {
  const { draft, calls } = await run([draftJson(PRESSURE), PASS]);
  assert.equal(calls.length, 2, 'generation + audit only');
  assert.equal(draft.audit.repaired, false);
  assert.equal(draft.audit.result, 'PASS');
  assert.deepEqual(draft.audit.findings.filter((f) => f.severity !== 'LOW'), []);
});

// =====================================================================================================================
// side effect found by the real canary: a condition restated at the start of the answer is NOT a leaked answer
// =====================================================================================================================

test('an answer that opens by restating the question\'s own condition is not "leaked" — the claim that follows is what the student must supply', () => {
  const observed = {
    question: 'Quando a perfusão renal cai, qual é o efeito da angiotensina II?',
    answer: 'Quando a perfusão renal cai, a angiotensina II contrai preferencialmente a arteríola eferente, ajudando a manter a pressão de filtração.',
    explanation: 'A contração da eferente mantém a pressão no capilar glomerular quando a entrada de sangue diminui, e por isso a filtração se preserva.',
    hint: 'Localize o efeito vascular em relação à entrada e à saída do glomérulo.',
    sourceSpans: [{ pageIndex: 2 }],
  };
  assert.ok(!issues(audit(observed), 0).includes('QUESTION_ANSWER_LEAKED'));
  const other = { ...observed, question: 'Na depleção de volume, o que fazem os anti-inflamatórios não esteroides com a perfusão renal?', answer: 'Na depleção de volume, reduzem as prostaglandinas vasodilatadoras da arteríola aferente, o que pode precipitar lesão renal aguda.', hint: null, sourceSpans: [{ pageIndex: 2 }] };
  assert.ok(!issues(audit(other), 0).includes('QUESTION_ANSWER_LEAKED'));
});

test('but an answer that IS only the question\'s own words — or whose claim is already in the question — is still flagged (the rule is not weakened)', () => {
  const only = { question: 'Quando a perfusão renal cai, o que acontece?', answer: 'Quando a perfusão renal cai.', explanation: 'A queda da perfusão renal altera a pressão de filtração do capilar glomerular.', hint: null, sourceSpans: [{ pageIndex: 2 }] };
  assert.ok(issues(audit(only), 0).includes('QUESTION_ANSWER_LEAKED'));
  const claimInQuestion = { question: 'Sabendo que a angiotensina II contrai preferencialmente a arteríola eferente, qual é o efeito dela?', answer: 'Quando a perfusão cai, a angiotensina II contrai preferencialmente a arteríola eferente, mantendo a pressão.', explanation: 'A contração da eferente mantém a pressão no capilar glomerular quando a entrada de sangue diminui.', hint: null, sourceSpans: [{ pageIndex: 2 }] };
  assert.ok(issues(audit(claimInQuestion), 0).includes('QUESTION_ANSWER_LEAKED'), 'the claim after the restated condition is already in the question');
  const plainLeak = { question: 'A TFG normal do adulto é 120 mL/min. Qual é a TFG normal?', answer: '120 mL/min', explanation: 'É o volume de plasma filtrado por minuto pelos dois rins de um adulto saudável.', hint: null, sourceSpans: [{ pageIndex: 1 }] };
  assert.ok(issues(audit(plainLeak), 0).includes('QUESTION_ANSWER_LEAKED'), 'the original leak rule is unchanged');
  // an ordinary first clause (not a restated condition) that the question already contains is still a leak
  const ordinaryLeak = { question: 'A pressão oncótica se opõe à filtração; qual é o nome dessa força?', answer: 'Pressão oncótica, que retém o líquido no capilar.', explanation: 'É a pressão exercida pelas proteínas do plasma, que puxam a água de volta para o capilar.', hint: null, sourceSpans: [{ pageIndex: 1 }] };
  assert.ok(issues(audit(ordinaryLeak), 0).includes('QUESTION_ANSWER_LEAKED'), 'only a leading CONDITION is skipped');
});
