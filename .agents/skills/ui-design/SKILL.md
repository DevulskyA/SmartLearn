---
name: ui-design
description: Design and implement intuitive, responsive, and accessible user interfaces for React-based applications.
phases: [P, E, V]
---

# UI Design

## When to Use
Use this skill when you need to design or improve a user interface, especially for React/Next.js applications. It is also appropriate for UI architecture, component composition, responsive behavior, and accessibility decisions.

## Focus Areas
- Core UI primitives and reusable components
- Layout, spacing, and responsive structure
- Accessibility and ARIA compliance
- Performance and user experience consistency
- Visual consistency with existing design tokens and CSS variables

## Instructions
1. Check for existing components and patterns before creating new UI elements.
2. Prefer composition and reuse over duplication.
3. Use the project’s established styling conventions, such as Tailwind CSS utilities and class merging helpers.
4. Implement responsive behavior with CSS breakpoints and structural hooks when needed.
5. Validate accessibility, loading states, and empty states for user-facing screens.

## Best Practices
- Use a shared class merging utility for dynamic styling to avoid Tailwind conflicts.
- Keep major components typed with explicit `Props` interfaces.
- Prefer passing `children` or slot-style composition for complex containers.
- Reuse existing icon sets and visual elements to maintain consistency.
- Use lazy loading for heavy views or charts, and fallback UI for remote assets.

## Key Principles
- Build predictable, intuitive flows that match the user’s mental model.
- Keep UI logic declarative and push side effects to higher-level hooks or state managers.
- Ensure layout shifts and responsive adjustments are handled gracefully.
- Maintain accessibility and responsive usability as first-class concerns.
