// CONTENT-QUALITY: a deterministic SCREEN over a generated draft, run after the structural
// validation (draft-schema.js) and before a human reviews it. It is deliberately honest about
// what it is: a high-recall flagger of things a reviewer should look at, not a medical verifier.
// `PASS` means "no flag raised". Semantic judgement (a contradiction, a subtly wrong mechanism)
// is the model auditor's job (live provider only, see draft-audit-model.js) and, in the end,
// the human's — a draft always stays DRAFT until a person accepts it.
//
// Finding shape (one per issue, no decorative score):
//   { issue, severity: 'HIGH'|'MEDIUM'|'LOW', scope: 'summary'|'question:<index>',
//     generatedClaim, sourceEvidence, repair }
// Result: REPAIR when any HIGH or MEDIUM finding exists, else PASS (LOW = advisory only).

export const AUDIT_RESULT = { PASS: 'PASS', REPAIR: 'REPAIR' };

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const tokens = (s) => (String(s).match(/\p{L}+/gu) ?? []).map((w) => ({ raw: w.toLowerCase(), key: norm(w) }));
const stem = (key) => (key.length >= 6 ? key.slice(0, 5) : key);

// Generic connective/academic words a faithful paraphrase may add without adding any fact.
const GENERIC = new Set([
  'importante', 'importantes', 'principal', 'principais', 'fundamental', 'fundamentais', 'geralmente', 'normalmente',
  'resultado', 'resultados', 'processo', 'processos', 'mecanismo', 'mecanismos', 'consequentemente', 'portanto',
  'entretanto', 'conforme', 'segundo', 'especialmente', 'diretamente', 'indiretamente', 'aproximadamente',
  'relacionado', 'relacionada', 'responsavel', 'responsaveis', 'necessario', 'necessaria', 'presente', 'presentes',
  'contudo', 'enquanto', 'durante', 'quando', 'atraves', 'resumindo', 'considerando', 'apresenta', 'representa',
  'depende', 'dependem', 'determina', 'determinam', 'consiste', 'permite', 'permitindo', 'exemplo', 'situacao',
  'caracteriza', 'caracterizada', 'caracterizado', 'refere', 'utilizado', 'utilizada', 'observado', 'observada',
]);

function numbersIn(text) {
  const out = [];
  for (const m of String(text).matchAll(/\d+(?:[.,]\d+)?/g)) {
    const key = m[0].replace(',', '.');
    out.push({ raw: m[0], key, index: m.index });
  }
  return out;
}

const sentencesOf = (text) => String(text).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

function sourceStemSet(segments) {
  const set = new Set();
  for (const seg of segments) for (const t of tokens(seg.text)) set.add(stem(t.key));
  return set;
}

function overlapScore(a, b) {
  const sa = new Set(tokens(a).map((t) => stem(t.key)).filter((k) => k.length >= 4));
  let n = 0;
  for (const t of tokens(b)) if (sa.has(stem(t.key)) && stem(t.key).length >= 4) n += 1;
  return n;
}

/** The source sentence that talks about the same thing as `claim` — what a reviewer should compare against. */
function closestSourceSentence(claim, segments) {
  let best = null;
  let bestScore = 0;
  for (const seg of segments) {
    for (const sentence of sentencesOf(seg.text)) {
      const score = overlapScore(claim, sentence);
      if (score > bestScore) { best = { sentence, pageIndex: seg.pageIndex }; bestScore = score; }
    }
  }
  return best ? `p. ${best.pageIndex}: ${best.sentence.slice(0, 240)}` : 'Nenhum trecho da fonte trata desse ponto.';
}

const clip = (s, n = 200) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The sentence of `text` that holds character `index` — the unit a reviewer actually reads. */
function sentenceContaining(text, index) {
  let start = 0;
  for (const m of text.matchAll(/(?<=[.!?])\s+/g)) {
    if (m.index >= index) return text.slice(start, m.index).trim();
    start = m.index + m[0].length;
  }
  return text.slice(start).trim();
}

function auditSummary(summary, segments) {
  const findings = [];
  const sourceText = segments.map((s) => s.text).join(' ');
  const sourceNumbers = new Set(numbersIn(sourceText).map((n) => n.key));

  // 1) Values (doses, pressures, rates...) that the source never states are the classic invented fact.
  const badNumbers = numbersIn(summary).filter((n) => !sourceNumbers.has(n.key) && (n.key.includes('.') || n.key.length >= 2));
  for (const n of badNumbers) {
    const claim = clip(sentenceContaining(summary, n.index), 240);
    findings.push({
      issue: 'SUMMARY_UNSUPPORTED_VALUE',
      severity: 'HIGH',
      scope: 'summary',
      generatedClaim: claim,
      // compare on what the value is ABOUT (the words right before it), not on the whole sentence
      sourceEvidence: closestSourceSentence(summary.slice(Math.max(0, n.index - 60), n.index), segments),
      repair: `O valor ${n.raw} não aparece na fonte. Use o valor que a fonte traz ou remova a afirmação.`,
    });
  }

  // 2) Specific terms with no counterpart in the source (a drug, a condition, a swapped term).
  const srcStems = sourceStemSet(segments);
  const seen = new Set();
  const unsupportedTerms = [];
  for (const t of tokens(summary)) {
    if (t.key.length < 8 || GENERIC.has(t.key)) continue;
    const s = stem(t.key);
    if (srcStems.has(s) || seen.has(s)) continue;
    seen.add(s);
    unsupportedTerms.push(t.raw);
  }
  if (unsupportedTerms.length > 0) {
    findings.push({
      issue: 'SUMMARY_UNSUPPORTED_TERM',
      severity: 'MEDIUM',
      scope: 'summary',
      generatedClaim: unsupportedTerms.slice(0, 5).join(', '),
      sourceEvidence: 'Nenhuma dessas palavras (nem uma forma próxima) aparece no texto de origem enviado.',
      repair: 'Confirme cada termo na fonte. Se for informação complementar, remova ou marque como tal; se for troca de termo, restaure o termo da fonte.',
    });
  }

  // 3) Central concepts of the source that the summary dropped silently.
  const counts = new Map();
  const order = [];
  for (const seg of segments) {
    for (const t of tokens(seg.text)) {
      if (t.key.length < 6 || GENERIC.has(t.key)) continue;
      const s = stem(t.key);
      if (!counts.has(s)) { counts.set(s, { n: 0, shown: t.raw }); order.push(s); }
      counts.get(s).n += 1;
    }
  }
  const central = order.filter((s) => counts.get(s).n >= 2)
    .sort((a, b) => counts.get(b).n - counts.get(a).n || order.indexOf(a) - order.indexOf(b))
    .slice(0, 5);
  if (central.length >= 3) {
    const summaryStems = new Set(tokens(summary).map((t) => stem(t.key)));
    const missing = central.filter((s) => !summaryStems.has(s));
    if ((central.length - missing.length) / central.length < 0.5) {
      findings.push({
        issue: 'SUMMARY_OMITS_CENTRAL_CONCEPT',
        severity: 'MEDIUM',
        scope: 'summary',
        generatedClaim: clip(summary, 160),
        sourceEvidence: `Termos centrais da fonte ausentes no resumo: ${missing.map((s) => counts.get(s).shown).join(', ')}.`,
        repair: 'Reescreva abrindo pelo conceito central da fonte; detalhes incidentais vêm depois.',
      });
    }
  }

  // 4) A token summary over a substantial source.
  const summaryWords = tokens(summary).length;
  const sourceWords = tokens(sourceText).length;
  if (summaryWords < 12 && sourceWords >= 40) {
    findings.push({
      issue: 'SUMMARY_TOO_THIN',
      severity: 'HIGH',
      scope: 'summary',
      generatedClaim: clip(summary, 160),
      sourceEvidence: `A fonte tem ${sourceWords} palavras; o resumo tem ${summaryWords}.`,
      repair: 'Explique o conceito central e o mecanismo que a fonte descreve, com a terminologia dela.',
    });
  }
  return findings;
}

// The "core" of an answer: what a student would type to get it right — the text before the first
// clause break. Used to detect an answer given away in the question or the hint.
function answerCore(answer) {
  const core = norm(answer).split(/[,;:.(]| porque /)[0].replace(/\s+/g, ' ').trim();
  return core.length >= 4 || /\d/.test(core) ? core : '';
}
const squash = (s) => norm(s).replace(/\s+/g, ' ');

function auditQuestions(questions, segments) {
  const findings = [];
  const seenQuestions = new Map();

  questions.forEach((q, index) => {
    const scope = `question:${index}`;
    const add = (issue, severity, generatedClaim, sourceEvidence, repair) =>
      findings.push({ issue, severity, scope, generatedClaim: clip(generatedClaim, 240), sourceEvidence, repair });

    const cited = segments.filter((s) => (q.sourceSpans ?? []).some((span) => span.pageIndex === s.pageIndex));
    const citedText = cited.map((s) => s.text).join(' ');
    const teaching = `${q.answer} ${q.explanation ?? ''}`;
    const answerWords = tokens(q.answer).length;
    const explanationWords = tokens(q.explanation ?? '').length;

    // 1) Feedback must teach: "125" or "C" alone corrects nothing.
    if (answerWords + explanationWords < 4) {
      add('QUESTION_ANSWER_TOO_THIN', 'HIGH', q.answer, 'A resposta não traz explicação suficiente para o aluno entender por quê.',
        'Dê a resposta e explique em 1–3 frases por que ela está certa, com base na página citada.');
    } else if (explanationWords === 0 && answerWords < 8) {
      add('QUESTION_NO_EXPLANATION', 'MEDIUM', q.answer, 'Resposta curta e sem explicação: o feedback só mostra o gabarito.',
        'Acrescente a explicação (por que está certo) usando apenas o que a página citada diz.');
    }

    // 2) Answer given away by the question or by the hint.
    const core = answerCore(q.answer);
    if (core && squash(q.question).includes(core)) {
      add('QUESTION_ANSWER_LEAKED', 'HIGH', q.question, `A resposta ("${clip(q.answer, 60)}") já aparece no enunciado.`,
        'Reescreva o enunciado sem revelar a resposta.');
    }
    if (core && q.hint && squash(q.hint).includes(core)) {
      add('HINT_REVEALS_ANSWER', 'HIGH', q.hint, `A dica repete a resposta ("${clip(q.answer, 60)}").`,
        'Uma dica é uma pista parcial (categoria, direção, termo relacionado), nunca a resposta.');
    }

    // 3) Facts the cited page does not hold — values first (the classic invented fact), then terms.
    const citedNumbers = new Set(numbersIn(citedText).map((n) => n.key));
    for (const n of numbersIn(teaching)) {
      if (citedNumbers.has(n.key) || !(n.key.includes('.') || n.key.length >= 2)) continue;
      const claim = sentenceContaining(teaching, n.index);
      add('QUESTION_UNSUPPORTED_VALUE', 'HIGH', claim,
        closestSourceSentence(teaching.slice(Math.max(0, n.index - 60), n.index), cited.length > 0 ? cited : segments),
        `O valor ${n.raw} não aparece na página citada. Use o valor da fonte, corrija a citação ou remova a afirmação.`);
    }
    const citedStems = sourceStemSet(cited.length > 0 ? cited : segments);
    const questionStems = new Set(tokens(q.question).map((t) => stem(t.key)));
    const seen = new Set();
    const unsupported = [];
    for (const t of tokens(teaching)) {
      if (t.key.length < 8 || GENERIC.has(t.key)) continue;
      const s = stem(t.key);
      if (citedStems.has(s) || questionStems.has(s) || seen.has(s)) continue;
      seen.add(s);
      unsupported.push(t.raw);
    }
    if (unsupported.length > 0) {
      add('QUESTION_UNSUPPORTED_TERM', 'MEDIUM', unsupported.slice(0, 5).join(', '),
        'Nenhuma dessas palavras (nem uma forma próxima) aparece na página citada.',
        'Confirme na fonte. Se for informação complementar, remova; se a citação estiver na página errada, corrija-a.');
    }

    // 4) Little lexical footing on the cited page at all.
    if (cited.length > 0) {
      const contentStems = [...new Set(tokens(teaching).filter((t) => t.key.length >= 5 && !GENERIC.has(t.key)).map((t) => stem(t.key)))]
        .filter((s) => !questionStems.has(s));
      if (contentStems.length >= 4) {
        const supported = contentStems.filter((s) => citedStems.has(s)).length;
        if (supported / contentStems.length < 0.4) {
          add('QUESTION_LOW_SOURCE_SUPPORT', 'MEDIUM', q.answer,
            `Só ${supported} de ${contentStems.length} termos da resposta/explicação aparecem na(s) página(s) citada(s).`,
            'Confira se a citação aponta para a página que sustenta a resposta e se a explicação não acrescenta fatos.');
        }
      }
    }

    // 5) Duplicates, and a verbatim copy of the source (advisory: a lacuna, not a question).
    const key = squash(q.question);
    if (seenQuestions.has(key)) {
      add('QUESTION_DUPLICATE', 'MEDIUM', q.question, `Igual à questão ${seenQuestions.get(key) + 1}.`, 'Remova ou reescreva uma das duas.');
    } else {
      seenQuestions.set(key, index);
    }
    const answerNorm = squash(q.answer);
    if (answerNorm.length >= 60 && squash(citedText).includes(answerNorm)) {
      add('QUESTION_LITERAL_COPY', 'LOW', q.answer, 'A resposta é um trecho literal da fonte.', 'Prefira reformular para testar compreensão, não cópia.');
    }
  });
  return findings;
}

/**
 * @param {{summary:string, questions:object[]}} draft an already schema-validated draft
 * @param {{segments:{pageIndex:number,text:string}[]}} context the exact source pages sent to the provider
 */
export function auditDraft(draft, { segments }) {
  const findings = [...auditSummary(draft.summary, segments), ...auditQuestions(draft.questions ?? [], segments)];
  const blocking = findings.some((f) => f.severity === 'HIGH' || f.severity === 'MEDIUM');
  return { result: blocking ? AUDIT_RESULT.REPAIR : AUDIT_RESULT.PASS, findings, auditedBy: 'DETERMINISTIC' };
}
