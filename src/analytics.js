import { getState, TREND_DELTA_MIN } from './performance-thresholds.js';

function getLocalDateValue() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sumField(arr, field) {
  return arr.reduce((acc, row) => acc + (Number(row[field]) || 0), 0);
}

function weightedAccuracy(evidence) {
  const q = sumField(evidence, 'questionsCount');
  const c = sumField(evidence, 'correctCount');
  return q > 0 ? (c / q) * 100 : null;
}

function windowEvidence(evidence, fromDate, toDate) {
  return evidence.filter((e) => e.evidenceDate >= fromDate && e.evidenceDate <= toDate);
}

function subtractDays(isoDate, days) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// Subject trend: delta of two 30-day windows (recent vs previous), min 10 questions each
export function subjectTrend(recentEvidence, previousEvidence, minQuestions = 10) {
  const recentQ = sumField(recentEvidence, 'questionsCount');
  const prevQ = sumField(previousEvidence, 'questionsCount');
  if (recentQ < minQuestions || prevQ < minQuestions) {
    return { direction: 'INSUFFICIENT', delta: null };
  }
  const recentAcc = sumField(recentEvidence, 'correctCount') / recentQ;
  const prevAcc = sumField(previousEvidence, 'correctCount') / prevQ;
  const delta = recentAcc - prevAcc;
  const direction = delta > TREND_DELTA_MIN ? 'IMPROVING'
    : delta < -TREND_DELTA_MIN ? 'DECLINING'
    : 'STABLE';
  return { direction, delta };
}

// Unit trend: compare endpoints of last-N scores sequence (N >= 3)
export function unitTrend(scoresSequence, minN = 3, threshold = 0.05) {
  if (!scoresSequence || scoresSequence.length < minN) {
    return { direction: 'INSUFFICIENT' };
  }
  const window = scoresSequence.slice(-minN);
  const delta = window[window.length - 1] - window[0];
  const direction = delta > threshold * 100 ? 'IMPROVING'
    : delta < -threshold * 100 ? 'DECLINING'
    : 'STABLE';
  return { direction, delta };
}

export const Analytics = {
  // Returns performance summary per subject
  bySubject(evidence, units, subjects, today = getLocalDateValue()) {
    const unitsById = new Map(units.map((u) => [u.id, u]));
    const subjectsById = new Map(subjects.map((s) => [s.id, s]));

    const evidenceBySubject = new Map();
    for (const e of evidence) {
      const unit = unitsById.get(e.unitId);
      if (!unit) continue;
      const subjectId = unit.subjectId;
      if (!evidenceBySubject.has(subjectId)) evidenceBySubject.set(subjectId, []);
      evidenceBySubject.get(subjectId).push(e);
    }

    const results = [];
    for (const subject of subjects) {
      const subjectEvidence = evidenceBySubject.get(subject.id) ?? [];
      const totalQ = sumField(subjectEvidence, 'questionsCount');
      const totalC = sumField(subjectEvidence, 'correctCount');
      const acc = totalQ > 0 ? (totalC / totalQ) * 100 : null;

      const recentFrom = subtractDays(today, 30);
      const prevFrom = subtractDays(today, 60);
      const prevTo = subtractDays(today, 31);
      const recentEv = windowEvidence(subjectEvidence, recentFrom, today);
      const prevEv = windowEvidence(subjectEvidence, prevFrom, prevTo);
      const trend = subjectTrend(recentEv, prevEv);

      results.push({
        subjectId: subject.id,
        subjectName: subject.name,
        color: subject.color ?? 'DISC-BLUE',
        totalQuestions: totalQ,
        totalCorrect: totalC,
        weightedAccuracy: acc,
        state: getState(acc, totalQ),
        trend,
        recentQuestions: sumField(recentEv, 'questionsCount'),
        evidenceCount: subjectEvidence.length,
      });
    }
    return results.sort((a, b) => {
      if (a.state === 'NO_EVIDENCE' && b.state !== 'NO_EVIDENCE') return 1;
      if (b.state === 'NO_EVIDENCE' && a.state !== 'NO_EVIDENCE') return -1;
      if (a.weightedAccuracy == null) return 1;
      if (b.weightedAccuracy == null) return -1;
      return a.weightedAccuracy - b.weightedAccuracy;
    });
  },

  // Returns performance summary per learning unit
  byUnit(evidence, units, subjects) {
    const subjectsById = new Map(subjects.map((s) => [s.id, s]));
    const evidenceByUnit = new Map();
    for (const e of evidence) {
      if (!evidenceByUnit.has(e.unitId)) evidenceByUnit.set(e.unitId, []);
      evidenceByUnit.get(e.unitId).push(e);
    }

    const results = [];
    for (const unit of units) {
      const unitEvidence = (evidenceByUnit.get(unit.id) ?? [])
        .sort((a, b) => a.evidenceDate.localeCompare(b.evidenceDate) || a.id - b.id);
      const totalQ = sumField(unitEvidence, 'questionsCount');
      const totalC = sumField(unitEvidence, 'correctCount');
      const acc = totalQ > 0 ? (totalC / totalQ) * 100 : null;
      const scoresSequence = unitEvidence
        .filter((e) => e.questionsCount > 0)
        .map((e) => (e.correctCount / e.questionsCount) * 100);
      const trend = unitTrend(scoresSequence);
      const lastEvidence = unitEvidence.length > 0 ? unitEvidence[unitEvidence.length - 1] : null;
      const subject = subjectsById.get(unit.subjectId);

      results.push({
        unitId: unit.id,
        unitTitle: unit.title,
        subjectId: unit.subjectId,
        subjectName: subject?.name ?? 'Sem disciplina',
        color: subject?.color ?? 'DISC-BLUE',
        totalQuestions: totalQ,
        weightedAccuracy: acc,
        state: getState(acc, totalQ),
        trend,
        scoresSequence,
        lastEvidence,
        evidenceCount: unitEvidence.length,
      });
    }
    return results;
  },

  // Returns state for given weighted accuracy and question count
  state: getState,

  subjectTrend,
  unitTrend,
};
