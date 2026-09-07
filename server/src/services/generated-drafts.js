import { generateDraft as fakeGenerateDraft, FAKE_PROVIDER_NAME } from '../ai/fake-provider.js';
import { generateDraft as anthropicGenerateDraft, ANTHROPIC_PROVIDER_NAME, ProviderRequestError } from '../ai/anthropic-provider.js';
import { validateDraft, DraftValidationError } from '../ai/draft-schema.js';

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
export function selectProvider({ apiKey, model, consentGranted, budgetCapUsd }) {
  const liveAvailable = Boolean(apiKey) && Boolean(model) && consentGranted === true && typeof budgetCapUsd === 'number' && budgetCapUsd > 0;
  if (liveAvailable) {
    return { name: ANTHROPIC_PROVIDER_NAME, live: true, generate: (input) => anthropicGenerateDraft(input, { apiKey, model }) };
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

function toDraftDto(row) {
  const draft = JSON.parse(row.draft_json);
  return {
    id: row.id,
    proposalId: row.proposal_id,
    provider: row.provider,
    modelVersion: row.model_version,
    promptVersion: row.prompt_version,
    status: row.status,
    createdAt: row.created_at,
    ...draft,
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
  promptVersion = '1',
  apiKey = null,
  model = null,
  consentGranted = false,
  budgetCapUsd = null,
  timeoutMs = 30_000,
  maxInputChars = 50_000,
  now = () => new Date(),
} = {}) {
  const found = findOwnedProposalWithSegments(db, userId, proposalId);
  if (!found) throw new DraftError('NOT_FOUND', 'Proposta não encontrada.');
  if (found.segments.length === 0) throw new DraftError('NOT_FOUND', 'A proposta não tem texto de origem associado.');

  const totalChars = found.segments.reduce((sum, s) => sum + s.text.length, 0);
  if (totalChars > maxInputChars) {
    throw new DraftError('INPUT_TOO_LARGE', `O texto de origem (${totalChars} caracteres) excede o limite de ${maxInputChars}.`);
  }

  const provider = selectProvider({ apiKey, model, consentGranted, budgetCapUsd });

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

  const nowIso = now().toISOString();
  const draftContent = { summary: validated.summary, questions: validated.questions, quarantinedCount: validated.quarantinedCount };
  const result = db.prepare(`
    INSERT INTO generated_drafts (user_id, proposal_id, provider, model_version, prompt_version, status, draft_json, created_at)
    VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?)
  `).run(
    userId, proposalId, provider.name, validated.modelVersion, validated.promptVersion, JSON.stringify(draftContent), nowIso
  );

  return { ...toDraftDto(db.prepare('SELECT * FROM generated_drafts WHERE id = ?').get(result.lastInsertRowid)), live: provider.live };
}

export function getDraft(db, userId, draftId) {
  const row = db.prepare('SELECT * FROM generated_drafts WHERE user_id = ? AND id = ?').get(userId, draftId);
  if (!row) throw new DraftError('NOT_FOUND', 'Rascunho não encontrado.');
  return toDraftDto(row);
}

export function listDrafts(db, userId, proposalId) {
  const proposal = db.prepare('SELECT id FROM content_proposals WHERE user_id = ? AND id = ?').get(userId, proposalId);
  if (!proposal) throw new DraftError('NOT_FOUND', 'Proposta não encontrada.');
  return db.prepare('SELECT * FROM generated_drafts WHERE user_id = ? AND proposal_id = ? ORDER BY id DESC').all(userId, proposalId).map(toDraftDto);
}
