import test from "node:test";
import assert from "node:assert/strict";

import { Analytics, studyVerdict, verdictText } from "../src/analytics.js";

// ANALYTICS-3: "Meu estudo está funcionando?" answered from OBSERVABLE evidence only.
// No score, no mastery: a headline built from how many subjects are improving / declining /
// stable / not comparable, plus the one unit that most deserves attention and why.

const TODAY = "2026-09-19";
const ev = (unitId, evidenceDate, questionsCount, correctCount, id = 0) => ({ id, unitId, evidenceDate, questionsCount, correctCount });

function world(unitDefs, evidence, reinforcement = {}) {
  const subjects = [...new Map(unitDefs.map((u) => [u.subjectId, { id: u.subjectId, name: u.subjectName, color: "DISC-BLUE" }])).values()];
  const units = unitDefs.map((u) => ({ id: u.id, subjectId: u.subjectId, title: u.title }));
  return studyVerdict(Analytics.bySubject(evidence, units, subjects, TODAY), Analytics.byUnit(evidence, units, subjects), reinforcement);
}

const ANA = { id: 1, subjectId: 10, subjectName: "Anatomia", title: "Coração" };
const FIS = { id: 2, subjectId: 20, subjectName: "Fisiologia", title: "Fisiologia renal" };
const FAR = { id: 3, subjectId: 30, subjectName: "Farmacologia", title: "Farmacocinética" };

// improving: 40% -> 80%; declining: 80% -> 40% (previous 30d = Aug 1, recent 30d = Sep 10)
const improving = (unitId) => [ev(unitId, "2026-08-01", 20, 8, unitId * 10), ev(unitId, "2026-09-10", 20, 16, unitId * 10 + 1)];
const declining = (unitId) => [ev(unitId, "2026-08-01", 20, 16, unitId * 10), ev(unitId, "2026-09-10", 20, 8, unitId * 10 + 1)];

test("no evidence at all: says so, never 0% nor a verdict", () => {
  const v = world([ANA, FIS], []);
  assert.equal(v.state, "NO_EVIDENCE");
  assert.equal(v.attention, null);
  assert.match(verdictText(v).headline, /Ainda não há evidência/);
});

test("low volume: evidence exists but no period is comparable -> INSUFFICIENT, not 'piorando'", () => {
  const v = world([ANA], [ev(1, "2026-09-10", 4, 1)]);
  assert.equal(v.state, "INSUFFICIENT");
  assert.equal(v.counts.insufficient, 1);
  assert.match(verdictText(v).headline, /histórico suficiente/);
  assert.match(verdictText(v).detail, /4 questões/);
});

test("user improving: every comparable subject improving", () => {
  const v = world([ANA, FIS], [...improving(1), ...improving(2)]);
  assert.equal(v.state, "IMPROVING");
  assert.match(verdictText(v).headline, /melhorando/);
  assert.equal(v.attention, null); // nothing declining, nothing to reinforce
});

test("user declining: names the unit that fell the most, with the old and recent accuracy", () => {
  const v = world([ANA, FIS], [...declining(1), ...declining(2), ev(2, "2026-09-12", 10, 3, 99)]);
  assert.equal(v.state, "DECLINING");
  assert.equal(v.attention.reason, "DECLINING");
  assert.ok(v.attention.unitId === 1 || v.attention.unitId === 2);
  assert.ok(v.attention.recentAccuracy < v.attention.olderAccuracy);
});

test("mixed areas: improving AND declining is reported as mixed, with counts, never averaged into one verdict", () => {
  const v = world([ANA, FIS, FAR], [...improving(1), ...declining(2)]);
  assert.equal(v.state, "MIXED");
  assert.equal(v.counts.improving, 1);
  assert.equal(v.counts.declining, 1);
  assert.equal(v.attention.unitId, 2, "attention goes to the declining unit, not the improving one");
  assert.equal(v.attention.subjectName, "Fisiologia");
  assert.equal(v.counts.noEvidence, 1, "Farmacologia has no evidence: counted apart, not as bad performance");
});

test("a subject without data is not counted as declining/insufficient performance, and does not change the verdict", () => {
  const withOne = world([ANA, FAR], improving(1));
  assert.equal(withOne.state, "IMPROVING");
  assert.equal(withOne.counts.noEvidence, 1);
});

test("very different volumes: the unit that fell on more evidence wins the tie-break only after a bigger fall", () => {
  // unit 1: 90% -> 30% on 20 q each (-60pp); unit 2: 80% -> 70% on 200 q each (-10pp)
  const rows = [
    ev(1, "2026-08-01", 20, 18, 1), ev(1, "2026-09-10", 20, 6, 2),
    ev(2, "2026-08-01", 200, 160, 3), ev(2, "2026-09-10", 200, 140, 4),
  ];
  const v = world([ANA, FIS], rows);
  assert.equal(v.attention.unitId, 1);
});

test("no declining unit but items to reinforce: attention is the unit with the most items to reinforce", () => {
  const v = world([ANA, FIS], [...improving(1), ...improving(2)], { 1: [11], 2: [21, 22, 23] });
  assert.equal(v.attention.reason, "REINFORCE");
  assert.equal(v.attention.unitId, 2);
  assert.equal(v.attention.reinforceCount, 3);
});

test("a declining unit reports how many items to reinforce it has (the existing action)", () => {
  const v = world([FIS], declining(2), { 2: [21, 22] });
  assert.equal(v.attention.reason, "DECLINING");
  assert.equal(v.attention.reinforceCount, 2);
});

test("immediate retest does not inflate the verdict: it writes no evidence row, so the same evidence gives the same verdict", () => {
  // The redo of a wrong item leaves learning_evidence untouched (pinned in server/test/attempts.test.js),
  // so the verdict is a pure function of the same rows before and after it.
  const rows = declining(2);
  assert.deepEqual(world([FIS], rows).counts, world([FIS], rows.slice()).counts);
  assert.equal(world([FIS], rows).state, "DECLINING");
});

test("stable: comparable but no material change", () => {
  const stable = [ev(1, "2026-08-01", 40, 28, 1), ev(1, "2026-09-10", 40, 29, 2)];
  const v = world([ANA], stable);
  assert.equal(v.state, "STABLE");
  assert.match(verdictText(v).headline, /estável/);
});

test("verdictText never claims mastery, retention or a score", () => {
  for (const evidence of [[], improving(1), declining(1), [ev(1, "2026-09-10", 4, 1)]]) {
    const t = verdictText(world([ANA], evidence));
    assert.doesNotMatch(`${t.headline} ${t.detail}`, /dom[ií]n|mastery|reten[cç][aã]o|score|previs/i);
  }
});

// ---------------------------------------------------------------------------------------------
// VERDICT-1 (human-approved, option B, threshold 25%): the AGGREGATE verdict weighs each subject
// by the questions actually compared (older + recent period), not one vote per subject. A subject
// with little evidence can no longer drag the headline; a real split is still reported as mixed.
// "Insufficient" and "no evidence" subjects never vote for a direction. Individual classifications
// and the unit that needs attention are unchanged.
// ---------------------------------------------------------------------------------------------

// A subject whose two comparison periods each hold `perPeriod` questions (volume = 2 * perPeriod).
const OLDER_DAY = "2026-08-01";
const RECENT_DAY = "2026-09-10";
function subjectOf(id, direction, perPeriod) {
  const def = { id, subjectId: id * 100, subjectName: `Disciplina ${id}`, title: `Aula ${id}` };
  const acc = { improving: [0.4, 0.8], declining: [0.8, 0.4], stable: [0.7, 0.7] }[direction];
  const rows = direction === "insufficient"
    ? [ev(id, OLDER_DAY, 5, 2, id * 10), ev(id, RECENT_DAY, perPeriod, Math.round(perPeriod * 0.5), id * 10 + 1)]
    : [ev(id, OLDER_DAY, perPeriod, Math.round(perPeriod * acc[0]), id * 10), ev(id, RECENT_DAY, perPeriod, Math.round(perPeriod * acc[1]), id * 10 + 1)];
  return { def, rows };
}
function verdictFor(spec) {
  const subjects = spec.map(([direction, perPeriod], i) => subjectOf(i + 1, direction, perPeriod));
  return world(subjects.map((s) => s.def), subjects.flatMap((s) => s.rows));
}

test("VERDICT-1: one tiny worsening subject among large stable ones no longer flips the headline", () => {
  const v = verdictFor([["declining", 10], ["stable", 100], ["stable", 100], ["stable", 100], ["stable", 100], ["stable", 100]]);
  assert.equal(v.counts.declining, 1);
  assert.equal(v.counts.stable, 5);
  assert.equal(v.state, "STABLE");
  assert.equal(v.attention.reason, "DECLINING", "the worsening unit is still surfaced as the attention unit");
  assert.equal(v.attention.subjectName, "Disciplina 1");
});

test("VERDICT-1: the headline follows the direction that holds most of the compared volume — in both orders", () => {
  assert.equal(verdictFor([["improving", 250], ["declining", 10]]).state, "IMPROVING");
  assert.equal(verdictFor([["declining", 250], ["improving", 10]]).state, "DECLINING");
});

test("VERDICT-1: 'insufficient' and 'no evidence' subjects never vote for a direction", () => {
  const v = verdictFor([["improving", 10], ["insufficient", 1000], ["insufficient", 1000], ["insufficient", 1000], ["insufficient", 1000]]);
  assert.equal(v.state, "IMPROVING");
  assert.equal(v.counts.insufficient, 4);
  assert.equal(v.volumes.improving, 20);
  assert.equal(v.volumes.compared, 20, "only comparable subjects count toward the compared volume");
});

test("VERDICT-1: 'mixed' needs BOTH improving and worsening to hold at least 25% of the compared volume (25% in, 24% out)", () => {
  // total compared volume 400: improving 100, declining 100, stable 200 -> 25% / 25% -> mixed
  assert.equal(verdictFor([["improving", 50], ["declining", 50], ["stable", 100]]).state, "MIXED");
  // declining 96 of 400 = 24% -> NOT mixed; stable holds the most volume
  const justUnder = verdictFor([["improving", 50], ["declining", 48], ["stable", 102]]);
  assert.equal(justUnder.volumes.compared, 400);
  assert.equal(justUnder.volumes.declining, 96);
  assert.equal(justUnder.state, "STABLE");
  // the same boundary on the other side: improving 24%
  assert.equal(verdictFor([["improving", 48], ["declining", 50], ["stable", 102]]).state, "STABLE");
  // one side below 25%, the other dominant -> the dominant direction
  assert.equal(verdictFor([["improving", 48], ["declining", 80], ["stable", 72]]).state, "DECLINING");
});

test("VERDICT-1: a real split with no stable area is mixed; with equal volume the title never overstates improvement", () => {
  assert.equal(verdictFor([["improving", 100], ["declining", 100]]).state, "MIXED");
  // tie between IMPROVING and STABLE (nobody worsening): the cautious label wins
  assert.equal(verdictFor([["improving", 100], ["stable", 100]]).state, "STABLE");
  // tie between DECLINING and STABLE: the worsening is not hidden
  assert.equal(verdictFor([["declining", 100], ["stable", 100]]).state, "DECLINING");
  // tie between IMPROVING and DECLINING is mixed anyway
  assert.equal(verdictFor([["improving", 30], ["declining", 30]]).state, "MIXED");
});

test("VERDICT-1: only stable, only improving, no evidence and nothing comparable keep their meaning", () => {
  assert.equal(verdictFor([["stable", 50], ["stable", 10]]).state, "STABLE");
  assert.equal(verdictFor([["improving", 50]]).state, "IMPROVING");
  assert.equal(world([ANA, FIS], []).state, "NO_EVIDENCE");
  assert.equal(verdictFor([["insufficient", 20]]).state, "INSUFFICIENT");
});

test("VERDICT-1: individual classifications and the attention unit are unchanged by the weighting", () => {
  const v = verdictFor([["improving", 200], ["declining", 10], ["stable", 50]]);
  assert.deepEqual(v.counts, { improving: 1, declining: 1, stable: 1, insufficient: 0, noEvidence: 0 });
  assert.equal(v.attention.unitId, 2);
  assert.equal(v.attention.reason, "DECLINING");
});

test("VERDICT-1: the detail text shows the questions behind each direction, in pt-BR, without scores", () => {
  const v = verdictFor([["declining", 10], ["stable", 250], ["stable", 250]]);
  const t = verdictText(v);
  assert.match(t.headline, /estável/);
  assert.match(t.detail, /1 piorando \(20 questões\)/);
  assert.match(t.detail, /2 estáveis \(1\.000 questões\)/);
  assert.doesNotMatch(t.detail, /Base de comparação/, "the parts already sum to the base; no redundant sentence");
  assert.doesNotMatch(`${t.headline} ${t.detail}`, /dom[ií]n|mastery|reten[cç][aã]o|score|previs|%/i);
});

test("VERDICT-1: pure — the same inputs give the same verdict and the inputs are not mutated", () => {
  const subjects = [subjectOf(1, "improving", 40), subjectOf(2, "declining", 40)];
  const rows = subjects.flatMap((s) => s.rows);
  const snapshot = JSON.stringify(rows);
  assert.deepEqual(world(subjects.map((s) => s.def), rows), world(subjects.map((s) => s.def), rows));
  assert.equal(JSON.stringify(rows), snapshot);
});

test("VERDICT-1: the weight is the volume the comparison rests on — old evidence outside both periods adds none", () => {
  // Subject 1 worsened on 10+10 questions but also has 1000 questions from months ago (outside both periods).
  const worsened = subjectOf(1, "declining", 10);
  const longAgo = ev(1, "2026-05-01", 1000, 600, 990);
  const improved = subjectOf(2, "improving", 10);
  const v = world([worsened.def, improved.def], [...worsened.rows, longAgo, ...improved.rows]);
  assert.equal(v.volumes.declining, 20, "only the 10 + 10 compared questions count, not the 1000 old ones");
  assert.equal(v.state, "MIXED", "equal compared volume on both sides");
});
