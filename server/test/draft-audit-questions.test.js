import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditDraft, AUDIT_RESULT } from '../src/ai/draft-audit.js';
import { validateDraft, DraftValidationError } from '../src/ai/draft-schema.js';

// CONTENT-QUALITY CQ-3: questions, answers, explanation.
// The product's questions are open-response (question / answer / hint), self-judged by the student,
// so there are no distractors to grade. What a deterministic screen can honestly check is grounding
// on the CITED pages, answers given away, thin feedback and duplicates. Ambiguity, a trivial detail
// and "two defensible answers" are semantic: the model audit (draft-audit-model.test.js) and the
// human reviewer own those. PASS = "no flag", never "verified".

const SEGMENTS = [
  { pageIndex: 1, text: 'A filtração glomerular é determinada pela pressão hidrostática capilar (60 mmHg), que favorece a filtração, e pela pressão oncótica (32 mmHg) e pela pressão da cápsula de Bowman (18 mmHg), que se opõem. A taxa de filtração glomerular normal é cerca de 125 mL/min.' },
  { pageIndex: 2, text: 'A arteríola aferente dilata e a eferente contrai para aumentar a taxa de filtração glomerular. A angiotensina II contrai preferencialmente a arteríola eferente, mantendo a pressão hidrostática glomerular.' },
];

const GOOD_SUMMARY = 'A filtração glomerular resulta do balanço entre a pressão hidrostática capilar (60 mmHg), que favorece a filtração, e as pressões oncótica (32 mmHg) e da cápsula de Bowman (18 mmHg), que se opõem. A taxa de filtração glomerular normal é cerca de 125 mL/min. A arteríola eferente, contraída pela angiotensina II, mantém a pressão glomerular.';
const EXPLANATION = 'A pressão hidrostática capilar favorece a filtração e as pressões oncótica e da cápsula de Bowman se opõem a ela.';
const Q = (o = {}) => ({ question: 'Qual é a taxa de filtração glomerular normal?', answer: '125 mL/min', explanation: EXPLANATION, hint: null, sourceSpans: [{ pageIndex: 1 }], ...o });
const draftOf = (...questions) => ({ summary: GOOD_SUMMARY, questions });
const audit = (...questions) => auditDraft(draftOf(...questions), { segments: SEGMENTS });
const issues = (r, index) => r.findings.filter((f) => f.scope === `question:${index}`).map((f) => f.issue);

test('valid questions of different kinds raise no flag: simple recall, conceptual and application', () => {
  const recall = Q();
  const concept = Q({ question: 'Que forças se opõem à filtração glomerular?', answer: 'As pressões oncótica e da cápsula de Bowman.', explanation: 'Elas atuam contra a pressão hidrostática capilar, que é a força que favorece a filtração glomerular.' });
  const application = Q({ question: 'Se a arteríola eferente contrai, o que acontece com a taxa de filtração glomerular?', answer: 'Ela aumenta.', explanation: 'A eferente contraída mantém a pressão hidrostática glomerular, o que aumenta a taxa de filtração glomerular.', sourceSpans: [{ pageIndex: 2 }] });
  const r = audit(recall, concept, application);
  assert.deepEqual(r.findings.filter((f) => f.scope.startsWith('question')), []);
  assert.equal(r.result, AUDIT_RESULT.PASS);
});

test('feedback must teach: a bare answer is HIGH; a short answer with no explanation is flagged; with an explanation it is fine', () => {
  assert.ok(issues(audit(Q({ answer: '125', explanation: null })), 0).includes('QUESTION_ANSWER_TOO_THIN'));
  assert.ok(issues(audit(Q({ answer: 'Cerca de 125 mL/min.', explanation: null })), 0).includes('QUESTION_NO_EXPLANATION'));
  assert.deepEqual(issues(audit(Q({ answer: 'Cerca de 125 mL/min.' })), 0), []);
  // an older draft with no explanation field whose answer itself teaches is not penalised
  const teachingAnswer = 'Cerca de 125 mL/min, resultado do balanço entre a pressão hidrostática capilar, que favorece a filtração, e as pressões oncótica e da cápsula de Bowman, que se opõem.';
  assert.deepEqual(issues(audit(Q({ answer: teachingAnswer, explanation: undefined })), 0), []);
});

test('an answer given away in the question or in the hint is HIGH; a partial cue is fine', () => {
  const leakQ = audit(Q({ question: 'A taxa de filtração glomerular normal é 125 mL/min. Qual é a taxa de filtração normal?' }));
  const f = leakQ.findings.find((x) => x.issue === 'QUESTION_ANSWER_LEAKED');
  assert.ok(f, 'leak in the question');
  assert.equal(f.severity, 'HIGH');
  assert.ok(issues(audit(Q({ hint: 'É cerca de 125 mL/min' })), 0).includes('HINT_REVEALS_ANSWER'));
  assert.deepEqual(issues(audit(Q({ hint: 'Pense na ordem de grandeza por minuto.' })), 0), []);
});

test('a fact added by the answer or explanation that the CITED page does not hold is flagged (value HIGH, term MEDIUM)', () => {
  const invented = audit(Q({ explanation: 'Em diabéticos ela é sempre 180 mL/min por hiperfiltração garantida.' }));
  const value = invented.findings.find((f) => f.issue === 'QUESTION_UNSUPPORTED_VALUE');
  assert.ok(value);
  assert.equal(value.severity, 'HIGH');
  assert.match(value.generatedClaim, /180/);
  assert.ok(value.sourceEvidence.length > 0);
  const term = invented.findings.find((f) => f.issue === 'QUESTION_UNSUPPORTED_TERM');
  assert.ok(term);
  assert.match(term.generatedClaim, /diab[eé]ticos/i);
  assert.equal(invented.result, AUDIT_RESULT.REPAIR);
  // 60 exists in the source, but on PAGE 1: citing page 2 for it is unsupported
  const wrongPage = audit(Q({ answer: 'Cerca de 60 mmHg.', sourceSpans: [{ pageIndex: 2 }] }));
  assert.ok(issues(wrongPage, 0).includes('QUESTION_UNSUPPORTED_VALUE'), 'support is judged on the cited pages, not on the whole source');
});

test('an answer with little lexical footing on the cited page is flagged for verification; the right page clears it', () => {
  const q = { question: 'O que a angiotensina II faz?', answer: 'A angiotensina II contrai a arteríola eferente.', explanation: 'Isso mantém a pressão glomerular e aumenta a filtração.' };
  assert.ok(issues(audit(Q({ ...q, sourceSpans: [{ pageIndex: 1 }] })), 0).includes('QUESTION_LOW_SOURCE_SUPPORT'));
  assert.deepEqual(issues(audit(Q({ ...q, sourceSpans: [{ pageIndex: 2 }] })), 0), []);
});

test('duplicate questions are flagged on the second; a verbatim copy of the source is only advisory (LOW) and never blocks', () => {
  assert.ok(issues(audit(Q(), Q()), 1).includes('QUESTION_DUPLICATE'));
  const copy = audit(Q({
    question: 'O que determina a filtração glomerular?',
    answer: 'A filtração glomerular é determinada pela pressão hidrostática capilar (60 mmHg), que favorece a filtração, e pela pressão oncótica (32 mmHg) e pela pressão da cápsula de Bowman (18 mmHg), que se opõem.',
  }));
  const lit = copy.findings.find((f) => f.issue === 'QUESTION_LITERAL_COPY');
  assert.ok(lit);
  assert.equal(lit.severity, 'LOW');
  assert.equal(copy.result, AUDIT_RESULT.PASS, 'advisory only');
});

test('findings of a question are scoped to that question (index) and never touch the summary scope', () => {
  const r = audit(Q(), Q({ answer: '99', explanation: null }));
  assert.ok(r.findings.every((f) => f.scope === 'summary' || /^question:\d+$/.test(f.scope)));
  assert.deepEqual(issues(r, 0), []);
  assert.ok(issues(r, 1).length > 0);
});

test('draft-schema: questionType is optional and clamped to the menu; explanation is optional text; bad shapes are rejected', () => {
  const base = { summary: GOOD_SUMMARY, modelVersion: 'm', promptVersion: '3' };
  const ok = validateDraft({ ...base, questions: [Q({ questionType: 'MECHANISM' }), Q({ questionType: 'NOT_A_TYPE' }), Q({ explanation: null })] }, { segments: SEGMENTS });
  assert.deepEqual(ok.questions.map((q) => q.questionType), ['MECHANISM', null, null]);
  assert.equal(ok.questions[0].explanation, EXPLANATION);
  assert.equal(ok.questions[2].explanation, null);
  assert.throws(() => validateDraft({ ...base, questions: [Q({ explanation: 42 })] }, { segments: SEGMENTS }), DraftValidationError);
  assert.throws(() => validateDraft({ ...base, questions: [Q({ explanation: 'x'.repeat(2001) })] }, { segments: SEGMENTS }), DraftValidationError);
});
