// The ONE rule that says how a review stage is concluded (kit de Hoje H-T03/H-T05). Pure and DOM-free so it is testable.
//   total = questions the stage has, answered = questions already judged in it (inline or in the focused session).
//   EVIDENCE          every question answered: the stage concludes by itself, with the evidence of those answers
//   PRACTICE_PENDING  the stage has questions and some are unanswered: it stays pending, `remaining` says how many are left
//   READ              the stage has no questions: reading concludes it ("lida"), with no score and no evidence
export function reviewConclusion({ total = 0, answered = 0 } = {}) {
  if (total <= 0) return { kind: "READ" };
  if (answered >= total) return { kind: "EVIDENCE" };
  return { kind: "PRACTICE_PENDING", remaining: total - Math.max(0, answered) };
}
