import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditDraft } from '../src/ai/draft-audit.js';
import { detectLanguage, differentLanguages } from '../src/ai/language-detect.js';

const EN_SOURCE = [{
  pageIndex: 1,
  text: 'Glomerular filtration is the first step in the formation of urine. The glomerular filtration rate (GFR) is about 125 mL/min. '
    + 'The fluid that is filtered into Bowman space is similar to interstitial fluid and contains no proteins and no blood cells. '
    + 'The basement membrane does not permit filtration of plasma proteins and is the most significant barrier of the capillary wall. '
    + 'Inulin is freely filtered and is neither reabsorbed nor secreted, so its clearance equals the GFR. The filtration fraction is 0.20.',
}];

const PT_FAITHFUL = {
  summary: 'A filtração glomerular é a primeira etapa da formação da urina. A taxa de filtração glomerular é de cerca de 125 mL/min. '
    + 'O líquido filtrado para o espaço de Bowman se parece com o líquido intersticial e não contém proteínas nem células sanguíneas. '
    + 'A membrana basal impede a filtração das proteínas do plasma e é a barreira mais importante da parede do capilar.',
  questions: [{
    question: 'Por que o clearance de inulina mede a taxa de filtração glomerular?',
    answer: 'Porque a inulina é livremente filtrada e não é reabsorvida nem secretada.',
    explanation: 'Toda a inulina filtrada aparece na urina, então a quantidade excretada é igual à filtrada e o clearance corresponde à filtração glomerular.',
    hint: null,
    sourceSpans: [{ pageIndex: 1 }],
  }],
};

const actionable = (r) => r.findings.filter((f) => f.severity !== 'LOW');

test('detectLanguage: English, Portuguese, Spanish and "unknown" for short or ambiguous text', () => {
  assert.equal(detectLanguage(EN_SOURCE[0].text).language, 'en');
  assert.equal(detectLanguage(PT_FAITHFUL.summary).language, 'pt');
  assert.equal(detectLanguage('La filtración glomerular es la primera etapa de la formación de la orina y se produce en los capilares del glomérulo, que son los más permeables del cuerpo humano, por lo que el líquido filtrado pasa al espacio de Bowman.').language, 'es');
  assert.equal(detectLanguage('Filtração glomerular.').language, 'unknown');
  assert.equal(differentLanguages(EN_SOURCE[0].text, PT_FAITHFUL.summary), true);
  assert.equal(differentLanguages(PT_FAITHFUL.summary, PT_FAITHFUL.summary), false);
  assert.equal(differentLanguages('curto', PT_FAITHFUL.summary), false, 'unknown never counts as different');
});

test('EN source + faithful PT paraphrase: translation is NOT reported as an unsupported fact', () => {
  const r = auditDraft(PT_FAITHFUL, { segments: EN_SOURCE });
  assert.deepEqual(actionable(r), []);
  assert.equal(r.result, 'PASS');
  // the skipped comparison is stated, not silent
  assert.ok(r.findings.some((f) => f.issue === 'LEXICAL_CHECK_SKIPPED_CROSS_LANGUAGE' && f.severity === 'LOW'));
});

test('EN source + PT draft with a number the source does not state: still flagged HIGH', () => {
  const invented = { ...PT_FAITHFUL, summary: `${PT_FAITHFUL.summary} A taxa chega a 250 mL/min em adultos saudáveis.` };
  const r = auditDraft(invented, { segments: EN_SOURCE });
  assert.ok(actionable(r).some((f) => f.issue === 'SUMMARY_UNSUPPORTED_VALUE' && f.generatedClaim.includes('250')));
});

test('EN source + PT question that changes a value of the cited page: flagged HIGH', () => {
  const changed = {
    ...PT_FAITHFUL,
    questions: [{ ...PT_FAITHFUL.questions[0], answer: 'A fração de filtração é 0,35.', explanation: 'Valor normal da fração de filtração em adultos.' }],
  };
  const r = auditDraft(changed, { segments: EN_SOURCE });
  assert.ok(actionable(r).some((f) => f.issue === 'QUESTION_UNSUPPORTED_VALUE' && f.scope === 'question:0'));
});

test('language-independent sensors still run across languages: a duplicated question and an answer leaked in the prompt', () => {
  const q = PT_FAITHFUL.questions[0];
  const leaked = { question: 'Qual é a taxa? A taxa é cerca de 125 mL/min', answer: 'cerca de 125 mL/min', explanation: 'Valor normal da filtração glomerular no adulto.', hint: null, sourceSpans: [{ pageIndex: 1 }] };
  const r = auditDraft({ ...PT_FAITHFUL, questions: [q, { ...q }, leaked] }, { segments: EN_SOURCE });
  const issues = actionable(r).map((f) => f.issue);
  assert.ok(issues.includes('QUESTION_DUPLICATE'));
  assert.ok(issues.includes('QUESTION_ANSWER_LEAKED'));
});

test('SAME language: the word-overlap checks are unchanged (a term the source never uses is still flagged)', () => {
  const ptSource = [{ pageIndex: 1, text: 'A filtração glomerular é a primeira etapa da formação da urina e ocorre nos capilares do glomérulo. O líquido filtrado passa ao espaço de Bowman e não contém proteínas nem células sanguíneas. A membrana basal é a barreira mais importante da parede do capilar e impede a passagem das proteínas do plasma para o espaço urinário.' }];
  const draft = {
    summary: 'A filtração glomerular é a primeira etapa da formação da urina e depende da furosemida administrada por via intravenosa para ocorrer nos capilares do glomérulo e no espaço de Bowman do néfron.',
    questions: [{ question: 'Onde ocorre a filtração glomerular?', answer: 'Nos capilares do glomérulo, junto ao espaço de Bowman.', explanation: 'É o primeiro passo da formação da urina, antes da reabsorção.', hint: null, sourceSpans: [{ pageIndex: 1 }] }],
  };
  const r = auditDraft(draft, { segments: ptSource });
  assert.ok(actionable(r).some((f) => f.issue === 'SUMMARY_UNSUPPORTED_TERM' && /furosemida/.test(f.generatedClaim)));
  assert.ok(!r.findings.some((f) => f.issue === 'LEXICAL_CHECK_SKIPPED_CROSS_LANGUAGE'));
});
