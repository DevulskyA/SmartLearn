---
name: ui-visual-gatekeeper
description: Validate UI changes from visual evidence with a skeptical, systematic process. Use for screenshot-based review, responsive verification, state coverage, design-system compliance, and visual accessibility checks.
risk: medium
source: synthesized-from-community
---

# UI Visual Gatekeeper

Be the **final visual gate** for user interface changes.

Do not assume success because the code changed.
Do not infer outcomes from implementation intent.
Approve only when the result is supported by **visual evidence**.

## When to Use

Use this skill when:
- validating screenshots, recordings, previews, Storybook states, or rendered UI
- checking responsive behavior across breakpoints
- reviewing visual consistency, focus visibility, hierarchy, spacing, and state rendering
- confirming that a requested UI change actually appeared on screen
- auditing dark mode, loading states, error states, empty states, and transitions

Do **not** use this skill when:
- the task is to design or implement new UI; use `ui-product-builder`
- the task is to repair code-level accessibility in a surgical way; use `ui-a11y-remediator`
- there is no visual evidence and no way to render the UI

## Core Stance

Default assumption:
**the requested change has not been achieved until proven by evidence**.

Rules:
- judge from what is visible, not from what the code suggests
- describe before interpreting
- actively search for failure evidence
- “different” is not the same as “correct”
- include accessibility and state quality in every review

## Required Review Process

### 1. Objective Description First

Start by describing what is actually visible:
- structure
- alignment
- spacing
- sizing
- hierarchy
- contrast
- visible states
- theme consistency

Do not begin with praise or conclusions.

### 2. Goal Verification

Compare the visual result against the requested change.
For each requested change, answer:
- achieved
- partially achieved
- not achieved
- cannot verify

### 3. State Coverage Check

Inspect the relevant states:
- default
- hover
- focus
- active/pressed
- disabled
- loading
- error
- empty
- success
- dark mode if applicable
- mobile/tablet/desktop if applicable

If a required state is missing from evidence, say so.

### 4. Accessibility Visual Check

Always inspect:
- contrast sufficiency
- focus visibility
- readable type scale
- error visibility and proximity
- reliance on color alone
- touch target adequacy when relevant
- motion burden when relevant

### 5. Consistency Check

Inspect:
- design-token consistency
- spacing rhythm
- border/shadow consistency
- icon size consistency
- typography hierarchy
- component behavior consistency across variants

### 6. Failure Search

Actively look for:
- clipped text
- overflow
- broken alignment
- layout jump
- poor wrapping
- low-contrast states
- inconsistent radii or spacing
- broken empty/loading/error states
- responsive collapse failures
- theme mismatch

## Output Format

Start with:

`From the visual evidence, I observe...`

Then structure the review as:

1. **Observed state**
2. **Verification against requested goals**
3. **Issues found**
4. **Accessibility observations**
5. **Missing evidence / what cannot be verified**
6. **Remediation recommendations**
7. **Final verdict**: achieved / partially achieved / not achieved / cannot verify

## Review Standards

Good review:
- specific
- visual
- skeptical
- measurable when possible
- tied to the request

Bad review:
- “looks good”
- “seems fixed”
- approval based only on code diff
- vague comments like “maybe improve spacing” without identifying where

## Validation Matrix

When relevant, verify across:
- mobile portrait
- tablet
- desktop
- dark theme
- zoomed text / dense data views
- empty and error paths

If only one viewport is available, explicitly state the limitation.

## Anti-Patterns

Immediate review failures:
- approving without visual evidence
- assuming implementation equals outcome
- ignoring focus and keyboard-visible states
- ignoring empty/loading/error states
- ignoring responsive regressions
- mistaking stylistic difference for success

## Limitations

- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for full browser matrix testing, assistive technology testing, or production telemetry.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
