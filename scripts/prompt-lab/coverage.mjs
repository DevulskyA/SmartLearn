// Concept coverage of a Resumo Mestre against a unit's local source map (keywords only, no book text).
//   node scripts/prompt-lab/coverage.mjs <source-map.json> <run-N.json | file with .summary>   (reads .draft.summary or .summary)
import { readFileSync } from 'node:fs';
import { normalizeForMatch } from '../../server/src/ai/claim-evidence.js';

export function coverageOf(summary, map) {
  const text = normalizeForMatch(summary);
  const rows = map.concepts.map((c) => ({
    id: c.id,
    label: c.label,
    covered: c.anyOf.some((group) => group.every((word) => text.includes(normalizeForMatch(word)))),
  }));
  return { covered: rows.filter((r) => r.covered).length, total: rows.length, missing: rows.filter((r) => !r.covered), rows };
}

const isMain = process.argv[1] && import.meta.url.toLowerCase().endsWith('coverage.mjs') && process.argv[1].toLowerCase().endsWith('coverage.mjs');
if (isMain) {
  const map = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const data = JSON.parse(readFileSync(process.argv[3], 'utf8'));
  const summary = data.draft?.summary ?? data.summary;
  const r = coverageOf(summary, map);
  console.log(`COVERAGE ${r.covered}/${r.total}; summary ${summary.length} chars`);
  for (const m of r.missing) console.log(`  missing ${m.id} ${m.label}`);
}
