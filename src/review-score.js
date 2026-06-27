function normalizeCount(rawValue) {
  if (rawValue === "" || rawValue == null) return null;
  return Math.max(0, Number.parseInt(rawValue, 10) || 0);
}

export function getReviewScoreValues(questionsRaw, correctRaw) {
  const questionsCount = normalizeCount(questionsRaw);
  const correctCount = normalizeCount(correctRaw);
  const isOverflow = questionsCount != null && correctCount != null && correctCount > questionsCount;
  const scorePercent = questionsCount > 0 && !isOverflow
    ? (correctCount / questionsCount) * 100
    : null;

  return {
    questionsCount,
    correctCount,
    scorePercent,
    isOverflow,
  };
}

export function getReviewScoreValidationMessage(values) {
  return values.isOverflow ? "Acertos não pode ser maior que Questões." : "";
}