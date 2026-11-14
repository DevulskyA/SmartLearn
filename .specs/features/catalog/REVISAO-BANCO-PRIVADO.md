# SmartLearn: banco privado de questões, o que mudou e por quê

Para o revisor: leia cada item, abra o arquivo original no commit anterior (`git show <commit>^:<arquivo>`), compare com o diff abaixo e sugira melhorias.
Nada foi enviado ao GitHub. São 4 commits locais, em ordem; cada diff vem depois desta explicação.

Regra que vale para tudo: metadados (ISBN, edição, ano) só indicam candidatos. Quem autoriza reaproveitar o texto é `usage_status` (OFFICIAL_PUBLIC ou LICENSED) mais a existência de gabarito (`canReuseText`). O banco é filtrado por `user_id`, então nada cruza contas.

## Commit 05aeae4f: consultar o banco privado antes do modelo
- `server/src/services/generated-drafts.js`: ao pedir as perguntas de um rascunho, o código primeiro procura as perguntas já aceitas do próprio aluno sobre as mesmas páginas (mesma fonte, páginas contidas no texto, outra aula). Se achar, usa-as em vez de chamar o modelo.
- `server/test/shared-reuse.test.js`: um teste. A aluna A aceita as perguntas; um segundo rascunho das mesmas páginas recebe as dela sem chamada ao modelo e sem consentimento de compartilhamento (`generatedBy.provider = PRIVATE_BANK`), continua `PROPOSED` (revisão humana antes de virar aula) e nada vai ao acervo compartilhado. O aluno B, com o mesmo texto, não tem banco e o modelo é chamado.

## Commit 85eb89b7: ano da edição vem da bibliografia
- `server/src/corpus/private-bank.js`: o ano do item passa a vir de `sources.bib_year`; o nome do arquivo só vale como reserva.
- `server/test/private-bank.test.js`: com `bib_year = 2021`, a bibliografia vence o ano 2012 do nome do arquivo e também preenche um arquivo sem ano; sem `bib_year`, volta a 2012 e a `null`.
- Por quê: o ano da bibliografia foi corrigido ou confirmado pelo aluno; o nome do arquivo é palpite.

## Commit a97d105d: ISBN, edição e ano na decisão DERIVE
- `server/src/corpus/bibliographic.js` (novo): `isbnKey` normaliza ISBN-10 e ISBN-13 (hífens, espaços, dígito X) para 13 dígitos. `bibliographicFit(item, need)` devolve MATCH (algum sinal concorda e nenhum discorda), OTHER_EDITION (algo discorda e nada concorda), CONFLICT (sinais que se contradizem, por exemplo mesmo ISBN e edição diferente), UNKNOWN (o item não tem dado comparável) ou NONE_REQUESTED (a necessidade não nomeia livro). `fitRank` dá a ordem MATCH, UNKNOWN, OTHER_EDITION, CONFLICT.
- `server/src/corpus/item.js`: `normalizeItem` agora preserva `isbn` e `edition`; antes descartava campos desconhecidos.
- `server/src/corpus/private-bank.js`: lê `bib_isbn` e `bib_edition` da fonte citada e os põe no item.
- `server/src/corpus/resolve-need.js`: ordena os candidatos pela adequação (ordenação estável, ninguém é removido) e acrescenta `bibliographic` à resposta REUSE ou DERIVE. Não muda quem pode ser reutilizado.
- `server/src/corpus/review-need.js`: item de outra edição (ou em conflito) com conteúdo sensível ao tempo vira DERIVE `REVALIDATE` com `verification.required`, motivo `OTHER_EDITION_TIME_SENSITIVE`. Conteúdo estável continua sendo reutilizado.
- `server/test/private-bank.test.js`: 4 testes novos: ordenação por ISBN-10, ISBN-13 com hífens, edição e ano; ausência e conflito; outra edição com conteúdo sensível ao tempo contra estável; sem reuso indevido (ISBN igual em outra conta é invisível; item REFERENCE_ONLY ou UNKNOWN com MATCH continua DERIVE e `copyText` é falso; item LICENSED vira REUSE).
- Prova: 20 testes passam (`private-bank` e `question-corpus`), ESLint limpo.
- Pontos que pedem sua opinião: (1) o critério de MATCH/CONFLICT, em que dois sinais divergentes viram CONFLICT em vez de pesar por tipo; (2) edição lida pelos 1–2 primeiros dígitos, o que não entende "2ª ed. rev." nem numeração romana; (3) `resolveReviewNeed` ainda não tem consumidor no produto.

## Commit 76747870: documentação
- `.specs/features/catalog/BACKLOG-FUTURO.md`, item 7: registra o que já está na decisão e o que falta (quem escreve o item DERIVE).

## Diffs

```diff
diff --git a/.specs/features/catalog/BACKLOG-FUTURO.md b/.specs/features/catalog/BACKLOG-FUTURO.md
index aa2dd0f2..6c9e3f39 100644
--- a/.specs/features/catalog/BACKLOG-FUTURO.md
+++ b/.specs/features/catalog/BACKLOG-FUTURO.md
@@ -15,8 +15,9 @@ quando trouxer benefício concreto ao fluxo básico e o dono pedir. Prioridade a
 4. Banco de resumos por edição/cobertura e registro de permissão de reuso.
 5. Classificação matéria › assunto › tópico, gravada e buscável por FTS5.
 6. Coluna de modalidade (objetiva/discursiva) e estado de validade da questão.
-7. Ligar `private-bank.js` ao fluxo (REUSE / DERIVE / GENERATE antes de gerar) e usar o ISBN/edição/ano de `sources` em vez do ano derivado do nome do arquivo.
-8. Ligar `resolveReviewNeed` ao fluxo de revisões.
+7. FEITO em parte (05aeae4f): o banco privado é consultado antes do modelo ao pedir as perguntas de um rascunho (mesma fonte, páginas contidas no texto, outra aula). O ano da edição já vem da bibliografia da fonte (`bib_year`), com o nome do arquivo só como reserva. ISBN, edição e ano (a97d105d) já entram em `resolveNeed`: ordenam os candidatos, voltam como `bibliographic` (MATCH, OTHER_EDITION, CONFLICT, UNKNOWN) e, em outra edição, seguram conteúdo sensível ao tempo como DERIVE `REVALIDATE`; só `usage_status` e gabarito autorizam reuso, e o banco segue isolado por usuário. Falta apenas quem escreva o item DERIVE (depende do item 8).
+8. `resolveReviewNeed` AGUARDA consumidor: a revisão de hoje só reapresenta exercícios existentes e não gera perguntas, então não há ponto de decisão REUSE/DERIVE/GENERATE para ligar. Só vale criar quando existir uma revisão que gere itens novos (decisão de produto).
+11. Compartilhamento entre instalações (reaproveitamento, hoje por conta no mesmo servidor, migrações 046/047): o acervo `shared_content` é uma tabela chaveada por (digest do texto enviado ao modelo, idioma), sem identidade de quem contribuiu exposta. Para duas instalações, o mesmo registro (digest, idioma, resumo, perguntas, versões do modelo/prompt, base jurídica declarada) pode trafegar por um serviço central que só armazena e entrega esse registro; o receptor continua auditando de novo contra o próprio texto e revisando como rascunho. Falta decidir: serviço central e autenticação, retirada (WITHDRAWN) propagada, e moderação. Não implementado; sem publicação.
 9. Geração automática adicional (títulos com IA real, checagem de duplicatas entre questões geradas).
 10. Interface para o aluno ver e corrigir os metadados do material (hoje só a API; a tela de Materiais está em redesenho por outra frente).
 
diff --git a/server/src/corpus/bibliographic.js b/server/src/corpus/bibliographic.js
new file mode 100644
index 00000000..139b47dd
--- /dev/null
+++ b/server/src/corpus/bibliographic.js
@@ -0,0 +1,51 @@
+// BIBLIOGRAPHIC FIT: how an item's source (ISBN, edition, year) compares with the book/edition a need names. Pure, no I/O, no model.
+// Metadata only INDICATES which candidate is the better parent; it never grants a right. Reuse of text still depends on the item's
+// usage_status and key (canReuseText), and the private bank is already scoped to one user, so a match never crosses users.
+
+/** ISBN-10/13 with hyphens or spaces -> 13 digits (978 prefix for ISBN-10); null when it is not a 10 or 13 digit ISBN. */
+export function isbnKey(value) {
+  const d = String(value ?? '').replace(/[\s-]/g, '').toUpperCase();
+  if (/^\d{13}$/.test(d)) return d;
+  if (!/^\d{9}[\dX]$/.test(d)) return null;
+  const core = `978${d.slice(0, 9)}`;
+  const sum = [...core].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
+  return `${core}${(10 - (sum % 10)) % 10}`;
+}
+
+const editionKey = (v) => {
+  const m = String(v ?? '').match(/\d{1,2}/);
+  return m ? Number(m[0]) : null;
+};
+const yearKey = (v) => {
+  if (Number.isInteger(v)) return v;
+  return /^\d{4}$/.test(String(v ?? '').trim()) ? Number(v) : null;
+};
+
+export const FIT = Object.freeze({ NONE_REQUESTED: 'NONE_REQUESTED', UNKNOWN: 'UNKNOWN', MATCH: 'MATCH', OTHER_EDITION: 'OTHER_EDITION', CONFLICT: 'CONFLICT' });
+
+/**
+ * @param item  { isbn?, edition?, year? } as stored on the item
+ * @param need  { isbn?, edition?, year? } the book/edition the student is working with
+ * MATCH = at least one signal agrees and none disagrees; OTHER_EDITION = something disagrees and nothing agrees;
+ * CONFLICT = signals disagree with each other (e.g. same ISBN, different edition): metadata is not trustworthy, so it is only reported;
+ * UNKNOWN = the need names a book/edition but the item has nothing comparable; NONE_REQUESTED = the need names none.
+ */
+export function bibliographicFit(item, need) {
+  const wanted = { isbn: isbnKey(need?.isbn), edition: editionKey(need?.edition), year: yearKey(need?.year) };
+  if (wanted.isbn === null && wanted.edition === null && wanted.year === null) return FIT.NONE_REQUESTED;
+  const have = { isbn: isbnKey(item?.isbn), edition: editionKey(item?.edition), year: yearKey(item?.year) };
+  let agree = 0;
+  let differ = 0;
+  for (const k of ['isbn', 'edition', 'year']) {
+    if (wanted[k] === null || have[k] === null) continue;
+    if (wanted[k] === have[k]) agree += 1; else differ += 1;
+  }
+  if (agree > 0 && differ > 0) return FIT.CONFLICT;
+  if (agree > 0) return FIT.MATCH;
+  if (differ > 0) return FIT.OTHER_EDITION;
+  return FIT.UNKNOWN;
+}
+
+const RANK = { MATCH: 0, UNKNOWN: 1, NONE_REQUESTED: 1, OTHER_EDITION: 2, CONFLICT: 3 };
+/** Stable preference among candidates: a book/edition match first, a conflict last. Does not remove anyone. */
+export const fitRank = (fit) => RANK[fit] ?? 1;
diff --git a/server/src/corpus/item.js b/server/src/corpus/item.js
index 47a13e35..fe1699b1 100644
--- a/server/src/corpus/item.js
+++ b/server/src/corpus/item.js
@@ -56,6 +56,8 @@ export function normalizeItem(raw, { sourceFile = null } = {}) {
       usage_status: usage,
       exam: str(raw.exam),
       year: int(raw.year),
+      isbn: str(raw.isbn),
+      edition: str(raw.edition === undefined || raw.edition === null ? null : String(raw.edition)),
       topic: str(raw.topic),
       competency: str(raw.competency),
       subcompetency: str(raw.subcompetency),
diff --git a/server/src/corpus/private-bank.js b/server/src/corpus/private-bank.js
index de6f6e34..be232d13 100644
--- a/server/src/corpus/private-bank.js
+++ b/server/src/corpus/private-bank.js
@@ -7,7 +7,7 @@
 //   exercise_versions.question / answer / explanation -> stem / key / explanation
 //   learning_units.title                              -> topic (the study unit the question came from)
 //   exercise_versions.question_type                   -> item_type (cognitive level; the stored data has no multiple-choice/essay field yet)
-//   exercise_source_citations (+ sources)             -> source (file name), pages and edition year when the file name states one
+//   exercise_source_citations (+ sources)             -> source (file name), pages and edition year (the bibliography on the source when known, else a year the file name states)
 //   provenance                                        -> provenance + origin (AI_GENERATED -> generated)
 // Usage rights: the student's own questions, made from the student's own material, are reusable PRIVATELY, so they are LICENSED here.
 // That never makes them public: the bank is built per user and is not shared between accounts.
@@ -38,7 +38,7 @@ function rowsFor(db, userId) {
 
 function citationsFor(db, userId, versionId) {
   return db.prepare(`
-    SELECT c.source_id, c.page_index, s.original_name
+    SELECT c.source_id, c.page_index, s.original_name, s.bib_year, s.bib_isbn, s.bib_edition
       FROM exercise_source_citations c JOIN sources s ON s.user_id = c.user_id AND s.id = c.source_id
      WHERE c.user_id = ? AND c.exercise_version_id = ? ORDER BY c.page_index
   `).all(userId, versionId);
@@ -57,7 +57,9 @@ export function privateBankItems(db, userId) {
       source_file: cites[0] ? `source#${cites[0].source_id}` : null,
       usage_status: 'LICENSED',
       exam: null,
-      year: editionYearOf(sourceName),
+      year: cites[0]?.bib_year ?? editionYearOf(sourceName),
+      isbn: cites[0]?.bib_isbn ?? null,
+      edition: cites[0]?.bib_edition ?? null,
       topic: row.unit_title,
       competency: null,
       subcompetency: null,
diff --git a/server/src/corpus/resolve-need.js b/server/src/corpus/resolve-need.js
index 2b8cc13e..d7370c99 100644
--- a/server/src/corpus/resolve-need.js
+++ b/server/src/corpus/resolve-need.js
@@ -6,8 +6,11 @@
 //   DERIVE    a close item exists but must not (or need not) be served as it is: a REFERENCE_ONLY or UNKNOWN item that fits, or any
 //             item that only comes near. The new item is written from the parent's cognitive structure, with `parent_id` and
 //             `relationship` recorded; text is copied only when the parent's rights allow it.
+//             `need.isbn / edition / year` (the book now studied) rank candidates and are echoed as `bibliographic` (MATCH, OTHER_EDITION,
+//             CONFLICT, UNKNOWN); they never grant reuse: that stays with usage_status and the answer key.
 //   GENERATE  nothing usable: a gap. Also what an empty corpus always answers.
 import { canReuseText } from './item.js';
+import { bibliographicFit, fitRank, FIT } from './bibliographic.js';
 
 // A near candidate must have matched the need's words in the full-text index at all (score > 0); a listing with no text query has no
 // notion of "near" and never produces one.
@@ -15,31 +18,36 @@ const MIN_NEAR_SCORE = 0;
 
 export function resolveNeed(corpus, need, { exposed = [] } = {}) {
   if (!corpus || corpus.status === 'CORPUS_EMPTY') return { action: 'GENERATE', reason: 'CORPUS_EMPTY', candidates: 0 };
-  const candidates = corpus.search({
+  const found = corpus.search({
     query: need.query ?? null, topic: need.topic ?? null, competency: need.competency ?? null, itemType: need.itemType ?? null,
     exam: need.exam ?? null, excludeIds: exposed, limit: 10,
   });
-  if (candidates.length === 0) return { action: 'GENERATE', reason: 'NO_CANDIDATE', candidates: 0 };
+  if (found.length === 0) return { action: 'GENERATE', reason: 'NO_CANDIDATE', candidates: 0 };
+
+  // Book metadata (ISBN, edition, year) only orders the candidates, best source first; it never makes an item reusable and never adds one.
+  const fits = new Map(found.map((c) => [c.item.id, bibliographicFit(c.item, need)]));
+  const candidates = [...found].sort((a, b) => fitRank(fits.get(a.item.id)) - fitRank(fits.get(b.item.id)));
+  const withFit = (answer, c) => (fits.get(c.item.id) === FIT.NONE_REQUESTED ? answer : { ...answer, bibliographic: fits.get(c.item.id) });
 
   const exactReusable = candidates.find((c) => c.exact && canReuseText(c.item));
-  if (exactReusable) return { action: 'REUSE', item: exactReusable.item, reason: 'EXACT_FIT_REUSABLE', candidates: candidates.length };
+  if (exactReusable) return withFit({ action: 'REUSE', item: exactReusable.item, reason: 'EXACT_FIT_REUSABLE', candidates: candidates.length }, exactReusable);
 
   const exactReference = candidates.find((c) => c.exact);
   if (exactReference) {
     const textAllowed = canReuseText(exactReference.item);
-    return {
+    return withFit({
       action: 'DERIVE',
       parent_id: exactReference.item.id,
       relationship: textAllowed ? 'VARIANT' : 'REFERENCE_STRUCTURE',
       copyText: textAllowed,
       reason: textAllowed ? 'EXACT_FIT_NEEDS_VARIANT' : `EXACT_FIT_NOT_REUSABLE_${exactReference.item.usage_status}`,
       candidates: candidates.length,
-    };
+    }, exactReference);
   }
 
   const near = candidates.find((c) => c.score > MIN_NEAR_SCORE);
   if (near) {
-    return { action: 'DERIVE', parent_id: near.item.id, relationship: 'NEAR_STRUCTURE', copyText: false, reason: 'NEAR_ITEM', candidates: candidates.length };
+    return withFit({ action: 'DERIVE', parent_id: near.item.id, relationship: 'NEAR_STRUCTURE', copyText: false, reason: 'NEAR_ITEM', candidates: candidates.length }, near);
   }
   return { action: 'GENERATE', reason: 'NO_CLOSE_CANDIDATE', candidates: candidates.length };
 }
diff --git a/server/src/corpus/review-need.js b/server/src/corpus/review-need.js
index d9fa9d09..b710ad59 100644
--- a/server/src/corpus/review-need.js
+++ b/server/src/corpus/review-need.js
@@ -17,7 +17,10 @@ export function resolveReviewNeed(db, userId, need, { now = new Date(), repeatAf
   const result = { ...answer, bank: corpus.size };
   if (answer.action !== 'REUSE') return result;
   const verdict = editionVerdict(answer.item, { studyingYear: need.studyingYear ?? null });
-  if (verdict.ok) return result;
+  // A different edition (by ISBN/edition, not only by year) holds time-sensitive content too; stable content still carries over.
+  const otherEdition = (answer.bibliographic === 'OTHER_EDITION' || answer.bibliographic === 'CONFLICT') && answer.item.needs_verification === true;
+  if (verdict.ok && !otherEdition) return result;
+  if (otherEdition) verdict.reason = 'OTHER_EDITION_TIME_SENSITIVE';
   return {
     action: 'DERIVE', parent_id: answer.item.id, relationship: 'REVALIDATE', copyText: false,
     reason: verdict.reason, verification: { required: true, because: verdict.reason, parentYear: answer.item.year ?? null },
diff --git a/server/src/services/generated-drafts.js b/server/src/services/generated-drafts.js
index 50d0ad03..999c6178 100644
--- a/server/src/services/generated-drafts.js
+++ b/server/src/services/generated-drafts.js
@@ -23,6 +23,7 @@ import { auditDraft, AUDIT_RESULT, AUDIT_RULES_VERSION, triggersRepair } from '.
 import { groundSummary } from '../ai/claim-evidence.js';
 import { findUnresolvedRefs, refsMessage } from './visual-assets.js';
 import { findShared, recordReuse, bibliographyOf } from './shared-reuse.js';
+import { privateBankItems } from '../corpus/private-bank.js';
 
 export class DraftError extends Error {
   constructor(code, message, field) {
@@ -785,34 +786,64 @@ function reuseSharedDraft(db, userId, { found, scope, proposalId, inputDigest, i
 }
 
 /** The questions of a summary-first draft, taken from reviewed content for the same text instead of asking the model. Null on a miss. */
+/** The questions of `candidates` that cite a page of THIS student's text and are not in the draft yet (an invalid one is dropped, never repaired). */
+function validFresh(first, candidates) {
+  const { draftRow, found, current } = first;
+  const have = new Set(current.questions.map((q) => q.question));
+  const fresh = [];
+  for (const candidate of candidates) {
+    if (have.has(candidate.question)) continue;
+    try {
+      const [valid] = validateOrThrow({
+        summary: current.summary, summarySourceSpans: current.summarySourceSpans, questions: [candidate],
+        modelVersion: draftRow.model_version, promptVersion: draftRow.prompt_version,
+      }, found.segments).questions;
+      fresh.push(valid);
+    } catch (err) {
+      if (!(err instanceof DraftError)) throw err;
+    }
+  }
+  return fresh;
+}
+
+/**
+ * The student's OWN accepted questions (private bank) that were written from pages of this same source and that this text contains, from lessons
+ * other than the one the draft adds to. Their own reviewed work: it needs no consent, no model and is never shared by this path.
+ */
+function privateQuestions(db, userId, first) {
+  const { draftRow, found } = first;
+  const inText = new Set(found.segments.map((seg) => seg.pageIndex));
+  const candidates = [];
+  for (const item of privateBankItems(db, userId)) {
+    if (item.source_file !== `source#${found.proposal.source_id}` || item.unit_id === draftRow.target_unit_id || item.needs_verification) continue;
+    const pages = (/^pages ([\d,]+)$/.exec(item.source_evidence ?? '')?.[1] ?? '').split(',').filter(Boolean).map(Number);
+    if (pages.length === 0 || !pages.every((p) => inText.has(p)) || !item.stem || !item.key || !item.explanation) continue;
+    candidates.push({ question: item.stem, answer: item.key, explanation: item.explanation, hint: null, questionType: item.item_type ?? null, sourceSpans: pages.map((pageIndex) => ({ pageIndex })) });
+  }
+  const fresh = validFresh(first, candidates);
+  return fresh.length === 0 ? null : { shared: null, fresh, generatedBy: { provider: 'PRIVATE_BANK', modelVersion: 'accepted-exercise', promptVersion: '-' } };
+}
+
+/** Existing material before the model: the student's own accepted questions first, then reviewed questions of the same text from the pool. */
 function reusableQuestions(db, userId, first) {
+  const own = privateQuestions(db, userId, first);
+  if (own) return own;
   const { draftRow, found, current } = first;
   const shared = findShared(db, { digest: draftRow.input_sha256, locale: current.generationLocale, bib: bibliographyOf(db, userId, found.proposal.source_id) });
   if (!shared || shared.questions.length === 0) return null;
-  let validated;
-  try { // reviewed elsewhere is not enough: each question must also cite a page of THIS student's text, else it is a miss and the normal flow runs
-    validated = validateOrThrow({
-      summary: current.summary, summarySourceSpans: current.summarySourceSpans, questions: shared.questions,
-      modelVersion: draftRow.model_version, promptVersion: draftRow.prompt_version,
-    }, found.segments);
-  } catch (err) {
-    if (err instanceof DraftError) return null;
-    throw err;
-  }
-  const have = new Set(current.questions.map(questionText));
-  const fresh = validated.questions.filter((q) => !have.has(questionText(q)));
-  return fresh.length === 0 ? null : { shared, fresh };
+  const fresh = validFresh(first, shared.questions); // reviewed elsewhere is not enough: each question must also cite a page of THIS student's text
+  return fresh.length === 0 ? null : { shared, fresh, generatedBy: shared.generatedBy };
 }
 
 function reuseSharedQuestions(db, userId, draftId, first, now) {
   const { draftRow, found, current } = first;
   const hit = reusableQuestions(db, userId, first);
   if (!hit) return null;
-  const { shared, fresh } = hit;
-  recordReuse(db, shared.id);
+  const { shared, fresh, generatedBy } = hit;
+  if (shared) recordReuse(db, shared.id);
   return persistEdit(db, userId, draftId, draftRow, found, current, {
     summary: current.summary, summarySourceSpans: current.summarySourceSpans, summaryVersion: current.summaryVersion,
-    questions: [...current.questions, ...fresh.map((q) => ({ ...q, origin: 'GENERATED', generatedBy: shared.generatedBy, editedAt: null }))],
+    questions: [...current.questions, ...fresh.map((q) => ({ ...q, origin: 'GENERATED', generatedBy, editedAt: null }))],
     questionsDelivered: true,
   }, now);
 }
diff --git a/server/test/private-bank.test.js b/server/test/private-bank.test.js
index d5b338c3..f63ee72b 100644
--- a/server/test/private-bank.test.js
+++ b/server/test/private-bank.test.js
@@ -9,6 +9,9 @@ import { runMigrations } from '../src/migrations.js';
 import { privateBankItems, recentlyExposedIds, editionYearOf } from '../src/corpus/private-bank.js';
 import { classifyFreshness, editionVerdict } from '../src/corpus/freshness.js';
 import { resolveReviewNeed } from '../src/corpus/review-need.js';
+import { resolveNeed } from '../src/corpus/resolve-need.js';
+import { openCorpus } from '../src/corpus/corpus-index.js';
+import { normalizeItem } from '../src/corpus/item.js';
 
 // PRIVATE QUESTION BANK on a SYNTHETIC database: no model, no paid call, no real data. The student's accepted exercises feed REUSE / DERIVE /
 // GENERATE; recent exposure is skipped but an old answer comes back (spaced review); problem-flagged and archived questions are not served;
@@ -121,6 +124,99 @@ test('2012 edition then 2025: stable science carries over, a time-sensitive reco
   } finally { cleanup(); }
 });
 
+test('edition year comes from the source bibliography when known, and from the file name only otherwise', () => {
+  const { db, cleanup } = tmpDb();
+  try {
+    const a = user(db, 'a@x.test');
+    const named = seed(db, a, { unit: 'Filtração glomerular', question: 'Q1?', answer: 'R1.', fileName: 'Costanzo Physiology 2012.pdf' });
+    const plain = seed(db, a, { unit: 'Hipertensão', question: 'Q2?', answer: 'R2.', fileName: 'apostila.pdf' });
+    db.prepare('UPDATE sources SET bib_year = 2021 WHERE user_id = ?').run(a);
+    const byId = Object.fromEntries(privateBankItems(db, a).map((i) => [i.id, i.year]));
+    assert.equal(byId[`ex${named.ex}`], 2021, 'the bibliography outranks a year typed in the file name');
+    assert.equal(byId[`ex${plain.ex}`], 2021, 'a file name without a year still gets the bibliography year');
+    db.prepare('UPDATE sources SET bib_year = NULL WHERE user_id = ?').run(a);
+    const fallback = Object.fromEntries(privateBankItems(db, a).map((i) => [i.id, i.year]));
+    assert.equal(fallback[`ex${named.ex}`], 2012);
+    assert.equal(fallback[`ex${plain.ex}`], null);
+  } finally { cleanup(); }
+});
+
+const setBib = (db, userId, fileName, bib) => db.prepare('UPDATE sources SET bib_isbn = ?, bib_edition = ?, bib_year = ? WHERE user_id = ? AND original_name = ?').run(bib.isbn ?? null, bib.edition ?? null, bib.year ?? null, userId, fileName);
+const ED6 = { isbn: '9781234567897', edition: '6', year: 2012 };
+const ED7 = { isbn: '9780306406157', edition: '7', year: 2021 };
+
+test('book metadata ranks candidates (ISBN-10 or 13, edition, year), reports the fit, and is silent when the need names no book', () => {
+  const { db, cleanup } = tmpDb();
+  try {
+    const a = user(db, 'a@x.test');
+    const old = seed(db, a, { unit: 'Filtração glomerular', question: 'O que determina a taxa de filtração glomerular?', answer: 'Starling.', fileName: 'livro-6.pdf' });
+    const cur = seed(db, a, { unit: 'Filtração glomerular', question: 'O que determina a taxa de filtração glomerular?', answer: 'Starling e Kf.', fileName: 'livro-7.pdf' });
+    setBib(db, a, 'livro-6.pdf', ED6); setBib(db, a, 'livro-7.pdf', ED7);
+    const pick = (need) => resolveReviewNeed(db, a, { topic: 'Filtração glomerular', ...need }, { now: NOW });
+    const byIsbn10 = pick({ isbn: '0-306-40615-2' });
+    assert.equal(byIsbn10.item.id, `ex${cur.ex}`, 'ISBN-10 is normalized and finds the 7th edition');
+    assert.equal(byIsbn10.bibliographic, 'MATCH');
+    assert.equal(pick({ isbn: '978-1-234-56789-7' }).item.id, `ex${old.ex}`, 'ISBN-13 with hyphens finds the 6th');
+    assert.equal(pick({ edition: '7ª' }).item.id, `ex${cur.ex}`, 'edition alone ranks the candidate');
+    assert.equal(pick({ year: 2012 }).item.id, `ex${old.ex}`, 'year alone ranks the candidate');
+    assert.equal('bibliographic' in pick({}), false, 'a need that names no book carries no bibliographic verdict');
+  } finally { cleanup(); }
+});
+
+test('absence and conflict of metadata are reported, never read as a match', () => {
+  const { db, cleanup } = tmpDb();
+  try {
+    const a = user(db, 'a@x.test');
+    seed(db, a, { unit: 'Filtração glomerular', question: 'O que determina a taxa de filtração glomerular?', answer: 'Starling.', fileName: 'sem-dados.pdf' });
+    assert.equal(resolveReviewNeed(db, a, { topic: 'Filtração glomerular', isbn: ED7.isbn }, { now: NOW }).bibliographic, 'UNKNOWN', 'item without bibliography');
+    setBib(db, a, 'sem-dados.pdf', ED6);
+    const conflict = resolveReviewNeed(db, a, { topic: 'Filtração glomerular', isbn: ED6.isbn, edition: '7' }, { now: NOW });
+    assert.equal(conflict.bibliographic, 'CONFLICT', 'same ISBN but a different edition: the metadata disagrees with itself');
+    assert.equal(conflict.action, 'REUSE', 'a conflict does not remove stable, reusable content; it is only reported');
+    assert.equal(resolveReviewNeed(db, a, { topic: 'Filtração glomerular', isbn: ED7.isbn, edition: '7', year: 2021 }, { now: NOW }).bibliographic, 'OTHER_EDITION');
+  } finally { cleanup(); }
+});
+
+test('another edition holds time-sensitive content for verification even without a studying year; stable content carries over', () => {
+  const { db, cleanup } = tmpDb();
+  try {
+    const a = user(db, 'a@x.test');
+    seed(db, a, { unit: 'Hipertensão', question: 'Qual a terapia de primeira linha para hipertensão segundo a diretriz?', answer: 'Tiazídico.', fileName: 'livro-6.pdf' });
+    seed(db, a, { unit: 'Filtração glomerular', question: 'O que determina a taxa de filtração glomerular?', answer: 'Starling.', fileName: 'livro-6b.pdf' });
+    setBib(db, a, 'livro-6.pdf', ED6); setBib(db, a, 'livro-6b.pdf', ED6);
+    const clinical = resolveReviewNeed(db, a, { topic: 'Hipertensão', isbn: ED7.isbn, edition: '7' }, { now: NOW });
+    assert.equal(clinical.action, 'DERIVE');
+    assert.equal(clinical.reason, 'OTHER_EDITION_TIME_SENSITIVE');
+    assert.equal(clinical.verification.required, true);
+    assert.equal(clinical.copyText, false);
+    assert.equal(resolveReviewNeed(db, a, { topic: 'Filtração glomerular', isbn: ED7.isbn, edition: '7' }, { now: NOW }).action, 'REUSE');
+    assert.equal(resolveReviewNeed(db, a, { topic: 'Hipertensão', isbn: ED6.isbn, edition: '6' }, { now: NOW }).action, 'REUSE', 'same edition: nothing to verify');
+  } finally { cleanup(); }
+});
+
+test('metadata never authorizes reuse: another account\'s book match is invisible, and a REFERENCE_ONLY or UNKNOWN item is only ever a parent', () => {
+  const { db, cleanup } = tmpDb();
+  try {
+    const a = user(db, 'a@x.test'); const b = user(db, 'b@x.test');
+    seed(db, b, { unit: 'Filtração glomerular', question: 'O que determina a taxa de filtração glomerular?', answer: 'Starling.', fileName: 'livro-7.pdf' });
+    setBib(db, b, 'livro-7.pdf', ED7);
+    const none = resolveReviewNeed(db, a, { topic: 'Filtração glomerular', isbn: ED7.isbn }, { now: NOW });
+    assert.equal(none.action, 'GENERATE', 'the same ISBN in someone else\'s bank is not a candidate');
+    assert.equal(none.bank, 0);
+
+    const raw = (usage, id) => ({ id, usage_status: usage, stem: 'Fluxo sanguíneo renal depende de quê?', key: 'Resistência arteriolar', topic: 'Fisiologia renal', competency: 'Fluxo sanguíneo renal', isbn: ED7.isbn, edition: '7', year: 2021 });
+    for (const usage of ['REFERENCE_ONLY', 'UNKNOWN']) {
+      const corpus = openCorpus({ items: [normalizeItem(raw(usage, `r-${usage}`)).item] });
+      const r = resolveNeed(corpus, { competency: 'Fluxo sanguíneo renal', topic: 'Fisiologia renal', isbn: ED7.isbn, edition: '7' });
+      assert.equal(r.bibliographic, 'MATCH');
+      assert.equal(r.action, 'DERIVE', `${usage}: a perfect book match is still not a right to copy`);
+      assert.equal(r.copyText, false);
+    }
+    const licensed = resolveNeed(openCorpus({ items: [normalizeItem(raw('LICENSED', 'l1')).item] }), { competency: 'Fluxo sanguíneo renal', topic: 'Fisiologia renal', isbn: ED7.isbn });
+    assert.equal(licensed.action, 'REUSE', 'rights, not metadata, decide: LICENSED with a key is reusable');
+  } finally { cleanup(); }
+});
+
 test('freshness and edition helpers are deterministic and conservative', () => {
   assert.equal(classifyFreshness({ stem: 'Qual a dose de amoxicilina?' }).needsVerification, true);
   assert.equal(classifyFreshness({ stem: 'Qual a função do néfron?' }).stability, 'STABLE');
diff --git a/server/test/shared-reuse.test.js b/server/test/shared-reuse.test.js
index 244eb6bd..8bdecb27 100644
--- a/server/test/shared-reuse.test.js
+++ b/server/test/shared-reuse.test.js
@@ -410,3 +410,35 @@ test('HTTP: a hit is served with AI consent OFF and no credentials; a miss keeps
     assert.equal(isReuseGranted(ctx.db, a.userId), true);
   } finally { await app.close(); ctx.cleanup(); }
 });
+
+test('private bank: the questions a student already accepted from the same pages are used before the model, from their own bank only', OPTS, async () => {
+  const ctx = tmpDb();
+  try {
+    const a = makeUser(ctx.db, 'bank-a@example.com');
+    const { proposal } = await proposalFor(ctx, a);
+    const first = await generate(ctx, a, proposal, counting());
+    acceptDraft(ctx.db, a, first.id, { ...INPUT, expectedRevision: first.revision });
+    assert.equal(exerciseCount(ctx.db, a), 2);
+
+    // a second, summary-first draft of the same pages: its questions come from A's own accepted ones, with no model call and no consent
+    const provider = counting({ withQuestions: false });
+    const second = await generate(ctx, a, proposal, provider, { regenerate: true, codex: { deferQuestions: true } });
+    assert.equal(second.questionsDeferred, true);
+    assert.equal(drafts.hasReusableContent(ctx.db, a, { draftId: second.id }), true, 'the job route can tell it needs no AI consent');
+    const withQuestions = await drafts.generateDeferredQuestions(ctx.db, a, second.id, { providerImpl: provider });
+    assert.equal(provider.questionCalls, 0, 'no model call');
+    assert.equal(withQuestions.questions.length, 2);
+    assert.equal(withQuestions.questions[0].generatedBy.provider, 'PRIVATE_BANK');
+    assert.equal(withQuestions.questions[0].status, 'PROPOSED', 'still reviewed before it joins a lesson');
+    assert.equal(shared(ctx.db).length, 0, 'nothing reached the shared pool (no consent)');
+
+    // another student with the same text has no bank: the model is asked
+    const b = makeUser(ctx.db, 'bank-b@example.com');
+    const { proposal: pb } = await proposalFor(ctx, b);
+    const providerB = counting({ withQuestions: false });
+    const draftB = await generate(ctx, b, pb, providerB, { codex: { deferQuestions: true } });
+    assert.equal(drafts.hasReusableContent(ctx.db, b, { draftId: draftB.id }), false);
+    await drafts.generateDeferredQuestions(ctx.db, b, draftB.id, { providerImpl: providerB });
+    assert.equal(providerB.questionCalls, 1, "A's bank is A's alone");
+  } finally { ctx.cleanup(); }
+});
```
