// T37: the one configured real-provider adapter (design.md §8: "one
// configured real-provider adapter using the provider selected in
// environment/explicit configuration"). Never called by default — see
// server/src/services/generated-drafts.js's provider selection, which
// only reaches this module when an API key, explicit consent, AND a
// configured budget cap are ALL present (server/src/config.js). Even
// then, this module's own output is validated by the exact same
// draft-schema.js the fake provider's output goes through — this adapter
// is never trusted just because it's "the real one".
//
// Source segment text is sent as clearly delimited, explicitly-untrusted
// data, with an explicit instruction not to follow any instruction found
// inside it (design.md: "treat source text as data, including any
// embedded instructions"). This adapter has no tool/function-calling
// capability wired up at all — it cannot call mutation APIs, read
// credentials, or touch the filesystem regardless of what a response
// contains, because nothing here ever executes anything from a response
// beyond passing its text through JSON.parse.
import { buildAuditPrompt, buildRepairPrompt, parseModelAudit } from './draft-audit-model.js';
import { buildDraftPrompt } from './draft-prompt.js';

export const ANTHROPIC_PROVIDER_NAME = 'ANTHROPIC';
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

export class ProviderRequestError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * One model call: prompt in, parsed JSON out. Shared by generation, audit and repair so the
 * credential check, timeout, error mapping and "nothing is executed from a response" property
 * are identical for all three.
 */
async function callModel(prompt, { apiKey, model, apiUrl = null, timeoutMs = 30_000, fetchImpl = fetch, maxTokens = 4096 } = {}) {
  if (!apiKey || !model) {
    throw new ProviderRequestError('MISSING_CREDENTIALS', 'Nenhuma credencial/modelo configurado para o provedor real.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetchImpl(apiUrl || API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new ProviderRequestError('TIMEOUT', 'Tempo limite excedido ao contatar o provedor.');
    throw new ProviderRequestError('NETWORK_ERROR', String(err.message || err));
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new ProviderRequestError('PROVIDER_ERROR', `Provedor respondeu com status ${res.status}.`);
  }

  const body = await res.json();
  const text = body?.content?.[0]?.text;
  if (typeof text !== 'string') {
    throw new ProviderRequestError('PROVIDER_ERROR', 'Resposta do provedor não contém texto de conteúdo.');
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderRequestError('PROVIDER_ERROR', 'Resposta do provedor não é um JSON válido.');
  }
}

/**
 * @param {{segments: {pageIndex:number, text:string}[], promptVersion: string}} input
 * @param {{apiKey: string, model: string, timeoutMs?: number, fetchImpl?: typeof fetch}} options
 * @returns {Promise<object>} the provider's RAW parsed JSON — NOT yet
 *   validated (see draft-schema.js, applied identically to every provider).
 */
export function generateDraft({ segments, promptVersion }, options = {}) {
  return callModel(buildDraftPrompt(segments, promptVersion), options);
}

/**
 * Independent audit of an already-validated draft against the same source pages. Returns sanitized
 * findings (see draft-audit-model.js); a malformed reply is reported, never guessed at.
 */
export async function auditDraftWithModel({ draft, segments }, options = {}) {
  const raw = await callModel(buildAuditPrompt(draft, segments), { ...options, maxTokens: 2048 });
  return parseModelAudit(raw, { questionCount: draft.questions.length });
}

/** One targeted repair: returns the RAW repaired draft (the caller re-validates it like any draft). */
export function repairDraftWithModel({ draft, findings, segments, promptVersion }, options = {}) {
  return callModel(buildRepairPrompt(draft, findings, segments, promptVersion), options);
}
