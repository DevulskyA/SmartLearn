import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import { auditDraft } from '../src/ai/draft-audit.js';
import { parseModelAudit } from '../src/ai/draft-audit-model.js';
import { AUDIT_MESSAGE_CODES, auditMessageText, msg, resolveMessages } from '../src/ai/audit-messages.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// Slice 1 of the server-text migration: the sentences of an audit finding travel as a stable code + parameters (finding.messages.<slot>)
// AND, unchanged, as the old Portuguese text (generatedClaim / sourceEvidence / repair). The client shows the catalog text for a code it
// knows and the old text otherwise (test/finding-messages.test.js). Here: the server side of that contract.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };

const PT = [
  { pageIndex: 1, text: 'A angiotensina II contrai a arteríola eferente e aumenta a pressão hidrostática glomerular. A aldosterona aumenta a reabsorção de sódio no túbulo coletor. A pressão arterial média normal é de 93 mmHg no adulto. O fluxo plasmático renal é cerca de 625 mL/min e a filtração glomerular é de 125 mL/min. A angiotensina II contrai a arteríola eferente.' },
  { pageIndex: 2, text: 'O hormônio antidiurético aumenta a permeabilidade do ducto coletor à água. A aldosterona atua nas células principais do túbulo coletor. A angiotensina II estimula a secreção de aldosterona e a sede, com efeito sobre a pressão arterial média.' },
  { pageIndex: 3, text: 'O peptídeo natriurético atrial aumenta a excreção de sódio e água pelos rins, reduzindo a pressão arterial média e o volume extracelular.' },
];
const q = (o) => ({ question: 'Qual hormônio contrai a arteríola eferente?', answer: 'A angiotensina II', explanation: 'A angiotensina II contrai a arteríola eferente e aumenta a pressão glomerular.', hint: null, sourceSpans: [{ pageIndex: 1 }], ...o });
const EN = [{ pageIndex: 1, text: [
  'The nephron is the functional unit of the kidney and it is the structure that is responsible for the formation of the urine in the body.',
  'Glomerular filtration occurs only through the endothelium, the basement membrane and the epithelium of the glomerular capillaries in the nephron.',
  'The glomerular filtration rate is about 125 mL/min and the drug is given at 5 mg per dose, which is the amount that is approved for the patient.',
  'Plasma proteins can be filtered when the filtration barrier is damaged, and this is the reason why proteinuria is a sign of glomerular disease.',
].join(' ') }];
const DRAFT_PT_FROM_EN = [
  'O néfron é a unidade funcional do rim e é a estrutura responsável pela formação da urina no corpo humano, como mostra o texto.',
  'A filtração glomerular ocorre sempre pelo endotélio, pela membrana basal e pelo epitélio dos capilares glomerulares no néfron.',
  'A taxa de filtração glomerular é de cerca de 125 mL/min e o fármaco é dado na dose de 5 g, que é a quantidade aprovada para o paciente.',
  'As proteínas plasmáticas são filtradas quando a barreira de filtração está lesada, e por isso a proteinúria é um sinal de doença glomerular.',
].join(' ');

// Drafts that together raise every finding the deterministic audit can write.
const SCENARIOS = [
  [{ summary: 'A farmacocinética de vancomicina mostra dose de 777 mg e pressão de 140 mmHg com eficácia notável em pacientes hospitalizados.', questions: [q({})] }, PT],
  [{ summary: 'A angiotensina contrai.', questions: [q({})] }, PT],
  [{
    summary: 'A angiotensina II contrai a arteríola eferente e aumenta a pressão hidrostática glomerular, enquanto a aldosterona aumenta a reabsorção de sódio no túbulo coletor, conforme o texto.',
    questions: [
      q({ answer: 'C', explanation: null }),
      q({ question: 'A angiotensina II contrai a arteríola eferente?', answer: 'A angiotensina II', explanation: 'Contrai.' }),
      q({ hint: 'É a angiotensina II mesmo', answer: 'A angiotensina II' }),
      q({ question: 'Qual a filtração glomerular?', answer: 'Cerca de 125 mL/min', hint: 'Fica perto de 125 por minuto', explanation: 'A página traz o valor da filtração glomerular normal.' }),
      q({ question: 'Qual a dose recomendada de heparina?', answer: 'Cerca de 8888 unidades', explanation: 'Prescreve-se 8888 unidades por hora ao paciente.' }),
      q({ question: 'Como o paciente com hipertensão resistente é tratado?', answer: 'Com espironolactona associada a diurético tiazídico', explanation: 'Antagonistas mineralocorticoides bloqueiam receptores citoplasmáticos distais.' }),
      q({ question: 'Qual a relação?', answer: 'Porque a angiotensina II contrai a arteríola eferente do rim', explanation: 'A angiotensina II contrai a arteríola eferente do rim.', sourceSpans: [{ pageIndex: 3 }] }),
      q({ question: 'Duplicada?', answer: 'Sim, duplicada mesmo.', explanation: 'Porque foi repetida na lista.' }),
      q({ question: 'Duplicada?', answer: 'Sim, duplicada mesmo.', explanation: 'Porque foi repetida na lista.' }),
      q({ question: 'Cópia?', answer: 'A angiotensina II contrai a arteríola eferente e aumenta a pressão hidrostática glomerular.', explanation: 'Está na fonte, no primeiro parágrafo da página.' }),
    ],
  }, PT],
  [{ summary: 'A angiotensina II contrai a arteríola eferente e aumenta a pressão glomerular.', questions: [] }, [{ pageIndex: 1, text: 'x '.repeat(20000) }, { pageIndex: 2, text: '   ' }, { pageIndex: 3, text: `angiotensina ${'�'.repeat(6)}` }]],
  [{ summary: 'A angiotensina II contrai a arteríola eferente e aumenta a pressão glomerular.', questions: Array.from({ length: 8 }, (_, i) => q({ question: `Pergunta ${i}?` })) }, [{ pageIndex: 1, text: 'angiotensina II contrai a arteríola eferente. ' }]],
  [{ summary: DRAFT_PT_FROM_EN, questions: [] }, EN],
];
const allFindings = () => SCENARIOS.flatMap(([draft, segments]) => auditDraft(structuredClone(draft), { segments }).findings);

test('every finding keeps the three old text fields as non-empty strings (a consumer that only reads text is not affected)', () => {
  const findings = allFindings();
  assert.ok(findings.length > 40);
  for (const f of findings) {
    for (const field of ['generatedClaim', 'sourceEvidence', 'repair']) assert.equal(typeof f[field], 'string', `${f.issue}.${field}`);
    assert.ok(f.sourceEvidence && f.repair, `${f.issue} has evidence and repair text`);
  }
});

test('every sentence the audit writes carries its code and params, and the old text is exactly the text of that code', () => {
  const findings = allFindings();
  const slotField = { claim: 'generatedClaim', evidence: 'sourceEvidence', repair: 'repair' };
  const used = new Set();
  for (const f of findings) {
    for (const [slot, message] of Object.entries(f.messages ?? {})) {
      assert.ok(AUDIT_MESSAGE_CODES.includes(message.code), `${f.issue}.${slot}: ${message.code} is a known code`);
      assert.equal(f[slotField[slot]], auditMessageText(message.code, message.params), `${f.issue}.${slot} reserve text follows its code`);
      used.add(message.code);
    }
    assert.ok(f.messages?.evidence && f.messages?.repair, `${f.issue} carries evidence and repair as codes`);
    assert.deepEqual(JSON.parse(JSON.stringify(f)), f, `${f.issue} survives JSON (params are plain strings and numbers)`);
  }
  assert.deepEqual(AUDIT_MESSAGE_CODES.filter((code) => !used.has(code)), [], 'every code in the table is raised by some finding: no dead code, no finding without a code');
});

test('the lexical findings and the source-text warning carry codes, and the text the draft itself wrote stays plain text', () => {
  const byIssue = (issue) => allFindings().find((f) => f.issue === issue);
  for (const issue of ['SUMMARY_UNSUPPORTED_TERM', 'SUMMARY_OMITS_CENTRAL_CONCEPT', 'QUESTION_UNSUPPORTED_TERM', 'QUESTION_LOW_SOURCE_SUPPORT', 'SOURCE_TEXT_INSUFFICIENT']) {
    const f = byIssue(issue);
    assert.ok(f, issue);
    assert.ok(f.messages.evidence.code.startsWith('EVIDENCE_') && f.messages.repair.code.startsWith('REPAIR_'), issue);
  }
  assert.equal(byIssue('SUMMARY_UNSUPPORTED_TERM').messages.claim, undefined, 'the terms listed are the draft\'s own words, not a sentence of the audit');
  assert.equal(byIssue('SOURCE_TEXT_INSUFFICIENT').messages.claim.code, 'CLAIM_SOURCE_TEXT_STATS');
  const value = byIssue('SUMMARY_UNSUPPORTED_VALUE');
  assert.deepEqual(value.messages.repair, { code: 'REPAIR_SUMMARY_UNSUPPORTED_VALUE', params: { value: '777' } });
  assert.deepEqual(byIssue('UNIT_MISMATCH').messages.repair, { code: 'REPAIR_UNIT_MISMATCH', params: { value: '5', sourceUnit: 'mg', unit: 'g' } });
});

test('compatibility: the reserve text is word for word what audit-rules-8 wrote', () => {
  assert.equal(auditMessageText('REPAIR_SUMMARY_UNSUPPORTED_VALUE', { value: '777' }), 'O valor 777 não aparece na fonte. Use o valor que a fonte traz ou remova a afirmação.');
  assert.equal(auditMessageText('REPAIR_UNIT_MISMATCH', { value: '5', sourceUnit: 'mg', unit: 'g' }), 'A fonte traz 5 em mg, não em g. Use a unidade da fonte.');
  assert.equal(auditMessageText('EVIDENCE_SOURCE_PASSAGE', { page: 2, text: 'Trecho.' }), 'p. 2: Trecho.');
  assert.equal(auditMessageText('EVIDENCE_VOLUME_EXPECTED', { chars: 12345, min: 1, max: 5 }), 'Para o tamanho desta fonte (12.345 caracteres) o esperado é entre 1 e 5 questões.');
  assert.equal(auditMessageText('EVIDENCE_ANSWER_IN_QUESTION', { answer: 'ECA' }), 'A resposta ("ECA") já aparece no enunciado.');
  assert.equal(auditMessageText('EVIDENCE_LOW_SOURCE_SUPPORT', { supported: 1, total: 5 }), 'Só 1 de 5 termos da resposta/explicação aparecem na(s) página(s) citada(s).');
  assert.equal(auditMessageText('EVIDENCE_NO_SOURCE_PASSAGE'), 'Nenhum trecho da fonte trata desse ponto.');
  assert.equal(auditMessageText('REPAIR_SUMMARY_UNSUPPORTED_TERM'), 'Confirme cada termo na fonte. Se for informação complementar, remova ou marque como tal; se for troca de termo, restaure o termo da fonte.');
});

test('resolveMessages: a message object becomes text + code, plain text stays, running it again changes nothing, an unknown code is a programming error', () => {
  const plain = { issue: 'X', severity: 'LOW', scope: 'summary', generatedClaim: 'texto do rascunho', sourceEvidence: 'texto do modelo', repair: 'texto do modelo' };
  assert.deepEqual(resolveMessages(plain), plain, 'nothing to resolve: no messages key is invented');
  const once = resolveMessages({ ...plain, repair: msg('REPAIR_DUPLICATE') });
  assert.deepEqual(once, { ...plain, repair: 'Remova ou reescreva uma das duas.', messages: { repair: { code: 'REPAIR_DUPLICATE', params: {} } } });
  assert.deepEqual(resolveMessages(once), once);
  assert.throws(() => msg('NOT_A_CODE'), /unknown audit message code/);
});

test('the model auditor: a CONTRADICTED finding locates its quote with a coded evidence; the model\'s own wording stays plain text', () => {
  const raw = { findings: [
    { issue: 'ANSWER_CONTRADICTS_SOURCE', severity: 'HIGH', scope: 'summary', verdict: 'CONTRADICTED', generatedClaim: 'c', evidencePage: 2, evidenceQuote: 'O hormônio antidiurético aumenta a permeabilidade do ducto coletor à água', sourceEvidence: 'prosa do modelo', repair: 'ajuste do modelo' },
    { issue: 'CLAIM_NOT_IN_SOURCE', severity: 'MEDIUM', scope: 'summary', verdict: 'NOT_FOUND', generatedClaim: 'c', sourceEvidence: 'prosa do modelo', repair: 'ajuste do modelo' },
  ] };
  const [contradicted, notFound] = parseModelAudit(raw, { questionCount: 1, segments: PT }).findings;
  assert.equal(contradicted.sourceEvidence, 'p. 2: O hormônio antidiurético aumenta a permeabilidade do ducto coletor à água');
  assert.deepEqual(contradicted.messages, { evidence: { code: 'EVIDENCE_SOURCE_PASSAGE', params: { page: 2, text: 'O hormônio antidiurético aumenta a permeabilidade do ducto coletor à água' } } });
  assert.equal(contradicted.repair, 'ajuste do modelo');
  assert.equal(notFound.messages, undefined);
  assert.equal(notFound.sourceEvidence, 'prosa do modelo');
});

test('HTTP: a draft over the real API returns code + params AND the old text; an audit stored by the old rules is returned untouched, without invented codes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-audit-msg-'));
  const sourcesDir = join(dir, 'sources');
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN], sources: { sourcesDir, ...UPLOAD_DEFAULTS } });
  try {
    const email = 'auditmsg@example.com';
    const credentials = { email, password: 'a genuinely long test password 1' };
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: credentials });
    const login = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: credentials });
    const cookie = login.headers['set-cookie'].split(';')[0];
    const csrfToken = JSON.parse((await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } })).body).csrfToken;
    const write = { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken };

    const boundary = 'sl-audit-msg-boundary';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.pdf"\r\nContent-Type: application/pdf\r\n\r\n`, 'utf8'),
      buildFixturePdf(['pagina de teste']),
      Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
    ]);
    const upload = await app.inject({ method: 'POST', url: '/v1/sources', headers: { ...write, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: body });
    const sourceId = JSON.parse(upload.body).source.id;
    await app.inject({ method: 'POST', url: `/v1/sources/${sourceId}/extract`, headers: write });
    const chunk = await app.inject({ method: 'POST', url: `/v1/sources/${sourceId}/proposals`, headers: { ...write, 'content-type': 'application/json' }, payload: {} });
    const proposalId = JSON.parse(chunk.body).proposals[0].id;
    const created = await app.inject({ method: 'POST', url: `/v1/proposals/${proposalId}/drafts`, headers: { ...write, 'content-type': 'application/json' }, payload: {} });
    const draftId = JSON.parse(created.body).draft.id;

    // an edit makes the server screen the text again: a value the source never states
    const edited = await app.inject({ method: 'PATCH', url: `/v1/drafts/${draftId}/summary`, headers: { ...write, 'content-type': 'application/json' }, payload: { summary: 'Resumo de teste com a dose de 777 mg para o paciente.' } });
    assert.equal(edited.statusCode, 200);
    const fetched = JSON.parse((await app.inject({ method: 'GET', url: `/v1/drafts/${draftId}`, headers: { cookie } })).body).draft;
    assert.deepEqual(JSON.parse(edited.body).draft.audit.findings, fetched.audit.findings, 'the edit response and a later read agree');
    const value = fetched.audit.findings.find((f) => f.issue === 'SUMMARY_UNSUPPORTED_VALUE');
    assert.ok(value, 'the invented value is flagged');
    // new contract
    assert.deepEqual(value.messages.repair, { code: 'REPAIR_SUMMARY_UNSUPPORTED_VALUE', params: { value: '777' } });
    assert.deepEqual(value.messages.evidence, { code: 'EVIDENCE_SOURCE_PASSAGE', params: { page: 1, text: 'pagina de teste' } });
    // old contract, from the same payload: a consumer that reads only the text fields
    assert.equal(value.repair, 'O valor 777 não aparece na fonte. Use o valor que a fonte traz ou remova a afirmação.');
    assert.equal(value.sourceEvidence, 'p. 1: pagina de teste');
    assert.equal(value.generatedClaim, 'Resumo de teste com a dose de 777 mg para o paciente.');
    assert.equal(fetched.audit.rulesVersion, 'audit-rules-9');

    // an audit written before this slice has no `messages`: it is returned as it was, and the text is all a client has
    const row = db.prepare('SELECT draft_json FROM generated_drafts WHERE id = ?').get(draftId);
    const content = JSON.parse(row.draft_json);
    content.audit.findings = [{ issue: 'SUMMARY_UNSUPPORTED_VALUE', severity: 'HIGH', scope: 'summary', generatedClaim: 'afirmação antiga', sourceEvidence: 'evidência antiga', repair: 'reparo antigo', source: 'DETERMINISTIC' }];
    content.audit.rulesVersion = 'audit-rules-8';
    db.prepare('UPDATE generated_drafts SET draft_json = ? WHERE id = ?').run(JSON.stringify(content), draftId);
    const old = JSON.parse((await app.inject({ method: 'GET', url: `/v1/drafts/${draftId}`, headers: { cookie } })).body).draft;
    assert.equal(old.auditStale, true);
    assert.equal(old.audit.findings[0].messages, undefined);
    assert.deepEqual([old.audit.findings[0].generatedClaim, old.audit.findings[0].sourceEvidence, old.audit.findings[0].repair], ['afirmação antiga', 'evidência antiga', 'reparo antigo']);

    // the explicit re-audit is what brings the codes to such a draft
    const reaudit = JSON.parse((await app.inject({ method: 'POST', url: `/v1/drafts/${draftId}/reaudit`, headers: write })).body);
    assert.ok(reaudit.draft.audit.findings.every((f) => f.messages?.evidence && f.messages?.repair));
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
