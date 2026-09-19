// Presentation of the server's explainable priorities (server/src/domain/priorities.js).
// Reason codes are the contract; this only turns them into pt-BR text, so an
// unknown/new code is dropped rather than shown raw. Pure, no DOM.

const plural = (n, one, many) => (n === 1 ? one : many);

export function weakPracticeReason(item) {
  const parts = [];
  for (const code of item.reasonCodes ?? []) {
    if (code === "LOW_RECENT_ACCURACY") {
      const e = item.evidence;
      parts.push(`Acerto de ${Math.round(e.accuracyPct)}% em ${e.questions} ${plural(e.questions, "questão", "questões")} nos últimos ${e.windowDays} dias`);
    } else if (code === "ITEMS_TO_REINFORCE") {
      parts.push(`${item.reinforceCount} ${plural(item.reinforceCount, "exercício", "exercícios")} para reforçar`);
    }
  }
  return parts.join(" · ");
}
