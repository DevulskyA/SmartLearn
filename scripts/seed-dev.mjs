#!/usr/bin/env node
// DEV seed: a small, permanent "living patient" for SmartLearn development.
//
// Principles (product intent: PERSIST BY DEFAULT, RECREATE ONLY WHEN ASKED):
//  - explicit opt-in (`npm run seed:dev`); never runs at startup, never from a test hook;
//  - talks to a RUNNING server through its real public API (register/login,
//    subjects, units, exercises, attempts, evidence, review completion) -- no SQL,
//    so it proves how the data model really behaves;
//  - loopback only; refuses anything that is not localhost/127.0.0.1/::1;
//  - idempotent and non-destructive: if the dev account already owns any
//    subject it does NOTHING (it can never replace or extend existing data);
//  - synthetic content only; no personal data.
//
// Usage:  npm run dev:remote   (other terminal)   npm run seed:dev
//         node scripts/seed-dev.mjs --base http://127.0.0.1:3000 --origin http://localhost:5173

export const DEV_ACCOUNT = {
  email: 'dev@smartlearn.local',
  password: 'SmartLearn-dev-2026-local-only',
};

export function assertLoopback(baseUrl) {
  const host = new URL(baseUrl).hostname.replace(/^\[|\]$/g, '');
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`REFUSING: seed-dev only talks to a loopback server (got host "${host}").`);
  }
}

const pad = (n) => String(n).padStart(2, '0');
export function isoDay(today, offsetDays) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offsetDays);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Synthetic, clinically conservative content. `state` documents what each unit
// is meant to exhibit in the product (used by the test that proves coverage).
export function buildPlan(today = new Date()) {
  const day = (o) => isoDay(today, o);
  const subjects = ['Anatomia', 'Fisiologia', 'Farmacologia', 'Semiologia Médica', 'Patologia Geral', 'Neurologia'];
  const units = [
    { key: 'plexo', subject: 'Anatomia', title: 'Plexo braquial: raízes, troncos e nervos', studyDate: day(-75), sourceText: 'Apostila DEV — Anatomia 1',
      summary: 'Plexo braquial: raízes C5–T1; troncos superior, médio e inferior; nervos mediano, ulnar, radial, axilar e musculocutâneo. (Conteúdo sintético para desenvolvimento.)',
      state: 'improving',
      exercises: [
        ['Quais raízes formam o plexo braquial?', 'C5, C6, C7, C8 e T1.', 'Cinco raízes ventrais.'],
        ['Qual nervo é lesado na fratura do colo cirúrgico do úmero?', 'Nervo axilar.', 'Inerva o deltoide.'],
        ['Qual nervo inerva os músculos da loja posterior do braço?', 'Nervo radial.', null],
        ['Qual nervo passa pelo túnel do carpo?', 'Nervo mediano.', null],
      ],
      evidence: [[-50, 10, 5], [-42, 10, 6], [-15, 10, 8], [-5, 10, 9]] },
    { key: 'coracao', subject: 'Anatomia', title: 'Coração: câmaras, valvas e irrigação', studyDate: day(-40), sourceText: 'Apostila DEV — Anatomia 2',
      summary: 'Quatro câmaras; valvas tricúspide, pulmonar, mitral e aórtica; irrigação pelas artérias coronárias direita e esquerda. (Conteúdo sintético.)',
      state: 'stable',
      exercises: [
        ['Qual valva separa o átrio esquerdo do ventrículo esquerdo?', 'Valva mitral (bicúspide).', null],
        ['De qual vaso saem as artérias coronárias?', 'Da raiz da aorta (seios aórticos).', null],
        ['Qual artéria irriga habitualmente o nó sinoatrial?', 'Artéria coronária direita.', 'Ramo do nó sinoatrial.'],
      ],
      evidence: [[-55, 20, 15], [-12, 20, 15]] },
    { key: 'renal', subject: 'Fisiologia', title: 'Fisiologia renal: filtração glomerular', studyDate: day(-60), sourceText: 'Apostila DEV — Fisiologia 1',
      summary: 'A filtração depende do balanço das pressões de Starling no glomérulo; a TFG é regulada pela autorregulação e pelo sistema renina-angiotensina. (Conteúdo sintético.)',
      state: 'declining',
      exercises: [
        ['O que a autorregulação renal mantém constante?', 'O fluxo sanguíneo renal e a taxa de filtração glomerular.', null],
        ['Qual arteríola, ao se contrair, reduz a pressão hidrostática glomerular?', 'A arteríola aferente.', 'Menos sangue chegando ao glomérulo.'],
        ['Qual hormônio aumenta a reabsorção de sódio no túbulo distal e coletor?', 'Aldosterona.', null],
        ['Qual é a principal força que favorece a filtração?', 'A pressão hidrostática capilar glomerular.', null],
      ],
      evidence: [[-52, 20, 17], [-8, 10, 6], [-3, 10, 5]] },
    { key: 'acao', subject: 'Fisiologia', title: 'Potencial de ação neuronal', studyDate: day(-20), sourceText: null, summary: null,
      state: 'insufficient', exercises: [], evidence: [[-6, 5, 3]] },
    { key: 'farmacocinetica', subject: 'Farmacologia', title: 'Farmacocinética: absorção e distribuição', studyDate: day(-35), sourceText: 'Apostila DEV — Farmacologia 1',
      summary: 'Absorção depende de via, solubilidade e pH; distribuição depende de fluxo, ligação a proteínas e volume de distribuição. (Conteúdo sintético.)',
      state: 'declining+retest',
      exercises: [
        ['O que é biodisponibilidade?', 'A fração da dose administrada que chega inalterada à circulação sistêmica.', null],
        ['Qual via evita o metabolismo de primeira passagem?', 'A via intravenosa (também sublingual e retal em parte).', 'Pense em onde a droga entra.'],
        ['O que aumenta o volume de distribuição aparente de um fármaco?', 'Alta lipossolubilidade e ligação tecidual.', null],
      ],
      evidence: [[-50, 15, 12], [-9, 15, 8]] },
    { key: 'antihipertensivos', subject: 'Farmacologia', title: 'Anti-hipertensivos: classes e mecanismos', studyDate: day(-10), sourceText: null, summary: null,
      state: 'no-evidence', exercises: [
        ['Qual classe reduz a pós-carga inibindo a conversão de angiotensina I em II?', 'Inibidores da ECA.', null],
        ['Qual efeito colateral clássico dos IECA?', 'Tosse seca.', 'Acúmulo de bradicinina.'],
      ], evidence: [] },
    { key: 'ausculta', subject: 'Semiologia Médica', title: 'Ausculta cardíaca: bulhas e sopros', studyDate: day(-3), sourceText: 'Apostila DEV — Semiologia 1',
      summary: 'B1 marca o fechamento das valvas atrioventriculares; B2, das semilunares. Sopros sistólicos e diastólicos têm focos de melhor ausculta. (Conteúdo sintético.)',
      state: 'open-review-in-progress',
      exercises: [
        ['O que produz a primeira bulha (B1)?', 'O fechamento das valvas mitral e tricúspide.', null],
        ['Onde se ausculta melhor o foco mitral?', 'No ápice, 5º espaço intercostal esquerdo, linha hemiclavicular.', 'Ictus.'],
        ['O que produz a segunda bulha (B2)?', 'O fechamento das valvas aórtica e pulmonar.', null],
      ], evidence: [] },
    { key: 'inflamacao', subject: 'Patologia Geral', title: 'Inflamação aguda', studyDate: day(-90), sourceText: null, summary: null,
      state: 'overdue-without-material', exercises: [], evidence: [] },
    { key: 'avc', subject: 'Neurologia', title: 'AVC isquêmico: reconhecimento e conduta inicial', studyDate: day(0), sourceText: 'Apostila DEV — Neurologia 1',
      summary: 'Déficit neurológico focal de início súbito; a janela terapêutica define a conduta; imagem sem contraste exclui hemorragia. (Conteúdo sintético.)',
      state: 'new-with-last-wrong',
      exercises: [
        ['Qual exame de imagem inicial exclui hemorragia no AVC agudo?', 'Tomografia de crânio sem contraste.', null],
        ['O que define a elegibilidade para trombólise?', 'O tempo de início dos sintomas dentro da janela e ausência de contraindicações.', 'Tempo é cérebro.'],
        ['Qual território costuma causar afasia com hemiparesia contralateral?', 'Artéria cerebral média (hemisfério dominante).', null],
      ], evidence: [] },
    { key: 'cefaleias', subject: 'Neurologia', title: 'Cefaleias primárias', studyDate: day(-14), sourceText: 'Apostila DEV — Neurologia 2',
      summary: 'Enxaqueca, tensional e em salvas diferem por duração, localização e sintomas associados. (Conteúdo sintético.)',
      state: 'few-questions', exercises: [], evidence: [[-10, 12, 9]] },
  ];
  return { subjects, units, today: day(0) };
}

class Api {
  constructor(base, origin) { this.base = base.replace(/\/$/, ''); this.origin = origin; this.cookies = new Map(); this.csrf = null; }
  async call(method, path, body, { allowError = false } = {}) {
    const headers = { origin: this.origin };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (this.cookies.size) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (this.csrf && method !== 'GET') headers['x-csrf-token'] = this.csrf;
    const res = await fetch(`${this.base}/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      this.cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok && !allowError) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
    return { status: res.status, body: json };
  }
}

async function ensureSession(api) {
  let login = await api.call('POST', '/auth/login', DEV_ACCOUNT, { allowError: true });
  if (login.status !== 200) {
    await api.call('POST', '/auth/register', DEV_ACCOUNT);
    login = await api.call('POST', '/auth/login', DEV_ACCOUNT);
  }
  api.csrf = (await api.call('GET', '/auth/me')).body.csrfToken;
}

export async function seedDev({ base = 'http://127.0.0.1:3000', origin = 'http://localhost:5173', today = new Date(), log = () => {} } = {}) {
  assertLoopback(base);
  const api = new Api(base, origin);
  await ensureSession(api);

  const existing = (await api.call('GET', '/subjects')).body.subjects ?? [];
  if (existing.length > 0) {
    log(`dev account already has ${existing.length} subject(s): nothing to do (seed never extends or replaces data).`);
    return { seeded: false, reason: 'already-populated' };
  }

  const plan = buildPlan(today);
  const subjectId = new Map();
  for (const name of plan.subjects) subjectId.set(name, (await api.call('POST', '/subjects', { name })).body.subject.id);

  const unitByKey = new Map();
  for (const u of plan.units) {
    const created = (await api.call('POST', '/learning-units', {
      subjectId: subjectId.get(u.subject), title: u.title, studyDate: u.studyDate, sourceText: u.sourceText, summaryBody: u.summary,
    })).body;
    const unit = created.unit;
    const exercises = [];
    for (const [question, answer, hint] of u.exercises) {
      exercises.push((await api.call('POST', `/learning-units/${unit.id}/exercises`, { question, answer, hint, provenance: 'MANUAL' })).body.exercise);
    }
    const reviews = (await api.call('GET', `/review-tasks?unitId=${unit.id}`)).body.reviewTasks;
    unitByKey.set(u.key, { unit, exercises, reviews, def: u });
    log(`unit ${u.key}: ${exercises.length} exercises, ${reviews.length} reviews`);
  }

  // Item-level practice helper: one real attempt (start -> reveal -> submit).
  const practice = async (exercise, outcome, reviewTaskId) => {
    const attempt = (await api.call('POST', `/exercises/${exercise.id}/attempts`, reviewTaskId ? { reviewTaskId } : {})).body.attempt;
    await api.call('POST', `/attempts/${attempt.id}/reveal-solution`, {});
    await api.call('POST', `/attempts/${attempt.id}/submit`, { outcome, assessmentMethod: 'SELF_REPORT' });
    return attempt.id;
  };
  const evidence = (unitId, offset, q, c, type = 'EXTERNAL', attemptIds) =>
    api.call('POST', '/learning-evidence', { unitId, type, questionsCount: q, correctCount: c, evidenceDate: isoDay(today, offset), ...(attemptIds ? { attemptIds } : {}) });

  // Dated history (volumes/trends): improving, stable, declining, insufficient, few questions.
  for (const { unit, def } of unitByKey.values()) for (const [offset, q, c] of def.evidence) await evidence(unit.id, offset, q, c);

  // Completed reviews (REVIEW evidence comes only through completion).
  const complete = async (key, scores) => {
    const { reviews } = unitByKey.get(key);
    for (let i = 0; i < scores.length; i++) await api.call('POST', `/review-tasks/${reviews[i].id}/complete`, { questionsCount: scores[i][0], correctCount: scores[i][1] });
  };
  await complete('plexo', [[5, 3], [5, 4], [5, 4], [5, 5]]);
  await complete('coracao', [[5, 4], [5, 4], [5, 4]]);
  await complete('renal', [[5, 4], [5, 3], [5, 2]]);
  await complete('farmacocinetica', [[5, 4], [5, 3]]);

  // Renal: the next open review, fully judged, with errors (block ends with "Refazer erros").
  {
    const { unit, exercises } = unitByKey.get('renal');
    const fresh = (await api.call('GET', `/review-tasks?unitId=${unit.id}`)).body.reviewTasks; // completions changed it
    const open = fresh.find((r) => !r.completedAt && r.dueDate <= plan.today) ?? fresh.find((r) => !r.completedAt);
    const outcomes = ['CORRECT', 'INCORRECT', 'INCORRECT', 'CORRECT'];
    for (let i = 0; i < exercises.length; i++) await practice(exercises[i], outcomes[i], open.id);
  }
  // Ausculta: an open, overdue review answered halfway (2 of 3) — a block in progress.
  {
    const { exercises, reviews } = unitByKey.get('ausculta');
    const open = reviews.find((r) => r.dueDate <= plan.today) ?? reviews[0];
    await practice(exercises[0], 'CORRECT', open.id);
    await practice(exercises[1], 'INCORRECT', open.id);
  }
  // Farmacocinética: first pass (2 wrong of 3) recorded as INITIAL_PRACTICE, then a redo: one fixed, one still wrong.
  {
    const { unit, exercises } = unitByKey.get('farmacocinetica');
    const ids = [await practice(exercises[0], 'INCORRECT'), await practice(exercises[1], 'INCORRECT'), await practice(exercises[2], 'CORRECT')];
    await evidence(unit.id, -30, 3, 1, 'INITIAL_PRACTICE', ids);
    await practice(exercises[0], 'CORRECT');
    await practice(exercises[1], 'INCORRECT');
  }
  // AVC (new today): first pass 2 right + 1 wrong, so the wrong one is the "last attempt" for the next review.
  {
    const { unit, exercises } = unitByKey.get('avc');
    const ids = [await practice(exercises[0], 'CORRECT'), await practice(exercises[1], 'CORRECT'), await practice(exercises[2], 'INCORRECT')];
    await evidence(unit.id, 0, 3, 2, 'INITIAL_PRACTICE', ids);
  }

  log('dev dataset created.');
  return { seeded: true, units: plan.units.length, subjects: plan.subjects.length };
}

// CLI ---------------------------------------------------------------------------
import { fileURLToPath } from 'node:url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : fallback; };
  seedDev({ base: arg('--base', 'http://127.0.0.1:3000'), origin: arg('--origin', 'http://localhost:5173'), log: (m) => console.log(`[seed:dev] ${m}`) })
    .then((r) => {
      if (r.seeded) console.log(`[seed:dev] login: ${DEV_ACCOUNT.email} / ${DEV_ACCOUNT.password}`);
    })
    .catch((err) => { console.error(`[seed:dev] ${err.message}`); process.exit(1); });
}
