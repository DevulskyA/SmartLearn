// T-F0-02 sensor: no decision/invariant token of a STATE.md revision may disappear from the live STATE.md plus its archive.
//   node scripts/check-state-ids.mjs [<git-rev-of-old-state>=HEAD]     (reads .specs/STATE.md and .specs/archive/*.md)
// A token is an upper-case identifier with a separator (AI_PROVIDER_DECISION, ARCH-01, PV1-01_STATUS, HUMAN_GATE ...).
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const TOKEN = /\b[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)+\b/g;
export const tokensOf = (text) => new Set(text.match(TOKEN) ?? []);

export function missingTokens(oldText, liveText, archiveTexts) {
  const have = tokensOf([liveText, ...archiveTexts].join('\n'));
  return [...tokensOf(oldText)].filter((t) => !have.has(t)).sort();
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/').split('/').pop())) {
  const rev = process.argv[2] ?? 'HEAD';
  const oldText = execFileSync('git', ['show', `${rev}:.specs/STATE.md`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const live = readFileSync('.specs/STATE.md', 'utf8');
  const dir = '.specs/archive';
  const archives = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => readFileSync(join(dir, f), 'utf8')) : [];
  const missing = missingTokens(oldText, live, archives);
  console.log(`old tokens: ${tokensOf(oldText).size} · live+archive tokens: ${tokensOf([live, ...archives].join('\n')).size} · missing: ${missing.length}`);
  if (missing.length) { console.error('MISSING:', missing.join(', ')); process.exit(1); }
}
