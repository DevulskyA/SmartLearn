// LUNA_ALTO (STATE.md AI_PROVIDER_DECISION, canonical): study generation calls OpenAI gpt-5.6-luna at reasoning
// effort high through the Responses API. Sibling of anthropic-provider.js with the SAME adapter contract
// (generateDraft / auditDraftWithModel / repairDraftWithModel) and the same guarantees: it is only reached through
// generated-drafts.js selectProvider (credential + consent + budget cap), source text is sent as explicitly
// untrusted data, no tools are given to the model (nothing in a response is ever executed beyond JSON.parse), and
// the raw result is validated by the exact same draft-schema.js as every other provider. No silent fallback: a
// missing credential is an explicit error, never fake/other-provider content.
import { buildAuditPrompt, buildRepairPrompt, parseModelAudit } from './draft-audit-model.js';
import { buildDraftPrompt } from './draft-prompt.js';
import { ProviderRequestError } from './anthropic-provider.js';

export const OPENAI_PROVIDER_NAME = 'OPENAI';
export const OPENAI_DEFAULT_REASONING_EFFORT = 'high';
const API_URL = 'https://api.openai.com/v1/responses';
// Reasoning tokens count against the output budget: a high-effort call needs room for them as well as for the JSON.
const GENERATION_MAX_OUTPUT_TOKENS = 16_000;
const AUDIT_MAX_OUTPUT_TOKENS = 8_000;

/** The assistant's text from a Responses API body: `output` items of type message, content parts of type output_text. */
function outputText(body) {
  if (typeof body?.output_text === 'string') return body.output_text;
  const parts = [];
  for (const item of body?.output ?? []) {
    if (item?.type !== 'message') continue;
    for (const part of item.content ?? []) {
      if (part?.type === 'output_text' && typeof part.text === 'string') parts.push(part.text);
    }
  }
  return parts.length > 0 ? parts.join('') : null;
}

/** One model call: prompt in, parsed JSON out. Shared by generation, audit and repair. */
async function callModel(prompt, { apiKey, model, apiUrl = null, timeoutMs = 30_000, fetchImpl = fetch, maxOutputTokens = GENERATION_MAX_OUTPUT_TOKENS, reasoningEffort = OPENAI_DEFAULT_REASONING_EFFORT } = {}) {
  if (!apiKey || !model) {
    throw new ProviderRequestError('MISSING_CREDENTIALS', 'Nenhuma credencial/modelo configurado para o provedor real.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetchImpl(apiUrl || API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        reasoning: { effort: reasoningEffort },
        input: prompt,
        max_output_tokens: maxOutputTokens,
        store: false,
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

  const text = outputText(await res.json());
  if (typeof text !== 'string') {
    throw new ProviderRequestError('PROVIDER_ERROR', 'Resposta do provedor não contém texto de conteúdo.');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderRequestError('PROVIDER_ERROR', 'Resposta do provedor não é um JSON válido.');
  }
}

/** @returns {Promise<object>} the provider's RAW parsed JSON, validated afterwards by draft-schema.js like every provider. */
export function generateDraft({ segments, promptVersion }, options = {}) {
  return callModel(buildDraftPrompt(segments, promptVersion), options);
}

export async function auditDraftWithModel({ draft, segments }, options = {}) {
  const raw = await callModel(buildAuditPrompt(draft, segments), { ...options, maxOutputTokens: AUDIT_MAX_OUTPUT_TOKENS });
  return parseModelAudit(raw, { questionCount: draft.questions.length });
}

export function repairDraftWithModel({ draft, findings, segments, promptVersion }, options = {}) {
  return callModel(buildRepairPrompt(draft, findings, segments, promptVersion), options);
}
