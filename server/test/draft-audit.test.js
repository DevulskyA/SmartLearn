import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditDraft, AUDIT_RESULT } from '../src/ai/draft-audit.js';

// CONTENT-QUALITY CQ-2: a deterministic SCREEN over a draft, before a human ever sees it.
// It is honest about what it is: PASS means "no flag raised", never "medically verified".
// Semantic judgement (a contradiction, a subtly wrong mechanism) belongs to the model auditor
// (live provider only) and to the human reviewer — see server/test/draft-audit-model.test.js.

const SEGMENTS = [
  { pageIndex: 1, text: 'A filtração glomerular é determinada pela pressão hidrostática capilar (60 mmHg), que favorece a filtração, e pela pressão oncótica (32 mmHg) e pela pressão da cápsula de Bowman (18 mmHg), que se opõem. A taxa de filtração glomerular normal é cerca de 125 mL/min.' },
  { pageIndex: 2, text: 'A arteríola aferente dilata e a eferente contrai para aumentar a taxa de filtração glomerular. A angiotensina II contrai preferencialmente a arteríola eferente, mantendo a pressão hidrostática glomerular.' },
];

const GOOD_SUMMARY = 'A filtração glomerular resulta do balanço entre a pressão hidrostática capilar (60 mmHg), que favorece a filtração, e as pressões oncótica (32 mmHg) e da cápsula de Bowman (18 mmHg), que se opõem. A taxa de filtração glomerular normal é cerca de 125 mL/min. A arteríola eferente, contraída pela angiotensina II, mantém a pressão glomerular.';
const Q = (o = {}) => ({ question: 'Qual é a taxa de filtração glomerular normal?', answer: 'Cerca de 125 mL/min: resulta do balanço entre a pressão hidrostática que favorece a filtração e as pressões oncótica e da cápsula de Bowman que se opõem.', hint: null, sourceSpans: [{ pageIndex: 1 }], ...o });
const draft = (o = {}) => ({ summary: GOOD_SUMMARY, questions: [Q()], ...o });
const issues = (r, scope) => r.findings.filter((f) => !scope || f.scope === scope).map((f) => f.issue);

test('a faithful summary raises no flag (PASS) and the finding shape is stable', () => {
  const r = auditDraft(draft(), { segments: SEGMENTS });
  assert.equal(r.result, AUDIT_RESULT.PASS);
  assert.deepEqual(r.findings.filter((f) => f.scope === 'summary'), []);
  assert.equal(r.auditedBy, 'DETERMINISTIC');
});

test('a value invented in the summary (300 mL/min) is HIGH and quotes both the claim and what the source actually says', () => {
  const r = auditDraft(draft({ summary: 'A taxa de filtração glomerular normal é 300 mL/min e depende da pressão hidrostática (60 mmHg).' }), { segments: SEGMENTS });
  assert.equal(r.result, AUDIT_RESULT.REPAIR);
  const f = r.findings.find((x) => x.issue === 'SUMMARY_UNSUPPORTED_VALUE');
  assert.ok(f, 'unsupported value flagged');
  assert.equal(f.severity, 'HIGH');
  assert.equal(f.scope, 'summary');
  assert.match(f.generatedClaim, /300/);
  assert.match(f.sourceEvidence, /125/, 'points at the value the source really gives');
  assert.ok(f.repair.length > 0);
});

test('a value that IS in the source is never flagged, even written with a decimal comma or another unit spacing', () => {
  const r = auditDraft(draft({ summary: GOOD_SUMMARY.replace('125 mL/min', '125 mL / min') }), { segments: SEGMENTS });
  assert.deepEqual(issues(r, 'summary').filter((i) => i === 'SUMMARY_UNSUPPORTED_VALUE'), []);
});

test('a specific term that appears nowhere in the source (drug, condition) is flagged for verification', () => {
  const r = auditDraft(draft({ summary: GOOD_SUMMARY + ' A furosemida dilata a arteríola aferente em diabéticos.' }), { segments: SEGMENTS });
  const f = r.findings.find((x) => x.issue === 'SUMMARY_UNSUPPORTED_TERM');
  assert.ok(f);
  assert.match(f.generatedClaim, /furosemida/i);
  assert.equal(r.result, AUDIT_RESULT.REPAIR);
});

test('terminology silently swapped (oncótica -> osmótica) is flagged, not accepted as a paraphrase', () => {
  const r = auditDraft(draft({ summary: GOOD_SUMMARY.replace(/oncótica/g, 'osmótica') }), { segments: SEGMENTS });
  const f = r.findings.find((x) => x.issue === 'SUMMARY_UNSUPPORTED_TERM');
  assert.ok(f, 'osmótica has no counterpart in the source');
  assert.match(f.generatedClaim, /osm[oó]tica/i);
});

test('a summary that keeps only an incidental detail and drops the central concept is flagged as an omission', () => {
  const r = auditDraft(draft({ summary: 'A cápsula de Bowman exerce uma pressão de 18 mmHg no glomérulo.' }), { segments: SEGMENTS });
  const f = r.findings.find((x) => x.issue === 'SUMMARY_OMITS_CENTRAL_CONCEPT');
  assert.ok(f, 'central terms of the source are missing');
  assert.equal(f.scope, 'summary');
  assert.match(f.sourceEvidence, /filtra/i);
});

test('a token summary over a substantial source is thin (HIGH); a short source may have a short summary', () => {
  const thin = auditDraft(draft({ summary: 'Fisiologia renal.' }), { segments: SEGMENTS });
  assert.ok(issues(thin, 'summary').includes('SUMMARY_TOO_THIN'));
  assert.equal(thin.result, AUDIT_RESULT.REPAIR);
  const shortSource = [{ pageIndex: 1, text: 'O rim filtra o sangue.' }];
  const ok = auditDraft({ summary: 'O rim filtra o sangue.', questions: [Q({ question: 'O que o rim faz?', answer: 'O rim filtra o sangue, removendo excretas.', sourceSpans: [{ pageIndex: 1 }] })] }, { segments: shortSource });
  assert.ok(!issues(ok, 'summary').includes('SUMMARY_TOO_THIN'));
});

test('the audit never mutates its input and is deterministic', () => {
  const d = draft({ summary: 'Pressão de 999 mmHg.' });
  const before = JSON.stringify(d);
  const a = auditDraft(d, { segments: SEGMENTS });
  const b = auditDraft(d, { segments: SEGMENTS });
  assert.equal(JSON.stringify(d), before);
  assert.deepEqual(a, b);
});
