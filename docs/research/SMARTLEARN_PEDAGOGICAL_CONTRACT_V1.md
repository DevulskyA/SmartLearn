# SmartLearn Pedagogical Contract V1

This contract operationalizes the canonical SmartLearn evidence architecture for implementation. It governs learning behavior until superseded by stronger project evidence.

## Product objective
SmartLearn optimizes durable, independent and transferable learning. Immediate assisted performance is an intermediate signal, not the target outcome.

## MUST
1. Final mastery evidence must include performance without assistance.
2. Every learning event that may influence mastery must record the assistance available and used.
3. A revealed answer or complete solution is an instructional event and contributes zero positive mastery evidence for that attempt.
4. Transfer must be measured separately from retention.
5. A single wrong answer must not be treated as definitive evidence of its cognitive cause.
6. Error causes must remain hypotheses until converging evidence supports them.
7. High-confidence wrong answers must be treated as potentially important misconceptions and calibration failures.
8. Mastery must be based on converging evidence rather than one score, one item, one session or one assisted success.
9. At least one delayed independent success must be required before durable mastery is claimed.
10. At least one independent transfer or integrated-simulation success must be required before transferable mastery is claimed.
11. Medical learning objects generated or transformed by AI must remain traceable to their source material once source-grounded generation is implemented.
12. Item versions must remain distinguishable once item-level psychometrics are implemented.
13. Learning-model uncertainty must remain explicit; the system must not present heuristic inferences as psychological diagnoses.
14. Changes to the adaptive engine must be evaluated against independent delayed outcomes, not only engagement or in-session score.
15. Existing user data must remain local-first unless a future product decision explicitly changes that contract.

## SHOULD
1. Require a meaningful learner attempt before revealing a full answer when the learner already has sufficient prerequisites.
2. Use a graduated hint ladder rather than immediately exposing a solution.
3. Reduce instructional assistance as independent competence increases.
4. Retest successful retrieval after a meaningful delay.
5. Use contrastive cases when the problem is discrimination between similar concepts.
6. Use varied contexts when transfer is the target.
7. Sample confidence where it has diagnostic value instead of forcing confidence input on every interaction.
8. Treat low-confidence correct answers as weaker evidence than stable independent retrieval.
9. Preserve a simple, low-friction interface even as the learner model becomes more sophisticated internally.
10. Prefer transparent baselines before learned or opaque adaptive models.

## MAY
1. Use item-response, cognitive-diagnostic, half-life, knowledge-tracing or learned policy models after the event model and evaluation framework are reliable.
2. Personalize scheduling, support and task type when the adaptation can be evaluated independently.
3. Use generative AI as tutor, content transformer or case generator when guardrails preserve learner effort and source fidelity.

## Mastery V1 operational gate
A competency may be marked mastered in the initial transparent implementation only when all conditions hold:

- at least two correct independent retrieval/application/transfer/simulation events exist;
- independent evidence demonstrates stability across at least 24 hours, or an event explicitly represents retrieval after a delay of at least 24 hours;
- at least one correct independent transfer or simulation event exists;
- no later high-confidence wrong answer remains unresolved by subsequent strong independent evidence.

These thresholds are deliberately conservative operational defaults, not universal laws of learning. They must be calibrated against real SmartLearn outcomes before being treated as optimized values.

## Evidence strength V1
- Exposure: no positive mastery evidence by itself.
- Recognition: weak evidence when independent.
- Independent immediate retrieval/application: moderate evidence.
- Independent delayed retrieval/application: strong evidence.
- Independent transfer/simulation: strong evidence.
- Success with orienting/conceptual hints: moderate evidence at most.
- Success after a partial step or worked example: weak evidence.
- Success after solution reveal: no positive mastery evidence for that attempt.

## Error-hypothesis classes V1
- knowledge gap
- retrieval failure
- misconception
- discrimination failure
- procedural failure
- integration/reasoning failure
- transfer failure
- calibration failure
- fluency/time-pressure failure
- possible lucky or unstable success

These labels are operational hypotheses. The engine should prefer discriminating follow-up evidence over confident attribution.

## Evaluation hierarchy
When validating SmartLearn, prefer outcomes in this order:
1. delayed independent retention;
2. novel transfer;
3. integrated performance;
4. time to stable mastery and retention efficiency;
5. calibration and misconception rate;
6. immediate unassisted performance;
7. assisted performance;
8. engagement and activity metrics.

Lower-level metrics may explain product behavior but must not substitute for higher-level learning outcomes.

## Implementation principle
The learning architecture should evolve incrementally:

`source/competency model -> learning events -> error evidence -> mastery state -> adaptive intervention -> adaptive scheduling -> advanced learned models`

Do not add a more sophisticated adaptive model before the event semantics required to evaluate it are reliable.
