# SmartLearn — Product Context

**Register:** product (the design serves the tool; the tool is the point).

## What it is
A local-first desktop/mobile app (Tauri 2 + vanilla HTML/CSS/JS + SQLite) for
spaced-repetition study. The user logs what they studied; the app generates a
fixed 16-step review schedule (1, 7, 15, 30… up to 390 days) per study record
and surfaces what is due each day. Per review, the user records whether the
review and the practice questions were done, the questions/correct counts (which
yield a percentage), and an optional note.

## Who uses it
A single Brazilian civil-service exam candidate ("concurseiro") preparing over
many months. Disciplines are real and exam-specific (Língua Portuguesa, AFO,
Arquivologia, Legislação, Conhecimentos sobre o DF…). Sessions are daily, often
early morning or late at night, frequently on a phone. The mood is disciplined
but fatigued: this is a long grind, and the daily screen should feel calm,
unambiguous about what is urgent, and quietly motivating when the day is cleared.

## Tone
Focused, grown-up, encouraging without being cute. Portuguese (pt-BR)
throughout. No gamified noise, no streak-shaming. Urgency is communicated
honestly (an overdue review is overdue) but never with alarm-fatigue.

## Anti-references
- Generic blue-and-white SaaS dashboards (the current look leans this way).
- Notion-cream minimalist productivity clones.
- Gamified flashcard apps (confetti, mascots, XP bars).

## Strategic principles
1. **The day's truth, at a glance.** Overdue vs. due-today vs. done must be
   distinguishable in under a second, on a phone.
2. **Logging is one tap, detail is opt-in.** Marking a review done is the
   primary action; recording scores/notes is progressive disclosure.
3. **Local and private.** No accounts, no network. The data is the user's.
4. **Mobile-first.** The primary device is a phone held in one hand.
