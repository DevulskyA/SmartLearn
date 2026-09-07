// T37: deterministic fake provider — no network, no credentials, always
// available. Every test of the generation/validation/acceptance pipeline
// runs against this, never a live call. Its shape is the same contract
// server/src/ai/anthropic-provider.js implements: given bounded source
// segments, return a raw (not-yet-validated) draft object.
//
// Deliberately dumb and literal: it never "interprets" segment text as
// instructions, only ever treats it as inert data to slice — this is the
// structural reason embedded text like "ignore previous instructions..."
// has no effect on this provider's behavior (design.md: "treat source
// text as data, including any embedded instructions").
export const FAKE_PROVIDER_NAME = 'FAKE';
export const FAKE_MODEL_VERSION = 'fake-v1';

const SUMMARY_SNIPPET_LENGTH = 150;
const ANSWER_SNIPPET_LENGTH = 80;

/**
 * @param {{segments: {pageIndex:number, text:string}[], promptVersion: string}} input
 * @returns {Promise<object>} a RAW draft — NOT yet validated against
 *   draft-schema.js. The caller (generated-drafts.js) validates every
 *   provider's output identically, fake or real.
 */
export async function generateDraft({ segments, promptVersion }) {
  const joinedText = segments.map((s) => s.text).join(' ').trim();
  const summary = joinedText.slice(0, SUMMARY_SNIPPET_LENGTH) || '(sem texto extraído)';

  const questions = segments.map((segment) => ({
    question: `O que este trecho (página ${segment.pageIndex}) aborda?`,
    answer: segment.text.slice(0, ANSWER_SNIPPET_LENGTH) || '(sem conteúdo nesta página)',
    hint: null,
    sourceSpans: [{ pageIndex: segment.pageIndex }],
  }));

  return {
    summary,
    questions,
    modelVersion: FAKE_MODEL_VERSION,
    promptVersion,
  };
}
