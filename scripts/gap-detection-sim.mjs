#!/usr/bin/env node
// F4 decision aid: how much evidence per subtopic is needed before "gap" can honestly be shown, and what a naive rule costs.
// Synthetic and deterministic (seeded): no database, no product code. A student has hidden per-subtopic ability; attempts are
// random questions answered correctly with that probability. Two rules read the SAME attempts:
//   NAIVE    flags a subtopic when its accuracy is under 60% after at least one attempt.
//   CAUTIOUS says "insufficient evidence" until >= 3 DISTINCT questions and >= 5 attempts, then flags only when the upper end of
//            the 95% Wilson interval for accuracy is under 70% (observed != mastery: a small n cannot support a claim).
//   node scripts/gap-detection-sim.mjs
import { fileURLToPath } from 'node:url';
import { wilsonUpper, cautiousState } from '../shared/unit-evidence.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The cautious rule lives in shared/unit-evidence.js (one definition: this experiment measured exactly what the component runs).
export { wilsonUpper, cautiousState };

export const naiveFlag = ({ attempts, correct }) => attempts >= 1 && correct / attempts < 0.6;

/** One synthetic student: `subtopics` subtopics of `pool` questions; the first `weak` are weak (ability 0.4), the rest strong (0.9). */
export function runStudent({ seed, subtopics = 8, weak = 2, pool = 10, attempts }) {
  const rnd = mulberry32(seed);
  const stats = Array.from({ length: subtopics }, () => ({ attempts: 0, correct: 0, seen: new Set() }));
  for (let i = 0; i < attempts; i += 1) {
    const s = Math.floor(rnd() * subtopics);
    const q = Math.floor(rnd() * pool);
    const ability = s < weak ? 0.4 : 0.9;
    stats[s].attempts += 1;
    stats[s].seen.add(q);
    if (rnd() < ability) stats[s].correct += 1;
  }
  return stats.map((x) => ({ attempts: x.attempts, correct: x.correct, distinct: x.seen.size }));
}

export function evaluate({ attempts, students = 300, weak = 2, subtopics = 8 }) {
  const m = { NAIVE: { tp: 0, fp: 0, fn: 0 }, CAUTIOUS: { tp: 0, fp: 0, fn: 0, insufficientShare: 0 } };
  for (let seed = 1; seed <= students; seed += 1) {
    runStudent({ seed, attempts, weak, subtopics }).forEach((st, s) => {
      const truth = s < weak;
      const naive = naiveFlag(st), state = cautiousState(st);
      const bump = (r, flagged) => { if (flagged && truth) r.tp += 1; else if (flagged) r.fp += 1; else if (truth) r.fn += 1; };
      bump(m.NAIVE, naive);
      bump(m.CAUTIOUS, state === 'GAP');
      if (state === 'INSUFFICIENT') m.CAUTIOUS.insufficientShare += 1;
    });
  }
  const ratio = (a, b) => (a + b === 0 ? 0 : a / (a + b));
  const total = students * subtopics;
  return {
    NAIVE: { precision: ratio(m.NAIVE.tp, m.NAIVE.fp), recall: ratio(m.NAIVE.tp, m.NAIVE.fn), falseFlagsPerStudent: m.NAIVE.fp / students },
    CAUTIOUS: { precision: ratio(m.CAUTIOUS.tp, m.CAUTIOUS.fp), recall: ratio(m.CAUTIOUS.tp, m.CAUTIOUS.fn), falseFlagsPerStudent: m.CAUTIOUS.fp / students, insufficient: m.CAUTIOUS.insufficientShare / total },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('8 subtopics (2 weak at 40%, 6 strong at 90%), 10 questions each, 300 seeded students per row. precision = flagged that are truly weak; recall = weak ones found.');
  console.log('attempts  rule      precision  recall  falseFlags/student  insufficient');
  for (const attempts of [16, 40, 80, 160, 320]) {
    const r = evaluate({ attempts });
    const f = (x) => x.toFixed(2).padStart(9);
    console.log(`${String(attempts).padStart(8)}  NAIVE    ${f(r.NAIVE.precision)} ${f(r.NAIVE.recall)} ${f(r.NAIVE.falseFlagsPerStudent)}${' '.repeat(10)}-`);
    console.log(`${' '.repeat(8)}  CAUTIOUS ${f(r.CAUTIOUS.precision)} ${f(r.CAUTIOUS.recall)} ${f(r.CAUTIOUS.falseFlagsPerStudent)}${' '.repeat(2)}${f(r.CAUTIOUS.insufficient)}`);
  }
}
