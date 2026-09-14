// UAT medical dataset — SmartLearn DEV/UAT only. NEVER used against the
// real user database (see window.__seedUatMedical's DEV-only gate in
// app.js and its explicit destructive-confirm guard).
//
// P0-2: this is the versioned, reproducible replacement for a prior
// session's rich 9-discipline dataset that was only ever seeded live via
// DB.* calls in a running dev session and never committed — gone on
// restart (see .specs/EXECUTION.md SEED_DATA_NOTE). Calling
// getUatMedicalDataset() rebuilds the exact same shape deterministically
// any time, in any dev environment, with no manual steps.
//
// Anchored to the REAL calendar day it is generated on (day-offsets from
// "today"), not a fixed historical date — so review-task states
// (overdue/today/upcoming) and evidence recency windows always render
// meaningfully whenever this is rebuilt, instead of going stale the way a
// fixed-date fixture would after enough real time passes.
//
// Format: DB.importAll-compatible (schemaVersion 3).
//
// Coverage (P0-2 checklist):
//  - ~9 representative disciplines, most with multiple contents (units)
//  - performance: STRONG/ADEQUATE/ATTENTION/CRITICAL all represented
//  - at least one discipline/unit with zero evidence yet
//  - practice volume: small / medium / heavy
//  - trend: IMPROVING, DECLINING, STABLE, INSUFFICIENT all represented
//  - evidence spread across multiple time windows (last 30d, 30-90d,
//    90-365d, and beyond 365d) so every period filter shows a different
//    real subset, not the same rows every time
//  - review_tasks in different states: done, overdue (pending, due date
//    already passed), and upcoming (pending, due date in the future)
//  - both short ("Anatomia", "Pediatria") and long labels (one
//    deliberately long discipline name, one deliberately long unit title)
import { generateReviewDates } from '../review-schedule.js';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// Inverse of daysAgoIso: how many whole days ago a given ISO date was,
// measured the same UTC-midnight way — used to place a REVIEW-context
// evidence row on the exact date of the review task it documents.
function daysAgoFromIso(isoDate) {
  const target = new Date(`${isoDate}T00:00:00.000Z`).getTime();
  const today = new Date(`${todayIso()}T00:00:00.000Z`).getTime();
  return Math.round((today - target) / 86400000);
}

const TS = (isoDate, t = '10:00:00.000Z') => `${isoDate}T${t}`;

let nextUnitId = 1;
let nextTaskId = 1;
let nextExerciseId = 1;
let nextEvidenceId = 1;

// Marks every past-due review as completed except the most recent
// `leaveOverdue` of them, which stay pending — i.e. genuinely overdue.
// A review whose due date is exactly today, or in the future, is always
// left pending (never invented as "done"). This gives every unit with a
// history a realistic done/overdue/upcoming mix from one simple rule,
// instead of hand-picking review numbers per unit.
function computeDoneReviewNumbers(dueDates, today, leaveOverdue) {
  const pastIdx = [];
  dueDates.forEach((d, i) => {
    if (d < today) pastIdx.push(i + 1);
  });
  if (pastIdx.length <= leaveOverdue) return [];
  return pastIdx.slice(0, pastIdx.length - leaveOverdue);
}

function buildUnit({ subjectId, title, sourceText, summaryBody = null, studyDateDaysAgo, leaveOverdue = 1 }) {
  const unitId = nextUnitId++;
  const studyDate = daysAgoIso(studyDateDaysAgo);
  const today = todayIso();
  const dueDates = generateReviewDates(studyDate);
  const doneReviewNumbers = computeDoneReviewNumbers(dueDates, today, leaveOverdue);

  const tasks = dueDates.map((dueDate, i) => {
    const reviewNumber = i + 1;
    const done = doneReviewNumbers.includes(reviewNumber);
    return {
      id: nextTaskId++,
      unitId,
      reviewNumber,
      dueDate,
      completedAt: done ? TS(dueDate) : null,
      reviewDone: done,
      questionsDone: done,
      questionsCount: null,
      correctCount: null,
      scorePercent: null,
      comment: null,
      createdAt: TS(studyDate),
      updatedAt: done ? TS(dueDate) : TS(studyDate),
    };
  });

  const firstDoneTask = tasks.find((t) => t.reviewDone) ?? null;

  return {
    unit: {
      id: unitId,
      subjectId,
      title,
      sourceText,
      studyDate,
      summaryBody,
      createdAt: TS(studyDate),
      updatedAt: TS(studyDate),
    },
    tasks,
    firstDoneTask,
  };
}

function buildExercises(unitId, items) {
  const today = todayIso();
  return items.map(([questionText, answerText, hintText, provenance], i) => ({
    id: nextExerciseId++,
    unitId,
    questionText,
    answerText,
    hintText: hintText ?? null,
    position: i,
    provenance,
    createdAt: TS(today),
    updatedAt: TS(today),
  }));
}

// entries: [{ daysAgo, q, c, context, reviewTaskId }] — context defaults to
// 'EXTERNAL' (unlinked practice, valid per the domain's own rule that only
// REVIEW-context evidence may carry a reviewTaskId).
function buildEvidence(unitId, entries) {
  return entries.map(({ daysAgo, q, c, context = 'EXTERNAL', reviewTaskId = null }) => {
    const evidenceDate = daysAgoIso(daysAgo);
    return {
      id: nextEvidenceId++,
      unitId,
      evidenceDate,
      context,
      questionsCount: q,
      correctCount: c,
      scorePercent: (c / q) * 100,
      reviewTaskId,
      createdAt: TS(evidenceDate),
    };
  });
}

export function getUatMedicalDataset() {
  // Reset every id counter on each call — these are module-level `let`s
  // (shared by buildUnit/buildExercises/buildEvidence below) purely so
  // those helpers don't need an id-generator object threaded through every
  // call; without this reset, a second call in the same process would
  // silently continue from wherever the first call left off instead of
  // reproducing the exact same dataset (found by an independent review:
  // unit id 1 vs 14, task id 1 vs 209, evidence id 1 vs 43 across two
  // calls) — directly contradicting this file's own "rebuilds the exact
  // same shape deterministically any time" claim above.
  nextUnitId = 1;
  nextTaskId = 1;
  nextExerciseId = 1;
  nextEvidenceId = 1;

  const subjects = [
    { id: 1, name: 'Anatomia', color: 'DISC-GREEN', isActive: true, sortOrder: 0 },
    { id: 2, name: 'Fisiologia', color: 'DISC-BLUE', isActive: true, sortOrder: 1 },
    { id: 3, name: 'Farmacologia', color: 'DISC-ORANGE', isActive: true, sortOrder: 2 },
    { id: 4, name: 'Microbiologia', color: 'DISC-PURPLE', isActive: true, sortOrder: 3 },
    { id: 5, name: 'Bioquímica', color: 'DISC-TEAL', isActive: true, sortOrder: 4 },
    {
      id: 6,
      name: 'Patologia Geral, Especial e Correlações Anatomoclínicas Multissistêmicas',
      color: 'DISC-PINK',
      isActive: true,
      sortOrder: 5,
    },
    { id: 7, name: 'Semiologia Médica', color: 'DISC-RED', isActive: true, sortOrder: 6 },
    { id: 8, name: 'Neurologia', color: 'DISC-INDIGO', isActive: true, sortOrder: 7 },
    { id: 9, name: 'Pediatria', color: 'DISC-AMBER', isActive: true, sortOrder: 8 },
  ].map((s) => ({ ...s, createdAt: TS(daysAgoIso(300)), updatedAt: TS(daysAgoIso(300)) }));

  const learningUnits = [];
  const reviewTasks = [];
  const exercises = [];
  const learningEvidence = [];

  function addUnit(opts) {
    const { unit, tasks, firstDoneTask } = buildUnit(opts);
    learningUnits.push(unit);
    reviewTasks.push(...tasks);
    return { unitId: unit.id, firstDoneTask };
  }

  // ─── 1. Anatomia — HIGH performance, HEAVY volume, STABLE trend ──────────
  {
    const { unitId, firstDoneTask } = addUnit({
      subjectId: 1,
      title: 'Sistema Musculoesquelético do Membro Superior',
      sourceText: 'Moore — Anatomia Orientada para a Clínica, 8ª ed., cap. 7',
      summaryBody: 'Revisão dos compartimentos musculares do braço e antebraço, inervação pelo plexo braquial e correlações clínicas de lesões nervosas periféricas mais comuns.',
      studyDateDaysAgo: 250,
      leaveOverdue: 1,
    });
    exercises.push(...buildExercises(unitId, [
      ['Qual nervo é mais frequentemente lesado em fraturas do colo cirúrgico do úmero?', 'O nervo axilar.', 'Pense na relação anatômica próxima ao colo cirúrgico.', 'SOURCE'],
      ['Quais músculos compõem o compartimento anterior do braço?', 'Bíceps braquial, braquial e coracobraquial.', null, 'MANUAL'],
    ]));
    learningEvidence.push(...buildEvidence(unitId, [
      { daysAgo: 5, q: 20, c: 18 }, // recent window, high
      { daysAgo: 18, q: 15, c: 13 }, // recent window, high
      { daysAgo: 38, q: 18, c: 15 }, // previous window
      { daysAgo: 50, q: 15, c: 13 }, // previous window
      { daysAgo: 120, q: 22, c: 19 }, // older, volume/history
      { daysAgo: 200, q: 20, c: 17 }, // older, volume/history
      // Demonstrates the REVIEW<->evidence link explicitly (most of this
      // fixture's other evidence is deliberately unlinked EXTERNAL
      // practice, which is simpler to place on exact recency windows):
      // one real completed review task gets its own matching evidence row
      // on its own due date.
      ...(firstDoneTask
        ? [{ daysAgo: daysAgoFromIso(firstDoneTask.dueDate), q: 12, c: 11, context: 'REVIEW', reviewTaskId: firstDoneTask.id }]
        : []),
    ]));
    const { unitId: u2 } = addUnit({
      subjectId: 1,
      title: 'Tórax',
      sourceText: 'Moore — Anatomia Orientada para a Clínica, 8ª ed., cap. 4',
      studyDateDaysAgo: 40,
      leaveOverdue: 0,
    });
    exercises.push(...buildExercises(u2, [
      ['Quais estruturas passam pelo hiato aórtico do diafragma?', 'Aorta, ducto torácico e veia ázigos.', null, 'SOURCE'],
    ]));
    learningEvidence.push(...buildEvidence(u2, [
      { daysAgo: 10, q: 16, c: 14 },
      { daysAgo: 20, q: 14, c: 12 },
      { daysAgo: 33, q: 15, c: 13 },
    ]));
  }

  // ─── 2. Fisiologia — MEDIUM performance, MEDIUM volume, IMPROVING ────────
  {
    const { unitId } = addUnit({
      subjectId: 2,
      title: 'Homeostase e Controle por Feedback Negativo',
      sourceText: 'Guyton & Hall — Tratado de Fisiologia Médica, 14ª ed., cap. 1',
      summaryBody: 'Homeostase é a manutenção dinâmica das condições do meio interno. A maioria dos sistemas de controle fisiológico usa feedback negativo: receptores detectam o desvio, um centro integrador compara com a faixa desejada e efetores executam a resposta corretiva.',
      studyDateDaysAgo: 70,
      leaveOverdue: 1,
    });
    exercises.push(...buildExercises(unitId, [
      ['O que caracteriza um mecanismo de feedback negativo?', 'A resposta do sistema se opõe ao desvio inicial da variável controlada.', 'Pense na direção da resposta em relação ao estímulo.', 'SOURCE'],
      ['Quais são os três componentes básicos de um sistema de controle homeostático?', 'Sensor, centro integrador e efetor.', null, 'MANUAL'],
    ]));
    learningEvidence.push(...buildEvidence(unitId, [
      { daysAgo: 6, q: 15, c: 14 }, // recent, ~93%
      { daysAgo: 16, q: 15, c: 13 }, // recent, ~87%
      { daysAgo: 40, q: 15, c: 9 }, // previous, 60%
      { daysAgo: 52, q: 15, c: 9 }, // previous, 60%
    ]));
    const { unitId: u2 } = addUnit({
      subjectId: 2,
      title: 'Potencial de Membrana em Repouso',
      sourceText: 'Guyton & Hall — Tratado de Fisiologia Médica, 14ª ed., cap. 5',
      studyDateDaysAgo: 12,
      leaveOverdue: 0,
    });
    exercises.push(...buildExercises(u2, [
      ['Qual íon exerce maior influência sobre o potencial de repouso de muitas células excitáveis?', 'Potássio, pela alta permeabilidade de repouso da membrana ao K+.', 'Considere os canais de vazamento.', 'SOURCE'],
    ]));
    learningEvidence.push(...buildEvidence(u2, [
      { daysAgo: 4, q: 12, c: 10 },
    ]));
  }

  // ─── 3. Farmacologia — LOW performance, MEDIUM volume, DECLINING ─────────
  {
    const { unitId } = addUnit({
      subjectId: 3,
      title: 'Receptores Adrenérgicos e Seus Principais Efeitos',
      sourceText: 'Katzung — Farmacologia Básica e Clínica, 16ª ed.',
      studyDateDaysAgo: 65,
      leaveOverdue: 1,
    });
    exercises.push(...buildExercises(unitId, [
      ['Qual receptor adrenérgico está mais associado ao aumento da frequência cardíaca?', 'β1.', 'Pense no principal receptor beta do coração.', 'SOURCE'],
      ['Qual efeito decorre da ativação de receptores β2 no músculo liso brônquico?', 'Broncodilatação.', null, 'MANUAL'],
    ]));
    learningEvidence.push(...buildEvidence(unitId, [
      { daysAgo: 7, q: 14, c: 6 }, // recent, ~43% (low)
      { daysAgo: 20, q: 12, c: 6 }, // recent, 50%
      { daysAgo: 36, q: 14, c: 12 }, // previous, ~86%
      { daysAgo: 48, q: 12, c: 10 }, // previous, ~83%
    ]));
  }

  // ─── 4. Microbiologia — HIGH performance, SMALL volume, INSUFFICIENT ─────
  {
    const { unitId } = addUnit({
      subjectId: 4,
      title: 'Helicobacter pylori',
      sourceText: 'Murray — Microbiologia Médica, capítulo de Helicobacter',
      studyDateDaysAgo: 20,
      leaveOverdue: 0,
    });
    exercises.push(...buildExercises(unitId, [
      ['Qual enzima produzida por H. pylori contribui para sua sobrevivência gástrica?', 'Urease.', 'Ela utiliza ureia.', 'SOURCE'],
    ]));
    learningEvidence.push(...buildEvidence(unitId, [
      { daysAgo: 8, q: 8, c: 7 }, // small volume, high accuracy, below the 10-question trend floor
    ]));
  }

  // ─── 5. Bioquímica — NO evidence yet ──────────────────────────────────────
  {
    addUnit({
      subjectId: 5,
      title: 'Ciclo de Krebs e Fosforilação Oxidativa',
      sourceText: 'Lehninger — Princípios de Bioquímica, 7ª ed.',
      studyDateDaysAgo: 3,
      leaveOverdue: 0,
    });
    // Deliberately zero exercises/evidence — content exists, nothing
    // practiced yet (P0-2: "some with no evidence yet").
  }

  // ─── 6. Patologia (long label) — MEDIUM, HEAVY volume, STABLE ────────────
  {
    const { unitId } = addUnit({
      subjectId: 6,
      title: 'Inflamação Aguda e Crônica: Mediadores e Correlações Clínicas',
      sourceText: 'Robbins — Patologia Básica, 10ª ed.',
      studyDateDaysAgo: 180,
      leaveOverdue: 1,
    });
    exercises.push(...buildExercises(unitId, [
      ['Quais são os principais sinais cardinais da inflamação aguda?', 'Calor, rubor, tumor, dor e perda de função.', null, 'SOURCE'],
      ['Qual célula predomina na fase inicial da inflamação aguda?', 'Neutrófilo.', 'É a primeira a migrar do sangue para o tecido.', 'MANUAL'],
    ]));
    learningEvidence.push(...buildEvidence(unitId, [
      { daysAgo: 4, q: 20, c: 14 }, // recent, 70%
      { daysAgo: 22, q: 15, c: 11 }, // recent, ~73%
      { daysAgo: 41, q: 18, c: 12 }, // previous, ~67%
      { daysAgo: 55, q: 17, c: 12 }, // previous, ~71%
      { daysAgo: 100, q: 20, c: 14 }, // older, volume/history
      { daysAgo: 160, q: 18, c: 12 }, // older, volume/history
    ]));
    addUnit({
      subjectId: 6,
      // Deliberately long unit title (content-level long-label stress test,
      // complementing the discipline-level one on this same subject).
      title: 'Neoplasias: Nomenclatura, Características Gerais e Bases Moleculares da Carcinogênese',
      sourceText: 'Robbins — Patologia Básica, 10ª ed., capítulo de Neoplasias',
      studyDateDaysAgo: 2,
      leaveOverdue: 0,
    });
    // No evidence yet on this second content — freshly added.
  }

  // ─── 7. Semiologia Médica — LOW, SMALL volume, DECLINING, overdue ────────
  {
    const { unitId } = addUnit({
      subjectId: 7,
      title: 'Ausculta Cardíaca — Focos e Bulhas',
      sourceText: 'Porto — Semiologia Médica, 8ª ed.',
      studyDateDaysAgo: 45,
      leaveOverdue: 2, // deliberately leaves more than one overdue review
    });
    exercises.push(...buildExercises(unitId, [
      ['Onde se ausculta o foco mitral?', 'No ápice cardíaco, 5º espaço intercostal esquerdo, linha hemiclavicular.', null, 'SOURCE'],
    ]));
    learningEvidence.push(...buildEvidence(unitId, [
      { daysAgo: 5, q: 10, c: 4 }, // recent, 40% (low)
      { daysAgo: 15, q: 10, c: 4 }, // recent, 40%
      { daysAgo: 33, q: 12, c: 8 }, // previous, ~67%
      { daysAgo: 47, q: 12, c: 7 }, // previous, ~58%
    ]));
  }

  // ─── 8. Neurologia — HIGH, HEAVY volume, IMPROVING, long chart history ───
  {
    const { unitId } = addUnit({
      subjectId: 8,
      title: 'Vias Motoras: Trato Corticoespinal',
      sourceText: 'Kandel — Princípios de Neurociência, 6ª ed.',
      studyDateDaysAgo: 340,
      leaveOverdue: 1,
    });
    exercises.push(...buildExercises(unitId, [
      ['Onde ocorre a decussação das pirâmides?', 'Na transição entre o bulbo e a medula espinhal.', null, 'SOURCE'],
      ['Uma lesão do trato corticoespinal lateral acima da decussação causa déficit em qual lado do corpo?', 'No lado contralateral à lesão.', 'Lembre onde ocorre o cruzamento das fibras.', 'MANUAL'],
    ]));
    learningEvidence.push(...buildEvidence(unitId, [
      { daysAgo: 3, q: 22, c: 21 }, // recent, ~95%
      { daysAgo: 14, q: 18, c: 16 }, // recent, ~89%
      { daysAgo: 34, q: 20, c: 16 }, // previous, 80%
      { daysAgo: 50, q: 20, c: 16 }, // previous, 80%
      { daysAgo: 90, q: 20, c: 17 }, // history
      { daysAgo: 180, q: 20, c: 16 }, // history
      { daysAgo: 300, q: 15, c: 12 }, // history, near the edge of a 365-day window
      { daysAgo: 400, q: 15, c: 13 }, // beyond 365 days — visible only with no period filter applied
    ]));
  }

  // ─── 9. Pediatria — mixed: one unit with evidence, one with none ─────────
  {
    const { unitId: withEvidence } = addUnit({
      subjectId: 9,
      title: 'Marcos do Desenvolvimento Neuropsicomotor',
      sourceText: 'Nelson — Tratado de Pediatria, 21ª ed.',
      studyDateDaysAgo: 55,
      leaveOverdue: 1,
    });
    exercises.push(...buildExercises(withEvidence, [
      ['Com quantos meses, em média, uma criança costuma sentar sem apoio?', 'Por volta dos 6 meses.', null, 'SOURCE'],
    ]));
    learningEvidence.push(...buildEvidence(withEvidence, [
      { daysAgo: 6, q: 15, c: 11 }, // recent, ~73%
      { daysAgo: 20, q: 15, c: 11 }, // recent, ~73%
      { daysAgo: 40, q: 15, c: 11 }, // previous, ~73%
      { daysAgo: 52, q: 15, c: 11 }, // previous, ~73%
    ]));

    addUnit({
      subjectId: 9,
      title: 'Calendário Vacinal',
      sourceText: 'Sociedade Brasileira de Pediatria — Calendário Vacinal vigente',
      studyDateDaysAgo: 1,
      leaveOverdue: 0,
    });
    // Second unit: freshly created, no exercises/evidence yet — same
    // "no evidence yet" state as Bioquímica, but this time alongside a
    // sibling unit in the SAME discipline that does have rich evidence,
    // exercising the Por conteúdo table's per-row (not per-discipline)
    // empty state.
  }

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
