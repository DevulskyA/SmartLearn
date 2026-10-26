// CONTENT-QUALITY / i18n slice 2: the student-visible error sentences of the draft editing and acceptance paths, as a stable CODE + PARAMETERS.
//
// An API error stays {code, field, message}; when its sentence is one of the table below it also carries `msg: { code, params }`.
// The client turns `msg.code` into the student's language with the catalog key `api.draft.<CODE>` (src/api-client.js) and uses
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
};

export const DRAFT_ERROR_MESSAGE_CODES = Object.freeze(Object.keys(TEXT));

/** Reserve text of one message. */
export const draftMessageText = (code, params = {}) => TEXT[code](params);

/** A sentence for DraftError / AcceptDraftError: carries its code and params next to the Portuguese text. */
export function dm(code, params = {}) {
  if (!Object.hasOwn(TEXT, code)) throw new Error(`unknown draft error message code ${code}`);
  return { code, params, text: TEXT[code](params) };
}

/** Constructor helper of the two error classes: a plain string stays a plain string; a dm() object gives its text and its `msg`. */
export function splitMessage(message) {
  return typeof message === 'object' && message !== null && typeof message.text === 'string'
    ? { text: message.text, msg: { code: message.code, params: message.params } }
    : { text: message, msg: undefined };
}
