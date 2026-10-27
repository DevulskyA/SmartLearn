import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DraftError } from '../src/services/generated-drafts.js';
import { AcceptDraftError } from '../src/services/accept-draft.js';
import { handleError } from '../src/routes/generated-drafts.js';
import { carry, dm, apiMessageText, API_ERROR_MESSAGE_CODES } from '../src/api-error-messages.js';

// Slice 2 of the server-text migration: a draft error keeps {code, field, message} and, for the sentences in the table, adds
// msg: { code, params }. `message` is the same Portuguese sentence as before (reserve), so a text-only consumer sees no change.
// Client side: test/api-error-messages.test.js.

const reply = () => ({ statusCode: 0, status(n) { this.statusCode = n; return this; } });

test('a DraftError built with a dm() sentence keeps the old text in message and exposes its code and params in msg', () => {
  const err = new DraftError('INVALID_STATE', dm('DRAFT_STATE_NOT_EDITABLE', { status: 'ACCEPTED' }));
  assert.equal(err.message, 'Rascunho no estado ACCEPTED não pode ser editado.');
  assert.deepEqual(err.msg, { code: 'DRAFT_STATE_NOT_EDITABLE', params: { status: 'ACCEPTED' } });
  const accept = new AcceptDraftError('NOT_FOUND', dm('DRAFT_NOT_FOUND'), 'draft');
  assert.equal(accept.message, 'Rascunho não encontrado.');
  assert.equal(accept.field, 'draft');
  assert.deepEqual(accept.msg, { code: 'DRAFT_NOT_FOUND', params: {} });
});

test('a plain-string error is unchanged: no msg, same message', () => {
  const err = new DraftError('PROVIDER_ERROR', 'O provedor falhou de forma inesperada. Nada foi salvo.');
  assert.equal(err.message, 'O provedor falhou de forma inesperada. Nada foi salvo.');
  assert.equal(err.msg, undefined);
});

test('the API body carries code, field, message (reserve) and msg; a plain error has no msg key content', () => {
  const r = reply();
  const body = handleError(new DraftError('NOT_FOUND', dm('QUESTION_NOT_FOUND')), r);
  assert.equal(r.statusCode, 404);
  assert.deepEqual(JSON.parse(JSON.stringify(body)), { error: { code: 'NOT_FOUND', message: 'Questão não encontrada.', msg: { code: 'QUESTION_NOT_FOUND', params: {} } } });
  const plain = JSON.parse(JSON.stringify(handleError(new DraftError('CANCELLED', 'A geração foi interrompida.'), reply())));
  assert.deepEqual(plain, { error: { code: 'CANCELLED', message: 'A geração foi interrompida.' } });
});

test('every code in the table builds its reserve text and rejects unknown codes', () => {
  for (const code of API_ERROR_MESSAGE_CODES) assert.equal(typeof dm(code, { status: 'X' }).text, 'string');
  assert.equal(apiMessageText('SUMMARY_REQUIRED'), 'Informe o texto do resumo.');
  assert.throws(() => dm('NOPE'), /unknown API error message code/);
});

test('subject and lesson errors carry code + params with the old text kept, and the route bodies expose msg', async () => {
  const { SubjectError } = await import('../src/services/subjects.js');
  const { LearningUnitError } = await import('../src/services/learning-units.js');
  const subject = new SubjectError('NOT_FOUND', dm('SUBJECT_NOT_FOUND'));
  assert.equal(subject.message, 'Disciplina não encontrada.');
  assert.deepEqual(subject.msg, { code: 'SUBJECT_NOT_FOUND', params: {} });
  const plain = new SubjectError('VALIDATION_FAILED', 'Informe o nome da disciplina.');
  assert.equal(plain.msg, undefined);
  const unit = new LearningUnitError('NOT_FOUND', dm('UNIT_NOT_FOUND'), 'id');
  assert.equal(unit.message, 'Aula não encontrada.');
  assert.equal(unit.field, 'id');
  assert.deepEqual(unit.msg, { code: 'UNIT_NOT_FOUND', params: {} });
});

test('an AcceptDraftError wrapping a LearningUnitError keeps the inner code and params; a plain inner error stays plain', async () => {
  const { LearningUnitError } = await import('../src/services/learning-units.js');
  const inner = new LearningUnitError('SUBJECT_CONFLICT', dm('SUBJECT_ARCHIVED_NAME_CONFLICT'), 'newSubjectName');
  const wrapped = new AcceptDraftError(inner.code, carry(inner), inner.field);
  assert.equal(wrapped.message, inner.message);
  assert.deepEqual(wrapped.msg, { code: 'SUBJECT_ARCHIVED_NAME_CONFLICT', params: {} });
  const plainInner = new LearningUnitError('VALIDATION_FAILED', 'Nome inválido.', 'title');
  const plainWrapped = new AcceptDraftError(plainInner.code, carry(plainInner), plainInner.field);
  assert.equal(plainWrapped.message, 'Nome inválido.');
  assert.equal(plainWrapped.msg, undefined);
});

test('exercise, attempt, review and evidence errors carry code + params with the old text kept; the route bodies expose msg', async () => {
  const { ExerciseError } = await import('../src/services/exercises.js');
  const { AttemptError } = await import('../src/services/attempts.js');
  const { ReviewError } = await import('../src/services/reviews.js');
  const { EvidenceError } = await import('../src/services/evidence.js');
  const cases = [
    [new ExerciseError('NOT_FOUND', dm('EXERCISE_NOT_FOUND')), 'Exercício não encontrado.', 'EXERCISE_NOT_FOUND'],
    [new AttemptError('ALREADY_SUBMITTED', dm('ATTEMPT_ALREADY_SUBMITTED')), 'Esta tentativa já foi finalizada.', 'ATTEMPT_ALREADY_SUBMITTED'],
    [new ReviewError('ALREADY_COMPLETED', dm('REVIEW_ALREADY_COMPLETED')), 'Esta revisão já foi concluída. Use a correção explícita para reabrir.', 'REVIEW_ALREADY_COMPLETED'],
    [new EvidenceError('NOT_FOUND', dm('UNIT_NOT_FOUND'), 'unitId'), 'Aula não encontrada.', 'UNIT_NOT_FOUND'],
  ];
  for (const [err, text, code] of cases) {
    assert.equal(err.message, text);
    assert.deepEqual(err.msg, { code, params: {} });
  }
  assert.equal(new AttemptError('VALIDATION_FAILED', 'confidence deve ser um número entre 0 e 1, ou omitido.', 'confidence').msg, undefined);
});

test('exam, source, proposal and visual-asset errors carry code + params with the old text kept', async () => {
  const { ExamError } = await import('../src/services/exams.js');
  const { SourceError } = await import('../src/services/source-storage.js');
  const { SourceExtractionError } = await import('../src/services/source-extraction.js');
  const { SourceOpeningError } = await import('../src/services/source-openings.js');
  const { ProposalError } = await import('../src/services/content-proposals.js');
  const { VisualAssetError } = await import('../src/services/visual-assets.js');
  const cases = [
    [new ExamError('INVALID_STATE', dm('EXAM_ALREADY_SUBMITTED')), 'A prova já foi submetida: as respostas não podem mais ser alteradas.', 'EXAM_ALREADY_SUBMITTED'],
    [new SourceError('NOT_FOUND', dm('SOURCE_NOT_FOUND')), 'Fonte não encontrada.', 'SOURCE_NOT_FOUND'],
    [new SourceError('ENCRYPTED_FILE_REJECTED', dm('SOURCE_ENCRYPTED'), 'file'), 'PDFs criptografados não são suportados.', 'SOURCE_ENCRYPTED'],
    [new SourceExtractionError('NOT_FOUND', dm('SOURCE_NOT_FOUND')), 'Fonte não encontrada.', 'SOURCE_NOT_FOUND'],
    [new SourceOpeningError('NOT_FOUND', dm('SOURCE_NOT_FOUND')), 'Fonte não encontrada.', 'SOURCE_NOT_FOUND'],
    [new ProposalError('NOT_EXTRACTED', dm('PROPOSAL_NO_USABLE_PAGE')), 'A fonte não tem nenhuma página com texto utilizável.', 'PROPOSAL_NO_USABLE_PAGE'],
    [new VisualAssetError('NOT_FOUND', dm('SOURCE_NOT_FOUND'), 'sourceId'), 'Fonte não encontrada.', 'SOURCE_NOT_FOUND'],
  ];
  for (const [err, text, code] of cases) {
    assert.equal(err.message, text);
    assert.deepEqual(err.msg, { code, params: {} });
  }
  assert.equal(new ProposalError('VALIDATION_FAILED', 'Posição final fora da página.', 'endOffset').msg, undefined);
});

test('figure, generation job and import preview errors carry code + params with the old text kept', async () => {
  const { VisualAssetError } = await import('../src/services/visual-assets.js');
  const { JobError } = await import('../src/services/generation-jobs.js');
  const { ImportError } = await import('../src/services/import-error.js');
  const cases = [
    [new VisualAssetError('NOT_FOUND', dm('FIGURE_NOT_FOUND')), 'Figura não encontrada.', 'FIGURE_NOT_FOUND'],
    [new JobError('NOT_FOUND', dm('JOB_NOT_FOUND')), 'Geração não encontrada.', 'JOB_NOT_FOUND'],
    [new ImportError('PREVIEW_EXPIRED', dm('IMPORT_PREVIEW_EXPIRED')), 'Prévia de importação expirada. Envie o arquivo novamente.', 'IMPORT_PREVIEW_EXPIRED'],
  ];
  for (const [err, text, code] of cases) {
    assert.equal(err.message, text);
    assert.deepEqual(err.msg, { code, params: {} });
  }
  const plain = new ImportError('INVALID_SOURCE', 'Arquivo inválido.', { issues: [1] });
  assert.equal(plain.msg, undefined);
  assert.deepEqual(plain.details, { issues: [1] });
});

test('proposal search/scope and generation errors carry code + params with the old text kept', async () => {
  const { ProposalError } = await import('../src/services/content-proposals.js');
  const cases = [
    [new ProposalError('NOT_FOUND', dm('SECTION_NOT_FOUND'), 'ordinal'), 'Seção não encontrada neste documento.', 'SECTION_NOT_FOUND'],
    [new DraftError('PROVIDER_ERROR', dm('PROVIDER_UNEXPECTED_FAILURE')), 'O provedor falhou de forma inesperada. Nada foi salvo.', 'PROVIDER_UNEXPECTED_FAILURE'],
    [new DraftError('CANCELLED', dm('GENERATION_CANCELLED_NO_DRAFT')), 'A geração foi interrompida; nenhum rascunho foi salvo.', 'GENERATION_CANCELLED_NO_DRAFT'],
  ];
  for (const [err, text, code] of cases) {
    assert.equal(err.message, text);
    assert.deepEqual(err.msg, { code, params: {} });
  }
});

test('dynamic sentences carry their counts and ids as params: findings pending, unusable figures, stale summary/question', async () => {
  const { refsMessage } = await import('../src/services/visual-assets.js');
  const pending = dm('FINDINGS_UNRESOLVED', { questions: 2, summary: 0 });
  assert.match(pending.text, /^Não dá para aceitar ainda\./);
  assert.deepEqual({ code: pending.code, params: pending.params }, { code: 'FINDINGS_UNRESOLVED', params: { questions: 2, summary: 0 } });
  const figures = refsMessage([{ id: 'abcdef123456', reason: 'OTHER_SOURCE' }, { id: '99999999zzzz', reason: 'MISSING' }]);
  assert.equal(figures.code, 'FIGURES_NOT_USABLE');
  assert.deepEqual(figures.params, { otherSource: 'abcdef12…', missing: '99999999…' });
  assert.deepEqual(refsMessage([{ id: 'abcdef123456', reason: 'OTHER_SOURCE' }]).params, { otherSource: 'abcdef12…', missing: '—' });
  assert.equal(dm('SUMMARY_CHANGED_SINCE_READ').text, 'O resumo foi alterado desde a última leitura. Recarregue e revise a versão atual.');
  const err = new DraftError('VALIDATION_FAILED', figures, 'summary');
  assert.equal(err.msg.code, 'FIGURES_NOT_USABLE');
  assert.equal(err.field, 'summary');
});

test('provider/operation, import size and attempt-id sentences carry their params with the old text kept', async () => {
  const { EvidenceError } = await import('../src/services/evidence.js');
  const { ImportError } = await import('../src/services/import-error.js');
  const unknown = new DraftError('UNKNOWN_PROVIDER', dm('PROVIDER_UNKNOWN', { provider: 'xyz' }));
  assert.equal(unknown.message, 'Provedor de IA desconhecido: xyz.');
  assert.deepEqual(unknown.msg, { code: 'PROVIDER_UNKNOWN', params: { provider: 'xyz' } });
  const big = new DraftError('INPUT_TOO_LARGE', dm('PROPOSAL_INPUT_TOO_LARGE', { chars: 90000, max: 60000 }));
  assert.match(big.message, /\(90000 de 60000 caracteres\)/);
  const attempt = new EvidenceError('VALIDATION_FAILED', dm('ATTEMPT_IN_REVIEW', { attemptId: 7 }), 'attemptIds');
  assert.equal(attempt.message, 'Tentativa 7 já pertence a uma revisão.');
  assert.deepEqual(attempt.msg, { code: 'ATTEMPT_IN_REVIEW', params: { attemptId: 7 } });
  const tooLarge = new ImportError('IMPORT_TOO_LARGE', dm('RESTORE_TOO_LARGE'), { rowTotal: 1 });
  assert.equal(tooLarge.message, 'A restauração excede o limite de capacidade configurado.');
  assert.deepEqual(tooLarge.details, { rowTotal: 1 });
});

test('exam completion, upload size, text length and budget sentences carry params; BudgetError keeps its details', async () => {
  const { BudgetError } = await import('../src/services/generation-budget.js');
  assert.equal(dm('EXAM_INCOMPLETE_ONE').text, 'Falta corrigir 1 questão antes de concluir.');
  assert.equal(dm('EXAM_INCOMPLETE_OTHER', { pending: 3 }).text, 'Falta corrigir 3 questões antes de concluir.');
  assert.equal(dm('SOURCE_FILE_TOO_LARGE', { bytes: 1024 }).text, 'Arquivo excede o limite de 1024 bytes.');
  assert.equal(dm('TEXT_TOO_LONG', { max: 500 }).text, 'Texto longo demais (máximo 500 caracteres).');
  const budget = new BudgetError('BUDGET_EXCEEDED', dm('BUDGET_EXCEEDED_WEEKLY', { units: 12 }), { limit: 'WEEKLY', remaining: 3, requested: 12 });
  assert.match(budget.message, /excede o limite semanal disponível/);
  assert.deepEqual(budget.msg, { code: 'BUDGET_EXCEEDED_WEEKLY', params: { units: 12 } });
  assert.equal(budget.limit, 'WEEKLY');
  const wrapped = new DraftError('BUDGET_EXCEEDED', carry(budget));
  assert.deepEqual(wrapped.msg, { code: 'BUDGET_EXCEEDED_WEEKLY', params: { units: 12 } });
  assert.equal(new BudgetError('NOT_FOUND', 'Reserva não encontrada.').msg, undefined);
});
