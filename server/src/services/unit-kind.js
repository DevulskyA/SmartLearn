// FRONT MATTER FILTER (found on the real Costanzo): indexing a whole book is legitimate, generating study material from its
// copyright page, dedication or answer key is not. Every proposal is classified; only CONTENT is offered to the model.
// Classification looks at the unit's TITLE (English, Portuguese and Spanish editorial vocabulary, anchored so that a content
// title merely containing a word such as "summary" is not misread) and, as a structural fallback for untitled text,
// at editorial markers inside a SHORT text (a copyright notice, an ISBN, "all rights reserved"). Pure function.

export const UNIT_KIND = Object.freeze({
  CONTENT: 'CONTENT',
  FRONT_MATTER: 'FRONT_MATTER',
  COPYRIGHT: 'COPYRIGHT',
  DEDICATION: 'DEDICATION',
  PREFACE: 'PREFACE',
  ACKNOWLEDGMENTS: 'ACKNOWLEDGMENTS',
  SUMMARY: 'SUMMARY',
  EXERCISE: 'EXERCISE',
  ANSWER_KEY: 'ANSWER_KEY',
  REFERENCE: 'REFERENCE',
  APPENDIX: 'APPENDIX',
  OTHER: 'OTHER',
});

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// Order matters: the first rule that matches wins (an answer key is checked before an exercise block).
const TITLE_RULES = [
  [UNIT_KIND.COPYRIGHT, /^(copyright|copyright page|copyright notice|direitos autorais|derechos de autor|creditos|credits|publication data|library of congress|isbn)\b/],
  [UNIT_KIND.DEDICATION, /^(dedication|dedicatoria|dedicatorias)( page| to)?$/],
  [UNIT_KIND.ACKNOWLEDGMENTS, /^(acknowledg(e)?ments?|agradecimentos?|agradecimientos?)( page)?$/],
  [UNIT_KIND.PREFACE, /^(preface|prefacio|foreword|prologo|prologue)( to the \w+ edition)?$/],
  [UNIT_KIND.ANSWER_KEY, /\b(answers?|answer key|gabarito|respostas?|respuestas?|solutions?|solucoes)\s*$|^(answers?|answer key|gabarito|respostas?|respuestas?)\b/],
  [UNIT_KIND.EXERCISE, /^(challenge yourself|review questions?|practice (questions?|problems?|exercises?)|self[- ]?(test|assessment)|quiz|exercises?|exercicios?|questoes|questions|problemas? (de pratica|propuestos)|test yourself|study questions?)\b/],
  [UNIT_KIND.SUMMARY, /^((chapter|section|unit) )?(summary|key (points|concepts|terms)|resumo( do capitulo)?|resumen|sumario do capitulo)$/],
  [UNIT_KIND.REFERENCE, /^(references?|bibliograph\w*|further reading|suggested readings?|referencias?|leituras? (adicionais|recomendadas)|index|indice remissivo|glossary|glossario|abbreviations?)$/],
  [UNIT_KIND.APPENDIX, /^(appendix|appendices|apendices?|anexos?|apendice)\b/],
  [UNIT_KIND.FRONT_MATTER, /^(title page|half[- ]?title|cover|front matter|table of contents|contents|sumario|indice|about the authors?|about this book|list of contributors|contributors|series (page|editors?)|editorial board|sobre (o|os) autor(es)?|abbreviations and symbols)\b/],
];

const EDITORIAL_MARKERS = /(all rights reserved|todos os direitos reservados|todos los derechos reservados|\bisbn\b|library of congress|printed in the united states|^\s*©|\bcopyright\s+©|\bcopyright\s+\d{4}|permission (is|was) (not )?granted|reproduced in any form)/i;
const SHORT_TEXT_CHARS = 2500;

/**
 * @param {string|null} title the unit title
 * @param {string} [text] the unit's source text, used only when the title says nothing
 * @returns {{kind: string, generatable: boolean, reason: string}}
 */
export function classifyUnit(title, text = '') {
  const parts = String(title ?? '').split(' · ').map(norm).filter((p) => p.length > 0 && p !== '…');
  if (parts.length > 0) {
    const kinds = parts.map((part) => {
      for (const [kind, re] of TITLE_RULES) if (re.test(part)) return kind;
      return UNIT_KIND.CONTENT;
    });
    // A merged unit ("Vitamins · Calcium", "Menopause · Summary") that carries any real content stays content.
    if (kinds.includes(UNIT_KIND.CONTENT)) return verdict(UNIT_KIND.CONTENT, 'title');
    return verdict(kinds[0], 'title');
  }
  const body = String(text ?? '');
  if (body.length <= SHORT_TEXT_CHARS && EDITORIAL_MARKERS.test(body)) return verdict(UNIT_KIND.COPYRIGHT, 'editorial-markers');
  return verdict(UNIT_KIND.CONTENT, 'default');
}

/**
 * The kind a stored proposal really has. Proposals created before classification existed carry the column default
 * ('CONTENT') even when they are a copyright page: those (no spans_json) are classified by their title on read, so an old
 * proposal is not a loophole around the front-matter filter.
 */
export function effectiveKind(row) {
  if (row.kind && row.kind !== UNIT_KIND.CONTENT) return row.kind;
  if (!row.spans_json) return classifyUnit(row.title).kind;
  return UNIT_KIND.CONTENT;
}

function verdict(kind, reason) {
  return { kind, generatable: kind === UNIT_KIND.CONTENT, reason };
}
