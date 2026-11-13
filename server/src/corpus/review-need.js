// REVIEW NEED: the entry point a review uses to get a question for one learning need, bank first. It reads the student's private bank
// (private-bank.js), skips what was shown recently, asks resolveNeed() what to do (REUSE / DERIVE / GENERATE) and then applies the
// freshness rule: a reusable item whose content may be outdated for the edition now studied is NOT served as current; it becomes a
// DERIVE that records why (and that the answer must be verified). Calls no model and writes nothing: the caller decides to generate.
import { openPrivateBank, recentlyExposedIds } from './private-bank.js';
import { resolveNeed } from './resolve-need.js';
import { editionVerdict } from './freshness.js';

/**
 * @param need { query?, topic?, competency?, itemType?, studyingYear? }  studyingYear = edition year of the material now studied.
 * @returns the resolveNeed() answer, plus `bank` (size) and, for a held item, `verification`.
 */
export function resolveReviewNeed(db, userId, need, { now = new Date(), repeatAfterDays = 14, exposed = null } = {}) {
  const corpus = openPrivateBank(db, userId);
  const recent = exposed ?? recentlyExposedIds(db, userId, { now, repeatAfterDays });
  const answer = resolveNeed(corpus, need, { exposed: recent });
  const result = { ...answer, bank: corpus.size };
  if (answer.action !== 'REUSE') return result;
  const verdict = editionVerdict(answer.item, { studyingYear: need.studyingYear ?? null });
  if (verdict.ok) return result;
  return {
    action: 'DERIVE', parent_id: answer.item.id, relationship: 'REVALIDATE', copyText: false,
    reason: verdict.reason, verification: { required: true, because: verdict.reason, parentYear: answer.item.year ?? null },
    candidates: answer.candidates, bank: corpus.size,
  };
}
