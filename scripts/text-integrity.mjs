// T-F4-07 (F-36): guards for the text the student reads. Two independent rules, both pure so a test can feed them a corrupted
// file without ever writing one:
//   1. MOJIBAKE: text that was UTF-8 but was read (and saved back) as Latin-1/cp1252, so "c-cedilla" became two characters (A-tilde + section sign) and an unknown character
//      became U+FFFD. Portuguese has no legitimate "Ã" or "Â" followed by a Latin-1 symbol, so the pattern has no false positives
//      on correct pt-BR text (including "SÃO", "ÃO", "ª", "º").
//   2. LOADING/PROGRESS copy: a message that says something is going on ends with the ellipsis character "…" (U+2026), never three
//      ASCII dots, so every "Enviando…", "Salvando…", "Carregando…" looks and is read the same way.
// The patterns are written with \u escapes: this file must not itself contain a corrupted literal, or the scan below would flag it.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// cp1252 shows bytes 0x80-0x9F as these characters (instead of C1 controls), which is what a mis-decoded UTF-8 continuation byte becomes.
const CP1252_HIGH = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

export const MOJIBAKE_PATTERNS = [
  { kind: 'A-tilde followed by a Latin-1 symbol (e.g. c-cedilla read as two characters)', re: new RegExp(`\\u00C3[\\u0080-\\u00BF${CP1252_HIGH}]`, 'u') },
  { kind: 'A-circumflex followed by a Latin-1 symbol (e.g. a non-breaking space or ordinal read as two characters)', re: /Â[ -¿]/u },
  { kind: 'a-circumflex + euro sign (a curly quote or dash read as three characters)', re: /\u00E2\u20AC/u },
  { kind: 'U+FFFD replacement character (a byte that was already lost)', re: /\uFFFD/u },
];

/** Where `text` has mojibake: [{ line, column, kind, sample }], 1-based. */
export function findMojibake(text) {
  const found = [];
  const lines = String(text).split(/\r\n|\n|\r/);
  lines.forEach((content, index) => {
    for (const { kind, re } of MOJIBAKE_PATTERNS) {
      const m = re.exec(content);
      if (m) found.push({ line: index + 1, column: m.index + 1, kind, sample: content.slice(Math.max(0, m.index - 12), m.index + 14) });
    }
  });
  return found;
}

/** Where a message says "…" with three ASCII dots after a letter, right before the closing quote (or tag): [{ line, column, sample }]. */
export function findAsciiEllipsis(text) {
  const found = [];
  String(text).split(/\r\n|\n|\r/).forEach((content, index) => {
    const re = /\p{L}\.\.\.(?=["'`<])/gu;
    let m;
    while ((m = re.exec(content)) !== null) found.push({ line: index + 1, column: m.index + 1, sample: content.slice(Math.max(0, m.index - 20), m.index + 8) });
  });
  return found;
}

const TEXT_EXT = /\.(js|mjs|cjs|html|css|json|rs|toml|yml|yaml)$/;

/** Tracked source files whose text can reach a student or a log: the app, the server, shared code, tests and scripts. */
export function trackedTextFiles(root = process.cwd()) {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\0').filter((f) => f && TEXT_EXT.test(f) && !/(^|\/)(package-lock\.json|node_modules\/|dist\/|test-results\/)/.test(f));
}

/** Applies `finder` to every { path, text }: [{ path, ...hit }]. Reading is injected so a test can scan a file that exists only in memory. */
export function scanFiles(paths, read, finder) {
  const hits = [];
  for (const path of paths) for (const hit of finder(read(path))) hits.push({ path, ...hit });
  return hits;
}

export const readUtf8 = (path) => readFileSync(path, 'utf8');
