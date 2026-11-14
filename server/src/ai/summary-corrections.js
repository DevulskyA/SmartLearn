// Per-excerpt corrections (P1-6). A model repair returns a whole corrected summary; this module turns the difference between the student's
// summary and that repair into small replaceable excerpts { key, original, proposed }, so the student accepts or dismisses each one and
// everything that was already right stays byte for byte. Pure functions, no I/O.
import { createHash } from 'node:crypto';

/** Sentence spans of a text with their exact offsets: a replacement is always the exact substring that was there. */
export function sentenceSpans(text) {
  const spans = [];
  const re = /[^\n.!?;]+[.!?;]*|\n+/g;
  let m = re.exec(text);
  while (m !== null) {
    const body = m[0];
    if (body.trim().length > 0 && !/^\n+$/.test(body)) {
      const lead = body.length - body.trimStart().length;
      const trimmed = body.trim();
      spans.push({ start: m.index + lead, end: m.index + lead + trimmed.length, text: trimmed });
    }
    m = re.exec(text);
  }
  return spans;
}

/** Longest-common-subsequence table over sentence texts (summaries are a few dozen sentences, so quadratic is fine). */
function lcsTable(a, b) {
  const t = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  }
  return t;
}

const keyOf = (original, proposed) => createHash('sha1').update(`${original}\u0000${proposed}`).digest('hex').slice(0, 10);

/**
 * Excerpts that differ between `before` and `after`: a run of old sentences replaced by a run of new ones (or by nothing). A sentence only
 * added, with no old text to anchor it, is not offered as an excerpt (there is nothing to replace). `original` is always an exact substring of `before`.
 * @returns {Array<{ key: string, original: string, proposed: string }>}
 */
export function diffExcerpts(before, after) {
  const a = sentenceSpans(before);
  const b = sentenceSpans(after);
  const t = lcsTable(a.map((s) => s.text), b.map((s) => s.text));
  const out = [];
  let i = 0;
  let j = 0;
  let run = null;
  const flush = () => {
    if (run && run.oldSpans.length > 0) {
      // as many new sentences as old ones: each old sentence has its own replacement, so each one is its own excerpt
      const pairs = run.oldSpans.length === run.newSpans.length ? run.oldSpans.map((o, k) => [[o], [run.newSpans[k]]]) : [[run.oldSpans, run.newSpans]];
      for (const [olds, news] of pairs) {
        const original = before.slice(olds[0].start, olds.at(-1).end);
        const proposed = news.length > 0 ? after.slice(news[0].start, news.at(-1).end) : '';
        if (original !== proposed) out.push({ key: keyOf(original, proposed), original, proposed });
      }
    }
    run = null;
  };
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i].text === b[j].text) { flush(); i += 1; j += 1; continue; }
    run ??= { oldSpans: [], newSpans: [] };
    if (j >= b.length || (i < a.length && t[i + 1][j] >= t[i][j + 1])) { run.oldSpans.push(a[i]); i += 1; } else { run.newSpans.push(b[j]); j += 1; }
  }
  flush();
  return out;
}

const countOccurrences = (text, part) => (part.length === 0 ? 0 : text.split(part).length - 1);

/** Replaces `original` with `proposed` only when `original` is in the text exactly once; otherwise null (the text moved, the excerpt is stale). */
export function applyExcerpt(summary, { original, proposed }) {
  if (countOccurrences(summary, original) !== 1) return null;
  return summary.replace(original, () => proposed);
}

/** The excerpts still anchored in the summary (the student kept typing: a stale one is dropped, never applied to the wrong place). */
export const pruneExcerpts = (excerpts, summary) => (excerpts ?? []).filter((e) => countOccurrences(summary, e.original) === 1);
