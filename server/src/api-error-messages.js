// i18n slices 2-10: the student-visible error sentences of the draft editing and acceptance paths, subjects, lessons, exercises, attempts, reviews, exams, sources, figures, generation jobs and import previews, as a stable CODE + PARAMETERS.
//
// An API error stays {code, field, message}; when its sentence is one of the table below it also carries `msg: { code, params }`.
// The client turns `msg.code` into the student's language with the catalog key `api.msg.<CODE>` (src/api-client.js) and uses
// `message` (the same sentence in Portuguese, the RESERVE) for a code it does not know, so older clients and text-only consumers
// keep working. Deleting the reserve text is a LATER slice. Params are strings or numbers only (they travel as JSON).
// Not in this table: developer-facing field validations (names of API fields) and the model-facing prompts.

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
  EXAM_NOT_FOUND: () => 'Prova não encontrada.',
  EXAM_UNIT_NO_QUESTIONS: () => 'Esta aula ainda não tem exercícios para uma prova.',
  EXAM_SUBJECT_NO_QUESTIONS: () => 'Esta disciplina ainda não tem exercícios para uma prova.',
  EXAM_ALREADY_SUBMITTED: () => 'A prova já foi submetida: as respostas não podem mais ser alteradas.',
  EXAM_ITEM_NOT_FOUND: () => 'Questão da prova não encontrada.',
  EXAM_SUBMIT_BEFORE_CORRECT: () => 'Submeta a prova antes de corrigir.',
  EXAM_CORRECTION_DONE: () => 'A correção desta prova já foi concluída.',
  EXAM_SUBMIT_BEFORE_FINISH: () => 'Submeta a prova antes de concluir a correção.',
  SOURCE_NOT_FOUND: () => 'Fonte não encontrada.',
  SOURCE_FILE_MISSING: () => 'O arquivo original desta fonte não foi encontrado no armazenamento.',
  SOURCE_FILE_MISSING_NOTHING_CHANGED: () => 'O arquivo original desta fonte não foi encontrado no armazenamento. Nada foi extraído nem alterado.',
  SOURCE_INTEGRITY_FAILED: () => 'O arquivo armazenado desta fonte não confere mais com o que foi enviado.',
  SOURCE_FILE_EMPTY: () => 'Arquivo vazio ou inválido.',
  SOURCE_NOT_PDF_TYPE: () => 'Apenas arquivos PDF são aceitos.',
  SOURCE_NOT_VALID_PDF: () => 'O conteúdo do arquivo não é um PDF válido.',
  SOURCE_ENCRYPTED: () => 'PDFs criptografados não são suportados.',
  SOURCE_QUOTA_EXCEEDED: () => 'Cota de armazenamento de fontes excedida.',
  PROPOSAL_SOURCE_NOT_EXTRACTED: () => 'A fonte precisa ser extraída com sucesso antes de gerar propostas.',
  PROPOSAL_NO_USABLE_PAGE: () => 'A fonte não tem nenhuma página com texto utilizável.',
  IMAGE_ALT_REQUIRED: () => 'O texto alternativo é obrigatório: descreva o que a imagem mostra.',
  IMAGE_NONE_SENT: () => 'Nenhuma imagem enviada.',
  IMAGE_TOO_LARGE: () => 'A imagem é grande demais.',
  IMAGE_NOT_VALID: () => 'O arquivo não é uma imagem PNG, JPEG ou WebP válida.',
  IMAGE_USE_SUPPORTED: () => 'Use uma imagem PNG, JPEG ou WebP.',
  IMAGE_ANIMATED: () => 'Imagens animadas não são aceitas.',
  IMAGE_DIMENSIONS_INVALID: () => 'Dimensões da imagem inválidas.',
  IMAGE_UNREADABLE: () => 'Não foi possível ler a imagem (arquivo corrompido).',
  CROP_RECT_OUTSIDE: () => 'O retângulo do recorte precisa estar dentro da página.',
  CROP_ROTATION_INVALID: () => 'Rotação inválida.',
  CROP_SOURCE_INVALID: () => 'Fonte inválida.',
  CROP_PAGE_MISSING: () => 'Página inexistente na fonte.',
  IMAGE_QUOTA_EXCEEDED: () => 'Limite de armazenamento de imagens atingido.',
  FIGURE_NOT_FOUND: () => 'Figura não encontrada.',
  FIGURE_FILE_MISSING: () => 'O arquivo da figura não está disponível.',
  FIGURE_INTEGRITY_FAILED: () => 'O arquivo da figura não confere com o registro.',
  FIGURE_IN_USE: () => 'Esta figura ainda aparece em um resumo. Remova-a do texto antes de excluí-la.',
  JOB_NOT_FOUND: () => 'Geração não encontrada.',
  JOB_SCOPE_CHANGED_PROPOSAL: () => 'O trecho aprovado mudou desde que esta geração foi criada. Crie uma nova.',
  JOB_SCOPE_CHANGED_TEXT: () => 'O texto do trecho aprovado mudou desde que esta geração foi criada. Crie uma nova.',
  JOB_STATE_CHANGED: () => 'A geração mudou de estado ao mesmo tempo.',
  IMPORT_PREVIEW_NOT_FOUND: () => 'Prévia de importação não encontrada.',
  IMPORT_PREVIEW_EXPIRED: () => 'Prévia de importação expirada. Envie o arquivo novamente.',
  IMPORT_PREVIEW_TAMPERED: () => 'O arquivo enviado não corresponde à prévia original.',
  TOPIC_SOURCE_NOT_EXTRACTED: () => 'A fonte precisa ser extraída com sucesso antes de buscar um assunto.',
  TOPIC_QUERY_TOO_SHORT: () => 'Informe ao menos duas letras do assunto.',
  SECTION_NOT_FOUND: () => 'Seção não encontrada neste documento.',
  SECTION_NO_USABLE_TEXT: () => 'Esta seção não tem texto utilizável.',
  PAGE_RANGE_REVERSED: () => 'A página final vem antes da inicial.',
  PAGE_RANGE_NO_TEXT: () => 'Nenhuma página com texto neste intervalo.',
  OFFSET_START_OUTSIDE: () => 'Posição inicial fora da página.',
  OFFSET_END_OUTSIDE: () => 'Posição final fora da página.',
  RANGE_NO_TEXT: () => 'O intervalo escolhido não contém texto.',
  PROPOSAL_TITLE_EMPTY: () => 'O título não pode ser vazio.',
  DRAFT_NO_USABLE_TEXT: () => 'Nenhuma página deste trecho tem texto utilizável (vazia ou ilegível na extração), então não há o que gerar. Nada foi enviado ao modelo.',
  GENERATION_CANCELLED_BEFORE_CALL: () => 'A geração foi interrompida antes da chamada ao provedor. Nada foi enviado.',
  GENERATION_CANCELLED_NO_DRAFT: () => 'A geração foi interrompida; nenhum rascunho foi salvo.',
  PROVIDER_UNEXPECTED_FAILURE: () => 'O provedor falhou de forma inesperada. Nada foi salvo.',
  FINDINGS_UNRESOLVED: ({ questions, summary }) => `Não dá para aceitar ainda. Questões com ponto crítico ainda sem decisão sua: ${questions}. Pontos críticos no resumo ainda não conferidos: ${summary}. Confira na fonte e aceite ou rejeite cada um.`,
  FIGURES_NOT_USABLE: ({ otherSource, missing }) => `O resumo aponta para figuras que não podem ser usadas aqui. De outra fonte: ${otherSource}. Inexistentes ou que não são suas: ${missing}.`,
  SUMMARY_CHANGED_SINCE_READ: () => 'O resumo foi alterado desde a última leitura. Recarregue e revise a versão atual.',
  QUESTION_CHANGED_SINCE_READ: () => 'A questão foi alterada desde a última leitura. Recarregue e revise a versão atual.',
  EVIDENCE_NOT_FOUND: () => 'Evidência não encontrada.',
  DATE_INVALID: () => 'Data inválida (use AAAA-MM-DD).',
  CODEX_CONSENT_MISSING: () => 'O provedor CODEX está configurado, mas falta o consentimento explícito (SMARTLEARN_AI_CONSENT=true). Nenhum conteúdo substituto foi gerado.',
  PROVIDER_UNKNOWN: ({ provider }) => `Provedor de IA desconhecido: ${provider}.`,
  PROVIDER_MISSING_SETUP: ({ provider }) => `O provedor ${provider} está configurado, mas faltam credencial, modelo, consentimento ou teto de orçamento. Nenhum conteúdo substituto foi gerado.`,
  PROPOSAL_NOT_GENERATABLE: ({ kind }) => `Este trecho (${kind}) não é conteúdo de estudo e não gera rascunho. Nada foi enviado ao modelo.`,
  PROPOSAL_INPUT_TOO_LARGE: ({ chars, max }) => `Este trecho tem texto demais para gerar um rascunho de uma vez (${chars} de ${max} caracteres). Isso só acontece com uma única página muito densa: use um material com menos texto por página ou envie-o de novo em partes.`,
  TIMEOUT_EXCEEDED: () => 'Tempo limite excedido.',
  IMPORT_TOO_LARGE: () => 'A importação excede o limite de capacidade configurado.',
  RESTORE_TOO_LARGE: () => 'A restauração excede o limite de capacidade configurado.',
  ATTEMPT_ID_NOT_FOUND: ({ attemptId }) => `Tentativa ${attemptId} não encontrada.`,
  ATTEMPT_OTHER_UNIT: ({ attemptId }) => `Tentativa ${attemptId} pertence a outra aula.`,
  ATTEMPT_NOT_SUBMITTED: ({ attemptId }) => `Tentativa ${attemptId} ainda não foi finalizada.`,
  ATTEMPT_IN_REVIEW: ({ attemptId }) => `Tentativa ${attemptId} já pertence a uma revisão.`,
  ATTEMPT_IN_OTHER_EVIDENCE: ({ attemptId }) => `Tentativa ${attemptId} já está vinculada a outra evidência.`,
  EXAM_INCOMPLETE_ONE: () => 'Falta corrigir 1 questão antes de concluir.',
  EXAM_INCOMPLETE_OTHER: ({ pending }) => `Falta corrigir ${pending} questões antes de concluir.`,
  SOURCE_INTEGRITY_FAILED_NOTHING_CHANGED: () => 'O arquivo armazenado desta fonte não confere mais com o que foi enviado (tamanho/checksum). Nada foi extraído nem alterado; restaure o arquivo original ou envie o PDF novamente.',
  SOURCE_FILE_TOO_LARGE: ({ bytes }) => `Arquivo excede o limite de ${bytes} bytes.`,
  TEXT_TOO_LONG: ({ max }) => `Texto longo demais (máximo ${max} caracteres).`,
  BUDGET_EXCEEDED_PER_JOB: ({ units }) => `Esta geração (estimada em ${units}) excede o limite por geração disponível. Nenhuma chamada foi feita e nada foi debitado.`,
  BUDGET_EXCEEDED_WEEKLY: ({ units }) => `Esta geração (estimada em ${units}) excede o limite semanal disponível. Nenhuma chamada foi feita e nada foi debitado.`,
  BUDGET_EXCEEDED_MONTHLY: ({ units }) => `Esta geração (estimada em ${units}) excede o limite mensal disponível. Nenhuma chamada foi feita e nada foi debitado.`,
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
