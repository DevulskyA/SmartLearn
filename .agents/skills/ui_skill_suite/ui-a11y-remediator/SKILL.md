---
name: ui-a11y-remediator
description: Audit and fix UI accessibility issues with minimal, targeted changes. Prioritize accessible names, keyboard access, focus behavior, semantic HTML, form errors, contrast, and reduced-motion support.
risk: medium
source: synthesized-from-community
---

# UI A11y Remediator

Audit and repair accessibility issues in a **surgical, production-safe** way.

This skill is for **remediation**, not redesign.
It improves accessibility while preserving the existing UI as much as possible.

## When to Use

Use this skill when:
- reviewing buttons, links, menus, dialogs, tabs, dropdowns, comboboxes, forms, or tables
- fixing keyboard access, focus behavior, labels, helper text, validation, contrast, or announcements
- hardening an already-built UI before release
- responding to an accessibility bug or audit finding

Do **not** use this skill when:
- the task is to create a new UI from scratch; use `ui-product-builder`
- the task is to visually validate screenshots only; use `ui-visual-gatekeeper`
- the user asked for broad visual redesign instead of targeted remediation

## Repair Philosophy

- prefer **minimal changes**
- prefer **native HTML** before ARIA additions
- do **not** refactor unrelated code
- do **not** migrate component libraries unless explicitly requested
- fix by **severity order**, not by personal preference

## Severity Order

1. accessible names
2. keyboard access
3. focus management and dialogs
4. semantics
5. forms and errors
6. announcements and status
7. contrast and non-color cues
8. media and motion

## Mandatory Checks

### 1. Accessible Names

- every interactive control must have an accessible name
- icon-only buttons must use `aria-label` or `aria-labelledby`
- decorative icons should be hidden from assistive tech
- all form controls must be labeled
- link text must be meaningful out of context

### 2. Keyboard Access

- do not use `div` or `span` as buttons without complete keyboard behavior
- all interactive elements must be reachable in a logical tab order
- avoid `tabindex > 0`
- Escape should close dialogs/overlays when applicable
- hover-only interactions must have keyboard equivalents

### 3. Focus and Dialogs

- focus must be visible
- dialogs must trap focus while open
- focus must return to the trigger on close when appropriate
- initial focus must land intentionally inside dialogs
- opening a dialog should not cause confusing page scroll jumps

### 4. Semantics

- prefer `button`, `a`, `input`, `select`, `textarea`, `table`, `th`, `ul`, `ol`, `li` over role-based workarounds
- do not skip heading levels without reason
- if ARIA role is used, include required states and properties
- use table semantics for actual data tables

### 5. Forms and Errors

- invalid fields must expose their error association
- use `aria-describedby` for helper or error text when relevant
- use `aria-invalid` for invalid inputs
- required fields must be communicated clearly
- disabled submission should explain why if the reason is not obvious

### 6. Announcements and Status

- critical status updates should be announced appropriately
- loading states should expose status text or `aria-busy` when useful
- toasts must not be the only channel for critical information
- expandable controls must expose expanded/collapsed state where relevant

### 7. Contrast and Non-Color Cues

- verify sufficient contrast for text and icons
- disabled, error, and success states must not rely on color alone
- never remove focus outlines without a visible replacement
- placeholder text must not carry critical meaning alone

### 8. Media and Motion

- images must use meaningful `alt` or empty `alt=""` when decorative
- respect `prefers-reduced-motion` for non-essential motion
- avoid autoplay with sound
- ensure controls for media are operable and labeled

## Required Output Format

When reviewing a file, output:

1. **Critical issues**
2. **High-severity issues**
3. **Medium issues**
4. **Minimal fix proposals**

For each issue include:
- exact snippet or element
- why it fails
- the smallest correct fix

## Preferred Fix Style

Good:
- replace fake button with native button
- add missing label
- associate error text with field
- restore visible focus
- use an accessible primitive for complex widget behavior

Bad:
- rewrite the whole page
- add random ARIA everywhere
- refactor unrelated styling
- migrate the design system during a simple fix

## Common Fix Patterns

```html
<!-- icon-only button -->
<button aria-label="Close"><svg aria-hidden="true"></svg></button>

<!-- invalid field -->
<input id="email" aria-invalid="true" aria-describedby="email-error" />
<p id="email-error">Enter a valid email address.</p>

<!-- native button instead of clickable div -->
<button type="button">Save</button>
```

## Escalation Rule

If the issue cannot be fixed safely with a small patch because the widget is fundamentally custom and broken, say so explicitly and recommend replacing it with an accessible primitive.

## Limitations

- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for manual testing with keyboard, zoom, screen reader, and real assistive technology.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
