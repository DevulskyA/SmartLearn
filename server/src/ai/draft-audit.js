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

/**
 * @param {{summary:string, questions:object[]}} draft an already schema-validated draft
 * @param {{segments:{pageIndex:number,text:string}[]}} context the exact source pages sent to the provider
 */
export function auditDraft(draft, { segments }) {
  const findings = [...auditSummary(draft.summary, segments)];
  const blocking = findings.some((f) => f.severity === 'HIGH' || f.severity === 'MEDIUM');
  return { result: blocking ? AUDIT_RESULT.REPAIR : AUDIT_RESULT.PASS, findings, auditedBy: 'DETERMINISTIC' };
}
