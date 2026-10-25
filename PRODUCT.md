# SmartLearn — Product Context

**Register:** product (the design serves the tool; the tool is the point).

## What it is
A study app for Medicine, Desktop first (Windows, Tauri 2 + vanilla HTML/CSS/JS, with a local backend and SQLite; the web build and a phone view
exist and must keep working, but the Desktop window is the primary place where the work happens). The student brings lessons and sources
(PDFs), the app proposes a formatted **Resumo Mestre** and practice questions from them, a human reviews anything critical against the source,
and accepted lessons get a spaced-review schedule (1, 7, 15, 30 … up to 390 days). Each review records what was practiced and how it went.

## Who uses it
A Brazilian medical student. Disciplines are medical (Anatomia, Fisiologia, Farmacologia, Patologia …), the sources are lessons and
textbooks, the summaries carry scientific content: formulas, chemistry, tables, diagrams and infographics. Sessions are long and daily, on a
Windows computer in a window of anywhere from 800×600 to a full screen. The student is here to learn Medicine, not to learn the app, and does
not know (and must never need to know) Markdown, LaTeX or any internal identifier.

## Tone
Focused, grown-up, calm, encouraging without being cute. Portuguese (pt-BR) throughout. No gamified noise, no streak-shaming. Urgency is
communicated honestly (an overdue review is overdue) but never with alarm-fatigue. Medical content is treated with care: nothing critical is
accepted without a human check against the source.

## Anti-references
- Generic blue-and-white SaaS dashboards.
- Notion-cream minimalist productivity clones.
- Gamified flashcard apps (confetti, mascots, XP bars).
- Word-processor ribbons and code-like editors: the page is read first; editing tools appear only when the student starts editing.

## Strategic principles
1. **One screen, one purpose.** Disciplinas manage disciplines; Materiais register lessons and sources and open the Resumo Mestre; the
   Resumo Mestre is read as a formatted page; Praticar shows questions and feedback and never the summary that contains the answers.
2. **The day's truth, at a glance.** Overdue vs. due-today vs. done must be distinguishable in under a second.
3. **Reading first, editing on request.** The summary opens as a clean page; editing is started by the student and its controls appear in
   context. Images sit in the text flow and are moved and resized directly.
4. **No technical syntax for the student.** Formulas are built with a visual math keyboard; the stored text (Markdown, LaTeX) stays out of
   sight, under "Avançado" at most.
5. **Never lose work, never accept silently.** Autosave with a local recoverable copy; saving is not accepting; critical content needs the
   human review against the source.
6. **Local and private.** The data is the student's; sources and images are private to their owner.
