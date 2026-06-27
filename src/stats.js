import { getReviewScoreValues } from "./review-score.js";

function getLocalDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const Stats = {
  calculate(reviewTasks, studyRecords, subjects, today = getLocalDateValue()) {
    const completedExercises = reviewTasks
      .filter((task) => task.questionsDone)
      .map((task) => ({ ...task, ...getReviewScoreValues(task.questionsCount, task.correctCount) }))
      .filter((task) => !task.isOverflow && task.questionsCount != null && task.correctCount != null);

    const totalQuestions = completedExercises.reduce(
      (total, task) => total + task.questionsCount,
      0,
    );
    const totalCorrect = completedExercises.reduce(
      (total, task) => total + task.correctCount,
      0,
    );
    const avgScore = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0;
    const studiesById = new Map(studyRecords.map((record) => [record.id, record]));
    const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));
    const scoresBySubject = new Map();

    for (const task of completedExercises) {
      const studyRecord = studiesById.get(task.studyRecordId);
      const subject = subjectsById.get(studyRecord?.subjectId);
      if (!subject) continue;
      const scores = scoresBySubject.get(subject.id) ?? {
        subjectId: subject.id,
        subjectName: subject.name,
        totalQuestions: 0,
        totalCorrect: 0,
      };
      scores.totalQuestions += task.questionsCount;
      scores.totalCorrect += task.correctCount;
      scoresBySubject.set(subject.id, scores);
    }

    const avgBySubject = [...scoresBySubject.values()]
      .map((item) => ({
        subjectId: item.subjectId,
        subjectName: item.subjectName,
        avgScore: item.totalQuestions > 0 ? (item.totalCorrect / item.totalQuestions) * 100 : 0,
      }))
      .sort((a, b) => a.subjectName.localeCompare(b.subjectName, "pt-BR"));

    return {
      totalQuestions,
      totalCorrect,
      avgScore,
      avgBySubject,
      reviewsDone: reviewTasks.filter((task) => task.reviewDone).length,
      reviewsPending: reviewTasks.filter(
        (task) => !task.reviewDone && task.dueDate >= today,
      ).length,
      reviewsOverdue: reviewTasks.filter(
        (task) => !task.reviewDone && task.dueDate < today,
      ).length,
    };
  },

  renderChart(canvas, dataPoints) {
    if (!canvas || dataPoints.length < 2) return false;
    const width = Math.max(260, Math.floor(canvas.parentElement?.clientWidth ?? 720) - 40);
    const height = 280;
    const margin = { top: 20, right: 18, bottom: 52, left: 46 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const context = canvas.getContext("2d");
    if (!context) return false;

    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);
    context.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    context.lineWidth = 1;
    context.textBaseline = "middle";

    for (const score of [0, 25, 50, 75, 100]) {
      const y = margin.top + plotHeight - (score / 100) * plotHeight;
      context.beginPath();
      context.strokeStyle = "#dbe3ee";
      context.moveTo(margin.left, y);
      context.lineTo(width - margin.right, y);
      context.stroke();
      context.fillStyle = "#64748b";
      context.textAlign = "right";
      context.fillText(`${score}%`, margin.left - 8, y);
    }

    const points = dataPoints.map((point, index) => ({
      x: margin.left + (index / (dataPoints.length - 1)) * plotWidth,
      y: margin.top + plotHeight - (Math.min(100, Math.max(0, Number(point.scorePercent))) / 100) * plotHeight,
      ...point,
    }));

    context.beginPath();
    context.strokeStyle = "#0b5bd3";
    context.lineWidth = 2.5;
    points.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.stroke();

    const labelEvery = Math.max(1, Math.ceil(points.length / 6));
    points.forEach((point, index) => {
      context.beginPath();
      context.fillStyle = "#0b5bd3";
      context.arc(point.x, point.y, 4, 0, Math.PI * 2);
      context.fill();

      if (index % labelEvery === 0 || index === points.length - 1) {
        const [, month, day] = point.date.split("-");
        context.fillStyle = "#64748b";
        context.textAlign = "center";
        context.fillText(`${day}/${month}`, point.x, height - 24);
      }
    });

    return true;
  },
};
