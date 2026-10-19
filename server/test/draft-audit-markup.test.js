// The scientific summary's technical markers must not produce false audit results, and equations must not become a way around the audit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditDraft, AUDIT_RESULT } from '../src/ai/draft-audit.js';

const SEGMENTS = [
  { pageIndex: 1, text: 'A filtração glomerular é determinada pela pressão hidrostática capilar (60 mmHg), que favorece a filtração, e pela pressão oncótica (32 mmHg) e pela pressão da cápsula de Bowman (18 mmHg), que se opõem. A taxa de filtração glomerular normal é cerca de 125 mL/min.' },
  { pageIndex: 2, text: 'A arteríola aferente dilata e a eferente contrai para aumentar a taxa de filtração glomerular. A angiotensina II contrai preferencialmente a arteríola eferente, mantendo a pressão hidrostática glomerular.' },
];
const GOOD = 'A filtração glomerular resulta do balanço entre a pressão hidrostática capilar (60 mmHg), que favorece a filtração, e as pressões oncótica (32 mmHg) e da cápsula de Bowman (18 mmHg), que se opõem. A taxa de filtração glomerular normal é cerca de 125 mL/min. A arteríola eferente, contraída pela angiotensina II, mantém a pressão glomerular.';
const Q = { question: 'Qual é a taxa de filtração glomerular normal?', answer: 'Cerca de 125 mL/min: resulta do balanço entre a pressão hidrostática que favorece a filtração e as pressões oncótica e da cápsula de Bowman que se opõem.', explanation: 'A filtração glomerular é determinada por essas pressões: 60 mmHg a favor e 32 mmHg mais 18 mmHg contra.', hint: null, sourceSpans: [{ pageIndex: 1 }] };
const audit = (summary) => auditDraft({ summary, questions: [Q] }, { segments: SEGMENTS });
const summaryIssues = (r) => r.findings.filter((f) => f.scope === 'summary').map((f) => f.issue);

test('a figure marker (its UUID is full of digits) is not read as an invented value', () => {
  const withFigure = `${GOOD}\n\n[[fig:3f2b8c1e-5a7d-4e9b-8c3a-1d2e3f4a5b6c]]\n\nEssa é a filtração glomerular.`;
  const r = audit(withFigure);
  assert.equal(r.result, AUDIT_RESULT.PASS, JSON.stringify(r.findings));
  assert.deepEqual(summaryIssues(r), []);
});

test('math delimiters are not claims, and an equation that only uses source values passes', () => {
  const r = audit(`${GOOD}\n\nPressão líquida: \\(P_{liq} = 60 - 32 - 18\\)\n\n\\[\nTFG = K_f \\times P_{liq}\n\\]`);
  assert.equal(r.result, AUDIT_RESULT.PASS, JSON.stringify(r.findings));
});

test('an equation does NOT hide an invented value: it is still screened like any other content', () => {
  const r = audit(`${GOOD}\n\nPressão líquida: \\(P_{liq} = 77 - 32\\)`);
  assert.equal(r.result, AUDIT_RESULT.REPAIR);
  assert.ok(summaryIssues(r).includes('SUMMARY_UNSUPPORTED_VALUE'));
});
