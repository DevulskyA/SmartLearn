// Presentation of the server's explainable priorities (server/src/domain/priorities.js).
// Reason codes are the contract; this only turns them into text in the active interface
// language (priority.weak.* in src/i18n/locales), so an unknown/new code is dropped rather
// than shown raw. Pure, no DOM.
//
// The counts are never 0 here: the server only raises LOW_RECENT_ACCURACY from a sample of
// at least MIN_SAMPLE_QUESTIONS and ITEMS_TO_REINFORCE when reinforceCount > 0, so the
// catalog plural (pt-BR reads 0 as singular) cannot differ from the former "n === 1" rule.
import { t, tn } from "./i18n/index.js";

export function weakPracticeReason(item) {
  const parts = [];
  for (const code of item.reasonCodes ?? []) {
    if (code === "LOW_RECENT_ACCURACY") {
      const e = item.evidence;
      parts.push(t("priority.weak.accuracy", {
        pct: Math.round(e.accuracyPct),
        questions: tn("priority.weak.questions", e.questions),
        days: e.windowDays,
      }));
    } else if (code === "ITEMS_TO_REINFORCE") {
      parts.push(tn("priority.weak.reinforce", item.reinforceCount));
    }
  }
  return parts.join(" · ");
}
