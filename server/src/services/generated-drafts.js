import { createHash } from 'node:crypto';
import { generateDraft as fakeGenerateDraft, FAKE_PROVIDER_NAME } from '../ai/fake-provider.js';
import { detectSourceLanguage, checkDraftLanguage, LanguageMismatch } from '../ai/language-contract.js';
import { ensureGenerationLocale } from './settings.js';
import { estimateCostUnits, reserve, settle, release, BudgetError } from './generation-budget.js';
import {
  generateDraft as anthropicGenerateDraft, auditDraftWithModel, repairDraftWithModel,
  ANTHROPIC_PROVIDER_NAME, ProviderRequestError,
} from '../ai/anthropic-provider.js';
import {
  generateDraft as openaiGenerateDraft, auditDraftWithModel as openaiAudit, repairDraftWithModel as openaiRepair, OPENAI_PROVIDER_NAME,
} from '../ai/openai-provider.js';
import {
  generateDraft as codexGenerateDraft, auditDraftWithModel as codexAudit, repairDraftWithModel as codexRepair,
  CODEX_PROVIDER_NAME, CODEX_DEFAULT_TIMEOUT_MS,
} from '../ai/codex-provider.js';
import { validateDraft, DraftValidationError } from '../ai/draft-schema.js';
import { segmentsForProposal, assertPayloadWithinScope, ScopeViolation } from './proposal-scope.js';
import { effectiveKind } from './unit-kind.js';
import { auditDraft, AUDIT_RESULT, AUDIT_RULES_VERSION } from '../ai/draft-audit.js';
import { groundSummary } from '../ai/claim-evidence.js';

export class DraftError extends Error {
  constructor(code, message, field) {
    super(message);
    this.code = code;
    if (field) this.field = field;
  }
}

/**
 * Whether the real provider is even reachable for this account/request.
 * ALL THREE must be explicitly configured -- a missing budget cap or
 * withheld consent blocks the live path exactly like a missing API key
 * does (design.md: "requires the user's configured consent and budget
 * cap"). Pure and side-effect-free so it is directly unit-testable
 * without touching config.js or the network.
 */
export function selectProvider({ provider: declared = null, apiKey, model, consentGranted, budgetCapUsd, fetchImpl, apiUrl, codex = {} }) {
  const liveAvailable = Boolean(apiKey) && Boolean(model) && consentGranted === true && typeof budgetCapUsd === 'number' && budgetCapUsd > 0;
  const options = { apiKey, model, ...(fetchImpl ? { fetchImpl } : {}), ...(apiUrl ? { apiUrl } : {}) };
  const anthropic = () => ({
    name: ANTHROPIC_PROVIDER_NAME,
    live: true,
    generate: (input) => anthropicGenerateDraft(input, options),
    // Production-time quality gate: an independent audit and one targeted repair. Same
    // credentials, consent and budget as generation — never a runtime call for the student.
    audit: (input) => auditDraftWithModel(input, options),
    repair: (input) => repairDraftWithModel(input, options),
  });
  const openai = () => ({
    name: OPENAI_PROVIDER_NAME,
    live: true,
    generate: (input) => openaiGenerateDraft(input, options),
    audit: (input) => openaiAudit(input, options),
    repair: (input) => openaiRepair(input, options),
  });

  // A DECLARED provider is honoured exactly: never silently replaced by fake or by another provider
  // (AI_SILENT_FALLBACK=FORBIDDEN). Without credentials/consent/budget it is an explicit error.
  if (declared) {
    const name = String(declared).toUpperCase();
    if (name === 'FAKE') return { name: FAKE_PROVIDER_NAME, live: false, languageContract: 'NOT_APPLICABLE', generate: fakeGenerateDraft };
    // CODEX authenticates through the operator's own Codex CLI login, not an API key, and has no per-request price to
    // cap — so the key/model/budget gate does not apply. Explicit consent still does, and a Codex that is missing or not
    // logged in is an explicit error raised by the provider itself (never fake/other-provider content).
    if (name === CODEX_PROVIDER_NAME) {
      if (consentGranted !== true) {
        throw new DraftError('MISSING_CREDENTIALS', 'O provedor CODEX está configurado, mas falta o consentimento explícito (SMARTLEARN_AI_CONSENT=true). Nenhum conteúdo substituto foi gerado.');
      }
      // One options object per selected provider: it also carries the per-draft call counters.
      const codexOptions = { ...codex, state: {} };
      return {
        name: CODEX_PROVIDER_NAME,
        live: true,
        // The outer deadline sits just above the child-process deadline so the child is killed first.
        timeoutMs: (codex.timeoutMs ?? CODEX_DEFAULT_TIMEOUT_MS) + 5_000,
        generate: (input) => codexGenerateDraft(input, codexOptions),
        audit: (input) => codexAudit(input, codexOptions),
        repair: (input) => codexRepair(input, codexOptions),
      };
    }
    if (name !== OPENAI_PROVIDER_NAME && name !== ANTHROPIC_PROVIDER_NAME) {
      throw new DraftError('UNKNOWN_PROVIDER', `Provedor de IA desconhecido: ${declared}.`);
    }
    if (!liveAvailable) {
      throw new DraftError('MISSING_CREDENTIALS', `O provedor ${name} está configurado, mas faltam credencial, modelo, consentimento ou teto de orçamento. Nenhum conteúdo substituto foi gerado.`);
    }
    return name === OPENAI_PROVIDER_NAME ? openai() : anthropic();
  }

  // Nothing declared (legacy behaviour): the configured real adapter when fully configured, otherwise the fake.
  if (liveAvailable) return anthropic();
  return { name: FAKE_PROVIDER_NAME, live: false, languageContract: 'NOT_APPLICABLE', generate: fakeGenerateDraft };
}
function withTimeout(promise, timeoutMs, onTimeoutCode) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new DraftError(onTimeoutCode, 'Tempo limite excedido.')), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const isBlocking = (f) => f.severity === 'HIGH' || f.severity === 'MEDIUM';
const withSource = (findings, source) => findings.map((f) => ({ ...f, source }));

/**
 * Production-time quality gate. 1 generation -> deterministic screen (+ 1 independent model audit
 * when the live provider is active) -> if anything blocking, ONE targeted repair -> re-validate ->
 * screen again. Bounded on purpose: never a generate/audit loop. The result never promotes
 * anything — the draft stays DRAFT for a human either way; `audit` only tells the reviewer where
 * to look. A model failure at any step degrades to the deterministic screen, never to a failed draft.
 */
async function auditAndRepair(provider, validated, segments, { promptVersion, timeoutMs }) {
  let draft = validated;
  let findings = withSource(auditDraft(draft, { segments }).findings, 'DETERMINISTIC');
  const auditedBy = ['DETERMINISTIC'];
  let modelAudit = 'NOT_RUN';

  if (provider.live && provider.audit) {
    try {
      const r = await withTimeout(provider.audit({ draft, segments }), timeoutMs, 'TIMEOUT');
      if (r.malformed) {
        modelAudit = 'MALFORMED';
      } else {
        modelAudit = 'OK';
        auditedBy.push('MODEL');
        findings = [...findings, ...r.findings];
      }
    } catch {
      modelAudit = 'UNAVAILABLE';
    }
  }

  let repaired = false;
  let repairRejected = false;
  let addressed = [];
  const blocking = findings.filter(isBlocking);
  if (provider.live && provider.repair && blocking.length > 0) {
    try {
      const rawRepair = await withTimeout(
        provider.repair({ draft, findings: blocking, segments, promptVersion: draft.promptVersion }), timeoutMs, 'TIMEOUT',
      );
      // provider-owned metadata is not the model's to rewrite
      const revalidated = validateDraft({ ...rawRepair, modelVersion: draft.modelVersion, promptVersion: draft.promptVersion }, { segments });
      addressed = blocking.map((f) => ({ issue: f.issue, scope: f.scope }));
      draft = revalidated;
      repaired = true;
      // the model's own findings were about the text that no longer exists; re-screen what is there now
      findings = withSource(auditDraft(draft, { segments }).findings, 'DETERMINISTIC');
    } catch {
      repairRejected = true;
    }
  }

  const audit = {
    result: findings.some(isBlocking) ? AUDIT_RESULT.REPAIR : AUDIT_RESULT.PASS,
    findings,
    auditedBy,
    modelAudit,
    repaired,
    repairRejected,
    addressed,
  };
  return { draft, audit };
}

function findOwnedProposalWithSegments(db, userId, proposalId) {
  const proposal = db.prepare('SELECT * FROM content_proposals WHERE user_id = ? AND id = ?').get(userId, proposalId);
  if (!proposal) return null;
  return { proposal, segments: segmentsForProposal(db, userId, proposal) };
}

/** Identity of the exact text a draft is generated from: SHA-256 over the (pageIndex, text) segments sent to the provider. */
export function segmentsDigest(segments) {
  return createHash('sha256').update(JSON.stringify(segments.map((s) => [s.pageIndex, s.text]))).digest('hex');
}

/**
 * SPRINT-04: true when this unaccepted draft was generated from text that the proposal's pages no longer hold
 * (the source was re-extracted with different text, or a page went away). Compared by content, so re-extracting
 * IDENTICAL text never invalidates a draft. A draft with no recorded input (created before the binding existed)
 * is unknown, not stale; an accepted draft is history, not stale.
 */
export function isDraftStale(db, userId, row) {
  if (row.status !== 'DRAFT' || !row.input_sha256) return false;
  const found = findOwnedProposalWithSegments(db, userId, row.proposal_id);
  if (!found) return true;
  return segmentsDigest(found.segments) !== row.input_sha256;
}

const CITED_PAGE_TEXT_CAP = 1500;

/** The source pages this draft cites (summary + questions), so a reviewer can verify each claim
 * next to the draft. Read live from the proposal's own pages; capped per page. */
function citedPagesFor(db, userId, row, draft) {
  const cited = new Set((draft.summarySourceSpans ?? []).map((s) => s.pageIndex));
  for (const q of draft.questions ?? []) for (const s of q.sourceSpans ?? []) cited.add(s.pageIndex);
  if (cited.size === 0) return [];
  const proposal = db.prepare('SELECT source_id FROM content_proposals WHERE user_id = ? AND id = ?').get(userId, row.proposal_id);
  if (!proposal) return [];
  return db.prepare('SELECT page_index, text FROM source_pages WHERE user_id = ? AND source_id = ? ORDER BY page_index')
    .all(userId, proposal.source_id)
    .filter((p) => cited.has(p.page_index))
    .map((p) => ({ pageIndex: p.page_index, text: p.text.slice(0, CITED_PAGE_TEXT_CAP) }));
}

/**
 * LESSON EDITOR: a lesson is SUMMARY + QUESTIONS[], each independently addressable. Every question has a stable id
 * ("q<n>", never reused after a delete), its own `version` (bumped by each edit of THAT question) and a human review
 * `status` (PROPOSED | ACCEPTED | REJECTED); the summary has its own `summaryVersion`. Drafts written before this existed are
 * given ids deterministically by position, so reading twice yields the same ids; they are persisted with the next edit.
 */
const QUESTION_REVIEW_STATUSES = new Set(['PROPOSED', 'ACCEPTED', 'REJECTED']);
const idNumber = (id) => { const m = /^q(\d+)$/.exec(String(id ?? '')); return m ? Number(m[1]) : 0; };

const QUESTION_ORIGINS = new Set(['GENERATED', 'HUMAN_EDITED', 'HUMAN_ADDED']);

/** Who generated a draft, as stored in its row. Used to presume the generator of questions written before provenance existed. */
const generatorOf = (row) => ({ provider: row.provider, modelVersion: row.model_version, promptVersion: row.prompt_version });

/**
 * PROVENANCE (T-F2-04). Each question carries `origin` (GENERATED | HUMAN_EDITED | HUMAN_ADDED), `generatedBy`
 * ({provider, modelVersion, promptVersion}; null for a human-added question) and `editedAt`; the summary carries
 * `summaryOrigin`/`summaryEditedAt`. A human edit moves origin to HUMAN_EDITED and never erases `generatedBy`. Content stored
 * before this existed has none of it: reading presumes GENERATED from the draft row and marks the question `legacy: true`
 * (presumed, not recorded). That presumption is derived on read and written only when a later edit persists the draft.
 */
export function normalizeContent(content, generatedByDefault = null) {
  const questions = content.questions ?? [];
  let seq = Math.max(Number.isInteger(content.questionSeq) ? content.questionSeq : 0, ...questions.map((q) => idNumber(q.id)));
  const used = new Set(questions.map((q) => q.id).filter(Boolean));
  const normalized = questions.map((q) => {
    let id = q.id;
    if (!id) { do { seq += 1; id = `q${seq}`; } while (used.has(id)); used.add(id); }
    const recorded = QUESTION_ORIGINS.has(q.origin);
    const origin = recorded ? q.origin : 'GENERATED';
    const { legacy: _storedLegacy, ...rest } = q;
    return {
      ...rest,
      id,
      status: QUESTION_REVIEW_STATUSES.has(q.status) ? q.status : 'PROPOSED',
      version: Number.isInteger(q.version) ? q.version : 1,
      origin,
      generatedBy: origin === 'HUMAN_ADDED' ? null : (q.generatedBy ?? generatedByDefault ?? null),
      editedAt: q.editedAt ?? null,
      ...(!recorded || q.legacy === true ? { legacy: true } : {}),
    };
  });
  return {
    ...content,
    sourceLanguage: content.sourceLanguage ?? null,
    generationLocale: content.generationLocale ?? null,
    languageCheck: content.languageCheck ?? null,
    summaryOrigin: content.summaryOrigin === 'HUMAN_EDITED' ? 'HUMAN_EDITED' : 'GENERATED',
    summaryEditedAt: content.summaryEditedAt ?? null,
    summaryVersion: Number.isInteger(content.summaryVersion) ? content.summaryVersion : 1,
    questionSeq: seq,
    questions: normalized,
  };
}

/** Audit findings with the entity they are about (stable id), so the UI groups them per question instead of dumping them. */
export function findingsWithEntities(audit, questions) {
  if (!audit) return audit;
  return {
    ...audit,
    findings: (audit.findings ?? []).map((f, index) => {
      const m = /^question:(\d+)$/.exec(f.scope ?? '');
      const target = m ? questions[Number(m[1])] : null;
      return {
        ...f,
        id: `f${index + 1}`,
        entityType: f.scope === 'summary' ? 'SUMMARY' : (target ? 'QUESTION' : 'DRAFT'),
        entityId: f.scope === 'summary' ? 'summary' : (target ? target.id : null),
        status: 'OPEN',
      };
    }),
  };
}

/**
 * What the human has not yet resolved: HIGH findings ("wrong or unsupported medical content"). AI output stays a draft until a
 * person has dealt with each one, and that is enforced HERE, not only by the screen:
 *   - a question with a HIGH finding must be explicitly ACCEPTED by the reviewer (or rejected, which keeps it out);
 *   - HIGH findings on the summary need the reviewer's explicit acknowledgement (there is no per-claim state to resolve).
 * MEDIUM and LOW stay advisory (their false-positive rate would otherwise build a wall of alerts), and so do the HIGH findings
 * that are about HOW the content teaches rather than whether it is true to the source (too thin, answer or hint giving the
 * answer away): they stay visible on the review screen but never stop the lesson.
 */
const PEDAGOGY_ONLY = new Set(['SUMMARY_TOO_THIN', 'QUESTION_ANSWER_TOO_THIN', 'QUESTION_ANSWER_LEAKED', 'HINT_REVEALS_ANSWER', 'HINT_REVEALS_VALUE', 'QUESTION_VOLUME_OUT_OF_RANGE']);

export function acceptanceBlockers(content, { acknowledgeSummaryFindings = false } = {}) {
  const findings = findingsWithEntities(content.audit, content.questions)?.findings ?? [];
  const high = findings.filter((f) => f.severity === 'HIGH' && !PEDAGOGY_ONLY.has(f.issue));
  const questionIds = new Set(high.filter((f) => f.entityType === 'QUESTION').map((f) => f.entityId));
  const questions = content.questions.filter((q) => questionIds.has(q.id) && q.status !== 'ACCEPTED' && q.status !== 'REJECTED').map((q) => q.id);
  const summary = acknowledgeSummaryFindings === true ? 0 : high.filter((f) => f.entityType === 'SUMMARY').length;
  return { questions, summary };
}

/** Read-only: which document and pages the unit this draft hangs on covers (shown even for drafts generated before sourceScope existed). */
function sourceUnitFor(db, userId, proposalId) {
  const r = db.prepare(`SELECT p.title, p.page_start AS pageStart, p.page_end AS pageEnd, s.original_name AS documentName
    FROM content_proposals p JOIN sources s ON s.user_id = p.user_id AND s.id = p.source_id WHERE p.user_id = ? AND p.id = ?`).get(userId, proposalId);
  return r ?? null;
}

function toDraftDto(row, { db, userId } = {}) {
  const draft = normalizeContent(JSON.parse(row.draft_json), generatorOf(row));
  const audit = findingsWithEntities(draft.audit, draft.questions);
  const flaggedIds = new Set((audit?.findings ?? []).filter((f) => f.severity !== 'LOW' && f.entityType === 'QUESTION').map((f) => f.entityId));
  draft.questions = draft.questions.map((q) => ({
    ...q,
    status: q.status === 'PROPOSED' && flaggedIds.has(q.id) ? 'FLAGGED' : q.status,
    findingCount: (audit?.findings ?? []).filter((f) => f.severity !== 'LOW' && f.entityId === q.id).length,
  }));
  draft.audit = audit;
  // Which sentence of the summary is backed by a real passage of the approved source, recomputed NOW (never a stored verdict).
  const grounded = db ? findOwnedProposalWithSegments(db, userId, row.proposal_id) : null;
  draft.summaryGrounding = groundSummary(draft.summary, draft.summaryEvidence, grounded?.segments ?? []);
  // what acceptance would refuse right now (without the summary acknowledgement): the screen reads it instead of re-deriving the rule
  const acceptanceBlock = acceptanceBlockers({ ...draft, audit: draft.audit }, {});
  return {
    acceptanceBlockers: { questions: acceptanceBlock.questions, summary: acceptanceBlock.summary },
    id: row.id,
    proposalId: row.proposal_id,
    provider: row.provider,
    modelVersion: row.model_version,
    promptVersion: row.prompt_version,
    status: row.status,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
    acceptedAt: row.accepted_at ?? null,
    acceptedUnitId: row.accepted_unit_id ?? null,
    ...draft,
    // T-F2-03: a COMPARISON only (opening never recalculates nor writes); an audit stored without a version is older than any version.
    auditStale: Boolean(audit) && audit.rulesVersion !== AUDIT_RULES_VERSION,
    sourceStale: db ? isDraftStale(db, userId, row) : false,
    sourceUnit: db ? sourceUnitFor(db, userId, row.proposal_id) : null,
    pages: db ? citedPagesFor(db, userId, row, draft) : [],
  };
}

/**
 * Everything that can be refused BEFORE a provider is involved: unknown proposal, no usable text, editorial (non-content)
 * unit, a payload that is not inside the approved scope, an input over the size limit. Shared by the synchronous
 * createDraft and by the background generation job, so both give the same early, 4xx-style answers.
 */
export function prepareGeneration(db, userId, proposalId, { maxInputChars = 50_000 } = {}) {
  const found = findOwnedProposalWithSegments(db, userId, proposalId);
  if (!found) throw new DraftError('NOT_FOUND', 'Proposta não encontrada.');
  if (found.segments.length === 0) throw new DraftError('NO_USABLE_TEXT', 'Nenhuma página deste trecho tem texto utilizável (vazia ou ilegível na extração), então não há o que gerar. Nada foi enviado ao modelo.');

  // Editorial pages (copyright, dedication, answer key...) are indexed but never offered to the model.
  if (effectiveKind(found.proposal) !== 'CONTENT') {
    throw new DraftError('NOT_GENERATABLE', `Este trecho (${effectiveKind(found.proposal)}) não é conteúdo de estudo e não gera rascunho. Nada foi enviado ao modelo.`);
  }
  // payload ⊆ approved scope, proven from the stored pages BEFORE any provider is called.
  let scope;
  try {
    scope = assertPayloadWithinScope(db, userId, found.proposal, found.segments);
  } catch (err) {
    if (err instanceof ScopeViolation) throw new DraftError('SCOPE_VIOLATION', err.message);
    throw err;
  }

  const totalChars = found.segments.reduce((sum, s) => sum + s.text.length, 0);
  if (totalChars > maxInputChars) {
    throw new DraftError('INPUT_TOO_LARGE', `Este trecho tem texto demais para gerar um rascunho de uma vez (${totalChars} de ${maxInputChars} caracteres). Isso só acontece com uma única página muito densa: use um material com menos texto por página ou envie-o de novo em partes.`);
  }
  return { found, scope };
}

/**
 * Generates and persists one draft for a proposal. ALWAYS status='DRAFT' --
 * no learning_unit/exercise is ever created here (T38's job). Bounds the
 * total input size before calling ANY provider (design.md: "Bound request
 * size/time/cost"), enforces a deadline around the provider call itself
 * (fake or real), and validates the raw result through the exact same
 * draft-schema.js regardless of which provider produced it -- "the real
 * one" gets no special trust.
 */
/** Provider failures that prove no request left the machine: nothing was spent, so the reservation is released. */
const PRE_SEND_FAILURES = new Set(['MISSING_CREDENTIALS', 'CODEX_NOT_FOUND', 'CODEX_NOT_AUTHENTICATED', 'CALL_LIMIT_EXCEEDED', 'UNKNOWN_PROVIDER']);

export async function createDraft(db, userId, proposalId, {
  // SMARTLEARN_PRODUCT_FIRST_V1 Slice 1: bumped from '1' -- the real
  // provider's prompt (anthropic-provider.js) changed materially (varied
  // question types, teaching answers, genuine hints), and promptVersion
  // is stored per draft precisely so a version change like this is
  // distinguishable in stored/historical drafts, not silently conflated.
  // '8': structured study-map summary, no references to the document (challenger of 2026-10-08, promoted after two real units; '7' stays reproducible by passing it).
  // '7': summaryEvidence (the model proposes which passage backs which sentence; the server confirms it).
  // '5' (REALMODEL-1 quality closure): explanations must add a cause, hints must not leak the answer or its value, named
  // conditions must survive, whole-sentence copying is discouraged.
  promptVersion = '8',
  apiKey = null,
  model = null,
  consentGranted = false,
  budgetCapUsd = null,
  timeoutMs = 30_000,
  maxInputChars = 50_000,
  fetchImpl = null,
  apiUrl = null,
  provider: declaredProvider = null,
  codex = {},
  // Test/ops seam: an already-built provider ({name, live, generate, audit?, repair?}) used instead of selectProvider, so a
  // spy can prove how many calls would have reached a model.
  providerImpl = null,
  // Credit limits for this call (tests); undefined = the configured limits (services/generation-budget.js).
  budgetLimits = undefined,
  // System/Accept-Language hint, used ONLY to initialize the student's generationLocale the first time (never afterwards).
  localeHint = null,
  // Generation is JIT and reuses what is valid: a repeat request returns the existing draft/lesson with NO provider call.
  // Making a new one is an explicit act.
  regenerate = false,
  // T-F3-02: set only by the background job runner. { signal, onReservation(reservation), onBudgetClosed({reservationId, state,
  // consumedUnits}), onPhase(phase) }. An aborted signal stops the work before the provider is called and before anything is stored.
  hooks = null,
  now = () => new Date(),
} = {}) {
  if (!regenerate) {
    const existing = reusableDraftRow(db, userId, proposalId);
    if (existing) return { ...toDraftDto(existing, { db, userId }), live: existing.provider !== FAKE_PROVIDER_NAME, reused: true };
  }
  const { found, scope } = prepareGeneration(db, userId, proposalId, { maxInputChars });

  // Bind the draft to the exact text it is generated from (SPRINT-04), fixed BEFORE the provider call.
  const inputDigest = segmentsDigest(found.segments);
  const inputGeneration = db.prepare('SELECT extraction_generation FROM sources WHERE user_id = ? AND id = ?').get(userId, found.proposal.source_id)?.extraction_generation ?? null;

  // The three languages: the source's (detected here), the student's persisted content language (never inferred from the
  // source or the interface) and, for the model, what to write in. A first generation initializes the preference once.
  const sourceLanguage = detectSourceLanguage(found.segments);
  const generationLocale = ensureGenerationLocale(db, userId, localeHint);

  const provider = providerImpl ?? selectProvider({ provider: declaredProvider, apiKey, model, consentGranted, budgetCapUsd, fetchImpl, apiUrl, codex });
  // A provider may need a longer deadline than the generic one (a Codex run is minutes, not seconds).
  const deadlineMs = provider.timeoutMs ?? timeoutMs;

  // CREDIT (R-12): a provider that reaches an external model never runs without a reservation inside the limits. The
  // estimate counts every call this provider may make (generate, independent audit, one repair). Refused here = nothing was
  // sent and nothing is debited. The deterministic test double (live:false) spends nothing external and skips the ledger.
  const plannedCalls = 1 + (provider.audit ? 1 : 0) + (provider.repair ? 1 : 0);
  const payloadChars = found.segments.reduce((sum, s) => sum + s.text.length, 0);
  let reservation = null;
  if (provider.live === true) {
    try {
      reservation = reserve(db, userId, { proposalId, estimatedUnits: estimateCostUnits({ payloadChars, calls: plannedCalls }), limits: budgetLimits, now });
      hooks?.onReservation?.(reservation);
    } catch (err) {
      if (err instanceof BudgetError) throw new DraftError('BUDGET_EXCEEDED', err.message);
      throw err;
    }
  }
  let callsMade = 1;
  let budgetClosed = reservation === null;
  // Exactly one of settle/release, once. Release = nothing external happened; settle = it may have, charged at the estimate of
  // the calls actually made (no provider reports a measurable cost yet, so the basis is ESTIMATED).
  const closeBudget = ({ refund = false } = {}) => {
    if (budgetClosed) return;
    budgetClosed = true;
    if (refund) {
      release(db, reservation.id, { now });
      hooks?.onBudgetClosed?.({ reservationId: reservation.id, state: 'RELEASED', consumedUnits: 0 });
    } else {
      const consumedUnits = estimateCostUnits({ payloadChars, calls: callsMade });
      settle(db, reservation.id, { consumedUnits, basis: 'ESTIMATED', now });
      hooks?.onBudgetClosed?.({ reservationId: reservation.id, state: 'SETTLED', consumedUnits });
    }
  };
  try {

  // Stopped before any request could leave: nothing was spent, so the held balance returns.
  if (hooks?.signal?.aborted) {
    closeBudget({ refund: true });
    throw new DraftError('CANCELLED', 'A geração foi interrompida antes da chamada ao provedor. Nada foi enviado.');
  }

  let raw;
  try {
    raw = await withTimeout(provider.generate({ segments: found.segments, promptVersion, sourceLanguage, generationLocale }), deadlineMs, 'TIMEOUT');
  } catch (err) {
    // Failures that happen BEFORE a request can leave (no credentials, CLI absent or not logged in, the local call limit)
    // spent nothing; any other failure may have happened after the model was reached and is charged.
    closeBudget({ refund: err instanceof ProviderRequestError && PRE_SEND_FAILURES.has(err.code) });
    if (err instanceof DraftError) throw err;
    if (err instanceof ProviderRequestError) throw new DraftError(err.code, err.message);
    // T-F8-03: an exception the provider adapters did not shape themselves is NOT reported verbatim -- its text can carry the
    // request (credential, source text) and this message is returned to the client and stored on the job.
    throw new DraftError('PROVIDER_ERROR', 'O provedor falhou de forma inesperada. Nada foi salvo.');
  }

  let validated;
  try {
    validated = validateDraft(raw, { segments: found.segments });
  } catch (err) {
    if (err instanceof DraftValidationError) throw new DraftError(err.code, err.message, err.field);
    throw err;
  }

  // Wrong language = contract failure: refused BEFORE spending an audit on it, and nothing is stored.
  // The built-in deterministic test double only slices the source text: it cannot write in another language, so the contract
  // is recorded as NOT_APPLICABLE for it (never for a real provider or an injected one).
  const languageCheckOf = (draft) => {
    if (provider.languageContract === 'NOT_APPLICABLE') return { status: 'NOT_APPLICABLE', detected: null, declared: null };
    try {
      return checkDraftLanguage(draft, generationLocale, raw.language);
    } catch (err) {
      if (err instanceof LanguageMismatch) throw new DraftError('LANGUAGE_MISMATCH', err.message);
      throw err;
    }
  };
  languageCheckOf(validated);

  const proposedEvidence = validated.summaryEvidence;
  const audited = await auditAndRepair(provider, validated, found.segments, { promptVersion, timeoutMs: deadlineMs });
  validated = audited.draft;
  // A repair that does not return evidence keeps the entries already confirmed; any whose sentence it rewrote simply stop holding (recomputed on read).
  if (!validated.summaryEvidence?.length) validated = { ...validated, summaryEvidence: proposedEvidence };
  callsMade = 1 + (audited.audit.modelAudit !== 'NOT_RUN' ? 1 : 0) + (audited.audit.repaired || audited.audit.repairRejected ? 1 : 0);
  // A repair may have rewritten text: the final content is what must be in the target language.
  const languageCheck = languageCheckOf(validated);
  closeBudget();

  // A stopped job never leaves a draft behind, not even a complete one that finished too late (the call happened: it is charged).
  hooks?.onPhase?.('SAVING');
  if (hooks?.signal?.aborted) throw new DraftError('CANCELLED', 'A geração foi interrompida; nenhum rascunho foi salvo.');

  const nowIso = now().toISOString();
  const generatedBy = { provider: provider.name, modelVersion: validated.modelVersion, promptVersion: validated.promptVersion };
  const draftContent = normalizeContent({
    summary: validated.summary,
    summarySourceSpans: validated.summarySourceSpans,
    summaryEvidence: validated.summaryEvidence ?? [],
    questions: validated.questions.map((q) => ({ ...q, origin: 'GENERATED', generatedBy, editedAt: null })),
    quarantinedCount: validated.quarantinedCount,
    audit: { ...audited.audit, rulesVersion: AUDIT_RULES_VERSION, auditedAt: nowIso },
    sourceLanguage,
    generationLocale,
    languageCheck: languageCheck.status,
    sourceScope: {
      documentId: found.proposal.source_id,
      documentName: db.prepare('SELECT original_name FROM sources WHERE user_id = ? AND id = ?').get(userId, found.proposal.source_id)?.original_name ?? null,
      topic: found.proposal.topic ?? found.proposal.title,
      approvedPages: [found.proposal.page_start, found.proposal.page_end],
      spanCount: found.proposal.spans_json ? JSON.parse(found.proposal.spans_json).length : null,
      sourceChars: scope.sourceChars,
      payloadChars: scope.payloadChars,
      payloadPages: scope.pages,
    },
  });
  const result = db.prepare(`
    INSERT INTO generated_drafts (user_id, proposal_id, provider, model_version, prompt_version, status, draft_json, created_at, input_sha256, source_extraction_generation)
    VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?)
  `).run(
    userId, proposalId, provider.name, validated.modelVersion, validated.promptVersion, JSON.stringify(draftContent), nowIso,
    inputDigest, inputGeneration,
  );

  return { ...toDraftDto(db.prepare('SELECT * FROM generated_drafts WHERE id = ?').get(result.lastInsertRowid), { db, userId }), live: provider.live };
  } finally {
    // Whatever happened above (validation, language, an unexpected error), no reservation is ever left open.
    closeBudget();
  }
}

/**
 * The newest draft of this unit that is still worth keeping: an accepted lesson, or a draft whose source text has not
 * changed. A stale draft is not reusable (its text no longer matches what it was generated from). NOT_FOUND when the unit is
 * not this user's, so reuse never reveals another user's content.
 */
function reusableDraftRow(db, userId, proposalId) {
  const proposal = db.prepare('SELECT id FROM content_proposals WHERE user_id = ? AND id = ?').get(userId, proposalId);
  if (!proposal) throw new DraftError('NOT_FOUND', 'Proposta não encontrada.');
  const rows = db.prepare('SELECT * FROM generated_drafts WHERE user_id = ? AND proposal_id = ? ORDER BY id DESC').all(userId, proposalId);
  for (const row of rows) {
    if (row.status === 'ACCEPTED') return row;
    if (row.status === 'DRAFT' && !isDraftStale(db, userId, row)) return row;
  }
  return null;
}

/** Where a unit is in its life: NOT_GENERATED | DRAFT | ACCEPTED | STALE (only stale drafts exist). GENERATING arrives with the jobs. */
export function generationState(db, userId, proposalId) {
  const reusable = reusableDraftRow(db, userId, proposalId);
  if (reusable) return reusable.status === 'ACCEPTED' ? 'ACCEPTED' : 'DRAFT';
  const any = db.prepare("SELECT 1 FROM generated_drafts WHERE user_id = ? AND proposal_id = ? AND status = 'DRAFT' LIMIT 1").get(userId, proposalId);
  return any ? 'STALE' : 'NOT_GENERATED';
}

/**
 * C3 (audit): "permite inspeção/edição" before acceptance. Only ever
 * touches a DRAFT-status row -- editing an already-ACCEPTED draft is
 * rejected (its content is now history, T17/A1's own immutability
 * principle). The edited content is re-validated through the exact same
 * draft-schema.js boundary a freshly generated draft goes through (no
 * special "trusted because a human typed it" bypass), against this
 * proposal's real segments, so a hand-edited citation still can't point
 * at a page that was never actually part of the source excerpt.
 * Bumps `revision` -- the value acceptDraft() requires an exact match on,
 * so a concurrent accept racing this edit gets an explicit conflict
 * rather than silently publishing whichever version happened to land in
 * the database last.
 */
// T-F2-01: replaces the WHOLE question list, so it is for fixtures only and is never wired to a route
// (guard test: draft-whole-list-replace). Product edits go through reviseSummary / reviseQuestion by id.
export function replaceDraftContent(db, userId, draftId, { summary, questions } = {}, now = () => new Date()) {
  const draftRow = db.prepare('SELECT * FROM generated_drafts WHERE user_id = ? AND id = ?').get(userId, draftId);
  if (!draftRow) throw new DraftError('NOT_FOUND', 'Rascunho não encontrado.');
  if (draftRow.status !== 'DRAFT') {
    throw new DraftError('INVALID_STATE', `Rascunho no estado ${draftRow.status} não pode ser editado.`);
  }

  const found = findOwnedProposalWithSegments(db, userId, draftRow.proposal_id);
  if (!found) throw new DraftError('NOT_FOUND', 'Proposta de origem não encontrada.');

  const current = normalizeContent(JSON.parse(draftRow.draft_json), generatorOf(draftRow));
  const candidate = {
    summary: summary !== undefined ? summary : current.summary,
    summarySourceSpans: current.summarySourceSpans,
    questions: questions !== undefined ? questions : current.questions.map(editableQuestion),
    modelVersion: draftRow.model_version,
    promptVersion: draftRow.prompt_version,
  };

  const validated = validateOrThrow(candidate, found.segments);

  // Identity survives a whole-draft edit: while the question list keeps its length each question keeps its id and
  // status, and only the ones whose text changed get a new version.
  // A different count cannot be matched to the old questions, so their review status would be lost: a REJECTED question would
  // silently come back as PROPOSED. Refuse and point to the per-question edits instead.
  if (validated.questions.length !== current.questions.length && current.questions.some((q) => q.status === 'REJECTED')) {
    throw new DraftError('ENTITY_CONFLICT', 'Há questões rejeitadas: altere a lista por questão (editar ou excluir), não substituindo todas de uma vez.');
  }
  const nextQuestions = validated.questions.length === current.questions.length
    ? validated.questions.map((q, i) => mergeIdentity(current.questions[i], q, now().toISOString()))
    : validated.questions;
  return persistEdit(db, userId, draftId, draftRow, found, current, {
    summary: validated.summary,
    summarySourceSpans: validated.summarySourceSpans,
    questions: nextQuestions,
    summaryVersion: validated.summary === current.summary ? current.summaryVersion : current.summaryVersion + 1,
    quarantinedCount: validated.quarantinedCount,
  }, now);
}

const EDITABLE_FIELDS = ['question', 'answer', 'explanation', 'questionType', 'hint', 'sourceSpans'];
const editableQuestion = (q) => Object.fromEntries(EDITABLE_FIELDS.map((k) => [k, q[k] ?? null]));

function validateOrThrow(candidate, segments) {
  try {
    return validateDraft(candidate, { segments });
  } catch (err) {
    if (err instanceof DraftValidationError) throw new DraftError(err.code, err.message, err.field);
    throw err;
  }
}

/** The validated text of a question plus the identity (id, review status, version) it already had; version moves only if the text did. */
function mergeIdentity(previous, validatedQuestion, nowIso) {
  const changed = EDITABLE_FIELDS.some((k) => JSON.stringify(previous?.[k] ?? null) !== JSON.stringify(validatedQuestion[k] ?? null));
  const origin = previous?.origin ?? 'GENERATED';
  return {
    ...validatedQuestion,
    id: previous?.id,
    status: previous?.status ?? 'PROPOSED',
    version: (previous?.version ?? 1) + (changed ? 1 : 0),
    // Provenance moves only when the TEXT moved: a status change or a no-op edit keeps it. Who generated it is never erased.
    origin: changed && origin === 'GENERATED' ? 'HUMAN_EDITED' : origin,
    generatedBy: previous?.generatedBy ?? null,
    editedAt: changed ? nowIso : (previous?.editedAt ?? null),
    ...(previous?.legacy ? { legacy: true } : {}),
  };
}

function loadEditable(db, userId, draftId) {
  const draftRow = db.prepare('SELECT * FROM generated_drafts WHERE user_id = ? AND id = ?').get(userId, draftId);
  if (!draftRow) throw new DraftError('NOT_FOUND', 'Rascunho não encontrado.');
  if (draftRow.status !== 'DRAFT') throw new DraftError('INVALID_STATE', `Rascunho no estado ${draftRow.status} não pode ser editado.`);
  const found = findOwnedProposalWithSegments(db, userId, draftRow.proposal_id);
  if (!found) throw new DraftError('NOT_FOUND', 'Proposta de origem não encontrada.');
  return { draftRow, found, current: normalizeContent(JSON.parse(draftRow.draft_json), generatorOf(draftRow)) };
}

/** Re-screens deterministically (a human edit changes the text, so earlier findings describe text that is gone), writes ONE row update and bumps the draft revision. */
/** The fields of a question a reviewer can change the MEANING of (status, version and timestamps are not content). */
const questionText = (q) => JSON.stringify([q.question, q.answer, q.explanation ?? null, q.hint ?? null, q.questionType ?? null]);

/**
 * A model finding is about one specific text. After an edit it stays when THAT text is untouched (accepting an unrelated question
 * must not erase a critical point about the summary) and goes when the text it judged changed. Findings are addressed by question
 * position, so if questions were added, removed or reordered none of them can be trusted to still point at the same question.
 */
function modelFindingsStillValid(previous, current, next) {
  const kept = (previous?.findings ?? []).filter((f) => f.source === 'MODEL');
  if (kept.length === 0) return [];
  const sameShape = current.questions.length === next.questions.length && current.questions.every((q, i) => q.id === next.questions[i].id);
  return kept.filter((f) => {
    if (f.scope === 'summary') return current.summary === next.summary;
    const m = /^question:(\d+)$/.exec(f.scope ?? '');
    if (!m || !sameShape) return false;
    const i = Number(m[1]);
    return Boolean(current.questions[i]) && questionText(current.questions[i]) === questionText(next.questions[i]);
  });
}

function persistEdit(db, userId, draftId, draftRow, found, current, next, now) {
  const rescreen = auditDraft({ summary: next.summary, summarySourceSpans: next.summarySourceSpans, questions: next.questions }, { segments: found.segments });
  const keptModel = modelFindingsStillValid(current.audit, current, next);
  const findings = [...withSource(rescreen.findings, 'DETERMINISTIC'), ...keptModel];
  const audit = {
    result: findings.some(isBlocking) ? AUDIT_RESULT.REPAIR : AUDIT_RESULT.PASS,
    findings,
    auditedBy: keptModel.length > 0 ? ['DETERMINISTIC', 'MODEL'] : ['DETERMINISTIC'],
    modelAudit: keptModel.length > 0 ? (current.audit?.modelAudit ?? 'OK') : 'NOT_RUN',
    repaired: false,
    repairRejected: false,
    addressed: [],
    editedByHuman: true,
    rulesVersion: AUDIT_RULES_VERSION,
    auditedAt: now().toISOString(),
  };
  const content = normalizeContent({
    ...current,
    summary: next.summary,
    summarySourceSpans: next.summarySourceSpans,
    questions: next.questions,
    summaryVersion: next.summaryVersion,
    summaryOrigin: next.summaryOrigin ?? current.summaryOrigin,
    summaryEditedAt: next.summaryEditedAt ?? current.summaryEditedAt,
    quarantinedCount: next.quarantinedCount ?? current.quarantinedCount,
    audit,
  });
  db.prepare('UPDATE generated_drafts SET draft_json = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND id = ?')
    .run(JSON.stringify(content), now().toISOString(), userId, draftId);
  return toDraftDto(db.prepare('SELECT * FROM generated_drafts WHERE id = ?').get(draftId), { db, userId });
}

function requireFresh(actual, expected, what) {
  if (expected !== undefined && expected !== null && expected !== actual) {
    throw new DraftError('ENTITY_CONFLICT', `${what} foi alterado desde a última leitura. Recarregue e revise a versão atual.`);
  }
}

/** Edits ONLY the summary: questions, their ids/status/versions and citations are untouched. */
export function reviseSummary(db, userId, draftId, { summary, expectedVersion } = {}, now = () => new Date()) {
  const { draftRow, found, current } = loadEditable(db, userId, draftId);
  requireFresh(current.summaryVersion, expectedVersion, 'O resumo');
  if (typeof summary !== 'string') throw new DraftError('VALIDATION_FAILED', 'Informe o texto do resumo.', 'summary');
  const validated = validateOrThrow({
    summary, summarySourceSpans: current.summarySourceSpans, questions: current.questions.map(editableQuestion),
    modelVersion: draftRow.model_version, promptVersion: draftRow.prompt_version,
  }, found.segments);
  return persistEdit(db, userId, draftId, draftRow, found, current, {
    summary: validated.summary,
    summarySourceSpans: validated.summarySourceSpans,
    questions: current.questions,
    summaryVersion: validated.summary === current.summary ? current.summaryVersion : current.summaryVersion + 1,
    ...(validated.summary === current.summary ? {} : { summaryOrigin: 'HUMAN_EDITED', summaryEditedAt: now().toISOString() }),
  }, now);
}

/** Edits ONE question (text fields, citations and/or its review status); the summary and every other question are untouched. */
export function reviseQuestion(db, userId, draftId, questionId, patch = {}, now = () => new Date()) {
  const { draftRow, found, current } = loadEditable(db, userId, draftId);
  const index = current.questions.findIndex((q) => q.id === questionId);
  if (index < 0) throw new DraftError('NOT_FOUND', 'Questão não encontrada.');
  const previous = current.questions[index];
  requireFresh(previous.version, patch.expectedVersion, 'A questão');
  if (patch.status !== undefined && !QUESTION_REVIEW_STATUSES.has(patch.status)) {
    throw new DraftError('VALIDATION_FAILED', 'Estado de questão inválido.', 'status');
  }
  const edited = editableQuestion(previous);
  for (const key of EDITABLE_FIELDS) if (patch[key] !== undefined) edited[key] = patch[key];
  const validated = validateOrThrow({
    summary: current.summary, summarySourceSpans: current.summarySourceSpans, questions: [edited],
    modelVersion: draftRow.model_version, promptVersion: draftRow.prompt_version,
  }, found.segments);
  if (validated.quarantinedCount > 0 || validated.questions.length !== 1) {
    throw new DraftError('INVALID_DRAFT', 'A citação da questão aponta para uma página fora do trecho da fonte.', 'sourceSpans');
  }
  const merged = mergeIdentity(previous, validated.questions[0], now().toISOString());
  if (patch.status !== undefined) merged.status = patch.status;
  const questions = current.questions.map((q, i) => (i === index ? merged : q));
  return persistEdit(db, userId, draftId, draftRow, found, current, {
    summary: current.summary, summarySourceSpans: current.summarySourceSpans, questions, summaryVersion: current.summaryVersion,
  }, now);
}

/** Removes ONE question for good (its id is never reused). The last remaining question cannot be removed: a lesson keeps at least one. */
export function deleteQuestion(db, userId, draftId, questionId, now = () => new Date()) {
  const { draftRow, found, current } = loadEditable(db, userId, draftId);
  const index = current.questions.findIndex((q) => q.id === questionId);
  if (index < 0) throw new DraftError('NOT_FOUND', 'Questão não encontrada.');
  if (current.questions.length === 1) throw new DraftError('INVALID_STATE', 'A aula precisa manter ao menos uma questão.');
  return persistEdit(db, userId, draftId, draftRow, found, current, {
    summary: current.summary, summarySourceSpans: current.summarySourceSpans,
    questions: current.questions.filter((_, i) => i !== index), summaryVersion: current.summaryVersion,
  }, now);
}

/**
 * Appends ONE question written by the reviewer. It gets a fresh id (the sequence is persisted, so an id removed earlier is
 * never handed out again), version 1, status PROPOSED and origin HUMAN_ADDED. The text goes through the same validation as
 * any question, citations included; every other question and the summary are untouched.
 */
export function addQuestion(db, userId, draftId, input = {}, now = () => new Date()) {
  const { draftRow, found, current } = loadEditable(db, userId, draftId);
  const validated = validateOrThrow({
    summary: current.summary, summarySourceSpans: current.summarySourceSpans, questions: [editableQuestion(input ?? {})],
    modelVersion: draftRow.model_version, promptVersion: draftRow.prompt_version,
  }, found.segments);
  if (validated.quarantinedCount > 0 || validated.questions.length !== 1) {
    throw new DraftError('INVALID_DRAFT', 'A citação da questão aponta para uma página fora do trecho da fonte.', 'sourceSpans');
  }
  const added = { ...validated.questions[0], id: `q${current.questionSeq + 1}`, status: 'PROPOSED', version: 1, origin: 'HUMAN_ADDED', generatedBy: null, editedAt: null };
  return persistEdit(db, userId, draftId, draftRow, found, current, {
    summary: current.summary, summarySourceSpans: current.summarySourceSpans,
    questions: [...current.questions, added], summaryVersion: current.summaryVersion,
  }, now);
}

/**
 * Sets the order of the questions from a list of ids. The list must be exactly the current ids, each once: a missing,
 * repeated or unknown id is refused (nothing is deleted or invented by omission). Questions move whole, with their text,
 * version, review status and citations, so a REJECTED status can never land on another question's content.
 */
export function reorderQuestions(db, userId, draftId, order, { expectedRevision } = {}, now = () => new Date()) {
  const { draftRow, found, current } = loadEditable(db, userId, draftId);
  if (expectedRevision !== undefined && expectedRevision !== null && expectedRevision !== draftRow.revision) {
    throw new DraftError('REVISION_CONFLICT', 'O rascunho foi alterado desde a última leitura. Recarregue e reordene de novo.');
  }
  const currentIds = current.questions.map((q) => q.id);
  const valid = Array.isArray(order) && order.length === currentIds.length && new Set(order).size === order.length
    && order.every((id) => typeof id === 'string' && currentIds.includes(id));
  if (!valid) throw new DraftError('VALIDATION_FAILED', 'A ordem deve listar exatamente as questões atuais, cada uma uma vez.', 'order');
  const byId = new Map(current.questions.map((q) => [q.id, q]));
  return persistEdit(db, userId, draftId, draftRow, found, current, {
    summary: current.summary, summarySourceSpans: current.summarySourceSpans,
    questions: order.map((id) => byId.get(id)), summaryVersion: current.summaryVersion,
  }, now);
}

const findingKey = (f) => `${f.issue}|${f.scope}|${f.generatedClaim ?? ''}`;

/**
 * T-F2-03: the explicit "Reauditar". Deterministic rules only (no model, no network). Writes ONLY `audit` (new findings, rulesVersion,
 * auditedAt) in the draft JSON: summary, questions, their versions and the draft revision are untouched. Findings an earlier MODEL audit
 * raised about this very text are kept (they are not the deterministic rules' to judge); after a human edit they were already dropped.
 * Returns the draft and how many deterministic findings appeared/disappeared.
 */
export function reauditDraft(db, userId, draftId, now = () => new Date()) {
  const { draftRow, found, current } = loadEditable(db, userId, draftId);
  const previous = current.audit ?? null;
  const rescreen = auditDraft({ summary: current.summary, summarySourceSpans: current.summarySourceSpans, questions: current.questions }, { segments: found.segments });
  const deterministic = withSource(rescreen.findings, 'DETERMINISTIC');
  const keptModel = previous && !previous.editedByHuman ? (previous.findings ?? []).filter((f) => f.source === 'MODEL') : [];
  const findings = [...deterministic, ...keptModel];
  const before = new Map((previous?.findings ?? []).filter((f) => f.source !== 'MODEL').map((f) => [findingKey(f), f]));
  const after = new Map(deterministic.map((f) => [findingKey(f), f]));
  const added = [...after.keys()].filter((k) => !before.has(k)).length;
  const removed = [...before.keys()].filter((k) => !after.has(k)).length;
  const audit = {
    ...(previous ?? {}),
    result: findings.some(isBlocking) ? AUDIT_RESULT.REPAIR : AUDIT_RESULT.PASS,
    findings,
    auditedBy: previous?.auditedBy ?? ['DETERMINISTIC'],
    rulesVersion: AUDIT_RULES_VERSION,
    auditedAt: now().toISOString(),
  };
  const content = { ...JSON.parse(draftRow.draft_json), audit };
  db.prepare('UPDATE generated_drafts SET draft_json = ? WHERE user_id = ? AND id = ?').run(JSON.stringify(content), userId, draftId);
  const draft = toDraftDto(db.prepare('SELECT * FROM generated_drafts WHERE id = ?').get(draftId), { db, userId });
  return { draft, reaudit: { added, removed, unchanged: after.size - added, before: before.size, after: after.size } };
}

export function getDraft(db, userId, draftId) {
  const row = db.prepare('SELECT * FROM generated_drafts WHERE user_id = ? AND id = ?').get(userId, draftId);
  if (!row) throw new DraftError('NOT_FOUND', 'Rascunho não encontrado.');
  return toDraftDto(row, { db, userId });
}

export function listDrafts(db, userId, proposalId) {
  const proposal = db.prepare('SELECT id FROM content_proposals WHERE user_id = ? AND id = ?').get(userId, proposalId);
  if (!proposal) throw new DraftError('NOT_FOUND', 'Proposta não encontrada.');
  return db.prepare('SELECT * FROM generated_drafts WHERE user_id = ? AND proposal_id = ? ORDER BY id DESC').all(userId, proposalId).map((row) => toDraftDto(row, { db, userId }));
}
