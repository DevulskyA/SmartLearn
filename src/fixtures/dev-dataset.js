// Canonical dev fixture — seeded into empty SQLite or BrowserStore in DEV mode only.
// Format: DB.importAll-compatible (schemaVersion 3).
// studyDate 2026-09-02 → review #1 due 2026-09-03 (first run shows tasks on Hoje).

const T = (d, t = '10:00:00Z') => `${d}T${t}`;
const BASE = '2026-09-02';

// REVIEW_DAY_OFFSETS = [1,7,15,30,60,90,120,150,180,210,240,270,300,330,360,390]
const DUE_DATES = [
  '2026-09-03', '2026-09-09', '2026-09-17', '2026-10-02',
  '2026-11-01', '2026-12-01', '2026-12-31', '2027-01-30',
  '2027-03-01', '2027-03-31', '2027-04-30', '2027-05-30',
  '2027-06-29', '2027-07-29', '2027-08-28', '2027-09-27',
];

function reviewTasksForUnit(unitId, startId) {
  return DUE_DATES.map((dueDate, i) => ({
    id: startId + i,
    unitId,
    reviewNumber: i + 1,
    dueDate,
    completedAt: null,
    reviewDone: false,
    questionsDone: false,
    questionsCount: null,
    correctCount: null,
    scorePercent: null,
    comment: null,
    createdAt: T(BASE),
    updatedAt: T(BASE),
  }));
}

export function getDevDataset() {
  return {
    schemaVersion: 3,
    subjects: [
      { id: 1, name: 'Biologia Celular', color: 'DISC-GREEN', isActive: true, sortOrder: 0, createdAt: T(BASE), updatedAt: T(BASE) },
      { id: 2, name: 'Farmacologia', color: 'DISC-BLUE', isActive: true, sortOrder: 1, createdAt: T(BASE), updatedAt: T(BASE) },
    ],
    learningUnits: [
      {
        id: 1, subjectId: 1,
        title: 'Membrana Plasmática',
        sourceText: 'Campbell — Biologia 9ª ed. Cap. 7',
        studyDate: BASE, summaryBody: null,
        createdAt: T(BASE), updatedAt: T(BASE),
      },
      {
        id: 2, subjectId: 2,
        title: 'Farmacocinética — Absorção e Distribuição',
        sourceText: 'Goodman & Gilman 13ª ed. Cap. 2',
        studyDate: BASE, summaryBody: null,
        createdAt: T(BASE, '10:30:00Z'), updatedAt: T(BASE, '10:30:00Z'),
      },
    ],
    reviewTasks: [
      ...reviewTasksForUnit(1, 1),
      ...reviewTasksForUnit(2, 17),
    ],
    exercises: [
      {
        id: 1, unitId: 1,
        questionText: 'Quais são os componentes principais da membrana plasmática?',
        answerText: 'Bicamada de fosfolipídios, proteínas integrais e periféricas, colesterol e glicoproteínas.',
        hintText: 'Pense na estrutura em mosaico fluido.',
        position: 0, provenance: 'MANUAL',
        createdAt: T(BASE), updatedAt: T(BASE),
      },
      {
        id: 2, unitId: 1,
        questionText: 'O que é a fluidez da membrana e quais fatores a influenciam?',
        answerText: 'Capacidade de movimento lateral dos fosfolipídios. Aumenta com insaturação das caudas e diminui com colesterol em excesso; temperatura também afeta.',
        hintText: null,
        position: 1, provenance: 'MANUAL',
        createdAt: T(BASE), updatedAt: T(BASE),
      },
      {
        id: 3, unitId: 2,
        questionText: 'O que é biodisponibilidade?',
        answerText: 'Fração do fármaco administrado que atinge a circulação sistêmica de forma inalterada.',
        hintText: 'Relacionado com a via de administração e metabolismo de primeira passagem.',
        position: 0, provenance: 'MANUAL',
        createdAt: T(BASE, '10:30:00Z'), updatedAt: T(BASE, '10:30:00Z'),
      },
    ],
    learningEvidence: [],
    settings: {
      appVersion: '2.0.0',
      reviewSchedule: null,
      lastBackupAt: null,
    },
  };
}
