# SmartLearn — Design Language

Calm, editorial study surface. Light theme (long daytime/low-light reading
sessions over months; dark would fight the paper-like reading feel). Cool slate
neutrals warmed just enough to avoid clinical, with one confident indigo accent.
Color strategy: **restrained** — tinted neutrals carry the surface, the accent
appears only on actions and the active state, and saturated color is reserved
for semantic review status (overdue / done).

## Color (OKLCH)
Neutrals are tinted toward the accent hue (~262). Never `#000`/`#fff`.

| Token | Value | Use |
|---|---|---|
| `--bg` | `oklch(0.972 0.008 262)` | app background |
| `--surface` | `oklch(0.998 0.003 262)` | cards, panels (near-white, faint cool) |
| `--surface-sunken` | `oklch(0.955 0.01 262)` | insets, secondary fills |
| `--text` | `oklch(0.29 0.035 264)` | ink |
| `--muted` | `oklch(0.55 0.025 260)` | secondary text |
| `--border` | `oklch(0.905 0.013 260)` | hairlines |
| `--accent` | `oklch(0.52 0.155 264)` | primary actions, active nav |
| `--accent-strong` | `oklch(0.46 0.16 264)` | hover/pressed |
| `--accent-soft` | `oklch(0.955 0.03 264)` | active backgrounds |

### Semantic status
| State | Text | Fill |
|---|---|---|
| Overdue | `oklch(0.48 0.13 60)` | `oklch(0.95 0.055 75)` (amber) |
| Today | `--accent` | `--accent-soft` |
| Done | `oklch(0.48 0.11 155)` | `oklch(0.945 0.05 158)` (green) |

## Type
System UI stack. Scale uses ≥1.25 weight/size contrast.
- Display (screen H1): 1.9rem / 760, letter-spacing −0.03em.
- Review content (focal line): 1.05rem / 680.
- Eyebrow + subject label: 0.74rem / 800, uppercase, +0.06em tracking.
- Body/meta: 0.88rem / 500, muted.
Body measure capped ~68ch.

## Form & rhythm
- Radii: 0.7rem controls, 1rem cards/panels, 999px pills.
- Spacing varies for rhythm; blocks breathe (section gap ~1.75rem, card gap ~0.85rem).
- Elevation is restrained: hairline border + a single soft shadow
  `0 1px 2px / 0 8px 24px` at low alpha. No glass, no heavy drop shadows.

## Status, not stripes
Review state is shown by **(a)** a leading round review-number token tinted by
urgency and **(b)** a small status pill, never by a colored side-stripe border.
Cards keep full hairline borders; the done state gets a faint full-surface tint.

## Motion
ease-out-quint (`cubic-bezier(0.22, 1, 0.36, 1)`), 140–200ms. Animate
opacity/transform only. The detail disclosure expands without animating layout.

## Bans (inherited)
No side-stripe accent borders, no gradient text, no decorative glass, no
identical-card metric grids, no em dashes in UI copy.
