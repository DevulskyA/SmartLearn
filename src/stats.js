function getLocalDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const Stats = {
  calculate(reviewTasks, studyRecords, subjects, today = getLocalDateValue()) {
    const completedExercises = reviewTasks.filter((task) => task.questionsDone);
    const totalQuestions = completedExercises.reduce(
      (total, task) => total + (Number(task.questionsCount) || 0),
      0,
    );
    const totalCorrect = completedExercises.reduce(
      (total, task) => total + (Number(task.correctCount) || 0),
      0,
    );
    const avgScore = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0;
    const studiesById = new Map(studyRecords.map((record) => [record.id, record]));
    const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));
    const scoresBySubject = new Map();

    for (const task of completedExercises) {
      if (task.scorePercent == null) continue;
      const studyRecord = studiesById.get(task.studyRecordId);
      const subject = subjectsById.get(studyRecord?.subjectId);
      if (!subject) continue;
      const scores = scoresBySubject.get(subject.id) ?? {
        subjectId: subject.id,
        subjectName: subject.name,
        total: 0,
        count: 0,
      };
      scores.total += Number(task.scorePercent);
      scores.count += 1;
      scoresBySubject.set(subject.id, scores);
    }

    const avgBySubject = [...scoresBySubject.values()]
      .map((item) => ({
        subjectId: item.subjectId,
        subjectName: item.subjectName,
        avgScore: item.count > 0 ? item.total / item.count : 0,
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
};
