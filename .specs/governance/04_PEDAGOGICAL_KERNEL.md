# SmartLearn Pedagogical Kernel — permanent learning contract

## Purpose

SmartLearn exists to improve durable, transferable learning with the least possible management burden on the student.

This document is a permanent cross-feature contract for the Harness. Any feature that changes study, review, exercises, scoring, learner state, scheduling, feedback, summaries, tutoring, analytics, or medical content MUST preserve this contract.

The product may evolve. These learning principles remain the reference champion until a challenger demonstrates superior real outcomes without material regression.

---

## PK-01 — Learning is demonstrated, not inferred from exposure

A student seeing, opening, reading, or completing content is process evidence. It does not by itself establish mastery.

Claims of learning must be grounded in observable learner performance.

Preferred evidence, from weaker to stronger:

1. recognition of a correct option;
2. unaided recall;
3. correct explanation in the learner's own words;
4. application to a closely related problem;
5. discrimination between plausible alternatives;
6. application to a materially novel case;
7. reconstruction of mechanism, reasoning, or governing rule including relevant limits;
8. successful performance again after a meaningful delay.

The system may record lower-strength evidence, but stronger mastery claims require stronger evidence.

---

## PK-02 — Mastery is multidimensional

Mastery is represented by the quality and recency of evidence, not by a single percentage alone.

When the product evolves beyond aggregate scoring, learner state SHOULD distinguish at minimum:

- recall;
- explanation/mechanism;
- application;
- discrimination;
- transfer;
- retention;
- unresolved misconception when known.

A composite score may summarize these dimensions only if its inputs and meaning remain inspectable.

---

## PK-03 — Retrieval precedes unnecessary re-exposure

When the learner has previously encountered a concept and retrieval is safe and appropriate, the system SHOULD first attempt retrieval before re-presenting the complete answer.

The purpose is diagnostic and mnemonic: discover what remains available in memory before supplying information.

Exceptions are allowed when prerequisites are absent, the task is initial instruction, the learner requests direct explanation, or safety/accuracy requires immediate guidance.

---

## PK-04 — Understanding requires reconstruction and transfer

For conceptual or mechanistic learning, the teaching path SHOULD aim for the learner to reconstruct why the answer follows from the underlying structure and then use that structure in a different case.

For medicine, the preferred reasoning spine is:

phenomenon → normal state → deviation/mechanism → hypotheses → discriminating evidence → risk/decision/management.

Feynman-style explanation is the default explanatory engine when explanation is required, while the orchestration layer decides when explanation is the correct pedagogical action.

---

## PK-05 — Technique follows the type of knowledge

The system SHOULD route pedagogy according to the learning object rather than applying one technique universally.

Typical mappings:

- factual recall → retrieval practice + spacing;
- conceptual understanding → causal/mechanistic explanation + self-explanation;
- procedures → worked example → partially scaffolded execution → independent execution;
- confusable concepts → contrast + discrimination + interleaving;
- problem solving → mixed problems requiring method selection;
- literal material → exact retrieval when exactness is the target;
- clinical reasoning → case variation + discriminating evidence + decision under uncertainty.

Routing logic may evolve, but a replacement must preserve or improve measured outcomes.

---

## PK-06 — Misconceptions are first-class learning state

When evidence supports a recurring wrong mental model, the system SHOULD preserve that misconception as learner state until it is repaired and retested.

A robust repair sequence is:

1. elicit prediction or reasoning;
2. identify the discriminating contradiction;
3. rebuild the governing model;
4. retest on a different case;
5. retire the misconception only after independent evidence of correction.

A single corrected answer does not automatically erase a demonstrated misconception.

---

## PK-07 — Retention is part of mastery

Immediate success and durable knowledge are separate observations.

When the learning objective matters beyond the current session, the system SHOULD collect delayed evidence and distinguish current performance from retained performance.

Scheduling algorithms may change. Their success is judged by retained competence per unit of student effort, not by review count alone.

---

## PK-08 — Learner effort is spent on learning, not administration

Pedagogical sophistication must remain operationally low-friction.

Where the system can infer, calculate, schedule, classify, or persist state reliably, it SHOULD do so automatically.

New learning evidence must not require unnecessary forms, duplicate data entry, repeated ratings, or workflow management from the student.

This kernel inherits INV-21, INV-22, and INV-23: automatic by default, minimal actions, energy reserved for studying.

---

## PK-09 — Medical fidelity is a release-critical property

For medical learning features, factual fidelity, provenance, uncertainty, and clinically meaningful distinctions are release-critical.

A pedagogical improvement that increases engagement while introducing material medical error is a regression.

When source-grounded content is available, generated explanations, exercises, feedback, and summaries SHOULD remain traceable to the authoritative material or approved evidence base.

---

## PK-10 — Champion–challenger promotion

The currently accepted learning behavior is the champion.

A new pedagogy, scheduler, scoring model, tutor behavior, learner model, or orchestration rule is a challenger until validated.

A challenger may replace the champion only when:

1. critical correctness and medical-fidelity gates pass;
2. existing protected behavior does not materially regress;
3. at least one meaningful learning outcome improves or an equivalent outcome is achieved with materially lower learner burden;
4. the change is reversible when practical;
5. evidence is recorded in the feature validation artifact.

When evidence is inconclusive, preserve the champion.

---

## PK-11 — Decision metrics

For learning-system decisions, prefer outcome metrics over activity metrics.

Primary metrics, selected proportionally to the feature:

- novel-transfer performance;
- delayed retention (for example D7/D30/D90 when the horizon justifies it);
- recurrence rate of a known misconception;
- time/attempts to demonstrated mastery;
- calibration between estimated mastery and later observed performance;
- medical/content fidelity;
- learner effort per demonstrated competence.

Secondary operational metrics may include completion rate, number of reviews, time in app, or questions answered. These do not substitute for learning outcomes.

Thresholds are feature-specific and must be justified; this kernel intentionally does not encode universal pass percentages.

---

## PK-12 — Evidence ledger is the durable substrate

The long-term learner model SHOULD be built from an append-only or audit-preserving evidence ledger rather than overwriting a single score.

Each evidence event should evolve toward representing, when applicable:

- learning unit / concept;
- date/time;
- context;
- evidence type;
- result;
- assistance/cues;
- confidence when useful;
- transfer distance or novelty when known;
- linked review/exercise/case;
- source/provenance when relevant.

Derived mastery state is a view over evidence. Historical evidence remains available for recalculation when models improve.

---

## Mandatory Harness gate for learning-affecting changes

Any feature that can alter learning outcomes MUST answer in its spec/design/impact/validation:

1. Which pedagogical kernel clauses are touched?
2. What learner outcome is expected to improve?
3. What existing champion behavior must be preserved?
4. Which observable evidence will discriminate improvement from apparent improvement?
5. Which regression sensor protects neighboring learning behavior?
6. What would falsify the proposed pedagogical benefit?
7. What is the rollback path if learning outcomes degrade?

A feature cannot be marked PASS when a required pedagogical outcome is asserted without evidence.

---

## Architecture boundary

The preferred separation of responsibilities is:

- SmartLearn curriculum/content layer: what exists to be learned and its provenance;
- learner model/evidence ledger: what the learner has demonstrated over time;
- learning orchestrator: which pedagogical action should happen next;
- Feynman explanatory engine: how to construct understanding when explanation is the selected action;
- practice/assessment layer: produce discriminating evidence through retrieval, application, transfer, and delayed retest;
- scheduler: decide when another evidence opportunity should occur;
- analytics: summarize learning without replacing the underlying evidence.

This is a directionally stable boundary, not permission to build every layer immediately. Implement only the smallest layer required by an approved feature.

---

## Anti-regression principle

The Harness optimizes for monotonic educational improvement:

> preserve proven strengths; add one evidence-backed capability at a time; promote only after measurable superiority or equivalent learning with lower burden.

When a proposed improvement conflicts with this principle, the proposal must be redesigned before implementation.
