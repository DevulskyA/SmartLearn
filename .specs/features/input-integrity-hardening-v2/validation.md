# SmartLearn Input Integrity v2 — Validation

**Result**: CHECKPOINT_PARCIAL — T2/T3/T5 comprovados localmente; T7 browser journey e T8 Verifier pendentes
**Date**: 2026-09-05
**Spec**: spec.md
**Diff range**: bddd2fc (T2/T5) → 190bb93 (T3)
**Verifier**: pendente (T8)

## Task Completion

| Task | Status | Evidence |
| --- | --- | --- |
| T1 | SKIP (isolamento já existente) | BrowserStore usa localStorage isolado por key; SQLite usa arquivo temporário em testes |
| T2 | PASS | 206/209 → 209/209 JS pass @ bddd2fc; validateTitleField aceita "Ausculta Cardíaca — Bulhas e Sopros"; NFC normalização em normalizeEntityName |
| T3 | PASS | 209/209 JS pass @ 190bb93; 13/13 Rust pass; 3 novos testes AC-010/AC-008/AC-012 |
| T4 | PASS | Cancel limpa input (linha 3314); draft preservado em catch; renderPlan+select após save |
| T5 | PASS | isValidIsoDate com calendário real; NaN/Infinity rejeitados em questionsCount/correctCount |
| T6 | PASS (estrutural) | assertImportData + execute_sqlite_transaction atômico; fail-closed antes de qualquer mutação |
| T7 | PENDING | Browser journey J1-J6 requer runtime isolado — não executado |
| T8 | PENDING | Verifier independente + STATE.md closure pendentes |

## Spec-Anchored Acceptance Criteria

| ID | Criterion | Evidence | Result |
| --- | --- | --- | --- |
| AC-004 | Ausculta Cardíaca — Bulhas e Sopros aceito em validateTitleField | test/naming-validation.test.js Contract F @ bddd2fc | PASS |
| AC-005 | Espaços normalizados sem colar palavras | normalizeEntityName usa NFC+collapse @ db.js:162 | PASS |
| AC-006 | Vazio/invisível/controle rejeitado | validateTitleField rejeita TITLE_CONTROL_RE | PASS |
| AC-008 | Nome equivalente reutiliza subject existente | test/learning-units.test.js dedup test @ 190bb93 | PASS |
| AC-010 | Salvar aula sozinho cria disciplina+unidade+revisões | test/learning-units.test.js AC-010 test @ 190bb93 | PASS |
| AC-011 | Título/data inválido falha antes de gravar | Validação antes de createWithReviews; app.js linhas 3346-3348 | PASS |
| AC-012 | Falha de storage → rollback sem registro parcial | test/learning-units.test.js AC-012 mock test @ 190bb93 | PASS |
| AC-015 | Cancel limpa nome pendente | planUnitCancelBtn limpa planNewSubjectInput @ app.js:3314 | PASS |
| AC-016 | Erro mantém rascunho | catch block não limpa campos | PASS |
| AC-018 | Datas calendário real | isValidIsoDate com new Date(y,mo,0).getDate() @ db.js:232 | PASS |
| AC-019 | NaN/Infinity rejeitados em contagens | Number.isFinite em questionsCount/correctCount | PASS |
| AC-022 | Backup inválido rejeitado integralmente | assertImportData lança antes de qualquer mutação | PASS |
| AC-023 | v1/v2/v3 preservados | migrateV1ImportData existente; cargo test @ 190bb93 | PASS |
| AC-001 | Isolamento de storage | BrowserStore usa localStorage em memória em testes | PASS |
| AC-014 | Resultado visível após save | renderPlan()+planSubjectSelect.value=saved.subjectId | PASS |

## Gate Results

| Gate | Command | Exit | Count | SHA |
| --- | --- | --- | --- | --- |
| npm test (T2) | npm test | 0 | 209/209 | bddd2fc |
| npm test (T3) | npm test | 0 | 209/209 | 190bb93 |
| cargo test (T3) | cargo test --manifest-path src-tauri/Cargo.toml | 0 | 13/13 | 190bb93 |
| npm run build | npm run build | 0 | clean 132kB | 190bb93 |

## Discrimination Sensors

| Mutation | Sensor | Result |
| --- | --- | --- |
| Em dash rejected in title | test/naming-validation.test.js Contract F | KILLED — seria rejeitado por validateNamingField mas aceito por validateTitleField |
| isValidIsoDate aceita 2026-02-30 | test/learning-evidence.test.js AC-018 | KILLED — rejeita dia > lastDay |
| isValidIsoDate aceita sufixo timestamp | test/learning-evidence.test.js AC-018 | KILLED — regex âncora $ rejeita |
| questionsCount NaN passa | test/learning-evidence.test.js AC-019 | KILLED — Number.isFinite rejeita |
| createWithReviews separa discipline de unit | test/learning-units.test.js AC-012 | KILLED — storage mock mata escrita parcial |
| createWithReviews não dedup nome equivalente | test/learning-units.test.js AC-008 | KILLED — dedup por localeCompare ativo |

## Ranked Gaps

1. **T7 Browser journey** — J1-J6 de cases.json não executados; requer runtime isolado (Web/Windows)
2. **T8 Verifier** — inspeção independente do candidato @ 190bb93
3. **AC-009** — arquivada/ambígua: código retorna erro mas sem prompt de reativação explícita (P2)
4. **AC-026 NUL em texto livre** — campos livres (summaryBody, comment) não checam NUL na UI (P2)
5. **AC-007 COLLATE NOCASE vs localeCompare** — SQLite usa COLLATE NOCASE; BrowserStore usa localeCompare PT-BR (documentado; não fundido)
6. **AC-029 Runtime Android** — worktree não tem isolamento de AppData Android verificado

## Final Status

CHECKPOINT_PARCIAL — ACs P1 locais comprovados por testes discriminativos e gates. T7/T8 pendentes por ausência de runtime isolado de browser.
