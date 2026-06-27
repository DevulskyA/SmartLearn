export const REVIEW_DAY_OFFSETS = [
  1, 7, 15, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360, 390,
];

export function generateReviewDates(studyDate) {
  const baseDate = new Date(`${studyDate}T00:00:00.000Z`);
  if (Number.isNaN(baseDate.getTime())) {
    throw new Error("A data de estudo é inválida.");
  }

  return REVIEW_DAY_OFFSETS.map((offset) => {
    const reviewDate = new Date(baseDate);
    reviewDate.setUTCDate(reviewDate.getUTCDate() + offset);
    return reviewDate.toISOString().slice(0, 10);
  });
}