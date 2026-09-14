# SmartLearn - Design Language

Calm, editorial study surface with configurable themes. The default is a paper-like light presentation for long reading sessions, but the app also exposes sepia, night, and high-contrast variants for different ambient light and device conditions. Cool slate neutrals warmed just enough to avoid clinical, with one confident indigo accent. Color strategy: restrained, tinted neutrals carry the surface, the accent appears only on actions and the active state, and saturated color is reserved for semantic review status (overdue / done).

## Color (OKLCH)
Neutrals are tinted toward the accent hue (~262). Never `#000` or `#fff`.

| Token | Value | Use |
|---|---|---|
| `--color-bg` | `oklch(0.972 0.008 262)` | app background |
| `--color-surface` | `oklch(0.998 0.003 262)` | cards, panels |
| `--color-surface-sunken` | `oklch(0.955 0.01 262)` | insets, secondary fills |
| `--color-text` | `oklch(0.29 0.035 264)` | ink |
| `--color-muted` | `oklch(0.55 0.025 260)` | secondary text |
| `--color-border` | `oklch(0.905 0.013 260)` | hairlines |
| `--color-primary` | `oklch(0.52 0.155 264)` | primary actions, active nav |
| `--color-primary-strong` | `oklch(0.46 0.16 264)` | hover / pressed |
| `--color-primary-soft` | `oklch(0.955 0.03 264)` | active backgrounds |
| `--color-on-primary` | `oklch(0.985 0.01 264)` | text on primary actions |

### Theme registry
- `paper` is the default light theme.
- `sepia` is a warmer light variant for longer reading sessions.
- `night` is the default dark theme.
- `contrast` is the high-contrast dark variant.
- `auto` follows system preference and resolves to `paper` or `night`.

### Semantic status
| State | Text | Fill |
|---|---|---|
| Overdue | `oklch(0.48 0.13 60)` | `oklch(0.95 0.055 75)` |
| Today | `--color-primary` | `--color-primary-soft` |
| Done | `oklch(0.48 0.11 155)` | `oklch(0.945 0.05 158)` |

## Type
System UI stack. Scale uses at least 1.25 weight/size contrast.
- Display (screen H1): 1.9rem / 760, letter-spacing -0.03em.
- Review content (focal line): 1.05rem / 680.
- Eyebrow + subject label: 0.74rem / 800, uppercase, +0.06em tracking.
- Body/meta: 0.88rem / 500, muted.
- Body measure capped at about 68ch.

## Form & rhythm
- Radii: 0.7rem controls, 1rem cards/panels, 999px pills.
- Spacing varies for rhythm, blocks breathe with section gap around 1.75rem and card gap around 0.85rem.
- Elevation is restrained: hairline border plus a single soft shadow. No glass, no heavy drop shadows.

## Status, not stripes
Review state is shown by a leading round review-number token tinted by urgency and a small status pill, never by a colored side-stripe border. Cards keep full hairline borders, and the done state gets a faint full-surface tint. This rule governs urgency/status (overdue, today, done) specifically — it does not extend to subject identity (see "Subject identity" below), which is a different signal with its own approved treatment.

## Subject identity
A subject/discipline is identified by a neutral chip (`.subject-cell`): a neutral surface fill, a hairline border, and a solid left stripe in the subject's own color (`subjectColor`) running the full height of the chip. This stripe is a structural identity marker, not decoration — it is the one place in the app where `subjectColor` appears, and it never carries performance or status meaning. Reused as-is anywhere a subject/discipline needs to be identified: matrix rows, the subject-switch trigger, and the subject-switch list (each open option is the same `.subject-cell` chip, not a dot, bullet, or fully-colored row). Do not substitute a colored dot, a fully-tinted surface, or any other marker for this chip. Do not extend the left-stripe treatment to other components (cards, list rows unrelated to subject identity, status indicators) without a separate, explicit decision — it is scoped to subject identity only.

## Theme delivery
- Theme choice is exposed in Settings and persisted locally on the device.
- The app applies the theme before the shell paints, so there is no flash of the wrong palette on startup.
- Component contrast should come from tokens, not hard-coded hex values in the screen layer.

## Motion
Ease-out-quint (`cubic-bezier(0.22, 1, 0.36, 1)`), 140-200ms. Animate opacity and transform only. The detail disclosure expands without animating layout.

## Bans
No side-stripe accent borders for review/urgency status (see "Status, not stripes" — the subject-identity stripe in "Subject identity" is the sole, explicit exception), no gradient text, no decorative glass, no identical-card metric grids, no em dashes in UI copy.
