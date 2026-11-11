// Rule-by-rule comparison of src/experience.css with the V7.2 reference stylesheet(s): which rules the app lacks, which differ.
// Usage: node scripts/css-diff-v72.mjs <regex over selectors> [--max N]
//   e.g. node scripts/css-diff-v72.mjs "screen-materials|sl-library|sources-"
// Source of the reference: the <style> blocks of tools/paridade-v72-kit/reference/V7.2.html (the exact CSS the screenshots come from).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postcss from 'postcss';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pattern = new RegExp(process.argv[2] ?? '.', 'i');
const maxIdx = process.argv.indexOf('--max');
const max = maxIdx > 0 ? Number(process.argv[maxIdx + 1]) : 60;

const normalizeDecls = (rule) => {
  const map = new Map();
  rule.walkDecls((d) => map.set(d.prop.trim().toLowerCase(), d.value.replace(/\s+/g, ' ').trim().toLowerCase()));
  return map;
};
const keyOf = (rule) => {
  let ctx = '';
  for (let p = rule.parent; p && p.type !== 'root'; p = p.parent) if (p.type === 'atrule') ctx = `@${p.name} ${p.params.replace(/\s+/g, ' ')} | ${ctx}`;
  return ctx + rule.selector.replace(/\s+/g, ' ').trim();
};
const collect = (css) => {
  const rules = new Map();
  postcss.parse(css).walkRules((rule) => {
    const key = keyOf(rule);
    const merged = rules.get(key) ?? new Map();
    for (const [k, v] of normalizeDecls(rule)) merged.set(k, v); // later declarations win, like the cascade of one selector
    rules.set(key, merged);
  });
  return rules;
};

const html = readFileSync(join(root, 'tools/paridade-v72-kit/reference/V7.2.html'), 'utf8');
const refCss = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const ref = collect(refCss);
const app = collect(readFileSync(join(root, 'src/experience.css'), 'utf8'));

let shown = 0;
const out = [];
for (const [key, decls] of ref) {
  if (!pattern.test(key)) continue;
  const mine = app.get(key);
  if (!mine) { out.push(`MISSING  ${key}\n    ${[...decls].map(([k, v]) => `${k}:${v}`).join('; ')}`); continue; }
  const diffs = [];
  for (const [k, v] of decls) if (mine.get(k) !== v) diffs.push(`${k}: ref "${v}" | app "${mine.get(k) ?? '(absent)'}"`);
  if (diffs.length) out.push(`DIFFERS  ${key}\n    ${diffs.join('\n    ')}`);
}
for (const line of out) { if (shown++ < max) console.log(line); }
console.log(`\n${out.length} differing/missing rules matching /${pattern.source}/ (${shown > max ? `first ${max} shown` : 'all shown'}); reference rules scanned: ${[...ref.keys()].filter((k) => pattern.test(k)).length}`);
