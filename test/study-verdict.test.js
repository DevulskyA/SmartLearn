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
