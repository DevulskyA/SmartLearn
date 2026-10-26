// CONTENT-QUALITY: the student-visible sentences of the audit findings, as a stable CODE + PARAMETERS.
//
// A finding says WHAT it found with `issue` (already a code) and, for the three sentences it shows, with `messages`:
//   messages: { claim?, evidence?, repair? }, each { code, params }    e.g. repair: { code: 'REPAIR_SUMMARY_UNSUPPORTED_VALUE', params: { value: '777' } }
// The client turns a code into the student's language with the catalog key `lesson.audit.<CODE>` (src/lesson-view-model.js findingText).
//
// RESERVE: the same sentence, in Portuguese, is still written into the old fields (`generatedClaim`, `sourceEvidence`, `repair`) by
// the table below, so a consumer that only reads text, a stored audit and a client that does not know a code keep working unchanged.
// Deleting this table (and keeping only codes) is the LATER slice, once the code path is proven; the model's repair prompt
// (draft-audit-model.js) reads the old fields too, so that slice has to decide what the model is told instead.
// Not a rule: wording here is not covered by AUDIT_RULES_VERSION. Params are strings or numbers only (they travel as JSON).

const TEXT = {
  // --- evidence (sourceEvidence)
  EVIDENCE_SOURCE_PASSAGE: ({ page, text }) => `p. ${page}: ${text}`,
  EVIDENCE_NO_SOURCE_PASSAGE: () => 'Nenhum trecho da fonte trata desse ponto.',
  EVIDENCE_SUMMARY_TERMS_ABSENT: () => 'Nenhuma dessas palavras (nem uma forma próxima) aparece no texto de origem enviado.',
  EVIDENCE_CENTRAL_TERMS_MISSING: ({ terms }) => `Termos centrais da fonte ausentes no resumo: ${terms}.`,
  EVIDENCE_SUMMARY_TOO_THIN: ({ sourceWords, summaryWords }) => `A fonte tem ${sourceWords} palavras; o resumo tem ${summaryWords}.`,
  EVIDENCE_ANSWER_TOO_THIN: () => 'A resposta não traz explicação suficiente para o aluno entender por quê.',
  EVIDENCE_EXPLANATION_MISSING: () => 'Esta questão não tem o "Por quê": o feedback só mostra o gabarito.',
  EVIDENCE_ANSWER_IN_QUESTION: ({ answer }) => `A resposta ("${answer}") já aparece no enunciado.`,
  EVIDENCE_ANSWER_IN_HINT: ({ answer }) => `A dica repete a resposta ("${answer}").`,
  EVIDENCE_HINT_HAS_VALUE: ({ value }) => `A dica traz o valor da resposta (${value}).`,
  EVIDENCE_EXPLANATION_CIRCULAR: () => 'A explicação só repete o que a pergunta e a resposta já dizem: não explica por quê.',
  EVIDENCE_QUESTION_TERMS_ABSENT: () => 'Nenhuma dessas palavras (nem uma forma próxima) aparece na página citada.',
  EVIDENCE_LOW_SOURCE_SUPPORT: ({ supported, total }) => `Só ${supported} de ${total} termos da resposta/explicação aparecem na(s) página(s) citada(s).`,
  EVIDENCE_DUPLICATE_OF: ({ number }) => `Igual à questão ${number}.`,
  EVIDENCE_LITERAL_COPY: () => 'A resposta é um trecho literal da fonte.',
  EVIDENCE_VOLUME_EXPECTED: ({ chars, min, max }) => `Para o tamanho desta fonte (${Number(chars).toLocaleString('pt-BR')} caracteres) o esperado é entre ${min} e ${max} questões.`,
  EVIDENCE_SOURCE_TEXT_THIN: () => 'O texto extraído da fonte é curto, tem páginas sem texto ou parece truncado ou ilegível. A conferência automática só enxerga esse texto.',
  EVIDENCE_LEXICAL_SKIPPED: () => 'A comparação palavra a palavra não vale entre idiomas e foi dispensada. Valores, unidades, páginas citadas, repetições e vazamentos continuam conferidos.',

  // --- claim (generatedClaim), only where it is the audit's own sentence and not the draft's text
  CLAIM_VOLUME_COUNT: ({ count }) => `${count} questão(ões) para uma fonte desse tamanho.`,
  CLAIM_SOURCE_TEXT_STATS: ({ chars, pages }) => `${chars} caracteres de texto em ${pages} página(s) aprovada(s).`,
  CLAIM_LANGUAGES_DIFFER: () => 'A fonte e o rascunho estão em idiomas diferentes.',

  // --- repair (repair)
  REPAIR_SUMMARY_UNSUPPORTED_VALUE: ({ value }) => `O valor ${value} não aparece na fonte. Use o valor que a fonte traz ou remova a afirmação.`,
  REPAIR_SUMMARY_UNSUPPORTED_TERM: () => 'Confirme cada termo na fonte. Se for informação complementar, remova ou marque como tal; se for troca de termo, restaure o termo da fonte.',
  REPAIR_SUMMARY_OMITS_CENTRAL_CONCEPT: () => 'Reescreva abrindo pelo conceito central da fonte; detalhes incidentais vêm depois.',
  REPAIR_SUMMARY_TOO_THIN: () => 'Explique o conceito central e o mecanismo que a fonte descreve, com a terminologia dela.',
  REPAIR_ANSWER_TOO_THIN: () => 'Dê a resposta e explique em 1–3 frases por que ela está certa, com base na página citada.',
  REPAIR_EXPLANATION_MISSING: () => 'Acrescente a explicação (por que está certo) usando apenas o que a página citada diz.',
  REPAIR_ANSWER_LEAKED: () => 'Reescreva o enunciado sem revelar a resposta.',
  REPAIR_HINT_REVEALS_ANSWER: () => 'Uma dica é uma pista parcial (categoria, direção, termo relacionado), nunca a resposta.',
  REPAIR_HINT_REVEALS_VALUE: () => 'Aponte o caminho (categoria, relação, mecanismo), sem citar o valor da resposta.',
  REPAIR_EXPLANATION_CIRCULAR: () => 'Explique o mecanismo, a condição ou a confusão a evitar, usando só o que a página citada diz.',
  REPAIR_QUESTION_UNSUPPORTED_VALUE: ({ value }) => `O valor ${value} não aparece na página citada. Use o valor da fonte, corrija a citação ou remova a afirmação.`,
  REPAIR_QUESTION_UNSUPPORTED_TERM: () => 'Confirme na fonte. Se for informação complementar, remova; se a citação estiver na página errada, corrija-a.',
  REPAIR_LOW_SOURCE_SUPPORT: () => 'Confira se a citação aponta para a página que sustenta a resposta e se a explicação não acrescenta fatos.',
  REPAIR_DUPLICATE: () => 'Remova ou reescreva uma das duas.',
  REPAIR_LITERAL_COPY: () => 'Prefira reformular para testar compreensão, não cópia.',
  REPAIR_VOLUME_TOO_MANY: () => 'Considere remover as questões menos importantes ou repetitivas; nada foi cortado automaticamente.',
  REPAIR_VOLUME_TOO_FEW: () => 'Considere acrescentar questões sobre os conceitos que ficaram sem pergunta.',
  REPAIR_SOURCE_TEXT_ADVICE: () => 'Se o PDF for escaneado ou depender de figuras, leia a fonte original: nenhum ponto sinalizado vale menos aqui. É um aviso, não prova de erro no rascunho.',
  REPAIR_CROSS_LANGUAGE: () => 'O apoio de significado (tradução fiel, mecanismo, qualificadores como "geralmente", "pode", "apenas") depende da auditoria do modelo e da sua leitura da fonte.',
  REPAIR_UNIT_MISMATCH: ({ value, sourceUnit, unit }) => `A fonte traz ${value} em ${sourceUnit}, não em ${unit}. Use a unidade da fonte.`,
  REPAIR_QUALIFIER_LOST: () => 'A fonte restringe esta afirmação (por exemplo "apenas", "geralmente", "pode") e a frase do rascunho não traz a restrição. Sem ela a afirmação fica mais forte do que a fonte.',
  REPAIR_QUALIFIER_ADDED: () => 'A frase do rascunho usa um termo absoluto ("sempre", "nunca", "apenas", "todos") que o trecho correspondente da fonte não usa. Confira se a afirmação não foi exagerada.',
};

export const AUDIT_MESSAGE_CODES = Object.freeze(Object.keys(TEXT));

/** Reserve text of one message, as the old fields carried it. */
export const auditMessageText = (code, params = {}) => TEXT[code](params);

/** A message to put in `generatedClaim` / `sourceEvidence` / `repair` of a finding; `resolveMessages` splits it into text + code. */
export function msg(code, params = {}) {
  if (!Object.hasOwn(TEXT, code)) throw new Error(`unknown audit message code ${code}`);
  return { code, params, text: TEXT[code](params) };
}

const SLOTS = { generatedClaim: 'claim', sourceEvidence: 'evidence', repair: 'repair' };

/**
 * Turns the `msg()` objects of a finding into the contract: the old field keeps the Portuguese text (reserve) and `messages.<slot>` carries
 * the code and params. A field that is plain text (the draft's own sentence, a model's wording) stays as it is. Idempotent.
 */
export function resolveMessages(finding) {
  const resolved = { ...finding };
  const messages = { ...finding.messages };
  for (const [field, slot] of Object.entries(SLOTS)) {
    const value = finding[field];
    if (value && typeof value === 'object') {
      resolved[field] = value.text;
      messages[slot] = { code: value.code, params: value.params };
    }
  }
  return Object.keys(messages).length > 0 ? { ...resolved, messages } : resolved;
}
