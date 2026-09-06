// UAT medical dataset — SmartLearn DEV/UAT only.
// Date anchor: 2026-09-04. Never use as production seed.
// Format: DB.importAll-compatible (schemaVersion 3).
//
// Due dates computed from REVIEW_DAY_OFFSETS = [1,7,15,30,60,90,120,150,180,210,240,270,300,330,360,390]
// using the same UTC arithmetic as generateReviewDates() in review-schedule.js.

const TS = (d, t = '10:00:00.000Z') => `${d}T${t}`;

// ─── Pre-computed due dates per study_date ────────────────────────────────────
// Verified: same output as generateReviewDates(studyDate) in review-schedule.js.

const DATES_0903 = [
  '2026-09-04','2026-09-10','2026-09-18','2026-10-03','2026-11-02','2026-12-02',
  '2027-01-01','2027-01-31','2027-03-02','2027-04-01','2027-05-01','2027-05-31',
  '2027-06-30','2027-07-30','2027-08-29','2027-09-28',
];

const DATES_0901 = [
  '2026-09-02','2026-09-08','2026-09-16','2026-10-01','2026-10-31','2026-11-30',
  '2026-12-30','2027-01-29','2027-02-28','2027-03-30','2027-04-29','2027-05-29',
  '2027-06-28','2027-07-28','2027-08-27','2027-09-26',
];

const DATES_0828 = [
  '2026-08-29','2026-09-04','2026-09-12','2026-09-27','2026-10-27','2026-11-26',
  '2026-12-26','2027-01-25','2027-02-24','2027-03-26','2027-04-25','2027-05-25',
  '2027-06-24','2027-07-24','2027-08-23','2027-09-22',
];

const DATES_0820 = [
  '2026-08-21','2026-08-27','2026-09-04','2026-09-19','2026-10-19','2026-11-18',
  '2026-12-18','2027-01-17','2027-02-16','2027-03-18','2027-04-17','2027-05-17',
  '2027-06-16','2027-07-16','2027-08-15','2027-09-14',
];

function tasks(unitId, idStart, dates, completions = {}) {
  return dates.map((dueDate, i) => {
    const reviewNumber = i + 1;
    const c = completions[reviewNumber];
    return {
      id: idStart + i,
      unitId,
      reviewNumber,
      dueDate,
      completedAt: c ? TS(dueDate) : null,
      reviewDone: Boolean(c),
      questionsDone: Boolean(c),
      questionsCount: c ? c.q : null,
      correctCount: c ? c.c : null,
      scorePercent: c ? (c.c / c.q) * 100 : null,
      comment: null,
      createdAt: TS('2026-08-20'),
      updatedAt: c ? TS(dueDate) : TS('2026-08-20'),
    };
  });
}

export function getUatMedicalDataset() {
  const now = '2026-09-04';

  // ─── Subjects ───────────────────────────────────────────────────────────────
  const subjects = [
    { id: 1, name: 'Fisiologia',              color: 'DISC-GREEN',  isActive: true, sortOrder: 0, createdAt: TS(now), updatedAt: TS(now) },
    { id: 2, name: 'Farmacologia',            color: 'DISC-BLUE',   isActive: true, sortOrder: 1, createdAt: TS(now), updatedAt: TS(now) },
    { id: 3, name: 'Microbiologia',           color: 'DISC-ORANGE', isActive: true, sortOrder: 2, createdAt: TS(now), updatedAt: TS(now) },
    { id: 4, name: 'Bioquímica — UAT vazia',  color: 'DISC-PURPLE', isActive: true, sortOrder: 3, createdAt: TS(now), updatedAt: TS(now) },
  ];

  // ─── Learning units ──────────────────────────────────────────────────────────
  const learningUnits = [
    // U1 — Fisiologia, study_date 2026-09-03 → review #1 due TODAY (pending)
    {
      id: 1, subjectId: 1,
      title: 'Homeostase e controle por feedback negativo',
      sourceText: 'Guyton & Hall — Tratado de Fisiologia Médica, 14ª ed., cap. 1',
      studyDate: '2026-09-03',
      summaryBody: 'Homeostase é a manutenção dinâmica das condições do meio interno dentro de faixas compatíveis com a função celular. A maior parte dos sistemas de controle fisiológico utiliza feedback negativo: uma alteração da variável controlada produz respostas que se opõem ao desvio inicial. Receptores detectam a mudança, um centro integrador compara a informação com a faixa desejada e efetores executam a resposta corretiva. Feedback positivo, ao contrário, amplifica a alteração inicial e costuma operar em processos autolimitados, como coagulação e parto.',
      createdAt: TS('2026-09-03'), updatedAt: TS('2026-09-03'),
    },
    // U2 — Fisiologia, study_date 2026-09-01 → review #1 due 2026-09-02 (OVERDUE)
    {
      id: 2, subjectId: 1,
      title: 'Potencial de membrana em repouso',
      sourceText: 'Guyton & Hall — Tratado de Fisiologia Médica, 14ª ed., cap. 5',
      studyDate: '2026-09-01',
      summaryBody: 'O potencial de membrana em repouso resulta da distribuição desigual de íons e da permeabilidade seletiva da membrana. Em muitas células, a elevada permeabilidade ao potássio através de canais de vazamento exerce papel dominante, fazendo o interior celular permanecer negativo em relação ao exterior. A bomba Na+/K+-ATPase mantém os gradientes de sódio e potássio e também possui pequena contribuição eletrogênica direta.',
      createdAt: TS('2026-09-01'), updatedAt: TS('2026-09-01'),
    },
    // U3 — Farmacologia, study_date 2026-08-28 → review #1 done; review #2 due TODAY
    {
      id: 3, subjectId: 2,
      title: 'Receptores adrenérgicos e seus principais efeitos',
      sourceText: 'Katzung — Farmacologia Básica e Clínica, 16ª ed., capítulo sobre agonistas adrenérgicos',
      studyDate: '2026-08-28',
      summaryBody: 'Os receptores adrenérgicos pertencem à família de receptores acoplados à proteína G. A ativação de α1 tende a produzir contração de músculo liso, incluindo vasoconstrição. Receptores β1 predominam funcionalmente no coração e aumentam frequência, condução e contratilidade. Receptores β2 promovem relaxamento de músculo liso, incluindo broncodilatação. Agonistas ativam receptores; antagonistas ocupam os receptores sem produzir a resposta agonista e reduzem a ação de agonistas.',
      createdAt: TS('2026-08-28'), updatedAt: TS('2026-08-28'),
    },
    // U4 — Microbiologia, study_date 2026-08-20 → reviews #1 and #2 done; review #3 due TODAY
    {
      id: 4, subjectId: 3,
      title: 'Helicobacter pylori: colonização e doença gastroduodenal',
      sourceText: 'Murray — Microbiologia Médica, capítulo de Helicobacter',
      studyDate: '2026-08-20',
      summaryBody: 'Helicobacter pylori é uma bactéria Gram-negativa curva ou espiralada, móvel e produtora de urease. A motilidade favorece sua penetração no muco gástrico, enquanto a urease converte ureia em produtos que ajudam a criar um microambiente menos ácido ao redor da bactéria. A colonização persistente provoca gastrite crônica e está associada a úlcera péptica, adenocarcinoma gástrico e linfoma MALT.',
      createdAt: TS('2026-08-20'), updatedAt: TS('2026-08-20'),
    },
    // U5 — Farmacologia, study_date 2026-09-03 → review #1 due TODAY; summaryBody null (proposital)
    {
      id: 5, subjectId: 2,
      title: 'Receptores colinérgicos muscarínicos e nicotínicos',
      sourceText: 'Katzung — Farmacologia Básica e Clínica, capítulo sobre fármacos colinérgicos',
      studyDate: '2026-09-03',
      summaryBody: null,
      createdAt: TS('2026-09-03'), updatedAt: TS('2026-09-03'),
    },
  ];

  // ─── Review tasks ────────────────────────────────────────────────────────────
  // IDs: U1→1-16, U2→17-32, U3→33-48, U4→49-64, U5→65-80
  const reviewTasks = [
    ...tasks(1, 1,  DATES_0903),
    ...tasks(2, 17, DATES_0901),
    ...tasks(3, 33, DATES_0828, { 1: { q: 15, c: 12 } }),  // review #1 done (80%)
    ...tasks(4, 49, DATES_0820, { 1: { q: 10, c: 7 }, 2: { q: 10, c: 9 } }),  // #1 70%, #2 90%
    ...tasks(5, 65, DATES_0903),
  ];

  // ─── Exercises ───────────────────────────────────────────────────────────────
  const exercises = [
    // U1 — Homeostase
    { id: 1, unitId: 1, questionText: 'O que caracteriza um mecanismo de feedback negativo?', answerText: 'A resposta do sistema se opõe ao desvio inicial da variável controlada, reduzindo a alteração e favorecendo o retorno à faixa fisiológica.', hintText: 'Pense na direção da resposta em relação ao estímulo inicial.', position: 0, provenance: 'SOURCE', createdAt: TS('2026-09-03'), updatedAt: TS('2026-09-03') },
    { id: 2, unitId: 1, questionText: 'Quais são os três componentes funcionais básicos de um sistema de controle homeostático?', answerText: 'Sensor ou receptor, centro integrador e efetor.', hintText: null, position: 1, provenance: 'MANUAL', createdAt: TS('2026-09-03'), updatedAt: TS('2026-09-03') },
    // U2 — Potencial de membrana
    { id: 3, unitId: 2, questionText: 'Qual íon exerce maior influência sobre o potencial de repouso de muitas células excitáveis?', answerText: 'Potássio, principalmente devido à alta permeabilidade de repouso da membrana ao K+.', hintText: 'Considere os canais de vazamento.', position: 0, provenance: 'SOURCE', createdAt: TS('2026-09-01'), updatedAt: TS('2026-09-01') },
    { id: 4, unitId: 2, questionText: 'Qual é a principal função da Na+/K+-ATPase na manutenção do potencial de membrana?', answerText: 'Manter os gradientes transmembrana de Na+ e K+ que tornam possíveis os potenciais de equilíbrio e o potencial de repouso.', hintText: null, position: 1, provenance: 'AI_GENERATED', createdAt: TS('2026-09-01'), updatedAt: TS('2026-09-01') },
    // U3 — Receptores adrenérgicos
    { id: 5, unitId: 3, questionText: 'Qual receptor adrenérgico está mais diretamente associado ao aumento da frequência e da contratilidade cardíacas?', answerText: 'β1.', hintText: 'Pense no principal receptor beta do coração.', position: 0, provenance: 'SOURCE', createdAt: TS('2026-08-28'), updatedAt: TS('2026-08-28') },
    { id: 6, unitId: 3, questionText: 'Qual efeito típico decorre da ativação de receptores β2 no músculo liso brônquico?', answerText: 'Broncodilatação.', hintText: null, position: 1, provenance: 'MANUAL', createdAt: TS('2026-08-28'), updatedAt: TS('2026-08-28') },
    // U4 — H. pylori
    { id: 7, unitId: 4, questionText: 'Qual enzima produzida por H. pylori contribui para sua sobrevivência no ambiente gástrico?', answerText: 'Urease.', hintText: 'Ela utiliza ureia.', position: 0, provenance: 'SOURCE', createdAt: TS('2026-08-20'), updatedAt: TS('2026-08-20') },
    { id: 8, unitId: 4, questionText: 'Quais duas neoplasias têm associação clássica com infecção crônica por H. pylori?', answerText: 'Adenocarcinoma gástrico e linfoma MALT gástrico.', hintText: null, position: 1, provenance: 'AI_GENERATED', createdAt: TS('2026-08-20'), updatedAt: TS('2026-08-20') },
    // U5 — Receptores colinérgicos (3 exercícios para o smoke Tauri)
    { id: 9,  unitId: 5, questionText: 'Qual é a diferença estrutural fundamental entre receptores nicotínicos e muscarínicos?', answerText: 'Receptores nicotínicos são canais iônicos controlados por ligante; receptores muscarínicos são receptores acoplados à proteína G.', hintText: 'Compare ionotrópico e metabotrópico.', position: 0, provenance: 'SOURCE', createdAt: TS('2026-09-03'), updatedAt: TS('2026-09-03') },
    { id: 10, unitId: 5, questionText: 'Qual receptor muscarínico tem papel importante na redução da frequência cardíaca?', answerText: 'M2.', hintText: 'É predominante funcionalmente no coração.', position: 1, provenance: 'MANUAL', createdAt: TS('2026-09-03'), updatedAt: TS('2026-09-03') },
    { id: 11, unitId: 5, questionText: 'A ativação de M3 nas glândulas tende a aumentar ou reduzir secreções?', answerText: 'Aumentar secreções glandulares.', hintText: null, position: 2, provenance: 'AI_GENERATED', createdAt: TS('2026-09-03'), updatedAt: TS('2026-09-03') },
  ];

  // ─── Learning evidence (historical completions) ───────────────────────────────
  // review_task_id must match the task id above (task #1 of U3 = id 33; #1/#2 of U4 = 49/50).
  const learningEvidence = [
    // U3 review #1 — 15q / 12c = 80%
    {
      id: 1, unitId: 3, evidenceDate: '2026-08-29', context: 'REVIEW',
      questionsCount: 15, correctCount: 12, scorePercent: 80,
      reviewTaskId: 33, createdAt: TS('2026-08-29'),
    },
    // U4 review #1 — 10q / 7c = 70%
    {
      id: 2, unitId: 4, evidenceDate: '2026-08-21', context: 'REVIEW',
      questionsCount: 10, correctCount: 7, scorePercent: 70,
      reviewTaskId: 49, createdAt: TS('2026-08-21'),
    },
    // U4 review #2 — 10q / 9c = 90%
    {
      id: 3, unitId: 4, evidenceDate: '2026-08-27', context: 'REVIEW',
      questionsCount: 10, correctCount: 9, scorePercent: 90,
      reviewTaskId: 50, createdAt: TS('2026-08-27'),
    },
  ];

  return {
    schemaVersion: 3,
    subjects,
    learningUnits,
    reviewTasks,
    exercises,
    learningEvidence,
    settings: { appVersion: '2.0.0', reviewSchedule: null, lastBackupAt: null },
  };
}

// ─── Expected state summary (2026-09-04) ──────────────────────────────────────
// subjects:            4 (Fisiologia, Farmacologia, Microbiologia, Bioquímica—UAT vazia)
// learning_units:      5
// review_tasks:        80 (16 per unit × 5 units)
//
// overdue (pending):   1
//   U2  Fisiologia — "Potencial de membrana em repouso"   review #1  due 2026-09-02
//
// due today (pending): 4
//   U1  Fisiologia   — "Homeostase e controle por feedback negativo"  review #1  due 2026-09-04
//   U3  Farmacologia — "Receptores adrenérgicos e seus principais efeitos"  review #2  due 2026-09-04
//   U4  Microbiologia — "Helicobacter pylori: colonização e doença gastroduodenal"  review #3  due 2026-09-04
//   U5  Farmacologia — "Receptores colinérgicos muscarínicos e nicotínicos"  review #1  due 2026-09-04
//
// evidence (historical completions): 3
//   U3 review #1 — 2026-08-29 — 12/15 = 80%
//   U4 review #1 — 2026-08-21 — 7/10  = 70%
//   U4 review #2 — 2026-08-27 — 9/10  = 90%
//
// empty subject:       Bioquímica — UAT vazia (0 units)
