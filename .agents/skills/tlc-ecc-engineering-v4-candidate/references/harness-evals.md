# Harness and Skill Evaluation

Use only when changing reusable engineering instructions, Skills, agent topologies, hooks, gates, or process policy; or when repeated overhead suggests a component may no longer earn its cost.

The question is causal: **does this component improve outcomes enough to justify its cost under current models and tools?**

## Champion vs candidate

Keep the current system as the champion. Compare a candidate under matched conditions:

- same representative tasks;
- same repository snapshots and starting information;
- same model/configuration when possible;
- equivalent tool permissions and time limits;
- repeated runs when stochastic variance could change the conclusion.

Do not promote a candidate because one impressive run looks better.

## Evaluation corpus

Prefer real work over synthetic trivia:

- recent bugs and regressions;
- representative feature slices;
- historically difficult integration tasks;
- handoff/context-loss cases;
- security/operations cases only when the harness claims competence there;
- incidents converted into permanent evals after the immediate fix.

Remove duplicates that test the same underlying behavior. Start small enough to iterate; for a mature reusable harness, tens of representative tasks are usually more informative than hundreds of weak ones.

## Measures

Judge in this order:

1. semantic correctness / observable outcome;
2. critical and material failure rate;
3. regression rate on previously solved cases;
4. task completion without rescue;
5. human interventions and rework;
6. wall-clock time;
7. tokens/cost and context consumption.

Never trade a material correctness regression for cheaper tokens.

Use deterministic graders where the outcome is machine-observable. Use blinded or fresh-context semantic review where judgment is necessary. Separate factual pass/fail from taste or preference.

## Ablation

When a harness contains several process components, remove or disable one component at a time when practical and rerun representative cases.

A component should survive because its removal causes a material loss, not because it sounds prudent. Re-test old assumptions after major model/tool upgrades.

Examples worth ablating:

- mandatory plan documents;
- permanent reviewer agents;
- mutation on ordinary changes;
- broad repository scans;
- repeated self-critique loops;
- extra handoff artifacts;
- duplicated Skills with overlapping control logic.

## Promotion rule

Promote the candidate only when evidence supports all of these:

- no unexplained critical regression;
- observable outcome quality is better or materially equivalent;
- added complexity/compute is justified by the gain;
- the result is not carried by one anomalous task or one lucky run.

If the candidate is equivalent but simpler, prefer the simpler system. Preserve the prior version so rollback and future comparison remain possible.
