// i18n slices 2-4: the student-visible error sentences of the draft editing and acceptance paths, subjects, lessons, exercises, attempts and reviews, as a stable CODE + PARAMETERS.
//
// An API error stays {code, field, message}; when its sentence is one of the table below it also carries `msg: { code, params }`.
// The client turns `msg.code` into the student's language with the catalog key `api.msg.<CODE>` (src/api-client.js) and uses
// `message` (the same sentence in Portuguese, the RESERVE) for a code it does not know, so older clients and text-only consumers
// keep working. Deleting the reserve text is a LATER slice. Params are strings or numbers only (they travel as JSON).
// Not in this table yet: the dynamic sentences (refsMessage, FINDINGS_UNRESOLVED, ENTITY_CONFLICT "what"), provider/ops errors, developer-facing ones.

const TEXT = {
  DRAFT_NOT_FOUND: () => 'Rascunho não encontrado.',
  PROPOSAL_NOT_FOUND: () => 'Proposta não encontrada.',
  SOURCE_PROPOSAL_NOT_FOUND: () => 'Proposta de origem não encontrada.',
  QUESTION_NOT_FOUND: () => 'Questão não encontrada.',
  DRAFT_STATE_NOT_EDITABLE: ({ status }) => `Rascunho no estado ${status} não pode ser editado.`,
  DRAFT_STATE_NOT_ACCEPTABLE: ({ status }) => `Rascunho no estado ${status} não pode ser aceito.`,
  SUMMARY_REQUIRED: () => 'Informe o texto do resumo.',
  QUESTION_STATE_INVALID: () => 'Estado de questão inválido.',
  CITATION_OUT_OF_RANGE: () => 'A citação da questão aponta para uma página fora do trecho da fonte.',
  LAST_QUESTION_REQUIRED: () => 'A aula precisa manter ao menos uma questão.',
  DRAFT_CHANGED_REORDER: () => 'O rascunho foi alterado desde a última leitura. Recarregue e reordene de novo.',
  ORDER_INVALID: () => 'A ordem deve listar exatamente as questões atuais, cada uma uma vez.',
  REJECTED_QUESTIONS_REPLACE: () => 'Há questões rejeitadas: altere a lista por questão (editar ou excluir), não substituindo todas de uma vez.',
  ACCEPT_REVISION_CONFLICT: () => 'O rascunho foi editado desde a última leitura. Recarregue e revise a versão atual antes de aceitar.',
  STUDY_DATE_INVALID: () => 'Informe uma data de estudo válida (YYYY-MM-DD).',
  SOURCE_CHANGED_SINCE_DRAFT: () => 'O texto da fonte mudou depois que este rascunho foi gerado (a fonte foi extraída de novo). Gere o rascunho novamente a partir do texto atual antes de aceitar.',
  ALL_QUESTIONS_REJECTED: () => 'Todas as questões foram rejeitadas. Mantenha ao menos uma para criar a aula.',
  SUBJECT_NOT_FOUND: () => 'Disciplina não encontrada.',
  UNIT_NOT_FOUND: () => 'Aula não encontrada.',
  SUBJECT_NAME_CONFLICT: () => 'Já existe uma disciplina com esse nome.',
  SUBJECT_ACTIVE_NAME_CONFLICT: () => 'Já existe uma disciplina ativa com esse nome.',
  SUBJECT_ARCHIVED_NAME_CONFLICT: () => 'Já existe uma disciplina arquivada com esse nome. Reative-a em vez de criar uma nova.',
  SUBJECT_NOT_EMPTY: () => 'Não é possível excluir uma disciplina com aulas cadastradas. Arquive-a em vez disso.',
  SUBJECT_REQUIRED: () => 'Informe uma disciplina para esta aula.',
  SUBJECT_INACTIVE: () => 'Selecione uma disciplina ativa.',
  EXERCISE_NOT_FOUND: () => 'Exercício não encontrado.',
  EXERCISE_VERSION_NOT_FOUND: () => 'Versão do exercício não encontrada.',
  QUESTION_REQUIRED: () => 'A questão é obrigatória.',
  COMPETENCY_NOT_FOUND: () => 'Competência não encontrada nesta aula.',
  REVIEW_IN_UNIT_NOT_FOUND: () => 'Revisão não encontrada nesta aula.',
  REVIEW_NOT_FOUND: () => 'Revisão não encontrada.',
  REVIEW_UNIT_NOT_FOUND: () => 'Unidade não encontrada.',
  ATTEMPT_NOT_FOUND: () => 'Tentativa não encontrada.',
  EXERCISE_ARCHIVED: () => 'Exercício arquivado não pode iniciar nova tentativa.',
  ATTEMPT_ALREADY_SUBMITTED: () => 'Esta tentativa já foi finalizada.',
  EXERCISE_NO_HINT: () => 'Este exercício não tem dica cadastrada.',
  EXERCISE_NO_ANSWER: () => 'Este exercício não tem resposta cadastrada.',
  REVIEW_ALREADY_COMPLETED: () => 'Esta revisão já foi concluída. Use a correção explícita para reabrir.',
  REVIEW_NOT_COMPLETED: () => 'Esta revisão ainda não foi concluída.',
};

export const API_ERROR_MESSAGE_CODES = Object.freeze(Object.keys(TEXT));

/** Reserve text of one message. */
export const apiMessageText = (code, params = {}) => TEXT[code](params);

/** A sentence for DraftError / AcceptDraftError: carries its code and params next to the Portuguese text. */
export function dm(code, params = {}) {
  if (!Object.hasOwn(TEXT, code)) throw new Error(`unknown API error message code ${code}`);
  return { code, params, text: TEXT[code](params) };
}

/** When one error class wraps another (LearningUnitError -> AcceptDraftError), keeps the code and params of the inner sentence. */
export const carry = (err) => (err.msg ? { text: err.message, code: err.msg.code, params: err.msg.params } : err.message);

/** Constructor helper of the error classes: a plain string stays a plain string; a dm() object gives its text and its `msg`. */
export function splitMessage(message) {
  return typeof message === 'object' && message !== null && typeof message.text === 'string'
    ? { text: message.text, msg: { code: message.code, params: message.params } }
    : { text: message, msg: undefined };
}
