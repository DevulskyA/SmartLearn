// QUESTION ENGINE, step 1: REUSE, then DERIVE, then GENERATE. For one learning need this answers WHAT to do; it calls no model and
// writes nothing. The student's exposure history (items already shown) is an input, so a repeat is not offered as new.
//
//   REUSE     an item that fits the need on every dimension the need names AND whose text may be reused as it is
//             (OFFICIAL_PUBLIC or LICENSED, with an answer key).
//   DERIVE    a close item exists but must not (or need not) be served as it is: a REFERENCE_ONLY or UNKNOWN item that fits, or any
//             item that only comes near. The new item is written from the parent's cognitive structure, with `parent_id` and
//             `relationship` recorded; text is copied only when the parent's rights allow it.
//   GENERATE  nothing usable: a gap. Also what an empty corpus always answers.
import { canReuseText } from './item.js';

// A near candidate must have matched the need's words in the full-text index at all (score > 0); a listing with no text query has no
// notion of "near" and never produces one.
export const MIN_NEAR_SCORE = 0;

export function resolveNeed(corpus, need, { exposed = [] } = {}) {
  if (!corpus || corpus.status === 'CORPUS_EMPTY') return { action: 'GENERATE', reason: 'CORPUS_EMPTY', candidates: 0 };
  const candidates = corpus.search({
    query: need.query ?? null, topic: need.topic ?? null, competency: need.competency ?? null, itemType: need.itemType ?? null,
    exam: need.exam ?? null, excludeIds: exposed, limit: 10,
  });
  if (candidates.length === 0) return { action: 'GENERATE', reason: 'NO_CANDIDATE', candidates: 0 };

  const exactReusable = candidates.find((c) => c.exact && canReuseText(c.item));
  if (exactReusable) return { action: 'REUSE', item: exactReusable.item, reason: 'EXACT_FIT_REUSABLE', candidates: candidates.length };

  const exactReference = candidates.find((c) => c.exact);
  if (exactReference) {
    const textAllowed = canReuseText(exactReference.item);
    return {
      action: 'DERIVE',
      parent_id: exactReference.item.id,
      relationship: textAllowed ? 'VARIANT' : 'REFERENCE_STRUCTURE',
      copyText: textAllowed,
      reason: textAllowed ? 'EXACT_FIT_NEEDS_VARIANT' : `EXACT_FIT_NOT_REUSABLE_${exactReference.item.usage_status}`,
      candidates: candidates.length,
    };
  }

  const near = candidates.find((c) => c.score > MIN_NEAR_SCORE);
  if (near) {
    return { action: 'DERIVE', parent_id: near.item.id, relationship: 'NEAR_STRUCTURE', copyText: false, reason: 'NEAR_ITEM', candidates: candidates.length };
  }
  return { action: 'GENERATE', reason: 'NO_CLOSE_CANDIDATE', candidates: candidates.length };
}
