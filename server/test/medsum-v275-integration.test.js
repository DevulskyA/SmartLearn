import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDraftPrompt } from '../src/ai/draft-prompt.js';

const segments = [{ pageIndex: 37, text: 'Em geral, o calcio pode causar tetania apenas em condicoes especificas. Valor de referencia: 4,2 mmol/L.' }];

test('MED-SUM 10 uses V2.7.5 principles without inheriting the v8/v9 procedural challenger', () => {
  const text = buildDraftPrompt(segments, '10', { generationLocale: 'pt-BR' });
  assert.match(text, /MED-SUM V2\.7\.5/);
  assert.match(text, /memory-reactivation/);
  assert.match(text, /SEMANTIC FIDELITY/);
  assert.match(text, /probabilities/);
  assert.match(text, /translation is required/);
  assert.match(text, /line beginning "## "/);
  assert.match(text, /10 percent.*NONBINDING/);
  assert.match(text, /12,000 characters/);
  assert.doesNotMatch(text, /SELECT FIRST, THEN WRITE|Aim for roughly a quarter|no markdown symbols/);
});

test('MED-SUM 10 preserves machine and source-evidence contract', () => {
  const text = buildDraftPrompt(segments, '10', { generationLocale: 'pt-BR' });
  for (const match of [/UNTRUSTED DATA/, /--- PAGE 37 \(untrusted source text/, /summarySourceSpans/, /summaryEvidence/, /summary/, /questions/, /questionType/, /answer/, /explanation/, /hint/, /sourceSpans/, /modelVersion/, /promptVersion exactly "10"/, /OUTPUT LANGUAGE.*Portuguese \("pt-BR"\)/, /Respond with ONLY a single JSON object/]) {
    assert.match(text, match);
  }
});

test('Legacy versions keep their summary criteria and do not inherit MED-SUM 10', () => {
  const v7 = buildDraftPrompt(segments, '7');
  const v8 = buildDraftPrompt(segments, '8');
  const v9 = buildDraftPrompt(segments, '9');
  for (const t of [v7, v8, v9]) {
    assert.doesNotMatch(t, /MED-SUM V2\.7\.5/);
    assert.match(t, /fidelity outranks brevity/);
  }
  assert.doesNotMatch(v7, /- STRUCTURE:/);
  assert.match(v8, /- STRUCTURE:/);
  assert.match(v9, /- SELECT FIRST, THEN WRITE:/);
  assert.match(v8, /no markdown symbols/); // historical behavior is preserved, not endorsed
});

test('Only the summary-editorial area changes; questions and JSON suffix remain the same', () => {
  const suffix = (v) => v.slice(v.indexOf('- summarySourceSpans lists')).replace(/promptVersion exactly "\d+"/, 'promptVersion exactly "N"');
  assert.equal(suffix(buildDraftPrompt(segments, '10', { generationLocale: 'pt-BR' })), suffix(buildDraftPrompt(segments, '8', { generationLocale: 'pt-BR' })));
});

test('Selected internal default prompt version is 10', () => {
  const service = readFileSync(new URL('../src/services/generated-drafts.js', import.meta.url), 'utf8');
  assert.match(service, /promptVersion = '10'/);
});
