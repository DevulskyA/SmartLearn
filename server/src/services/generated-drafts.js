import { createHash } from 'node:crypto';
import { generateDraft as fakeGenerateDraft, FAKE_PROVIDER_NAME } from '../ai/fake-provider.js';
import { detectSourceLanguage, checkDraftLanguage, LanguageMismatch } from '../ai/language-contract.js';
import { ensureGenerationLocale } from './settings.js';
import { resolveSupportedLocale, DEFAULT_LOCALE } from '../../../shared/locales.js';
import { estimateCostUnits, reserve, settle, release, BudgetError } from './generation-budget.js';
import {
  generateDraft as anthropicGenerateDraft, auditDraftWithModel, repairDraftWithModel,
  ANTHROPIC_PROVIDER_NAME, ProviderRequestError,
} from '../ai/anthropic-provider.js';
import {
  generateDraft as openaiGenerateDraft, auditDraftWithModel as openaiAudit, repairDraftWithModel as openaiRepair, OPENAI_PROVIDER_NAME,
} from '../ai/openai-provider.js';
import {
  generateDraft as codexGenerateDraft, generateQuestions as codexGenerateQuestions, auditDraftWithModel as codexAudit, repairDraftWithModel as codexRepair,
  CODEX_PROVIDER_NAME, CODEX_DEFAULT_TIMEOUT_MS, scaledCodexTimeoutMs, CODEX_PROMPT_OVERHEAD_CHARS, codexCallPlan,
} from '../ai/codex-provider.js';
import { validateDraft, DraftValidationError } from '../ai/draft-schema.js';
import { segmentsForProposal, assertPayloadWithinScope, ScopeViolation } from './proposal-scope.js';
import { effectiveKind } from './unit-kind.js';
import { carry, dm, splitMessage } from '../api-error-messages.js';
import { auditDraft, AUDIT_RESULT, AUDIT_RULES_VERSION, triggersRepair } from '../ai/draft-audit.js';
import { groundSummary } from '../ai/claim-evidence.js';
import { findUnresolvedRefs, refsMessage } from './visual-assets.js';
import { findShared, recordReuse, bibliographyOf } from './shared-reuse.js';
import { privateBankItems } from '../corpus/private-bank.js';
import { measureFidelityLoss } from '../ai/fidelity-loss.js';
import { diffExcerpts, applyExcerpt, pruneExcerpts } from '../ai/summary-corrections.js';
import { recordSummaryVersion, listSummaryVersions, getSummaryVersion } from './draft-summary-versions.js';
import { findPending, recordReplacement, applyDecision, discardDraft, settleExpired, REPLACEMENT_DECISIONS } from './draft-replacements.js';

export class DraftError extends Error {
  constructor(code, message, field) {
    const { text, msg } = splitMessage(message);
    super(text);
    this.code = code;
    if (field) this.field = field;
    if (msg) this.msg = msg;
  }
}

function createAnthropicProvider(options) {
  return {
    name: ANTHROPIC_PROVIDER_NAME,
    live: true,
    generate: (input) => anthropicGenerateDraft(input, options),
    // The independent audit and one targeted repair use the same consent and budget as generation.
    audit: (input) => auditDraftWithModel(input, options),
    repair: (input) => repairDraftWithModel(input, options),
  };
}

function createOpenAIProvider(options) {
  return {
    name: OPENAI_PROVIDER_NAME,
    live: true,
    generate: (input) => openaiGenerateDraft(input, options),
    audit: (input) => openaiAudit(input, options),
    repair: (input) => openaiRepair(input, options),
  };
}

function createCodexProvider(codex) {
  // A per-draft state carries call counters; the outer deadline lets the child-process deadline fire first.
  const codexOptions = { ...codex, state: {} };
  return {
    name: CODEX_PROVIDER_NAME,
    live: true,
    timeoutMs: (codex.timeoutMs ?? CODEX_DEFAULT_TIMEOUT_MS) + 5_000,
    // the outer deadline follows the same size-based limit as the call it wraps, so it never fires first
    deadlineFor: (payloadChars) => (codex.timeoutMs ?? scaledCodexTimeoutMs(payloadChars + CODEX_PROMPT_OVERHEAD_CHARS)) + 5_000,
    generate: (input) => codexGenerateDraft(input, codexOptions),
    generateQuestions: (input) => codexGenerateQuestions(input, codexOptions),
    callPlan: (segments, mode) => codexCallPlan(segments, mode),
    audit: (input) => codexAudit(input, codexOptions),
    repair: (input) => codexRepair(input, codexOptions),
  };
}

function selectDeclaredProvider(name, declared, { liveAvailable, options, codex, consentGranted }) {
  if (name === 'FAKE') return { name: FAKE_PROVIDER_NAME, live: false, languageContract: 'NOT_APPLICABLE', generate: fakeGenerateDraft };
  if (name === CODEX_PROVIDER_NAME) {
    // Codex uses the operator's CLI login, not an API key or per-request budget cap; explicit consent still applies.
    if (consentGranted !== true) throw new DraftError('MISSING_CREDENTIALS', dm('CODEX_CONSENT_MISSING'));
    return createCodexProvider(codex);
  }
  if (name !== OPENAI_PROVIDER_NAME && name !== ANTHROPIC_PROVIDER_NAME) {
    throw new DraftError('UNKNOWN_PROVIDER', dm('PROVIDER_UNKNOWN', { provider: String(declared) }));
  }
  if (!liveAvailable) throw new DraftError('MISSING_CREDENTIALS', dm('PROVIDER_MISSING_SETUP', { provider: String(name) }));
  return name === OPENAI_PROVIDER_NAME ? createOpenAIProvider(options) : createAnthropicProvider(options);
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
  // A DECLARED provider is honoured exactly: never silently replaced by fake or by another provider
  // (AI_SILENT_FALLBACK=FORBIDDEN). Without credentials/consent/budget it is an explicit error.
  if (declared) return selectDeclaredProvider(String(declared).toUpperCase(), declared, { liveAvailable, options, codex, consentGranted });

  // Nothing declared (legacy behaviour): the configured real adapter when fully configured, otherwise the fake.
  if (liveAvailable) return createAnthropicProvider(options);
  return { name: FAKE_PROVIDER_NAME, live: false, languageContract: 'NOT_APPLICABLE', generate: fakeGenerateDraft };
}
/**
 * Stands in for a provider the account may not use (no AI consent or credentials) when reviewed content for the same text might still answer the
 * request. It is never live and never reserves credit; if nothing reusable is found it fails with the SAME error the refused provider gave.
 */
export function reuseOnlyProvider(cause) {
  const refuse = async () => { throw cause; };
  return { name: 'SHARED_REUSE', live: false, languageContract: 'NOT_APPLICABLE', generate: refuse, generateQuestions: refuse };
}

function withTimeout(promise, timeoutMs, onTimeoutCode) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new DraftError(onTimeoutCode, dm('TIMEOUT_EXCEEDED'))), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const isBlocking = triggersRepair;
/** Which parts of the draft a repair rewrote: 'summary' and/or 'question:<index>' (the position in the list). */
function repairedScopes(before, after) {
  const scopes = before.summary === after.summary ? [] : ['summary'];
  for (let i = 0; i < Math.max(before.questions.length, after.questions.length); i += 1) {
    const [b, a] = [before.questions[i], after.questions[i]];
    if (!b || !a || questionText(b) !== questionText(a)) scopes.push(`question:${i}`);
  }
  return scopes;
}
// LOW findings are advisories (e.g. the cross-language notice): the review list does not show them as points, so no count reported to the student includes them.
const isActionable = (f) => f.severity !== 'LOW';
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
  let kept = null;
  const blocking = findings.filter(isBlocking);
  if (provider.live && provider.repair && blocking.length > 0) {
    try {
      const rawRepair = await withTimeout(
        provider.repair({ draft, findings: blocking, segments, promptVersion: draft.promptVersion }), timeoutMs, 'TIMEOUT',
      );
      // provider-owned metadata is not the model's to rewrite
      const revalidated = validateDraft({ ...rawRepair, modelVersion: draft.modelVersion, promptVersion: draft.promptVersion }, { segments });
      addressed = blocking.map((f) => ({ issue: f.issue, scope: f.scope }));
      // the repair replaces the text the reviewer would have read: keep the original and say what changed, so nothing is lost silently
      kept = { original: { summary: draft.summary, questions: draft.questions }, repairChanges: repairedScopes(draft, revalidated) };
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
    ...kept,
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
    .map((p) => ({ pageIndex: p.page_index, text: p.text.slice(0, CITED_PAGE_TEXT_CAP), sourceId: proposal.source_id }));
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
    const { legacy, ...rest } = q;
    return {
      ...rest,
      id,
      status: QUESTION_REVIEW_STATUSES.has(q.status) ? q.status : 'PROPOSED',
      version: Number.isInteger(q.version) ? q.version : 1,
      origin,
      generatedBy: origin === 'HUMAN_ADDED' ? null : (q.generatedBy ?? generatedByDefault ?? null),
      editedAt: q.editedAt ?? null,
      ...(!recorded || legacy === true ? { legacy: true } : {}),
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
function findingsWithEntities(audit, questions) {
  if (!audit) return audit;
  return {
    ...audit,
    findings: (audit.findings ?? []).map((f, index) => {
      const m = /^question:(\d+)$/.exec(f.scope ?? '');
      const target = m ? questions[Number(m[1])] : null;
      const entityType = entityTypeFor(f.scope, target);
      const entityId = entityIdFor(f.scope, target);
      return {
        ...f,
        id: `f${index + 1}`,
        entityType,
        entityId,
        status: 'OPEN',
      };
    }),
  };
}

function entityTypeFor(scope, target) {
  if (scope === 'summary') return 'SUMMARY';
  if (target) return 'QUESTION';
  return 'DRAFT';
}

function entityIdFor(scope, target) {
  if (scope === 'summary') return 'summary';
  return target ? target.id : null;
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
    // set on a draft that only ADDS questions to this existing lesson (migration 045); null on every ordinary draft
    targetUnitId: row.target_unit_id ?? null,
    ...draft,
    // a draft that came from reviewed content of the same text; WHO wrote it is never exposed, nor the internal entry id
    fromSharedReuse: Boolean(draft.reusedFrom),
    reusedFrom: undefined,
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
  if (!found) throw new DraftError('NOT_FOUND', dm('PROPOSAL_NOT_FOUND'));
  if (found.segments.length === 0) throw new DraftError('NO_USABLE_TEXT', dm('DRAFT_NO_USABLE_TEXT'));

  // Editorial pages (copyright, dedication, answer key...) are indexed but never offered to the model.
  if (effectiveKind(found.proposal) !== 'CONTENT') {
    throw new DraftError('NOT_GENERATABLE', dm('PROPOSAL_NOT_GENERATABLE', { kind: String(effectiveKind(found.proposal)) }));
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
    throw new DraftError('INPUT_TOO_LARGE', dm('PROPOSAL_INPUT_TOO_LARGE', { chars: totalChars, max: maxInputChars }));
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

/** Calls and whole-text passes of the generation step itself; a provider that does not report a plan makes one call over the text. */
function generationPlan(provider, segments, mode) {
  return provider.callPlan?.(segments, mode) ?? { calls: 1, inputPasses: 1 };
}

function reserveProviderBudget(db, userId, provider, proposalId, payloadChars, plan, budgetLimits, now, hooks) {
  if (provider.live !== true) return null;
  try {
    const reservation = reserve(db, userId, {
      proposalId,
      estimatedUnits: estimateCostUnits({ payloadChars, ...plan }),
      limits: budgetLimits,
      now,
    });
    hooks?.onReservation?.(reservation);
    return reservation;
  } catch (err) {
    if (err instanceof BudgetError) throw new DraftError('BUDGET_EXCEEDED', carry(err));
    throw err;
  }
}

async function generateAndValidate(provider, segments, generation, deadlineMs, closeBudget) {
  let raw;
  try {
    raw = await withTimeout(provider.generate(generation), deadlineMs, 'TIMEOUT');
  } catch (err) {
    // Only failures known to happen before an external request release the reservation; others may have been charged.
    closeBudget({ refund: err instanceof ProviderRequestError && PRE_SEND_FAILURES.has(err.code) });
    if (err instanceof DraftError) throw err;
    if (err instanceof ProviderRequestError) throw new DraftError(err.code, err.message);
    // Never return an unshaped provider exception, which could contain credentials or source text.
    throw new DraftError('PROVIDER_ERROR', dm('PROVIDER_UNEXPECTED_FAILURE'));
  }

  try {
    return { raw, validated: validateDraft(raw, { segments, allowNoQuestions: generation.deferQuestions === true }) };
  } catch (err) {
    if (err instanceof DraftValidationError) throw new DraftError(err.code, err.message, err.field);
    throw err;
  }
}

/**
 * REUSE before GENERATE: when another student already had the SAME text (same digest, same language) turned into a reviewed summary, this student
 * gets that content as a DRAFT of their own, with no model call and no credit. It is audited again here against THEIR source text and still has to
 * be reviewed and accepted. A summary without questions only suits the summary-first flow (the questions are then asked for later). Returns null on a miss.
 */
function reuseSharedDraft(db, userId, { found, scope, proposalId, inputDigest, inputGeneration, sourceLanguage, generationLocale, questionsLater, now }) {
  const shared = findShared(db, { digest: inputDigest, locale: generationLocale, bib: bibliographyOf(db, userId, found.proposal.source_id) });
  if (!shared) return null;
  const hasQuestions = shared.questions.length > 0;
  if (!hasQuestions && !questionsLater) return null;
  const nowIso = now().toISOString();
  const content = normalizeContent({
    summary: shared.summary,
    summarySourceSpans: shared.summarySourceSpans,
    summaryEvidence: shared.summaryEvidence ?? [],
    questions: shared.questions.map((q) => ({ ...q, origin: 'GENERATED', generatedBy: shared.generatedBy, editedAt: null })),
    ...(hasQuestions ? {} : { questionsDeferred: true }),
    quarantinedCount: 0,
    audit: { result: AUDIT_RESULT.PASS, findings: [], auditedBy: ['DETERMINISTIC'], modelAudit: 'NOT_RUN', rulesVersion: AUDIT_RULES_VERSION, auditedAt: nowIso },
    sourceLanguage: sourceLanguage ?? shared.sourceLanguage,
    generationLocale,
    languageCheck: 'NOT_APPLICABLE',
    reusedFrom: { sharedId: shared.id, at: nowIso },
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
  const inserted = db.transaction(() => {
    const r = db.prepare(`
      INSERT INTO generated_drafts (user_id, proposal_id, provider, model_version, prompt_version, status, draft_json, created_at, input_sha256, source_extraction_generation)
      VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?)
    `).run(userId, proposalId, shared.generatedBy.provider, shared.generatedBy.modelVersion, shared.generatedBy.promptVersion, JSON.stringify(content), nowIso, inputDigest, inputGeneration);
    recordReuse(db, shared.id);
    return r;
  })();
  const { draft } = reauditDraft(db, userId, Number(inserted.lastInsertRowid), now);
  return { ...draft, live: false, sharedReuse: true };
}

/** The questions of a summary-first draft, taken from reviewed content for the same text instead of asking the model. Null on a miss. */
/** The questions of `candidates` that cite a page of THIS student's text and are not in the draft yet (an invalid one is dropped, never repaired). */
function validFresh(first, candidates) {
  const { draftRow, found, current } = first;
  const have = new Set(current.questions.map((q) => q.question));
  const fresh = [];
  for (const candidate of candidates) {
    if (have.has(candidate.question)) continue;
    try {
      const [valid] = validateOrThrow({
        summary: current.summary, summarySourceSpans: current.summarySourceSpans, questions: [candidate],
        modelVersion: draftRow.model_version, promptVersion: draftRow.prompt_version,
      }, found.segments).questions;
      fresh.push(valid);
    } catch (err) {
      if (!(err instanceof DraftError)) throw err;
    }
  }
  return fresh;
}

/**
 * The student's OWN accepted questions (private bank) that were written from pages of this same source and that this text contains, from lessons
 * other than the one the draft adds to. Their own reviewed work: it needs no consent, no model and is never shared by this path.
 */
function privateQuestions(db, userId, first) {
  const { draftRow, found } = first;
  const inText = new Set(found.segments.map((seg) => seg.pageIndex));
  const candidates = [];
  for (const item of privateBankItems(db, userId)) {
    if (item.source_file !== `source#${found.proposal.source_id}` || item.unit_id === draftRow.target_unit_id || item.needs_verification) continue;
    const pages = (/^pages ([\d,]+)$/.exec(item.source_evidence ?? '')?.[1] ?? '').split(',').filter(Boolean).map(Number);
    if (pages.length === 0 || !pages.every((p) => inText.has(p)) || !item.stem || !item.key || !item.explanation) continue;
    candidates.push({ question: item.stem, answer: item.key, explanation: item.explanation, hint: null, questionType: item.item_type ?? null, sourceSpans: pages.map((pageIndex) => ({ pageIndex })) });
  }
  const fresh = validFresh(first, candidates);
  return fresh.length === 0 ? null : { shared: null, fresh, generatedBy: { provider: 'PRIVATE_BANK', modelVersion: 'accepted-exercise', promptVersion: '-' } };
}

/** Existing material before the model: the student's own accepted questions first, then reviewed questions of the same text from the pool. */
function reusableQuestions(db, userId, first) {
  const own = privateQuestions(db, userId, first);
  if (own) return own;
  const { draftRow, found, current } = first;
  const shared = findShared(db, { digest: draftRow.input_sha256, locale: current.generationLocale, bib: bibliographyOf(db, userId, found.proposal.source_id) });
  if (!shared || shared.questions.length === 0) return null;
  const fresh = validFresh(first, shared.questions); // reviewed elsewhere is not enough: each question must also cite a page of THIS student's text
  return fresh.length === 0 ? null : { shared, fresh, generatedBy: shared.generatedBy };
}

function reuseSharedQuestions(db, userId, draftId, first, now) {
  const { draftRow, found, current } = first;
  const hit = reusableQuestions(db, userId, first);
  if (!hit) return null;
  const { shared, fresh, generatedBy } = hit;
  if (shared) recordReuse(db, shared.id);
  return persistEdit(db, userId, draftId, draftRow, found, current, {
    summary: current.summary, summarySourceSpans: current.summarySourceSpans, summaryVersion: current.summaryVersion,
    questions: [...current.questions, ...fresh.map((q) => ({ ...q, origin: 'GENERATED', generatedBy, editedAt: null }))],
    questionsDelivered: true,
  }, now);
}

function checkLanguageContract(draft, provider, generationLocale, rawLanguage) {
  if (provider.languageContract === 'NOT_APPLICABLE') return { status: 'NOT_APPLICABLE', detected: null, declared: null };
  try {
    return checkDraftLanguage(draft, generationLocale, rawLanguage);
  } catch (err) {
    if (err instanceof LanguageMismatch) throw new DraftError('LANGUAGE_MISMATCH', err.message);
    throw err;
  }
}

export async function createDraft(db, userId, proposalId, {
  // SMARTLEARN_PRODUCT_FIRST_V1 Slice 1: bumped from '1' -- the real
  // provider's prompt (anthropic-provider.js) changed materially (varied
  // question types, teaching answers, genuine hints), and promptVersion
  // is stored per draft precisely so a version change like this is
  // distinguishable in stored/historical drafts, not silently conflated.
  // '10': selected MED-SUM v2.7.5 principles adapted for the app summary JSON, provenance, and UI.
  // '9': historical selection-first experiment, not promoted.
  // '8': prior study-map summary; remains reproducible by passing promptVersion '8'.
  // '7': summaryEvidence (the model proposes which passage backs which sentence; the server confirms it).
  // '5' (REALMODEL-1 quality closure): explanations must add a cause, hints must not leak the answer or its value, named
  // conditions must survive, whole-sentence copying is discouraged.
  promptVersion = '10',
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
  // Translation: write THIS draft in another supported language WITHOUT changing the student's persisted preference. The language
  // contract is checked against it, so the result is refused if it comes back in another language.
  generationLocaleOverride = null,
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
  const generationLocale = (generationLocaleOverride && resolveSupportedLocale(generationLocaleOverride)) || ensureGenerationLocale(db, userId, localeHint);

  // REUSE first (a regenerate is an explicit wish for a new one): reviewed content for exactly this text costs nothing and needs no provider.
  if (!regenerate) {
    const reused = reuseSharedDraft(db, userId, { found, scope, proposalId, inputDigest, inputGeneration, sourceLanguage, generationLocale, questionsLater: codex?.deferQuestions === true, now });
    if (reused) return reused;
  }
  const provider = providerImpl ?? selectProvider({ provider: declaredProvider, apiKey, model, consentGranted, budgetCapUsd, fetchImpl, apiUrl, codex });
  // A provider may need a longer deadline than the generic one (a Codex run is minutes, not seconds).
  const deadlineMs = provider.deadlineFor?.(found.segments.reduce((sum, s) => sum + s.text.length, 0)) ?? provider.timeoutMs ?? timeoutMs;

  // A regenerate keeps the previous draft until the student decides which to keep (migration 043). While that decision is pending
  // nothing new is generated: refused here, AFTER every refusal that already existed (unknown unit, scope, size, provider selection:
  // their error codes and order are unchanged) and BEFORE any credit is reserved or any provider is called. Decisions whose 30 days
  // passed are settled first. An ACCEPTED lesson is never part of a replacement (old behaviour: a new draft beside it).
  let previousDraftId = null;
  if (regenerate) {
    settleExpiredDecisions(db, { now });
    assertNoPendingDecision(db, userId, proposalId);
    const previous = reusableDraftRow(db, userId, proposalId);
    previousDraftId = previous?.status === 'DRAFT' ? previous.id : null;
  }

  // CREDIT (R-12): a provider that reaches an external model never runs without a reservation inside the limits. The
  // estimate counts every call this provider may make (generate, independent audit, one repair). Refused here = nothing was
  // sent and nothing is debited. The deterministic test double (live:false) spends nothing external and skips the ledger.
  // Summary first (Codex only, when configured): the generation writes just the Resumo Mestre and the draft carries no questions yet.
  const deferQuestions = codex?.deferQuestions === true && provider.name === CODEX_PROVIDER_NAME;
  // A split generation is several calls (summary + one per question group), not one: the ledger prices what is really sent.
  const generation = generationPlan(provider, found.segments, { deferQuestions });
  const followUp = (provider.audit ? 1 : 0) + (provider.repair ? 1 : 0);
  const plannedPlan = { calls: generation.calls + followUp, inputPasses: generation.inputPasses + followUp };
  const payloadChars = found.segments.reduce((sum, s) => sum + s.text.length, 0);
  const reservation = reserveProviderBudget(db, userId, provider, proposalId, payloadChars, plannedPlan, budgetLimits, now, hooks);
  let madePlan = generation;
  let budgetClosed = reservation === null;
  // Exactly one of settle/release, once. Release = nothing external happened; settle = it may have, charged at the estimate of
  // the calls actually made (no provider reports a measurable cost yet, so the basis is ESTIMATED).
  const closeBudget = ({ refund = false } = {}) => {
    if (budgetClosed) return;
    // The flag is raised only AFTER the ledger write succeeded: if it throws (database busy), the `finally` below tries once more
    // instead of leaving the reservation held until the next startup.
    if (refund) {
      release(db, reservation.id, { now });
      budgetClosed = true;
      hooks?.onBudgetClosed?.({ reservationId: reservation.id, state: 'RELEASED', consumedUnits: 0 });
    } else {
      const consumedUnits = estimateCostUnits({ payloadChars, ...madePlan });
      settle(db, reservation.id, { consumedUnits, basis: 'ESTIMATED', now });
      budgetClosed = true;
      hooks?.onBudgetClosed?.({ reservationId: reservation.id, state: 'SETTLED', consumedUnits });
    }
  };
  try {

  // Stopped before any request could leave: nothing was spent, so the held balance returns.
  if (hooks?.signal?.aborted) {
    closeBudget({ refund: true });
    throw new DraftError('CANCELLED', dm('GENERATION_CANCELLED_BEFORE_CALL'));
  }

  const { raw, validated: initialDraft } = await generateAndValidate(provider, found.segments, {
    segments: found.segments, promptVersion, sourceLanguage, generationLocale, deferQuestions,
  }, deadlineMs, closeBudget);
  let validated = initialDraft;
  // From here the audit and the repair may reach the model: an unexpected error before the exact count below settles at every
  // planned call (it may have happened), never at the generation alone.
  madePlan = plannedPlan;

  // Wrong language = contract failure: refused BEFORE spending an audit on it, and nothing is stored.
  // The built-in deterministic test double only slices the source text: it cannot write in another language, so the contract
  // is recorded as NOT_APPLICABLE for it (never for a real provider or an injected one).
  checkLanguageContract(validated, provider, generationLocale, raw.language);

  const proposedEvidence = validated.summaryEvidence;
  const audited = await auditAndRepair(provider, validated, found.segments, { promptVersion, timeoutMs: deadlineMs });
  validated = audited.draft;
  // A repair that does not return evidence keeps the entries already confirmed; any whose sentence it rewrote simply stop holding (recomputed on read).
  if (!validated.summaryEvidence?.length) validated = { ...validated, summaryEvidence: proposedEvidence };
  const followUpMade = (audited.audit.modelAudit !== 'NOT_RUN' ? 1 : 0) + (audited.audit.repaired || audited.audit.repairRejected ? 1 : 0);
  madePlan = { calls: generation.calls + followUpMade, inputPasses: generation.inputPasses + followUpMade };
  // A repair may have rewritten text: the final content is what must be in the target language.
  const languageCheck = checkLanguageContract(validated, provider, generationLocale, raw.language);
  closeBudget();

  // A stopped job never leaves a draft behind, not even a complete one that finished too late (the call happened: it is charged).
  hooks?.onPhase?.('SAVING');
  if (hooks?.signal?.aborted) throw new DraftError('CANCELLED', dm('GENERATION_CANCELLED_NO_DRAFT'));

  const nowIso = now().toISOString();
  const generatedBy = { provider: provider.name, modelVersion: validated.modelVersion, promptVersion: validated.promptVersion };
  const draftContent = normalizeContent({
    summary: validated.summary,
    summarySourceSpans: validated.summarySourceSpans,
    summaryEvidence: validated.summaryEvidence ?? [],
    questions: validated.questions.map((q) => ({ ...q, origin: 'GENERATED', generatedBy, editedAt: null })),
    ...(deferQuestions && validated.questions.length === 0 ? { questionsDeferred: true } : {}),
    quarantinedCount: validated.quarantinedCount,
    // a summary-only draft has no questions on purpose: "volume out of range" would only mislead
    audit: { ...audited.audit, ...(deferQuestions && validated.questions.length === 0 ? { findings: audited.audit.findings.filter((f) => f.issue !== 'QUESTION_VOLUME_OUT_OF_RANGE') } : {}), rulesVersion: AUDIT_RULES_VERSION, auditedAt: nowIso },
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
  // One transaction: the new draft and, when it replaces a plain draft, the pending decision about the previous one (all or nothing).
  // The previous draft is recorded only if it is still a plain draft and no decision was recorded meanwhile (two direct requests at once).
  const result = db.transaction(() => {
    // Two direct regenerates passed the early check together: the second one finds the decision of the first and stores nothing
    // (its generation was already paid), so no draft is left that no decision covers.
    if (regenerate) assertNoPendingDecision(db, userId, proposalId);
    const inserted = db.prepare(`
      INSERT INTO generated_drafts (user_id, proposal_id, provider, model_version, prompt_version, status, draft_json, created_at, input_sha256, source_extraction_generation)
      VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?)
    `).run(
      userId, proposalId, provider.name, validated.modelVersion, validated.promptVersion, JSON.stringify(draftContent), nowIso,
      inputDigest, inputGeneration,
    );
    if (previousDraftId !== null && !findPending(db, userId, proposalId)
      && db.prepare("SELECT 1 FROM generated_drafts WHERE user_id = ? AND id = ? AND status = 'DRAFT'").get(userId, previousDraftId)) {
      recordReplacement(db, userId, { proposalId, newDraftId: Number(inserted.lastInsertRowid), previousDraftId, now });
    }
    return inserted;
  })();

  return { ...toDraftDto(db.prepare('SELECT * FROM generated_drafts WHERE id = ?').get(result.lastInsertRowid), { db, userId }), live: provider.live };
  } finally {
    // Whatever happened above (validation, language, an unexpected error), no reservation is ever left open. A ledger failure here
    // never replaces the error that is already propagating (the server writes to the console only from main.js); a reservation that
    // still could not be closed is reconciled at the next startup, as before.
    try { closeBudget(); } catch { /* see above */ }
  }
}

/**
 * The newest draft of this unit that is still worth keeping: an accepted lesson, or a draft whose source text has not
 * changed. A stale draft is not reusable (its text no longer matches what it was generated from). NOT_FOUND when the unit is
 * not this user's, so reuse never reveals another user's content.
 */
function reusableDraftRow(db, userId, proposalId) {
  const proposal = db.prepare('SELECT id FROM content_proposals WHERE user_id = ? AND id = ?').get(userId, proposalId);
  if (!proposal) throw new DraftError('NOT_FOUND', dm('PROPOSAL_NOT_FOUND'));
  // a draft that only adds questions to an existing lesson is never "the unit's draft": the lesson (or its summary draft) answers
  const rows = db.prepare('SELECT * FROM generated_drafts WHERE user_id = ? AND proposal_id = ? AND target_unit_id IS NULL ORDER BY id DESC').all(userId, proposalId);
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
  const any = db.prepare("SELECT 1 FROM generated_drafts WHERE user_id = ? AND proposal_id = ? AND status = 'DRAFT' AND target_unit_id IS NULL LIMIT 1").get(userId, proposalId);
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
  if (!draftRow) throw new DraftError('NOT_FOUND', dm('DRAFT_NOT_FOUND'));
  if (draftRow.status !== 'DRAFT') {
    throw new DraftError('INVALID_STATE', dm('DRAFT_STATE_NOT_EDITABLE', { status: draftRow.status }));
  }

  const found = findOwnedProposalWithSegments(db, userId, draftRow.proposal_id);
  if (!found) throw new DraftError('NOT_FOUND', dm('SOURCE_PROPOSAL_NOT_FOUND'));

  const current = normalizeContent(JSON.parse(draftRow.draft_json), generatorOf(draftRow));
  const candidate = {
    summary: summary !== undefined ? summary : current.summary,
    summarySourceSpans: current.summarySourceSpans,
    questions: questions !== undefined ? questions : current.questions.map(editableQuestion),
    modelVersion: draftRow.model_version,
    promptVersion: draftRow.prompt_version,
  };

  const validated = validateOrThrow(candidate, found.segments, { allowNoQuestions: current.questionsDeferred === true });

  // Identity survives a whole-draft edit: while the question list keeps its length each question keeps its id and
  // status, and only the ones whose text changed get a new version.
  // A different count cannot be matched to the old questions, so their review status would be lost: a REJECTED question would
  // silently come back as PROPOSED. Refuse and point to the per-question edits instead.
  if (validated.questions.length !== current.questions.length && current.questions.some((q) => q.status === 'REJECTED')) {
    throw new DraftError('ENTITY_CONFLICT', dm('REJECTED_QUESTIONS_REPLACE'));
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

// allowNoQuestions: only a summary-first draft (questionsDeferred) may be edited while it has no questions.
function validateOrThrow(candidate, segments, { allowNoQuestions = false } = {}) {
  try {
    return validateDraft(candidate, { segments, allowNoQuestions });
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
    // The review status belongs to the content that was reviewed: an ACCEPTED question whose text changed is no longer the one that was accepted and goes back to
    // PROPOSED (the reviewer accepts it again, deliberately). REJECTED stays REJECTED; a status given explicitly with the edit (reviseQuestion) overrides this.
    status: changed && previous?.status === 'ACCEPTED' ? 'PROPOSED' : (previous?.status ?? 'PROPOSED'),
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
  if (!draftRow) throw new DraftError('NOT_FOUND', dm('DRAFT_NOT_FOUND'));
  if (draftRow.status !== 'DRAFT') throw new DraftError('INVALID_STATE', dm('DRAFT_STATE_NOT_EDITABLE', { status: draftRow.status }));
  const found = findOwnedProposalWithSegments(db, userId, draftRow.proposal_id);
  if (!found) throw new DraftError('NOT_FOUND', dm('SOURCE_PROPOSAL_NOT_FOUND'));
  return { draftRow, found, current: normalizeContent(JSON.parse(draftRow.draft_json), generatorOf(draftRow)) };
}

/** Re-screens deterministically (a human edit changes the text, so earlier findings describe text that is gone), writes ONE row update and bumps the draft revision. */
/** The fields of a question a reviewer can change the MEANING of (status, version and timestamps are not content). */
/**
 * Read-only: would asking for this (a summary job for `proposalId`, or the questions of `draftId`) be answered from reviewed content?
 * The job route asks BEFORE it demands AI consent or credentials: a hit needs neither (no model is called, nothing is reserved). Never writes.
 */
export function hasReusableContent(db, userId, { proposalId = null, draftId = null, regenerate = false, targetLocale = null, deferQuestions = false, maxInputChars = 50_000 } = {}) {
  try {
    if (draftId !== null) {
      const first = loadEditable(db, userId, draftId);
      return first.current.questionsDeferred === true && reusableQuestions(db, userId, first) !== null;
    }
    if (regenerate || reusableDraftRow(db, userId, proposalId)) return false;
    const { found } = prepareGeneration(db, userId, proposalId, { maxInputChars });
    const settings = db.prepare('SELECT ui_locale, generation_locale FROM user_settings WHERE user_id = ?').get(userId);
    const locale = (targetLocale && resolveSupportedLocale(targetLocale)) || settings?.generation_locale || settings?.ui_locale || DEFAULT_LOCALE;
    const shared = findShared(db, { digest: segmentsDigest(found.segments), locale, bib: bibliographyOf(db, userId, found.proposal.source_id) });
    return shared !== null && (shared.questions.length > 0 || deferQuestions === true);
  } catch (err) {
    if (err instanceof DraftError) return false;
    throw err;
  }
}

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
    // the pre-repair text and what the repair rewrote stay with the draft after a human edit
    ...(current.audit?.original ? { original: current.audit.original, repairChanges: current.audit.repairChanges } : {}),
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
    ...(next.questionsDelivered ? { questionsDeferred: false } : {}),
    summaryOrigin: next.summaryOrigin ?? current.summaryOrigin,
    summaryEditedAt: next.summaryEditedAt ?? current.summaryEditedAt,
    // an excerpt proposed for text that has since changed is dropped, never applied to the wrong place
    ...(current.corrections ? { corrections: { ...current.corrections, items: pruneExcerpts(current.corrections.items, next.summary) } } : {}),
    quarantinedCount: next.quarantinedCount ?? current.quarantinedCount,
    audit,
  });
  db.transaction(() => {
    // the text that is going away is kept before it is replaced: the student never loses what they wrote (migration 048)
    if (next.summary !== current.summary) {
      recordSummaryVersion(db, userId, draftId, {
        version: current.summaryVersion, summary: current.summary, origin: current.summaryOrigin, force: next.keepPreviousSummary === true, now,
      });
    }
    db.prepare('UPDATE generated_drafts SET draft_json = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND id = ?')
      .run(JSON.stringify(content), now().toISOString(), userId, draftId);
  })();
  return toDraftDto(db.prepare('SELECT * FROM generated_drafts WHERE id = ?').get(draftId), { db, userId });
}

/** Words that flip the meaning (negation, qualifier, number) present in the source and missing from the summary sentence that restates them. No AI, no credit, read-only. */
export function summaryFidelity(db, userId, draftId) {
  const { found, current } = loadEditable(db, userId, draftId);
  return measureFidelityLoss(found.segments.map((seg) => seg.text).join('\n'), current.summary);
}

/** Earlier texts of this draft's summary, newest first (no text). */
export function listDraftSummaryVersions(db, userId, draftId) {
  if (!db.prepare('SELECT 1 FROM generated_drafts WHERE user_id = ? AND id = ?').get(userId, draftId)) throw new DraftError('NOT_FOUND', dm('DRAFT_NOT_FOUND'));
  return listSummaryVersions(db, userId, draftId);
}

export function readDraftSummaryVersion(db, userId, draftId, version) {
  if (!db.prepare('SELECT 1 FROM generated_drafts WHERE user_id = ? AND id = ?').get(userId, draftId)) throw new DraftError('NOT_FOUND', dm('DRAFT_NOT_FOUND'));
  const found = getSummaryVersion(db, userId, draftId, version);
  if (!found) throw new DraftError('NOT_FOUND', dm('SUMMARY_VERSION_NOT_FOUND'));
  return found;
}

/** Puts an earlier text back as the current summary. Goes through reviseSummary (same validation) and keeps the text it replaces as a version. */
export function restoreSummaryVersion(db, userId, draftId, version, now = () => new Date()) {
  const earlier = readDraftSummaryVersion(db, userId, draftId, version);
  return reviseSummary(db, userId, draftId, { summary: earlier.summary }, now, { keepPreviousSummary: true });
}

function requireFresh(actual, expected, code) {
  if (expected !== undefined && expected !== null && expected !== actual) {
    throw new DraftError('ENTITY_CONFLICT', dm(code));
  }
}

/** Edits ONLY the summary: questions, their ids/status/versions and citations are untouched. */
export function reviseSummary(db, userId, draftId, { summary, expectedVersion } = {}, now = () => new Date(), { keepPreviousSummary = false } = {}) {
  const { draftRow, found, current } = loadEditable(db, userId, draftId);
  // the summary of a lesson that already exists is edited in the lesson; a draft that only adds questions never rewrites it
  if (draftRow.target_unit_id != null) throw new DraftError('INVALID_STATE', dm('LESSON_SUMMARY_READONLY'));
  requireFresh(current.summaryVersion, expectedVersion, 'SUMMARY_CHANGED_SINCE_READ');
  if (typeof summary !== 'string') throw new DraftError('VALIDATION_FAILED', dm('SUMMARY_REQUIRED'), 'summary');
  // a [[fig:UUID]] must be one of the student's own figures, and a PDF crop must come from THIS draft's source
  const refProblems = findUnresolvedRefs(db, userId, summary, { sourceId: found.proposal.source_id });
  if (refProblems.length > 0) throw new DraftError('VALIDATION_FAILED', refsMessage(refProblems), 'summary');
  const validated = validateOrThrow({
    summary, summarySourceSpans: current.summarySourceSpans, questions: current.questions.map(editableQuestion),
    modelVersion: draftRow.model_version, promptVersion: draftRow.prompt_version,
  }, found.segments, { allowNoQuestions: current.questionsDeferred === true });
  return persistEdit(db, userId, draftId, draftRow, found, current, {
    summary: validated.summary,
    summarySourceSpans: validated.summarySourceSpans,
    questions: current.questions,
    summaryVersion: validated.summary === current.summary ? current.summaryVersion : current.summaryVersion + 1,
    ...(validated.summary === current.summary ? {} : { summaryOrigin: 'HUMAN_EDITED', summaryEditedAt: now().toISOString() }),
    keepPreviousSummary,
  }, now);
}

/** Edits ONE question (text fields, citations and/or its review status); the summary and every other question are untouched. */
export function reviseQuestion(db, userId, draftId, questionId, patch = {}, now = () => new Date()) {
  const { draftRow, found, current } = loadEditable(db, userId, draftId);
  const index = current.questions.findIndex((q) => q.id === questionId);
  if (index < 0) throw new DraftError('NOT_FOUND', dm('QUESTION_NOT_FOUND'));
  const previous = current.questions[index];
  requireFresh(previous.version, patch.expectedVersion, 'QUESTION_CHANGED_SINCE_READ');
  if (patch.status !== undefined && !QUESTION_REVIEW_STATUSES.has(patch.status)) {
    throw new DraftError('VALIDATION_FAILED', dm('QUESTION_STATE_INVALID'), 'status');
  }
  const edited = editableQuestion(previous);
  for (const key of EDITABLE_FIELDS) if (patch[key] !== undefined) edited[key] = patch[key];
  const validated = validateOrThrow({
    summary: current.summary, summarySourceSpans: current.summarySourceSpans, questions: [edited],
    modelVersion: draftRow.model_version, promptVersion: draftRow.prompt_version,
  }, found.segments);
  if (validated.quarantinedCount > 0 || validated.questions.length !== 1) {
    throw new DraftError('INVALID_DRAFT', dm('CITATION_OUT_OF_RANGE'), 'sourceSpans');
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
  if (index < 0) throw new DraftError('NOT_FOUND', dm('QUESTION_NOT_FOUND'));
  if (current.questions.length === 1) throw new DraftError('INVALID_STATE', dm('LAST_QUESTION_REQUIRED'));
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
    throw new DraftError('INVALID_DRAFT', dm('CITATION_OUT_OF_RANGE'), 'sourceSpans');
  }
  // A retried request (reply lost, button pressed again) must not append the same question twice: identical content is already there.
  if (current.questions.some((q) => questionText(q) === questionText(validated.questions[0]))) {
    return toDraftDto(draftRow, { db, userId });
  }
  const added = { ...validated.questions[0], id: `q${current.questionSeq + 1}`, status: 'PROPOSED', version: 1, origin: 'HUMAN_ADDED', generatedBy: null, editedAt: null };
  return persistEdit(db, userId, draftId, draftRow, found, current, {
    summary: current.summary, summarySourceSpans: current.summarySourceSpans,
    questions: [...current.questions, added], summaryVersion: current.summaryVersion,
  }, now);
}

/**
 * Summary-first draft: writes its questions LATER, from the same source text, and puts them in the SAME draft as PROPOSED, origin GENERATED.
 * The student's summary (edited or not) is never touched; the questions still need the human review before the lesson is accepted
 * (AI output stays a DRAFT). The number of questions is whatever the model wrote for the source (no fixed quantity); a model that writes
 * none, or none with a valid citation, changes nothing and the draft stays summary-only. A repeat once the questions are there is a no-op.
 */
export async function generateDeferredQuestions(db, userId, draftId, {
  promptVersion = '10', provider: declaredProvider = null, providerImpl = null, consentGranted = false, codex = {}, timeoutMs = 30_000, signal = null,
  // Credit limits for this call (tests); undefined = the configured limits. `hooks` is set only by the background job runner (see createDraft).
  budgetLimits = undefined, hooks = null, now = () => new Date(),
} = {}) {
  const first = loadEditable(db, userId, draftId);
  if (first.current.questionsDeferred !== true) return toDraftDto(first.draftRow, { db, userId });
  const reusedQuestions = reuseSharedQuestions(db, userId, draftId, first, now);
  if (reusedQuestions) return reusedQuestions;
  const provider = providerImpl ?? selectProvider({ provider: declaredProvider, consentGranted, codex });
  if (typeof provider.generateQuestions !== 'function') throw new DraftError('INVALID_STATE', dm('QUESTIONS_LATER_UNSUPPORTED'));
  const chars = first.found.segments.reduce((sum, s) => sum + s.text.length, 0);
  const deadlineMs = provider.deadlineFor?.(chars) ?? provider.timeoutMs ?? timeoutMs;
  const stopSignal = hooks?.signal ?? signal;

  // CREDIT (R-12), exactly like the summary: a provider that reaches an external model never runs without a reservation inside the limits.
  // One call, so one call is held. Released when nothing could have left (stopped before the call, or a failure that proves no request was
  // sent); settled at the estimate when the call may have happened (it is never refunded, and it is closed once).
  // A big source is answered in page groups, one call each (the text goes out once): the plan says how many calls to hold.
  const plan = generationPlan(provider, first.found.segments, { questionsOnly: true });
  let reservation = null;
  if (provider.live === true) {
    try {
      reservation = reserve(db, userId, { proposalId: first.draftRow.proposal_id, estimatedUnits: estimateCostUnits({ payloadChars: chars, ...plan }), limits: budgetLimits, now });
      hooks?.onReservation?.(reservation);
    } catch (err) {
      if (err instanceof BudgetError) throw new DraftError('BUDGET_EXCEEDED', carry(err));
      throw err;
    }
  }
  let budgetClosed = reservation === null;
  const closeBudget = ({ refund = false } = {}) => {
    if (budgetClosed) return;
    if (refund) {
      release(db, reservation.id, { now });
      budgetClosed = true;
      hooks?.onBudgetClosed?.({ reservationId: reservation.id, state: 'RELEASED', consumedUnits: 0 });
    } else {
      const consumedUnits = estimateCostUnits({ payloadChars: chars, ...plan });
      settle(db, reservation.id, { consumedUnits, basis: 'ESTIMATED', now });
      budgetClosed = true;
      hooks?.onBudgetClosed?.({ reservationId: reservation.id, state: 'SETTLED', consumedUnits });
    }
  };
  try {
    if (stopSignal?.aborted) {
      closeBudget({ refund: true });
      throw new DraftError('CANCELLED', dm('GENERATION_CANCELLED_BEFORE_CALL'));
    }
    let raw;
    try {
      raw = await withTimeout(Promise.resolve(provider.generateQuestions({
        segments: first.found.segments, promptVersion, generationLocale: first.current.generationLocale, signal: stopSignal,
      })), deadlineMs, 'TIMEOUT');
    } catch (err) {
      closeBudget({ refund: err instanceof ProviderRequestError && PRE_SEND_FAILURES.has(err.code) });
      if (err instanceof DraftError) throw err;
      if (err instanceof ProviderRequestError) throw new DraftError(err.code, err.message);
      throw new DraftError('PROVIDER_ERROR', dm('PROVIDER_UNEXPECTED_FAILURE')); // never an unshaped provider exception (credentials, source text)
    }
    closeBudget();

    hooks?.onPhase?.('SAVING');
    // A stopped job never leaves questions behind, not even a complete answer that came too late (the call happened: it is charged).
    if (stopSignal?.aborted) throw new DraftError('CANCELLED', dm('GENERATION_CANCELLED_NO_DRAFT'));
    // Reload after the (long) call: the student may have edited the summary or added/approved questions meanwhile, or a repeat request may
    // have delivered the questions already.
    const { draftRow, found, current } = loadEditable(db, userId, draftId);
    if (current.questionsDeferred !== true) return toDraftDto(draftRow, { db, userId });
    const validated = validateOrThrow({
      summary: current.summary, summarySourceSpans: current.summarySourceSpans, questions: raw?.questions ?? [],
      modelVersion: draftRow.model_version, promptVersion: draftRow.prompt_version,
    }, found.segments);
    if (validated.questions.length === 0) throw new DraftError('INVALID_DRAFT', dm('CITATION_OUT_OF_RANGE'), 'questions');
    const generatedBy = { provider: provider.name, modelVersion: raw?.modelVersion ?? draftRow.model_version, promptVersion };
    // Everything the student already has stays EXACTLY as it is (text, id, review status, origin); the generated questions are added after
    // them, and one that repeats a question already there is not added twice.
    const have = new Set(current.questions.map(questionText));
    const fresh = validated.questions.filter((q) => !have.has(questionText(q)));
    return persistEdit(db, userId, draftId, draftRow, found, current, {
      summary: current.summary, summarySourceSpans: current.summarySourceSpans, summaryVersion: current.summaryVersion,
      questions: [...current.questions, ...fresh.map((q) => ({ ...q, origin: 'GENERATED', generatedBy, editedAt: null }))],
      questionsDelivered: true,
    }, now);
  } finally {
    // an unexpected error before the call closed the ledger: the call may have left, so it is settled, never left held
    if (!budgetClosed) { try { closeBudget(); } catch { /* startup reconciliation settles what is still open */ } }
  }
}

/**
 * On-demand independent model check of the summary AS IT IS NOW (the student's own text or an edited generated one) against the source.
 * Same fidelity criteria as the production-time audit (medical accuracy, omissions, lost qualifiers); it only REPORTS: nothing in the
 * summary or the questions changes, the student's text is never rewritten, and the draft stays DRAFT. One call, held and settled in the
 * credit ledger exactly like `generateDeferredQuestions`. The previous MODEL findings are replaced (they judged an older text); the
 * deterministic screen is recomputed on the current text.
 */
export async function auditSummaryWithModel(db, userId, draftId, {
  provider: declaredProvider = null, providerImpl = null, consentGranted = false, codex = {}, timeoutMs = 30_000, signal = null,
  budgetLimits = undefined, now = () => new Date(),
} = {}) {
  const first = loadEditable(db, userId, draftId);
  const provider = providerImpl ?? selectProvider({ provider: declaredProvider, consentGranted, codex });
  if (provider.live !== true || typeof provider.audit !== 'function') throw new DraftError('INVALID_STATE', dm('MODEL_AUDIT_UNSUPPORTED'));
  const chars = first.found.segments.reduce((sum, s) => sum + s.text.length, 0) + first.current.summary.length;
  const deadlineMs = provider.deadlineFor?.(chars) ?? provider.timeoutMs ?? timeoutMs;

  let reservation;
  try {
    reservation = reserve(db, userId, { proposalId: first.draftRow.proposal_id, estimatedUnits: estimateCostUnits({ payloadChars: chars, calls: 1 }), limits: budgetLimits, now });
  } catch (err) {
    if (err instanceof BudgetError) throw new DraftError('BUDGET_EXCEEDED', carry(err));
    throw err;
  }
  let budgetClosed = false;
  const closeBudget = ({ refund = false } = {}) => {
    if (budgetClosed) return;
    budgetClosed = true;
    if (refund) release(db, reservation.id, { now });
    else settle(db, reservation.id, { consumedUnits: estimateCostUnits({ payloadChars: chars, calls: 1 }), basis: 'ESTIMATED', now });
  };
  try {
    if (signal?.aborted) { closeBudget({ refund: true }); throw new DraftError('CANCELLED', dm('GENERATION_CANCELLED_BEFORE_CALL')); }
    let result;
    try {
      result = await withTimeout(Promise.resolve(provider.audit({
        draft: { summary: first.current.summary, summarySourceSpans: first.current.summarySourceSpans, questions: first.current.questions },
        segments: first.found.segments, signal,
      })), deadlineMs, 'TIMEOUT');
    } catch (err) {
      closeBudget({ refund: err instanceof ProviderRequestError && PRE_SEND_FAILURES.has(err.code) });
      if (err instanceof DraftError) throw err;
      if (err instanceof ProviderRequestError) throw new DraftError(err.code, err.message);
      throw new DraftError('PROVIDER_ERROR', dm('PROVIDER_UNEXPECTED_FAILURE')); // never an unshaped provider exception (credentials, source text)
    }
    closeBudget();
    if (result?.malformed) throw new DraftError('INVALID_STATE', dm('MODEL_AUDIT_MALFORMED'));

    return storeModelAudit(db, userId, draftId, first.current.summary, result?.findings ?? [], now);
  } finally {
    if (!budgetClosed) { try { closeBudget(); } catch { /* startup reconciliation settles what is still open */ } }
  }
}

/**
 * Per-excerpt corrections (P1-6). Asks the provider's ONE targeted repair to fix what the audit pointed at in the summary, then keeps ONLY the
 * difference as excerpts { key, original, proposed, reason }: the summary itself is never changed here, the student accepts or dismisses each
 * excerpt. Needs a live provider with `repair` and at least one non-LOW finding about the summary. One call, held and settled in the credit ledger.
 */
export async function proposeSummaryCorrections(db, userId, draftId, {
  provider: declaredProvider = null, providerImpl = null, consentGranted = false, codex = {}, timeoutMs = 30_000, signal = null,
  budgetLimits = undefined, now = () => new Date(),
} = {}) {
  const first = loadEditable(db, userId, draftId);
  const provider = providerImpl ?? selectProvider({ provider: declaredProvider, consentGranted, codex });
  if (provider.live !== true || typeof provider.repair !== 'function') throw new DraftError('INVALID_STATE', dm('MODEL_AUDIT_UNSUPPORTED'));
  const findings = (first.current.audit?.findings ?? []).filter((f) => f.scope === 'summary' && f.severity !== 'LOW');
  if (findings.length === 0) throw new DraftError('INVALID_STATE', dm('CORRECTION_NOTHING'));
  const chars = first.found.segments.reduce((sum, s) => sum + s.text.length, 0) + first.current.summary.length;
  const deadlineMs = provider.deadlineFor?.(chars) ?? provider.timeoutMs ?? timeoutMs;

  let reservation;
  try {
    reservation = reserve(db, userId, { proposalId: first.draftRow.proposal_id, estimatedUnits: estimateCostUnits({ payloadChars: chars, calls: 1 }), limits: budgetLimits, now });
  } catch (err) {
    if (err instanceof BudgetError) throw new DraftError('BUDGET_EXCEEDED', carry(err));
    throw err;
  }
  let budgetClosed = false;
  const closeBudget = ({ refund = false } = {}) => {
    if (budgetClosed) return;
    budgetClosed = true;
    if (refund) release(db, reservation.id, { now });
    else settle(db, reservation.id, { consumedUnits: estimateCostUnits({ payloadChars: chars, calls: 1 }), basis: 'ESTIMATED', now });
  };
  try {
    if (signal?.aborted) { closeBudget({ refund: true }); throw new DraftError('CANCELLED', dm('GENERATION_CANCELLED_BEFORE_CALL')); }
    let raw;
    try {
      raw = await withTimeout(Promise.resolve(provider.repair({
        draft: { summary: first.current.summary, summarySourceSpans: first.current.summarySourceSpans, questions: first.current.questions, modelVersion: first.draftRow.model_version, promptVersion: first.draftRow.prompt_version },
        findings, segments: first.found.segments, promptVersion: first.draftRow.prompt_version, signal,
      })), deadlineMs, 'TIMEOUT');
    } catch (err) {
      closeBudget({ refund: err instanceof ProviderRequestError && PRE_SEND_FAILURES.has(err.code) });
      if (err instanceof DraftError) throw err;
      if (err instanceof ProviderRequestError) throw new DraftError(err.code, err.message);
      throw new DraftError('PROVIDER_ERROR', dm('PROVIDER_UNEXPECTED_FAILURE'));
    }
    closeBudget();
    const repaired = typeof raw?.summary === 'string' ? raw.summary.trim() : '';
    if (!repaired) throw new DraftError('INVALID_STATE', dm('CORRECTION_MALFORMED'));
    return storeCorrections(db, userId, draftId, first.current.summary, repaired, findings, now);
  } finally {
    if (!budgetClosed) { try { closeBudget(); } catch { /* startup reconciliation settles what is still open */ } }
  }
}

/** Keeps the excerpts of a repaired summary beside the draft. Reloads after the call: if the student kept typing, the proposal is about a text that is gone. */
function storeCorrections(db, userId, draftId, judgedSummary, repairedSummary, findings, now) {
  const { draftRow, found, current } = loadEditable(db, userId, draftId);
  if (current.summary !== judgedSummary) throw new DraftError('ENTITY_CONFLICT', dm('SUMMARY_CHANGED_SINCE_READ'));
  // the repaired text must satisfy the same rules as any summary (figure references, citations); an invalid one proposes nothing
  validateOrThrow({
    summary: repairedSummary, summarySourceSpans: current.summarySourceSpans, questions: current.questions.map(editableQuestion),
    modelVersion: draftRow.model_version, promptVersion: draftRow.prompt_version,
  }, found.segments, { allowNoQuestions: current.questionsDeferred === true });
  // the finding that quotes this excerpt explains it; otherwise the first model finding (never an internal rule code when a model one exists)
  const lowered = (s) => String(s ?? '').toLowerCase();
  const fallback = (findings.find((f) => f.source === 'MODEL') ?? findings[0])?.issue ?? '';
  const items = diffExcerpts(current.summary, repairedSummary).map((e) => ({
    ...e,
    reason: findings.find((f) => f.generatedClaim && lowered(e.original).includes(lowered(f.generatedClaim)))?.issue ?? fallback,
  }));
  const content = { ...JSON.parse(draftRow.draft_json), corrections: { createdAt: now().toISOString(), items } };
  db.prepare('UPDATE generated_drafts SET draft_json = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND id = ?')
    .run(JSON.stringify(content), now().toISOString(), userId, draftId);
  return toDraftDto(db.prepare('SELECT * FROM generated_drafts WHERE id = ?').get(draftId), { db, userId });
}

/** Accepts ONE proposed excerpt: replaces exactly that text (it must still be in the summary exactly once), through reviseSummary so the version is kept. */
export function applySummaryCorrection(db, userId, draftId, key, now = () => new Date()) {
  const { current } = loadEditable(db, userId, draftId);
  const item = (current.corrections?.items ?? []).find((e) => e.key === key);
  const next = item ? applyExcerpt(current.summary, item) : null;
  if (next === null) throw new DraftError('NOT_FOUND', dm('CORRECTION_NOT_FOUND'));
  return reviseSummary(db, userId, draftId, { summary: next }, now);
}

/** Dismisses ONE proposed excerpt; the summary is untouched. */
export function dismissSummaryCorrection(db, userId, draftId, key, now = () => new Date()) {
  const { draftRow, current } = loadEditable(db, userId, draftId);
  const items = current.corrections?.items ?? [];
  if (!items.some((e) => e.key === key)) throw new DraftError('NOT_FOUND', dm('CORRECTION_NOT_FOUND'));
  const content = { ...JSON.parse(draftRow.draft_json), corrections: { ...current.corrections, items: items.filter((e) => e.key !== key) } };
  db.prepare('UPDATE generated_drafts SET draft_json = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND id = ?')
    .run(JSON.stringify(content), now().toISOString(), userId, draftId);
  return toDraftDto(db.prepare('SELECT * FROM generated_drafts WHERE id = ?').get(draftId), { db, userId });
}

/** Saves a model audit of the summary. Reloads after the (long) call: the student may have kept typing, and a finding about a text that is gone is never shown. */
function storeModelAudit(db, userId, draftId, judgedSummary, modelResult, now) {
  const { draftRow, found, current } = loadEditable(db, userId, draftId);
  if (current.summary !== judgedSummary) throw new DraftError('ENTITY_CONFLICT', dm('SUMMARY_CHANGED_SINCE_READ'));
  const deterministic = withSource(auditDraft({ summary: current.summary, summarySourceSpans: current.summarySourceSpans, questions: current.questions }, { segments: found.segments }).findings, 'DETERMINISTIC');
  const findings = [...deterministic, ...modelResult.map((f) => ({ ...f, source: 'MODEL' }))];
  const audit = {
    ...current.audit,
    result: findings.some(isBlocking) ? AUDIT_RESULT.REPAIR : AUDIT_RESULT.PASS,
    findings,
    auditedBy: ['DETERMINISTIC', 'MODEL'],
    modelAudit: 'OK',
    rulesVersion: AUDIT_RULES_VERSION,
    auditedAt: now().toISOString(),
  };
  const content = { ...JSON.parse(draftRow.draft_json), audit };
  db.prepare('UPDATE generated_drafts SET draft_json = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND id = ?')
    .run(JSON.stringify(content), now().toISOString(), userId, draftId);
  return toDraftDto(db.prepare('SELECT * FROM generated_drafts WHERE id = ?').get(draftId), { db, userId });
}

/**
 * Questions for a lesson that ALREADY exists (it was accepted as a summary only). They are written into a draft of their own,
 * hung on the lesson (target_unit_id), so they are reviewed like any AI output; accepting it only ADDS exercises (accept-draft.js).
 * The draft is summary-first shaped (no questions, questionsDeferred) and carries the lesson's summary read-only. Asking again while
 * one is open returns it. No provider is involved. NOT_FOUND for another student's lesson and for a lesson that did not come from a source.
 */
export function createLessonQuestionsDraft(db, userId, unitId, { now = () => new Date() } = {}) {
  const unit = db.prepare('SELECT id, summary_body FROM learning_units WHERE user_id = ? AND id = ?').get(userId, unitId);
  if (!unit) throw new DraftError('NOT_FOUND', dm('UNIT_NOT_FOUND'));
  const open = () => db.prepare("SELECT * FROM generated_drafts WHERE user_id = ? AND target_unit_id = ? AND status = 'DRAFT'").get(userId, unitId);
  if (open()) return toDraftDto(open(), { db, userId });
  const origin = db.prepare("SELECT * FROM generated_drafts WHERE user_id = ? AND accepted_unit_id = ? AND status = 'ACCEPTED' AND target_unit_id IS NULL ORDER BY id DESC LIMIT 1").get(userId, unitId);
  if (!origin) throw new DraftError('NOT_FOUND', dm('LESSON_WITHOUT_SOURCE'));
  const found = findOwnedProposalWithSegments(db, userId, origin.proposal_id);
  if (!found) throw new DraftError('NOT_FOUND', dm('SOURCE_PROPOSAL_NOT_FOUND'));
  const digest = segmentsDigest(found.segments);
  // the questions must come from the text the lesson came from: a source extracted differently since then would attribute text B to a summary of text A
  if (origin.input_sha256 && origin.input_sha256 !== digest) throw new DraftError('SOURCE_CHANGED', dm('SOURCE_CHANGED_SINCE_DRAFT'));
  const prior = normalizeContent(JSON.parse(origin.draft_json), generatorOf(origin));
  const nowIso = now().toISOString();
  const content = normalizeContent({
    summary: unit.summary_body || prior.summary,
    summarySourceSpans: prior.summarySourceSpans,
    summaryEvidence: [],
    questions: [],
    questionsDeferred: true,
    quarantinedCount: 0,
    audit: { result: AUDIT_RESULT.PASS, findings: [], auditedBy: ['DETERMINISTIC'], modelAudit: 'NOT_RUN', repaired: false, repairRejected: false, addressed: [], rulesVersion: AUDIT_RULES_VERSION, auditedAt: nowIso },
    sourceLanguage: prior.sourceLanguage,
    generationLocale: prior.generationLocale,
    languageCheck: prior.languageCheck,
    sourceScope: prior.sourceScope,
  });
  const generation = db.prepare('SELECT extraction_generation FROM sources WHERE user_id = ? AND id = ?').get(userId, found.proposal.source_id)?.extraction_generation ?? null;
  try {
    db.prepare(`
      INSERT INTO generated_drafts (user_id, proposal_id, provider, model_version, prompt_version, status, draft_json, created_at, input_sha256, source_extraction_generation, target_unit_id)
      VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?)
    `).run(userId, origin.proposal_id, origin.provider, origin.model_version, origin.prompt_version, JSON.stringify(content), nowIso, digest, generation, unitId);
  } catch (err) {
    if (!open()) throw err; // two requests at once: the partial unique index let one in; the other gets that one
  }
  return toDraftDto(open(), { db, userId });
}

/**
 * Sets the order of the questions from a list of ids. The list must be exactly the current ids, each once: a missing,
 * repeated or unknown id is refused (nothing is deleted or invented by omission). Questions move whole, with their text,
 * version, review status and citations, so a REJECTED status can never land on another question's content.
 */
export function reorderQuestions(db, userId, draftId, order, { expectedRevision } = {}, now = () => new Date()) {
  const { draftRow, found, current } = loadEditable(db, userId, draftId);
  if (expectedRevision !== undefined && expectedRevision !== null && expectedRevision !== draftRow.revision) {
    throw new DraftError('REVISION_CONFLICT', dm('DRAFT_CHANGED_REORDER'));
  }
  const currentIds = current.questions.map((q) => q.id);
  const valid = Array.isArray(order) && order.length === currentIds.length && new Set(order).size === order.length
    && order.every((id) => typeof id === 'string' && currentIds.includes(id));
  if (!valid) throw new DraftError('VALIDATION_FAILED', dm('ORDER_INVALID'), 'order');
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
 * Returns the draft and how many deterministic ACTIONABLE (non-LOW) findings appeared/disappeared, matching what the review list shows.
 */
export function reauditDraft(db, userId, draftId, now = () => new Date()) {
  const { draftRow, found, current } = loadEditable(db, userId, draftId);
  const previous = current.audit ?? null;
  const rescreen = auditDraft({ summary: current.summary, summarySourceSpans: current.summarySourceSpans, questions: current.questions }, { segments: found.segments });
  const deterministic = withSource(rescreen.findings, 'DETERMINISTIC');
  const keptModel = previous && !previous.editedByHuman ? (previous.findings ?? []).filter((f) => f.source === 'MODEL') : [];
  const findings = [...deterministic, ...keptModel];
  const before = new Map((previous?.findings ?? []).filter((f) => f.source !== 'MODEL' && isActionable(f)).map((f) => [findingKey(f), f]));
  const after = new Map(deterministic.filter(isActionable).map((f) => [findingKey(f), f]));
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
  if (!row) throw new DraftError('NOT_FOUND', dm('DRAFT_NOT_FOUND'));
  return toDraftDto(row, { db, userId });
}

export function listDrafts(db, userId, proposalId, { now = () => new Date() } = {}) {
  const proposal = db.prepare('SELECT id FROM content_proposals WHERE user_id = ? AND id = ?').get(userId, proposalId);
  if (!proposal) throw new DraftError('NOT_FOUND', dm('PROPOSAL_NOT_FOUND'));
  // looking at the unit is when a replacement whose 30 days passed with no decision is settled (the previous draft goes)
  settleExpiredDecisions(db, { now });
  return db.prepare('SELECT * FROM generated_drafts WHERE user_id = ? AND proposal_id = ? AND target_unit_id IS NULL ORDER BY id DESC').all(userId, proposalId).map((row) => toDraftDto(row, { db, userId }));
}

// ---- Replacement decision (migration 043; spec RESUMO-ATUAL-E-LIXEIRA-2026-11-12) -------------------------------------------------

/** The decision pending for this unit (a regenerate kept the previous draft until the student chooses), or null. Read-only. */
export function pendingDecision(db, userId, proposalId) {
  return findPending(db, userId, proposalId);
}

/** For the API: the unit must be this student's (NOT_FOUND otherwise); what expired is settled first, then the pending decision or null. */
export function loadPendingDecision(db, userId, proposalId, { now = () => new Date() } = {}) {
  if (!db.prepare('SELECT 1 FROM content_proposals WHERE user_id = ? AND id = ?').get(userId, proposalId)) {
    throw new DraftError('NOT_FOUND', dm('PROPOSAL_NOT_FOUND'));
  }
  settleExpiredDecisions(db, { now });
  return findPending(db, userId, proposalId);
}

/** Settles the replacements whose 30 days passed with no decision (the previous draft is deleted, the new one stays). Returns how many. */
export function settleExpiredDecisions(db, { now = () => new Date() } = {}) {
  return settleExpired(db, { now });
}

/** Discards one unfinished summary (status DRAFT). Never touches the book, the unit or an accepted lesson. No provider call, no credit. */
export function discardDraftById(db, userId, draftId, { confirmDiscard = false } = {}) {
  const result = discardDraft(db, userId, draftId, { confirmDiscard: confirmDiscard === true });
  if (result.outcome === 'NOT_FOUND') throw new DraftError('NOT_FOUND', dm('DRAFT_NOT_FOUND'));
  if (result.outcome === 'NOT_DISCARDABLE') throw new DraftError('INVALID_STATE', dm('DRAFT_ALREADY_LESSON'));
  if (result.outcome === 'IN_DECISION') throw new DraftError('INVALID_STATE', dm('DRAFT_IN_DECISION'));
  if (result.outcome === 'NEEDS_CONFIRMATION') {
    throw new DraftError('DISCARD_NEEDS_CONFIRMATION', dm('DRAFT_DISCARD_CONFIRM'));
  }
  return { discardedDraftId: draftId, proposalId: result.proposalId };
}

/** A regenerate is refused while the student has not decided about the previous one: nothing is generated and no credit is reserved. */
export function assertNoPendingDecision(db, userId, proposalId) {
  if (findPending(db, userId, proposalId)) {
    throw new DraftError('DECISION_PENDING', 'Já existe um resumo novo aguardando a sua decisão. Escolha manter o novo ou voltar ao anterior antes de gerar outro.');
  }
}

/**
 * The student's choice after a regenerate. `draftId` is the NEW draft (the one that carries the decision).
 *   KEEP_NEW          the previous draft is deleted (unless it became a lesson meanwhile, then it stays); the new one stays current
 *   RESTORE_PREVIOUS  the new draft is deleted; the previous one is current again (refused if the new one became a lesson meanwhile)
 * Neither calls a provider or spends credit.
 */
export function decideReplacement(db, userId, draftId, decision, { confirmDiscard = false } = {}) {
  if (!REPLACEMENT_DECISIONS.includes(decision)) {
    throw new DraftError('VALIDATION_FAILED', 'Decisão inválida: use KEEP_NEW ou RESTORE_PREVIOUS.', 'decision');
  }
  if (!db.prepare('SELECT 1 FROM generated_drafts WHERE user_id = ? AND id = ?').get(userId, draftId)) {
    throw new DraftError('NOT_FOUND', dm('DRAFT_NOT_FOUND'));
  }
  const result = applyDecision(db, userId, draftId, decision, { confirmDiscard: confirmDiscard === true });
  if (result.outcome === 'NEEDS_CONFIRMATION') {
    throw new DraftError('DISCARD_NEEDS_CONFIRMATION', 'O resumo que seria apagado tem alterações suas. Confirme para apagá-lo mesmo assim.');
  }
  if (result.outcome === 'NOT_PENDING') throw new DraftError('INVALID_STATE', 'Não há decisão pendente para este resumo.');
  if (result.outcome === 'BLOCKED') throw new DraftError('INVALID_STATE', 'O resumo novo já foi aceito como aula; não é possível voltar ao anterior.');
  return { decision: result.decision, currentDraftId: result.currentDraftId, deletedDraftId: result.deletedDraftId };
}
