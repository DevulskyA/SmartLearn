# Knowledge Placement

Persist knowledge at the lowest layer that can enforce or recover it reliably.

| Knowledge type | Preferred home | Why |
| --- | --- | --- |
| stable repository-wide invariant | host-appropriate project instruction file | always relevant to work in that scope |
| directory/domain-specific convention | nearest scoped instruction or governed project doc | limits context and accidental overreach |
| reusable on-demand procedure | Skill/reference | loaded only when triggered |
| deterministic invariant | code, schema, test, hook, static analysis, or CI | executable enforcement beats memory |
| task-local accepted decision | spec/design/plan/decision artifact | preserves intent without globalizing it |
| transient execution position | compact handoff/state note | supports resume without polluting permanent rules |
| observed defect or incident | regression test/eval first | recurrence becomes mechanically detectable |
| cross-cutting behavioral lesson not fully executable | reviewed lesson/policy | prose is justified only for the remainder |

## Promotion discipline

Do not promote a local correction directly into a global rule. Ask:

1. Is the claim actually general?
2. Can a deterministic mechanism enforce it?
3. Can a regression case capture it more precisely?
4. What scope truly needs the instruction?
5. Does an existing rule already cover it?

Prefer replacing broad prose with a narrower executable control when evidence permits.

## Staleness

Treat persistent instructions as versioned code. When models, tools, architecture, or policy change, revalidate assumptions and delete obsolete instructions instead of layering exceptions on top.
