import { createHash } from 'node:crypto';
import { generateDraft as fakeGenerateDraft, FAKE_PROVIDER_NAME } from '../ai/fake-provider.js';
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
import { auditDraft, AUDIT_RESULT } from '../ai/draft-audit.js';

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
    if (name === 'FAKE') return { name: FAKE_PROVIDER_NAME, live: false, generate: fakeGenerateDraft };
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
  return { name: FAKE_PROVIDER_NAME, live: false, generate: fakeGenerateDraft };
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

export function normalizeContent(content) {
  const questions = content.questions ?? [];
  let seq = Math.max(Number.isInteger(content.questionSeq) ? content.questionSeq : 0, ...questions.map((q) => idNumber(q.id)));
  const used = new Set(questions.map((q) => q.id).filter(Boolean));
  const normalized = questions.map((q) => {
    let id = q.id;
    if (!id) { do { seq += 1; id = `q${seq}`; } while (used.has(id)); used.add(id); }
    return {
      ...q,
      id,
      status: QUESTION_REVIEW_STATUSES.has(q.status) ? q.status : 'PROPOSED',
      version: Number.isInteger(q.version) ? q.version : 1,
    };
  });
  return {
    ...content,
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

function toDraftDto(row, { db, userId } = {}) {
  const draft = normalizeContent(JSON.parse(row.draft_json));
  const audit = findingsWithEntities(draft.audit, draft.questions);
  const flaggedIds = new Set((audit?.findings ?? []).filter((f) => f.severity !== 'LOW' && f.entityType === 'QUESTION').map((f) => f.entityId));
  draft.questions = draft.questions.map((q) => ({
    ...q,
    status: q.status === 'PROPOSED' && flaggedIds.has(q.id) ? 'FLAGGED' : q.status,
    findingCount: (audit?.findings ?? []).filter((f) => f.severity !== 'LOW' && f.entityId === q.id).length,
  }));
  draft.audit = audit;
  return {
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
    sourceStale: db ? isDraftStale(db, userId, row) : false,
    pages: db ? citedPagesFor(db, userId, row, draft) : [],
  };
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
export async function createDraft(db, userId, proposalId, {
  // SMARTLEARN_PRODUCT_FIRST_V1 Slice 1: bumped from '1' -- the real
  // provider's prompt (anthropic-provider.js) changed materially (varied
  // question types, teaching answers, genuine hints), and promptVersion
  // is stored per draft precisely so a version change like this is
  // distinguishable in stored/historical drafts, not silently conflated.
  // '5' (REALMODEL-1 quality closure): explanations must add a cause, hints must not leak the answer or its value, named
  // conditions must survive, whole-sentence copying is discouraged.
  promptVersion = '5',
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
  now = () => new Date(),
} = {}) {
  const found = findOwnedProposalWithSegments(db, userId, proposalId);
  if (!found) throw new DraftError('NOT_FOUND', 'Proposta não encontrada.');
  if (found.segments.length === 0) throw new DraftError('NO_USABLE_TEXT', 'Nenhuma página deste trecho tem texto utilizável (vazia ou ilegível na extração), então não há o que gerar. Nada foi enviado ao modelo.');

  // Editorial pages (copyright, dedication, answer key...) are indexed but never offered to the model.
  if ((found.proposal.kind ?? 'CONTENT') !== 'CONTENT') {
    throw new DraftError('NOT_GENERATABLE', `Este trecho (${found.proposal.kind}) não é conteúdo de estudo e não gera rascunho. Nada foi enviado ao modelo.`);
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

  // Bind the draft to the exact text it is generated from (SPRINT-04), fixed BEFORE the provider call.
  const inputDigest = segmentsDigest(found.segments);
  const inputGeneration = db.prepare('SELECT extraction_generation FROM sources WHERE user_id = ? AND id = ?').get(userId, found.proposal.source_id)?.extraction_generation ?? null;

  const provider = selectProvider({ provider: declaredProvider, apiKey, model, consentGranted, budgetCapUsd, fetchImpl, apiUrl, codex });
  // A provider may need a longer deadline than the generic one (a Codex run is minutes, not seconds).
  const deadlineMs = provider.timeoutMs ?? timeoutMs;

  let raw;
  try {
    raw = await withTimeout(provider.generate({ segments: found.segments, promptVersion }), deadlineMs, 'TIMEOUT');
  } catch (err) {
    if (err instanceof DraftError) throw err;
    if (err instanceof ProviderRequestError) throw new DraftError(err.code, err.message);
    throw new DraftError('PROVIDER_ERROR', String(err.message || err));
  }

  let validated;
  try {
    validated = validateDraft(raw, { segments: found.segments });
  } catch (err) {
    if (err instanceof DraftValidationError) throw new DraftError(err.code, err.message, err.field);
    throw err;
  }

  const audited = await auditAndRepair(provider, validated, found.segments, { promptVersion, timeoutMs: deadlineMs });
  validated = audited.draft;

  const nowIso = now().toISOString();
  const draftContent = normalizeContent({
    summary: validated.summary,
    summarySourceSpans: validated.summarySourceSpans,
    questions: validated.questions,
    quarantinedCount: validated.quarantinedCount,
    audit: audited.audit,
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
export function reviseDraft(db, userId, draftId, { summary, questions } = {}, now = () => new Date()) {
  const draftRow = db.prepare('SELECT * FROM generated_drafts WHERE user_id = ? AND id = ?').get(userId, draftId);
  if (!draftRow) throw new DraftError('NOT_FOUND', 'Rascunho não encontrado.');
  if (draftRow.status !== 'DRAFT') {
    throw new DraftError('INVALID_STATE', `Rascunho no estado ${draftRow.status} não pode ser editado.`);
  }

  const found = findOwnedProposalWithSegments(db, userId, draftRow.proposal_id);
  if (!found) throw new DraftError('NOT_FOUND', 'Proposta de origem não encontrada.');

  const current = normalizeContent(JSON.parse(draftRow.draft_json));
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
  const nextQuestions = validated.questions.length === current.questions.length
    ? validated.questions.map((q, i) => mergeIdentity(current.questions[i], q))
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
function mergeIdentity(previous, validatedQuestion) {
  const changed = EDITABLE_FIELDS.some((k) => JSON.stringify(previous?.[k] ?? null) !== JSON.stringify(validatedQuestion[k] ?? null));
  return {
    ...validatedQuestion,
    id: previous?.id,
    status: previous?.status ?? 'PROPOSED',
    version: (previous?.version ?? 1) + (changed ? 1 : 0),
  };
}

function loadEditable(db, userId, draftId) {
  const draftRow = db.prepare('SELECT * FROM generated_drafts WHERE user_id = ? AND id = ?').get(userId, draftId);
  if (!draftRow) throw new DraftError('NOT_FOUND', 'Rascunho não encontrado.');
  if (draftRow.status !== 'DRAFT') throw new DraftError('INVALID_STATE', `Rascunho no estado ${draftRow.status} não pode ser editado.`);
  const found = findOwnedProposalWithSegments(db, userId, draftRow.proposal_id);
  if (!found) throw new DraftError('NOT_FOUND', 'Proposta de origem não encontrada.');
  return { draftRow, found, current: normalizeContent(JSON.parse(draftRow.draft_json)) };
}

/** Re-screens deterministically (a human edit changes the text, so earlier findings describe text that is gone), writes ONE row update and bumps the draft revision. */
function persistEdit(db, userId, draftId, draftRow, found, current, next, now) {
  const rescreen = auditDraft({ summary: next.summary, summarySourceSpans: next.summarySourceSpans, questions: next.questions }, { segments: found.segments });
  const audit = {
    result: rescreen.result,
    findings: withSource(rescreen.findings, 'DETERMINISTIC'),
    auditedBy: ['DETERMINISTIC'],
    modelAudit: 'NOT_RUN',
    repaired: false,
    repairRejected: false,
    addressed: [],
    editedByHuman: true,
  };
  const content = normalizeContent({
    ...current,
    summary: next.summary,
    summarySourceSpans: next.summarySourceSpans,
    questions: next.questions,
    summaryVersion: next.summaryVersion,
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
  const merged = mergeIdentity(previous, validated.questions[0]);
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
