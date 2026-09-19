import { generateDraft as fakeGenerateDraft, FAKE_PROVIDER_NAME } from '../ai/fake-provider.js';
import {
  generateDraft as anthropicGenerateDraft, auditDraftWithModel, repairDraftWithModel,
  ANTHROPIC_PROVIDER_NAME, ProviderRequestError,
} from '../ai/anthropic-provider.js';
import { validateDraft, DraftValidationError } from '../ai/draft-schema.js';
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
export function selectProvider({ apiKey, model, consentGranted, budgetCapUsd, fetchImpl, apiUrl }) {
  const liveAvailable = Boolean(apiKey) && Boolean(model) && consentGranted === true && typeof budgetCapUsd === 'number' && budgetCapUsd > 0;
  if (liveAvailable) {
    const options = { apiKey, model, ...(fetchImpl ? { fetchImpl } : {}), ...(apiUrl ? { apiUrl } : {}) };
    return {
      name: ANTHROPIC_PROVIDER_NAME,
      live: true,
      generate: (input) => anthropicGenerateDraft(input, options),
      // Production-time quality gate: an independent audit and one targeted repair. Same
      // credentials, consent and budget as generation — never a runtime call for the student.
      audit: (input) => auditDraftWithModel(input, options),
      repair: (input) => repairDraftWithModel(input, options),
    };
  }
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
  const segments = db.prepare(`
    SELECT page_index as pageIndex, text FROM source_pages
    WHERE user_id = ? AND source_id = ? AND page_index BETWEEN ? AND ?
    ORDER BY page_index
  `).all(userId, proposal.source_id, proposal.page_start, proposal.page_end);
  return { proposal, segments };
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

function toDraftDto(row, { db, userId } = {}) {
  const draft = JSON.parse(row.draft_json);
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
  promptVersion = '3',
  apiKey = null,
  model = null,
  consentGranted = false,
  budgetCapUsd = null,
  timeoutMs = 30_000,
  maxInputChars = 50_000,
  fetchImpl = null,
  apiUrl = null,
  now = () => new Date(),
} = {}) {
  const found = findOwnedProposalWithSegments(db, userId, proposalId);
  if (!found) throw new DraftError('NOT_FOUND', 'Proposta não encontrada.');
  if (found.segments.length === 0) throw new DraftError('NOT_FOUND', 'A proposta não tem texto de origem associado.');

  const totalChars = found.segments.reduce((sum, s) => sum + s.text.length, 0);
  if (totalChars > maxInputChars) {
    throw new DraftError('INPUT_TOO_LARGE', `O texto de origem (${totalChars} caracteres) excede o limite de ${maxInputChars}.`);
  }

  const provider = selectProvider({ apiKey, model, consentGranted, budgetCapUsd, fetchImpl, apiUrl });

  let raw;
  try {
    raw = await withTimeout(provider.generate({ segments: found.segments, promptVersion }), timeoutMs, 'TIMEOUT');
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

  const audited = await auditAndRepair(provider, validated, found.segments, { promptVersion, timeoutMs });
  validated = audited.draft;

  const nowIso = now().toISOString();
  const draftContent = {
    summary: validated.summary,
    summarySourceSpans: validated.summarySourceSpans,
    questions: validated.questions,
    quarantinedCount: validated.quarantinedCount,
    audit: audited.audit,
  };
  const result = db.prepare(`
    INSERT INTO generated_drafts (user_id, proposal_id, provider, model_version, prompt_version, status, draft_json, created_at)
    VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?)
  `).run(
    userId, proposalId, provider.name, validated.modelVersion, validated.promptVersion, JSON.stringify(draftContent), nowIso
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

  const current = JSON.parse(draftRow.draft_json);
  const candidate = {
    summary: summary !== undefined ? summary : current.summary,
    summarySourceSpans: current.summarySourceSpans,
    questions: questions !== undefined ? questions : current.questions,
    modelVersion: draftRow.model_version,
    promptVersion: draftRow.prompt_version,
  };

  let validated;
  try {
    validated = validateDraft(candidate, { segments: found.segments });
  } catch (err) {
    if (err instanceof DraftValidationError) throw new DraftError(err.code, err.message, err.field);
    throw err;
  }

  // A human edit changes the text, so the previous findings describe text that is gone: re-screen
  // deterministically (no model call for an edit) and say so.
  const rescreen = auditDraft(validated, { segments: found.segments });
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

  const nowIso = now().toISOString();
  const draftContent = {
    summary: validated.summary,
    summarySourceSpans: validated.summarySourceSpans,
    questions: validated.questions,
    quarantinedCount: validated.quarantinedCount,
    audit,
  };
  db.prepare('UPDATE generated_drafts SET draft_json = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND id = ?')
    .run(JSON.stringify(draftContent), nowIso, userId, draftId);

  return toDraftDto(db.prepare('SELECT * FROM generated_drafts WHERE id = ?').get(draftId), { db, userId });
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
