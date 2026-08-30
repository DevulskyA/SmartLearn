---
name: ui-product-builder
description: Create or evolve production-grade UI with explicit aesthetic direction, strict implementation baseline, accessible interactions, and strong loading/error/empty states. Use when building pages, components, forms, dashboards, and user-facing flows.
risk: medium
source: synthesized-from-community
---

# UI Product Builder

Build **production-grade, user-facing UI** with a clear design point of view, disciplined implementation rules, and reliable interaction states.

This skill exists to prevent two opposite failures:
- generic “AI UI” with no identity
- flashy UI that is fragile, inaccessible, or operationally sloppy

## When to Use

Use this skill when:
- building a new page, component, form, settings screen, dashboard, modal, or navigation flow
- redesigning or elevating an existing interface
- converting a requirement into real UI code
- reviewing a UI implementation and proposing targeted improvements

Do **not** use this skill when:
- the task is only visual validation from screenshots; use `ui-visual-gatekeeper`
- the task is only accessibility remediation; use `ui-a11y-remediator`
- the task is backend, data modeling, or non-UI logic

## Required Operating Mode

Before coding, explicitly state:
1. **Goal**: what the user must be able to do
2. **Surface**: page, component, modal, form, navigation, or dashboard
3. **Primary constraints**: framework, existing design system, responsiveness, accessibility, performance
4. **Chosen design direction**: one dominant style, at most two if truly necessary
5. **Success criteria**: what would make the UI clearly correct

If critical inputs are missing, ask only for what blocks correct execution.

## Design Direction

Always define a design stance before implementation.

Examples:
- editorial minimal
- industrial utilitarian
- premium restrained
- technical dense
- playful productized
- quiet enterprise

### Design Rule

The UI must have:
- one clear visual thesis
- one memorable anchor
- restraint everywhere else

The memorable anchor may be:
- a typographic move
- layout asymmetry
- a distinctive navigation pattern
- a strong but controlled accent treatment
- a meaningful data presentation pattern

Avoid decoration without purpose.

## Design Feasibility Check

Before implementation, score the direction from 1–5 on:
- impact
- context fit
- implementation feasibility
- performance safety
- consistency risk

Use:

```text
DFII = impact + fit + feasibility + performance - consistency_risk
```

Interpretation:
- **12–15**: execute fully
- **8–11**: strong; proceed with discipline
- **4–7**: reduce scope/effects
- **<= 3**: rethink direction

If DFII is below 8, simplify before building.

## Implementation Baseline

### Stack and Primitives

- Prefer the project’s existing component system first
- For keyboard/focus-heavy interactions, use accessible primitives rather than custom behavior
- Do not mix primitive systems on the same interaction surface unless the user explicitly requests it
- Prefer semantic HTML before role-based patches

### Layout

- Do not use `h-screen`; use `h-dvh`
- Respect safe areas for fixed/sticky mobile surfaces
- Use a consistent spacing rhythm
- Use a fixed z-index scale; avoid arbitrary stacking values unless already established in the project
- Prefer composition over one giant component

### Typography

- Headings must communicate hierarchy clearly
- Body text must remain readable at realistic density
- Use `text-balance` for headings and `text-pretty` for longer body copy when available
- Use `tabular-nums` for metrics, currency, and tabular data
- Avoid arbitrary tracking changes unless explicitly justified

### Color and Theme

- Use existing theme tokens first
- Keep one dominant accent per view unless the brand system requires otherwise
- Avoid generic purple/multicolor SaaS gradients unless explicitly requested
- Avoid glow as the primary affordance
- Use shadows with restraint

### Interaction

- Icon-only buttons must have accessible names
- Destructive or irreversible actions must use confirmation patterns such as `AlertDialog`
- Errors must appear near the point of action
- Never block paste in text inputs
- Focus must remain visible and predictable

### Motion

- Add motion only when it helps comprehension, hierarchy, or feedback
- Animate only compositor-friendly properties where possible (`transform`, `opacity`)
- Do not animate layout properties unless explicitly required and justified
- Interaction feedback should usually stay at or below `200ms`
- Respect `prefers-reduced-motion`
- Avoid decorative motion spam

### Performance and React Hygiene

- Prefer render logic over `useEffect` when possible
- Do not add unused animations, dead variants, or dead style branches
- Avoid large blur/backdrop effects on large surfaces
- Do not leave `will-change` applied outside active animation windows

## Required State Coverage

Every user-facing UI that reads, mutates, or lists data must explicitly handle these states where applicable:

1. **loading**
2. **success**
3. **empty**
4. **error**
5. **disabled / unavailable**
6. **optimistic / in-flight**

### Loading Rules

- Show loading indicator **only when no useful data is available yet**
- Prefer skeletons when the content shape is known
- Do not flash a full spinner over already-available data during refetch

### Error Rules

- Never swallow errors silently
- Surface the error in the correct layer:
  - field-level for validation
  - inline/banner for partial page failure
  - full error state for unrecoverable screens
- When retry is viable, expose retry

### Empty State Rules

Every empty state must contain:
- a clear title
- one-sentence explanation
- one next action when action is possible

## Accessibility Minimum Bar

This skill must build accessible UI by default.

- every interactive control must have an accessible name
- all interaction must be keyboard reachable when appropriate
- focus must be visible
- dialogs must trap focus and restore it on close
- form errors must be associated with fields
- disabled actions should communicate why when the reason is not obvious
- use native HTML before adding ARIA
- do not remove semantics that the browser already gives for free

If accessibility remediation becomes the main task, switch to `ui-a11y-remediator`.

## Output Modes

### If the user asks to create UI
Output in this order:
1. goal and chosen design direction
2. DFII with one-line justification
3. structure of the interface
4. complete implementation
5. brief note explaining how the UI avoids generic patterns

### If the user asks to review an existing file
Output in this order:
1. strengths worth preserving
2. concrete issues grouped by category:
   - layout
   - hierarchy/typography
   - interaction
   - state handling
   - accessibility
   - performance
3. exact code-level fixes

## Anti-Patterns

Immediate quality failures:
- template-looking layout with no design thesis
- symmetric section stacking with no hierarchy
- spinner shown over cached data during refetch
- destructive actions without clear confirmation
- icon-only buttons without labels
- inaccessible custom controls that should be native
- decoration with no narrative or interaction purpose
- refactoring unrelated code in a small UI task

## Response Standard

Be concrete.
Do not produce vague design talk.
Translate intent into implementation decisions.
When reviewing, quote exact snippets and propose surgical fixes.

## Limitations

- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for real runtime testing, visual QA, browser checks, or product validation.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
