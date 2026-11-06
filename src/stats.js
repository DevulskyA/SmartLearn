import { getReviewScoreValues } from "./review-score.js";
import { compareText, formatDecimal } from "./i18n/format.js";
import { t } from "./i18n/index.js";

function getLocalDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const DAY_MS = 86_400_000;

/**
 * Pure geometry of the evolution chart's X axis. The axis is TIME-proportional
 * (a 25-day gap looks 25 days long; several points on the same day share one
 * x), not index-proportional -- equal spacing for unequal gaps reads as a
 * steadier or faster trend than the data supports. Date labels are unique and
 * never closer than `minLabelGap` px, so they cannot overlap.
 * If every point is on the same day the points fall back to index spacing.
 */
export function layoutEvolutionChart(dataPoints, plotWidth, minLabelGap = 46) {
  const day = (date) => Date.UTC(...date.split("-").map((n, i) => (i === 1 ? Number(n) - 1 : Number(n)))) / DAY_MS;
  const first = day(dataPoints[0].date);
  const span = day(dataPoints[dataPoints.length - 1].date) - first;
  const points = dataPoints.map((point, index) => ({
    ...point,
    x: span > 0 ? ((day(point.date) - first) / span) * plotWidth : (index / Math.max(1, dataPoints.length - 1)) * plotWidth,
  }));
  const labels = [];
  const seen = new Set();
  for (const point of points) {
    if (seen.has(point.date)) continue;
    seen.add(point.date);
    const [, month, dayOfMonth] = point.date.split("-");
    const label = { x: point.x, text: `${dayOfMonth}/${month}` };
    const last = labels[labels.length - 1];
    if (!last || label.x - last.x >= minLabelGap) labels.push(label);
    else if (point === points[points.length - 1] || point.date === dataPoints[dataPoints.length - 1].date) labels[labels.length - 1] = label;
  }
  return { points, labels };
}

/** "71,4%" for a real average; "—" when there is no evidence yet (null), never "0,0%". */
export function formatAverageScore(avgScore) {
  if (avgScore == null || !Number.isFinite(Number(avgScore))) return "—";
  return `${formatDecimal(Number(avgScore))}%`;
}

export const Stats = {
  calculate(reviewTasks, evidence, learningUnits, subjects, today = getLocalDateValue()) {
    const unitsById = new Map(learningUnits.map((unit) => [unit.id, unit]));
    const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));

    const completedExercises = evidence
      .filter((ev) => ev.questionsCount != null && ev.correctCount != null)
      .map((ev) => {
        const unit = unitsById.get(ev.unitId);
        const subject = subjectsById.get(unit?.subjectId);
        const values = getReviewScoreValues(ev.questionsCount, ev.correctCount);

        return {
          ...ev,
          ...values,
          subjectName: subject?.name ?? t("stats.noSubject"),
          title: unit?.title ?? t("stats.unavailableContent"),
          completedAt: ev.completedAt ?? "",
        };
      })
      .filter((ev) => !ev.isOverflow)
      .sort((a, b) => {
        const subjectComparison = compareText(a.subjectName, b.subjectName);
        if (subjectComparison !== 0) return subjectComparison;
        const titleComparison = compareText(a.title, b.title);
        if (titleComparison !== 0) return titleComparison;
        return b.completedAt.localeCompare(a.completedAt);
      });

    const totalQuestions = completedExercises.reduce(
      (total, item) => total + item.questionsCount,
      0,
    );
    const totalCorrect = completedExercises.reduce(
      (total, item) => total + item.correctCount,
      0,
    );
    // No answered question is NO evidence, not a 0% average (Charter P-03/D-03).
    const avgScore = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : null;

    const scoresBySubject = new Map();
    for (const item of completedExercises) {
      const subjectScores = scoresBySubject.get(item.subjectName) ?? {
        subjectName: item.subjectName,
        totalQuestions: 0,
        totalCorrect: 0,
      };
      subjectScores.totalQuestions += item.questionsCount;
      subjectScores.totalCorrect += item.correctCount;
      scoresBySubject.set(item.subjectName, subjectScores);
    }

    const avgBySubject = [...scoresBySubject.values()]
      .map((item) => ({
        subjectName: item.subjectName,
        totalQuestions: item.totalQuestions,
        avgScore: item.totalQuestions > 0 ? (item.totalCorrect / item.totalQuestions) * 100 : 0,
      }))
      .sort((a, b) => a.avgScore - b.avgScore || compareText(a.subjectName, b.subjectName));

    return {
      totalQuestions,
      totalCorrect,
      avgScore,
      completedExercises,
      avgBySubject,
      reviewsDone: reviewTasks.filter((task) => task.reviewDone).length,
      reviewsPending: reviewTasks.filter(
        (task) => !task.reviewDone && task.dueDate === today,
      ).length,
      reviewsOverdue: reviewTasks.filter((task) => !task.reviewDone && task.dueDate < today).length,
    };
  },
};
