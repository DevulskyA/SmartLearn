import { getReviewScoreValues } from "./review-score.js";

function getLocalDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const Stats = {
  calculate(reviewTasks, studyRecords, subjects, today = getLocalDateValue()) {
    const studiesById = new Map(studyRecords.map((record) => [record.id, record]));
    const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));

    const completedExercises = reviewTasks
      .filter((task) => task.questionsDone)
      .map((task) => {
        const studyRecord = studiesById.get(task.studyRecordId);
        const subject = subjectsById.get(studyRecord?.subjectId);
        const values = getReviewScoreValues(task.questionsCount, task.correctCount);

        return {
          ...task,
          ...values,
          subjectName: subject?.name ?? "Sem disciplina",
          content: studyRecord?.content ?? "Conteúdo indisponível",
          completedAt: task.completedAt ?? "",
        };
      })
      .filter((task) => !task.isOverflow && task.questionsCount != null && task.correctCount != null)
      .sort((a, b) => {
        const subjectComparison = a.subjectName.localeCompare(b.subjectName, "pt-BR");
        if (subjectComparison !== 0) return subjectComparison;
        const contentComparison = a.content.localeCompare(b.content, "pt-BR");
        if (contentComparison !== 0) return contentComparison;
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
    const avgScore = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0;

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
      .sort((a, b) => a.avgScore - b.avgScore || a.subjectName.localeCompare(b.subjectName, "pt-BR"));

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

  renderChart(canvas, dataPoints) {
    if (!canvas || dataPoints.length < 2) return false;
    const width = Math.max(260, Math.floor(canvas.parentElement?.clientWidth ?? 720) - 40);
    const height = 280;
    const margin = { top: 20, right: 18, bottom: 52, left: 46 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const context = canvas.getContext("2d");
    if (!context) return false;

    const styles = getComputedStyle(canvas);
    const gridColor = styles.getPropertyValue("--color-border").trim() || "#dbe3ee";
    const labelColor = styles.getPropertyValue("--color-muted").trim() || "#64748b";
    const lineColor = styles.getPropertyValue("--color-primary").trim() || "#0b5bd3";

    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);
    context.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    context.lineWidth = 1;
    context.textBaseline = "middle";

    for (const score of [0, 25, 50, 75, 100]) {
      const y = margin.top + plotHeight - (score / 100) * plotHeight;
      context.beginPath();
      context.strokeStyle = gridColor;
      context.moveTo(margin.left, y);
      context.lineTo(width - margin.right, y);
      context.stroke();
      context.fillStyle = labelColor;
      context.textAlign = "right";
      context.fillText(`${score}%`, margin.left - 8, y);
    }

    const points = dataPoints.map((point, index) => ({
      x: margin.left + (index / (dataPoints.length - 1)) * plotWidth,
      y: margin.top + plotHeight - (Math.min(100, Math.max(0, Number(point.scorePercent))) / 100) * plotHeight,
      ...point,
    }));

    context.beginPath();
    context.strokeStyle = lineColor;
    context.lineWidth = 2.5;
    points.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.stroke();

    const labelEvery = Math.max(1, Math.ceil(points.length / 6));
    points.forEach((point, index) => {
      context.beginPath();
      context.fillStyle = lineColor;
      context.arc(point.x, point.y, 4, 0, Math.PI * 2);
      context.fill();

      if (index % labelEvery === 0 || index === points.length - 1) {
        const [, month, day] = point.date.split("-");
        context.fillStyle = labelColor;
        context.textAlign = "center";
        context.fillText(`${day}/${month}`, point.x, height - 24);
      }
    });

    return true;
  },
};
