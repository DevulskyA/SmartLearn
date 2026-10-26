import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditDraft, AUDIT_RESULT, SOURCE_SUFFICIENCY, triggersRepair } from '../src/ai/draft-audit.js';

// R-3 (medical fidelity, deterministic part). Each case states WHAT the source says, what the draft changes, and what must (not) happen:
// a changed dose, unit, frequency or condition is a real error that blocks; a faithful paraphrase or translation is not; a thin source is
// only an advisory about what the check could see. Word-level signals never hide a real error and never cause a repair on their own.

const PAGE = (pageIndex, text) => ({ pageIndex, text });
const pad = (text, n = 900) => `${text} ${'A fisiologia descreve o funcionamento normal do organismo humano. '.repeat(Math.ceil(n / 60))}`;
const SOURCE = [
  PAGE(1, pad('A amoxicilina é usada na dose de 500 mg a cada 8 horas por 7 dias em adultos. A pressão arterial média normal é cerca de 93 mmHg.')),
  PAGE(2, pad('O paciente com insuficiência renal grave pode precisar de ajuste da dose. A filtração glomerular normal é cerca de 125 mL/min.')),
  PAGE(3, pad('A infecção urinária não complicada trata-se apenas com antibiótico oral. O volume de distribuição é de 0,3 L/kg.')),
];
const Q = (o = {}) => ({ question: 'Qual a dose da amoxicilina em adultos?', answer: 'A dose é de 500 mg a cada 8 horas por 7 dias.', explanation: 'Esse esquema aparece na página citada e define a dose habitual do adulto.', hint: null, sourceSpans: [{ pageIndex: 1 }], ...o });
const SUMMARY = 'A amoxicilina é usada na dose de 500 mg a cada 8 horas por 7 dias em adultos. A pressão arterial média normal é cerca de 93 mmHg. A filtração glomerular normal é cerca de 125 mL/min.';
const draft = (o = {}) => ({ summary: SUMMARY, questions: [Q()], ...o });
const audit = (d) => auditDraft(d, { segments: SOURCE });
const issues = (r, scope) => r.findings.filter((f) => !scope || f.scope === scope).map((f) => f.issue);

test('baseline: the faithful draft is a PASS; whatever is raised is a word-level signal, never a value, unit, qualifier or citation problem', () => {
  const r = audit(draft());
  assert.equal(r.result, AUDIT_RESULT.PASS);
  assert.ok(r.findings.every((f) => f.blocksRepair === false || f.severity === 'LOW'), 'only signals that cannot block');
  assert.ok(!r.findings.some((f) => /VALUE|UNIT|QUALIFIER/.test(f.issue)));
});

test('DOSE: a dose changed from 500 mg to 250 mg is a HIGH finding in the summary and in a question, and asks for a repair', () => {
  const inSummary = audit(draft({ summary: SUMMARY.replace('500 mg', '250 mg') }));
  assert.equal(inSummary.result, AUDIT_RESULT.REPAIR);
  const f = inSummary.findings.find((x) => x.issue === 'SUMMARY_UNSUPPORTED_VALUE');
  assert.ok(f && f.severity === 'HIGH', 'the changed dose is flagged');
  assert.match(f.generatedClaim, /250/);
  assert.match(f.sourceEvidence, /500 mg/, 'and shows what the source really says');

  const inQuestion = audit(draft({ questions: [Q({ answer: 'A dose é de 250 mg a cada 8 horas por 7 dias.' })] }));
  assert.equal(inQuestion.result, AUDIT_RESULT.REPAIR);
  assert.ok(issues(inQuestion, 'question:0').includes('QUESTION_UNSUPPORTED_VALUE'));
});

test('DOSE: the frequency and the duration are values too: "a cada 12 horas" and "por 14 dias" are not in the source', () => {
  assert.ok(issues(audit(draft({ summary: SUMMARY.replace('8 horas', '12 horas') }))).includes('SUMMARY_UNSUPPORTED_VALUE'));
  assert.ok(issues(audit(draft({ summary: SUMMARY.replace('7 dias', '14 dias') }))).includes('SUMMARY_UNSUPPORTED_VALUE'));
});

test('DOSE (should PASS): the same dose written another way (decimal comma, extra space) is the source\'s value, not a new one', () => {
  const r = audit(draft({ summary: SUMMARY.replace('93 mmHg', '93 mm Hg').replace('500 mg', '500  mg') }));
  assert.ok(!issues(r, 'summary').includes('SUMMARY_UNSUPPORTED_VALUE'));
  assert.equal(r.result, AUDIT_RESULT.PASS);
});

test('UNITS: the same number in another unit of the same dimension (125 mL/min -> 125 L/min, 500 mg -> 500 mcg) is HIGH', () => {
  const volume = audit(draft({ summary: SUMMARY.replace('125 mL/min', '125 L/min') }));
  assert.ok(volume.findings.some((f) => f.severity === 'HIGH' && /unit|unid|UNIT/i.test(`${f.issue} ${f.repair}`)), 'volume unit swap');
  assert.equal(volume.result, AUDIT_RESULT.REPAIR);
  const mass = audit(draft({ questions: [Q({ answer: 'A dose é de 500 mcg a cada 8 horas por 7 dias.' })] }));
  assert.ok(mass.findings.some((f) => f.severity === 'HIGH'), 'mass unit swap in a question');
  assert.equal(mass.result, AUDIT_RESULT.REPAIR);
});

test('QUALIFIER: "apenas" and "pode" in the source that vanish from the draft are flagged; the faithful sentence is not', () => {
  const dropped = audit(draft({ summary: `${SUMMARY} A infecção urinária não complicada trata-se com antibiótico oral. O paciente com insuficiência renal grave precisa de ajuste da dose.` }));
  const lost = dropped.findings.filter((f) => f.issue === 'QUALIFIER_LOST');
  assert.ok(lost.length >= 1, 'a qualifier that the source states was lost');
  assert.equal(dropped.result, AUDIT_RESULT.REPAIR);
  const faithful = audit(draft({ summary: `${SUMMARY} A infecção urinária não complicada trata-se apenas com antibiótico oral. O paciente com insuficiência renal grave pode precisar de ajuste da dose.` }));
  assert.ok(!issues(faithful).includes('QUALIFIER_LOST'));
});

test('FAITHFUL TRANSLATION / PARAPHRASE: an English source and a Portuguese draft with the same values and no new fact raise no blocking finding', () => {
  const english = [PAGE(1, pad('Amoxicillin is given at 500 mg every 8 hours for 7 days in adults. Mean arterial pressure is about 93 mmHg.', 1200))];
  const r = auditDraft(draft({ summary: 'A amoxicilina é dada na dose de 500 mg a cada 8 horas por 7 dias em adultos. A pressão arterial média é cerca de 93 mmHg.', questions: [Q()] }), { segments: english });
  assert.ok(!r.findings.some((f) => f.severity === 'HIGH' || (f.severity === 'MEDIUM' && f.blocksRepair !== false)), 'nothing blocking');
  assert.equal(r.result, AUDIT_RESULT.PASS);
});

test('WRONG CITATION: a value that is on page 1 but cited to page 3 is not supported by the cited page', () => {
  const r = audit(draft({ questions: [Q({ sourceSpans: [{ pageIndex: 3 }] })] }));
  assert.ok(issues(r, 'question:0').includes('QUESTION_UNSUPPORTED_VALUE'), 'support is judged on the cited page, not on the whole source');
  assert.equal(r.result, AUDIT_RESULT.REPAIR);
  const right = audit(draft({ questions: [Q({ sourceSpans: [{ pageIndex: 1 }] })] }));
  assert.equal(right.result, AUDIT_RESULT.PASS);
});

test('SUMMARY + THREE QUESTIONS: each finding lands on the part that holds the problem, the clean part stays clean, and a real error still blocks next to word-level signals', () => {
  const d = draft({
    // the summary changes a value (real error) AND adds a word the source never uses (signal only)
    summary: `${SUMMARY.replace('93 mmHg', '120 mmHg')} A farmacocinética explica a absorção.`,
    questions: [
      Q({ answer: 'A dose é de 500 mcg a cada 8 horas por 7 dias.' }),                                        // 0: unit swapped
      Q({ question: 'Qual a filtração glomerular normal?', answer: 'Cerca de 125 mL/min.', explanation: 'É o valor da página citada para o adulto saudável em repouso.', sourceSpans: [{ pageIndex: 3 }] }), // 1: wrong page
      Q({ question: 'O que a dose exige no paciente renal grave?', answer: 'Pode precisar de ajuste da dose.', explanation: 'A página 2 diz que a insuficiência renal grave pode exigir ajuste.', sourceSpans: [{ pageIndex: 2 }] }), // 2: faithful
    ],
  });
  const r = audit(d);
  assert.equal(r.result, AUDIT_RESULT.REPAIR);
  assert.ok(issues(r, 'summary').includes('SUMMARY_UNSUPPORTED_VALUE'), 'the changed pressure is on the summary');
  assert.ok(r.findings.some((f) => f.scope === 'question:0' && f.severity === 'HIGH'), 'question 0: unit swap');
  assert.ok(r.findings.some((f) => f.scope === 'question:1' && f.issue === 'QUESTION_UNSUPPORTED_VALUE'), 'question 1: wrong page');
  assert.deepEqual(r.findings.filter((f) => f.scope === 'question:2'), [], 'question 2 is faithful and stays clean');
  // and the word-level signal does not become the reason for anything
  const lexical = r.findings.filter((f) => f.blocksRepair === false);
  assert.ok(lexical.every((f) => f.severity !== 'HIGH'));
});

test('SUMMARY + THREE QUESTIONS: the same draft with only word-level differences is a PASS (no repair)', () => {
  const d = draft({
    summary: `${SUMMARY} A farmacocinética explica a absorção.`,
    questions: [Q(), Q({ question: 'Qual a filtração glomerular normal?', answer: 'Cerca de 125 mL/min.', explanation: 'É o valor da página citada para o adulto saudável em repouso.', sourceSpans: [{ pageIndex: 2 }] }), Q({ question: 'Qual o volume de distribuição?', answer: 'É de 0,3 L/kg.', explanation: 'A página 3 traz esse volume de distribuição por quilo do paciente.', sourceSpans: [{ pageIndex: 3 }] })],
  });
  const r = audit(d);
  assert.equal(r.result, AUDIT_RESULT.PASS);
  assert.ok(r.findings.every((f) => f.severity === 'LOW' || f.blocksRepair === false));
});

// ---- the extracted text is too thin to judge ----------------------------------------------------------------------------------------

test('SOURCE SUFFICIENCY: 440 characters over 3 pages is advised as thin (LOW), never blocks, and changes no other finding', () => {
  const thin = [PAGE(1, 'a'.repeat(150) + ' texto'), PAGE(2, 'b'.repeat(150) + ' texto'), PAGE(3, 'c'.repeat(120) + ' texto')];
  const total = thin.reduce((n, s) => n + s.text.trim().length, 0);
  assert.ok(total / 3 < SOURCE_SUFFICIENCY.minCharsPerPage);
  const d = { summary: 'Resumo curto sobre texto.', questions: [Q({ answer: 'Resposta curta.', explanation: 'Explicação curta para a resposta.' })] };
  const r = auditDraft(d, { segments: thin });
  const f = r.findings.find((x) => x.issue === 'SOURCE_TEXT_INSUFFICIENT');
  assert.ok(f, 'the advisory is raised');
  assert.equal(f.severity, 'LOW');
  assert.equal(f.scope, 'draft');
  assert.deepEqual(f.reasons, ['THIN']);
  assert.equal(f.sourceChars, total);
  assert.equal(f.pageCount, 3);
  // it is not the reason for a repair, and it is the only difference against the same draft over a sufficient source
  const others = r.findings.filter((x) => x.issue !== 'SOURCE_TEXT_INSUFFICIENT');
  assert.equal(r.result, others.some(triggersRepair) ? AUDIT_RESULT.REPAIR : AUDIT_RESULT.PASS, 'the result is decided by the OTHER findings only');
  assert.ok(!triggersRepair(f), 'the advisory itself can never trigger a repair');
  const longer = thin.map((s) => ({ ...s, text: `${s.text} ${'texto de apoio com conteúdo. '.repeat(20)}` }));
  assert.ok(!auditDraft(d, { segments: longer }).findings.some((x) => x.issue === 'SOURCE_TEXT_INSUFFICIENT'), 'a source with enough text per page does not raise it');
});

test('SOURCE SUFFICIENCY: a page with no text in a multi-page scope, and a page full of replacement characters, are named', () => {
  const rich = (n) => 'texto de conteúdo médico completo '.repeat(n);
  const empty = auditDraft(draft(), { segments: [PAGE(1, rich(60)), PAGE(2, '   '), PAGE(3, rich(60))] }).findings.find((x) => x.issue === 'SOURCE_TEXT_INSUFFICIENT');
  assert.deepEqual(empty.reasons, ['EMPTY_PAGES']);
  assert.deepEqual(empty.emptyPages, [2]);
  const garbled = auditDraft(draft(), { segments: [PAGE(1, rich(60)), PAGE(2, `${rich(30)}${'\uFFFD'.repeat(6)}${rich(30)}`)] }).findings.find((x) => x.issue === 'SOURCE_TEXT_INSUFFICIENT');
  assert.deepEqual(garbled.reasons, ['GARBLED']);
  assert.deepEqual(garbled.garbledPages, [2]);
});

test('SOURCE SUFFICIENCY (should NOT fire): a table of numbers, a single short page and an ordinary multi-page source are fine', () => {
  const table = PAGE(1, Array.from({ length: 80 }, (_, i) => `${i} ${i * 3} ${i * 7}`).join('\n') + ' tabela de valores de referência e leitura clínica');
  assert.ok(!auditDraft(draft(), { segments: [table] }).findings.some((x) => x.issue === 'SOURCE_TEXT_INSUFFICIENT'), 'digits are not a broken extraction');
  assert.ok(!auditDraft(draft(), { segments: [PAGE(1, 'O rim filtra o sangue e produz urina.')] }).findings.some((x) => x.issue === 'SOURCE_TEXT_INSUFFICIENT'), 'one short page is a short source, not a thin one');
  assert.ok(!audit(draft()).findings.some((x) => x.issue === 'SOURCE_TEXT_INSUFFICIENT'));
});
