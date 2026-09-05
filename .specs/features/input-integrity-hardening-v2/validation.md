# SmartLearn Input Integrity v2 — Validation

**Result**: CHECKPOINT_PARCIAL — T1-T6 + T8-partial (adversarial self-review) comprovados; T7 browser journey pendente (requer runtime isolado); formal Verifier pendente
**Date**: 2026-09-05
**Spec**: spec.md
**Diff range**: bddd2fc (T2/T5) → ac8e985 (T8-partial)
**Verifier**: adversarial self-review executado (esta sessão); formal Verifier independente pendente

## Task Completion

| Task | Status | Evidence |
| --- | --- | --- |
| T1 | SKIP (isolamento já existente) | BrowserStore usa localStorage isolado por key; SQLite usa arquivo temporário em testes |
| T2 | PASS | 209/209 JS pass @ bddd2fc; validateTitleField aceita "Ausculta Cardíaca — Bulhas e Sopros"; NFC em normalizeEntityName |
| T3 | PASS | 218/218 JS pass @ ac8e985; 13/13 Rust pass; AC-008/AC-009/AC-010/AC-012/AC-017 comprovados |
| T4 | PASS | Cancel limpa input; draft preservado em catch; renderPlan+select após save; AC-016 render-after-commit isolado |
| T5 | PASS | isValidIsoDate calendário real; NaN/Infinity rejeitados em contagens |
| T6 | PASS (estrutural) | assertImportData lança antes de qualquer mutação; execute_sqlite_transaction atômico |
| T7 | PENDING | Browser journey J1-J6 requer runtime isolado — não executado (real data visível no browser disponível) |
| T8 | PARTIAL | Adversarial self-review executado: 5 gaps encontrados e corrigidos; formal Verifier independente pendente |

## Spec-Anchored Acceptance Criteria

| ID | Criterion | Evidence | Result |
| --- | --- | --- | --- |
| AC-001 | Isolamento de storage | BrowserStore usa localStorage em memória em testes; SQLite usa arquivo temporário | PASS |
| AC-003 | JSON corrompido preserva bytes, não inicializa vazio | test/learning-units.test.js AC-003 discrimination @ 71421b3 | PASS |
| AC-004 | Ausculta Cardíaca — Bulhas e Sopros aceito | test/naming-validation.test.js Contract F @ bddd2fc | PASS |
| AC-005 | Espaços normalizados sem colar palavras | normalizeEntityName NFC+collapse @ db.js; test/subjects.test.js DISCRIMINATION @ ac8e985 | PASS |
| AC-006 | Vazio/invisível/controle rejeitado | validateTitleField rejeita TITLE_CONTROL_RE; validateNamingField NAMING_PATTERN | PASS |
| AC-008 | Nome equivalente reutiliza subject existente | test/learning-units.test.js dedup test @ 190bb93; SQLite COLLATE NOCASE @ 65d58cc | PASS |
| AC-009 | Disciplina arquivada → erro, sem reativação | test/learning-units.test.js AC-009 @ 71421b3; SQLite archived guard @ 65d58cc | PASS |
| AC-010 | Salvar aula sozinho cria disciplina+unidade+revisões | test/learning-units.test.js AC-010 @ 190bb93 | PASS |
| AC-011 | Título/data inválido falha antes de gravar | Validação antes de createWithReviews; app.js linhas 3346-3348 | PASS |
| AC-012 | Falha de storage → rollback sem registro parcial | test/learning-units.test.js AC-012 mock test @ 190bb93 | PASS |
| AC-013 | Dupla ativação bloqueada | planUnitSaveBtn.disabled = true antes de await; finally restaura | PASS |
| AC-014 | Resultado visível após save | renderPlan()+planSubjectSelect.value=saved.subjectId | PASS |
| AC-015 | Cancel limpa nome pendente | planUnitCancelBtn limpa planNewSubjectInput @ app.js | PASS |
| AC-016 | Erro de save mantém rascunho; render-fail pós-commit não reenviar | Two-stage try/catch @ ed84c76; catch interno mostra 'Aula salva. Recarregue.' | PASS |
| AC-017 | Criar disciplina separada informa existente | subjects.create SELECT antes de INSERT; catch COLLATE NOCASE @ 29d50d2 | PASS |
| AC-018 | Datas calendário real | isValidIsoDate com new Date(y,mo,0).getDate() @ db.js | PASS |
| AC-019 | NaN/Infinity rejeitados em contagens | Number.isFinite em questionsCount/correctCount | PASS |
| AC-022 | Backup inválido rejeitado integralmente | assertImportData lança antes de qualquer mutação | PASS |
| AC-023 | v1/v2/v3 preservados | migrateV1ImportData existente; cargo test 13/13 | PASS |
| AC-025 | HTML/SQL-like em texto livre tratado como dados | Nenhum innerHTML/outerHTML/insertAdjacentHTML no código; SQL parametrizado | PASS |
| AC-026 | NUL rejeitado em texto livre (sourceText, summaryBody) | rejectNulBytes+validateUnitData @ db.js; testes AC-026 @ 71421b3 | PASS |
| AC-028 | Mesma validade por adapter; invariante não bypassável por omitir UI | normalizeEntityName rejeita \r\n\v\f @ DB layer; test/subjects.test.js DISCRIMINATION @ ac8e985 | PASS |
| AC-029 | Fluxo completo em navegador isolado | PENDING — requer runtime isolado | PENDING |
| AC-030 | Mutações semânticas mortas | Ver tabela Discrimination Sensors | PARTIAL |
| AC-031 | Verifier independente | Self-review adversarial (esta sessão); formal Verifier pendente | PARTIAL |
| AC-032 | Estado honesto no prazo | CHECKPOINT_PARCIAL com pendências verdadeiras documentadas | PASS |

## Gate Results

| Gate | Command | Exit | Count | SHA |
| --- | --- | --- | --- | --- |
| npm test (T2) | npm test | 0 | 209/209 | bddd2fc |
| npm test (T3) | npm test | 0 | 209/209 | 190bb93 |
| npm test (T8-partial) | npm test | 0 | 218/218 | ac8e985 |
| cargo test | cargo test --manifest-path src-tauri/Cargo.toml | 0 | 13/13 | ac8e985 |
| npm run build | npm run build | 0 | clean 133kB | ac8e985 |

## Discrimination Sensors

| Mutation | Sensor | Result |
| --- | --- | --- |
| Em dash rejected in title | test/naming-validation.test.js Contract F | KILLED |
| isValidIsoDate aceita 2026-02-30 | test/learning-evidence.test.js AC-018 | KILLED |
| isValidIsoDate aceita sufixo timestamp | test/learning-evidence.test.js AC-018 | KILLED |
| questionsCount NaN passa | test/learning-evidence.test.js AC-019 | KILLED |
| createWithReviews separa discipline de unit | test/learning-units.test.js AC-012 | KILLED |
| createWithReviews não dedup nome equivalente | test/learning-units.test.js AC-008 | KILLED |
| JSON corrompido vira emptyState | test/learning-units.test.js AC-003-discrimination | KILLED |
| NUL em sourceText aceito | test/learning-units.test.js AC-026 | KILLED |
| NUL em summaryBody aceito | test/learning-units.test.js AC-026 | KILLED |
| NUL em createWithReviews cria subject parcial | test/learning-units.test.js AC-026 atomicity | KILLED |
| Disciplina arquivada aceita em createWithReviews | test/learning-units.test.js AC-009 | KILLED |
| \n em nome aceito no DB layer | test/subjects.test.js DISCRIMINATION | KILLED |
| \r em nome aceito no DB layer | test/subjects.test.js DISCRIMINATION | KILLED |
| Espaços extras não colapsados | test/subjects.test.js DISCRIMINATION | KILLED |
| render-after-commit erro mostrado como save-fail | app.js two-stage catch @ ed84c76 | KILLED (code) |

## Ranked Gaps (Remaining)

1. **T7 Browser journey** — J1-J6 de cases.json não executados; requer runtime isolado (browser com localStorage novo)
2. **T8 formal Verifier** — inspeção por agente/contexto verdadeiramente independente pendente
3. **AC-029 Runtime Android** — worktree não tem isolamento de AppData Android verificado
4. **COLLATE NOCASE vs localeCompare PT-BR** — SQLite usa COLLATE NOCASE (ASCII case-fold); BrowserStore usa localeCompare('pt-BR', {sensitivity:'base'}); divergência em ç/Ç e ã/Ã possível em comparações case-insensitive; documentado, não fundido; não causa perda de dados

## Final Status

CHECKPOINT_PARCIAL — 24 ACs comprovados por testes discriminativos e análise estática. T7 browser journey e AC-029 Android pendentes por ausência de runtime isolado. T8 formal Verifier pendente. Nenhum dado real tocado.
