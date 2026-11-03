import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditRisk, quantitiesIn } from '../src/ai/risk-checks.js';
import { auditDraft } from '../src/ai/draft-audit.js';

// Deterministic checks for changes that matter most in medicine and that a word-overlap screen cannot see. Fixtures are synthetic
// (no book text); the false-positive measurement on the real generations of 04/10 is recorded in validation.md.

const segment = (text, pageIndex = 5) => ({ pageIndex, text });
const issues = (findings) => findings.map((f) => f.issue);

// An English source long enough for the language detector, with the anchors a faithful Portuguese sentence shares with it.
const SOURCE_EN = segment([
  'The nephron is the functional unit of the kidney and it is the structure that is responsible for the formation of the urine in the body.',
  'Glomerular filtration occurs only through the endothelium, the basement membrane and the epithelium of the glomerular capillaries in the nephron.',
  'The glomerular filtration rate is about 125 mL/min and the drug is given at 5 mg per dose, which is the amount that is approved for the patient.',
  'Plasma proteins can be filtered when the filtration barrier is damaged, and this is the reason why proteinuria is a sign of glomerular disease.',
].join(' '));

// Portuguese draft sentences, long enough overall to be detected as Portuguese.
const DRAFT_BASE = [
  'O néfron é a unidade funcional do rim e é a estrutura responsável pela formação da urina no corpo humano, como mostra o texto.',
  'A filtração glomerular ocorre apenas pelo endotélio, pela membrana basal e pelo epitélio dos capilares glomerulares no néfron.',
  'A taxa de filtração glomerular é de cerca de 125 mL/min e o fármaco é dado na dose de 5 mg, que é a quantidade aprovada para o paciente.',
  'As proteínas plasmáticas podem ser filtradas quando a barreira de filtração está lesada, e por isso a proteinúria é um sinal de doença glomerular.',
];
const draftOf = (sentences) => ({ summary: sentences.join(' '), questions: [] });

test('quantities: units are read by dimension, spelled-out units and "mm Hg" included', () => {
  const found = quantitiesIn('Dose de 5 mg, 0,5 miligramas, 45 mm Hg, pores de 70–100 nanômetros e 125 mL/min.');
  assert.deepEqual(found.map((q) => `${q.value} ${q.unit}`), ['5 mg', '0.5 mg', '45 mmhg', '70 nm', '100 nm', '125 ml/min']);
});

test('UNIT_MISMATCH: the same value given in another unit of the SAME dimension is a HIGH finding', () => {
  const swapped = DRAFT_BASE.map((s) => s.replace('5 mg', '5 g'));
  const findings = auditRisk(draftOf(swapped), { segments: [SOURCE_EN] });
  const unit = findings.filter((f) => f.issue === 'UNIT_MISMATCH');
  assert.equal(unit.length, 1);
  assert.equal(unit[0].severity, 'HIGH');
  assert.equal(unit[0].scope, 'summary');
  assert.match(unit[0].sourceEvidence, /5 mg per dose/);
  assert.match(unit[0].repair, /mg/);
});

test('UNIT_MISMATCH: pressure and volume swaps are caught too, in a question answer and explanation', () => {
  const source = segment('The net filtration pressure is 16 mm Hg and the patient received 250 mL of saline during the first hour of treatment in the ward.');
  const draft = { summary: 'Texto.', questions: [{ question: 'Qual a pressão?', answer: 'A pressão é de 16 kPa.', explanation: 'Foram dados 250 L de solução.' }] };
  const found = auditRisk(draft, { segments: [source] }).filter((f) => f.issue === 'UNIT_MISMATCH');
  assert.equal(found.length, 2);
  assert.ok(found.every((f) => f.scope === 'question:0'));
});

test('UNIT_MISMATCH does not fire for a derived value (another dimension), a value the source never gives, or the right unit', () => {
  const source = segment('The inulin concentration in urine is 100 mg/mL and the urine flow is 1 mL/min, with a plasma concentration of 1 mg/mL in this experiment.');
  const derived = { summary: 'A depuração é de 100 mL/min.', questions: [] }; // computed from the source, not stated in it
  assert.deepEqual(issues(auditRisk(derived, { segments: [source] })), []);
  const invented = { summary: 'A dose é de 77 mg por dia.', questions: [] }; // that is draft-audit.js's unsupported-value rule, not this one
  assert.deepEqual(issues(auditRisk(invented, { segments: [source] })), []);
  assert.deepEqual(issues(auditRisk({ summary: 'A urina tem 100 mg/mL.', questions: [] }, { segments: [source] })), []);
});

test('QUALIFIER_ADDED: an absolute the source does not use ("sempre") is flagged on a sentence that can be paired', () => {
  const stronger = DRAFT_BASE.map((s) => s.replace('podem ser filtradas', 'sempre são filtradas'));
  const findings = auditRisk(draftOf(stronger), { segments: [SOURCE_EN] });
  // the sentence also lost its "podem" (can), which is the other half of the same strengthening
  assert.deepEqual(issues(findings).sort(), ['QUALIFIER_ADDED', 'QUALIFIER_LOST']);
  assert.ok(findings.every((f) => f.severity === 'MEDIUM'));
});

test('QUALIFIER_LOST: "only" and "can" in the source that vanish from the paired sentence are flagged; a faithful draft is not', () => {
  assert.deepEqual(issues(auditRisk(draftOf(DRAFT_BASE), { segments: [SOURCE_EN] })), [], 'faithful draft: zero findings');
  const lostOnly = DRAFT_BASE.map((s) => s.replace('ocorre apenas pelo', 'ocorre pelo'));
  assert.deepEqual(issues(auditRisk(draftOf(lostOnly), { segments: [SOURCE_EN] })), ['QUALIFIER_LOST']);
  const lostCan = DRAFT_BASE.map((s) => s.replace('podem ser filtradas', 'são filtradas'));
  assert.deepEqual(issues(auditRisk(draftOf(lostCan), { segments: [SOURCE_EN] })), ['QUALIFIER_LOST']);
});

test('a sentence that cannot be paired with confidence is NOT judged (silence means "not checked")', () => {
  const unrelated = DRAFT_BASE.map((s) => (s.startsWith('A filtração glomerular ocorre apenas') ? 'Esta frase sempre fala de algo bem diferente do trecho.' : s));
  assert.deepEqual(issues(auditRisk(draftOf(unrelated), { segments: [SOURCE_EN] })), []);
});

test('same language works the same way (pt source, pt draft)', () => {
  const source = segment('A filtração glomerular ocorre apenas pelo endotélio, pela membrana basal e pelo epitélio dos capilares glomerulares no néfron, e esta é a estrutura responsável pela formação da urina no corpo humano, como mostra o texto de origem desta aula, que foi escrito para os estudantes de medicina do primeiro ano da faculdade e que serve para o estudo da fisiologia renal.');
  const lost = { summary: 'A filtração glomerular ocorre pelo endotélio, pela membrana basal e pelo epitélio dos capilares glomerulares no néfron, e esta é a estrutura responsável pela formação da urina no corpo humano, como mostra o texto desta aula, que foi escrito para os estudantes de medicina do primeiro ano da faculdade e que serve para o estudo da fisiologia renal.', questions: [] };
  assert.deepEqual(issues(auditRisk(lost, { segments: [source] })), ['QUALIFIER_LOST']);
});

test('NEGATION_LOST / NEGATION_ADDED: a contraindication that reads as an indication (and the reverse) is HIGH; the faithful draft is clean', () => {
  const tail = ', e esta é a conduta recomendada pelo texto de origem desta aula, que foi escrito para os estudantes de medicina do primeiro ano da faculdade e que serve para o estudo da farmacologia clínica.';
  const sentence = (neg) => `A metformina ${neg}deve ser iniciada quando a filtração glomerular estiver reduzida em pacientes com insuficiência renal grave${tail}`;
  const run = (src, dst) => auditRisk({ summary: sentence(dst), questions: [] }, { segments: [segment(sentence(src))] });
  assert.deepEqual(issues(run('não ', 'não ')), [], 'faithful: zero findings');
  const lost = run('não ', '');
  assert.deepEqual(issues(lost), ['NEGATION_LOST']);
  assert.equal(lost[0].severity, 'HIGH');
  const added = run('', 'não ');
  assert.deepEqual(issues(added), ['NEGATION_ADDED']);
  assert.equal(added[0].severity, 'HIGH');
  // a word-level signal: shown (HIGH, so the student must decide) but it never starts an automatic repair by itself
  const audit = auditDraft({ summary: sentence(''), questions: [] }, { segments: [segment(sentence('não '))] });
  assert.ok(audit.findings.some((f) => f.issue === 'NEGATION_LOST' && f.severity === 'HIGH' && f.blocksRepair === false));
  assert.equal(audit.result, 'PASS');
});

test('NEGATION_LOST is judged on the sentence itself: another negation in a neighbouring sentence does not hide it', () => {
  const tail = ', e esta é a conduta recomendada pelo texto de origem desta aula, que foi escrito para os estudantes de medicina do primeiro ano da faculdade e que serve para o estudo da farmacologia clínica.';
  const s = (neg) => `A metformina ${neg}reduz a produção hepática de glicose quando a filtração glomerular estiver reduzida em pacientes com insuficiência renal grave${tail}`;
  const neighbour = ' O fármaco não é metabolizado pelo fígado e não é eliminado na bile, conforme descrito na página do texto de origem para os estudantes.';
  const found = auditRisk({ summary: s('') + neighbour, questions: [] }, { segments: [segment(s('não '))] });
  assert.ok(issues(found).includes('NEGATION_LOST'));
});

test('negation-like verbs have legitimate paraphrases: "bloqueia" -> "inibe" and "evita" -> "previne" are not a flipped negation', () => {
  const tail = ', e esta é a conduta recomendada pelo texto de origem desta aula, que foi escrito para os estudantes de medicina do primeiro ano da faculdade e que serve para o estudo da farmacologia clínica.';
  const s = (verb) => `O fármaco ${verb} a produção hepática de glicose quando a filtração glomerular estiver reduzida em pacientes com insuficiência renal grave${tail}`;
  assert.deepEqual(issues(auditRisk({ summary: s('inibe'), questions: [] }, { segments: [segment(s('bloqueia'))] })), []);
  assert.deepEqual(issues(auditRisk({ summary: s('previne'), questions: [] }, { segments: [segment(s('evita'))] })), []);
});

test('the checks run inside auditDraft, so the reviewer, the repair step and "Reauditar" all see them', () => {
  const swapped = DRAFT_BASE.map((s) => s.replace('5 mg', '5 g'));
  const audit = auditDraft(draftOf(swapped), { segments: [SOURCE_EN] });
  assert.ok(audit.findings.some((f) => f.issue === 'UNIT_MISMATCH' && f.severity === 'HIGH'));
  assert.equal(audit.result, 'REPAIR');
});

test('a qualifier that the source carries in the NEXT sentence is not "added" when the draft folds the two sentences into one', () => {
  const source = segment([
    'The kidneys keep the renal blood flow constant while the arterial pressure varies between eighty and two hundred, which is the autoregulation of the renal circulation in the nephron.',
    'Only when the arterial pressure decreases below eighty does the renal blood flow also decrease, and this is the reason why the regulation of the circulation matters in the kidney.',
    'The nephron is the functional unit of the kidney and it is the structure that is responsible for the formation of the urine in the body of the patient.',
  ].join(' '));
  const folded = { summary: 'Os rins mantêm constante o fluxo sanguíneo renal enquanto a pressão arterial varia entre oitenta e duzentos, e somente abaixo de oitenta o fluxo sanguíneo renal diminui, o que é a autorregulação da circulação renal no néfron. O néfron é a unidade funcional do rim e é a estrutura responsável pela formação da urina no corpo do paciente.', questions: [] };
  assert.deepEqual(issues(auditRisk(folded, { segments: [source] })), []);
});
