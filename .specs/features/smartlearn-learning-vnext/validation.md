# validation.md — SmartLearn Learning vNext (Domain Redesign v3)

**Feature:** smartlearn-learning-vnext
**Data:** 2026-09-03
**Executor:** Claude Sonnet 4.6 (sessão domain-redesign v3)
**Ambiente:** BrowserStore (Vite dev, http://localhost:5173)

---

## Resultado geral: PASS

> **Nota de escopo:** Validação executada em modo BrowserStore (localStorage, sem SQLite).
> Funcionalidades validadas: UI, cadastro, exercícios, revisão, fila Tela Hoje, export/import roundtrip.
> NÃO validado em Tauri (requer `tauri dev` com runtime nativo):
> - Migrations SQL (`ALTER TABLE RENAME`, `ADD COLUMN ... DEFAULT 'MANUAL'`, ensureColumns)
> - `PRAGMA foreign_keys = ON` e `ON DELETE CASCADE` em SQLite real
> - Importação de backup via dialog nativo (Tauri fs/dialog APIs)
>
> Para validação completa em SQLite: executar `npm run tauri dev` e repetir UAT FINAL.

---

## Testes Automatizados

**Comando:** `node --test test/*.test.js`
**Resultado:** **44 PASS, 0 FAIL**

Suites:
- `test/learning-units.test.js`: 9 testes (create/title/summaryBody, schemaVersion 2, fail-closed import, roundtrip, no-seeds)
- `test/exercises.test.js`: 13 testes (create/getAll/delete/update/cascade/provenance validation/export roundtrip/ordering/non-array guard)
- `test/stats.test.js`: 4 testes (unitId, learningUnits array, subjects vazio, all done)
- `test/review-schedule.test.js`: 4 testes (16 revisões, datas ISO, ordem crescente, data inválida)
- `test/review-score.test.js`: 6 testes (score cálculo, nulos, zero questões)
- `test/scheduler.test.js`: 4 testes (LEGACY algorithm, SCHEDULE_OFFSETS, tasks=generateReviewDates, unknown throws)
- `test/study-records.test.js`: DELETED (substituído por learning-units.test.js)

---

## UAT FINAL — Fisiologia/Guyton Scenario

### Cenário 1: Criar disciplina → cadastrar learning_unit → exercício → 16 revisões

**Passos executados:**
1. Cadastro → "+ Nova disciplina" → "Fisiologia" → Adicionar ✓
2. Fonte: "Guyton & Hall, cap. 1" / Conteúdo: "Débito cardíaco e regulação"
3. Salvo → "Estudo salvo. 16 revisões criadas." ✓
4. Exercícios: Q "Qual é a lei de Frank-Starling?" / R "Mais estiramento → mais força de contração"
5. "Exercício adicionado." ✓

**Verificação BrowserStore:**
- 1 subject (Fisiologia) ✓
- 2 learning units com campo `title` (não `content`) ✓
- 32 review_tasks (16 por unidade) ✓
- 1 exercise com provenance: "MANUAL" ✓

**Resultado: PASS**

---

### Cenário 2: Revisão com cálculo automático

**Passos executados:**
1. Criado estudo "Lei de Frank-Starling" com studyDate = 2026-09-02 (ontem)
2. Tela Hoje: R1 "Lei de Frank-Starling" apareceu com "Vence hoje" ✓
3. "Ver desempenho" expandiu com campos Questões/Acertos/Aproveitamento ✓
4. "Revisão feita" marcado → badge "Concluída" → "Feitas hoje 1" → "Tudo em dia!" ✓

**Resultado: PASS**

---

### Cenário 3: Reload — persistência

1. F5 (reload) → estado preservado: "Feitas hoje 1", "Concluída" badge, "Revisão feita" checked ✓

**Resultado: PASS**

---

### Cenário 4: Export/Import roundtrip

1. Configurações → Backup → "Exportar backup" → "Backup exportado com sucesso." ✓
2. Roundtrip JS: `DB.exportAll()` → `DB.importAll(data)` → verificação
   - schemaVersion: 2 ✓
   - learningUnits: 2, titles corretos ✓
   - exercise provenance: "MANUAL" preservado ✓

**Resultado: PASS**

---

## Discriminação Sensor

Mutações validadas pela suite automatizada:
1. `validateProvenance` ausente → `create sem provenance lança erro` e `create com provenance inválido lança erro` matam ✓
2. `Array.isArray(x) ? x : []` → `importAll com exercises como não-array` mata ✓
3. `questionText vazio` → `create com questionText vazio lança erro` mata ✓
4. `schemaVersion !== SCHEMA_VERSION` → `importAll com schemaVersion incorreto` e `sem schemaVersion` matam ✓
5. `unitId` vs `studyRecordId` FK → `exercises.getAll retorna apenas da unidade especificada` mata ✓

**Sensor: PASS**

---

## Pendente (requer ambiente Tauri)

- Migrations SQL em banco real com dados legados (`study_records` → `learning_units`, `content` → `title`)
- `ALTER TABLE ADD COLUMN provenance ... DEFAULT 'MANUAL'` em SQLite existente
- `ON DELETE CASCADE` efetivo com `PRAGMA foreign_keys = ON`
- Import/export via dialog nativo do sistema operacional
- TLC_INSTALLATION_MISMATCH: incompatibilidade detectada entre `@tauri-apps/plugin-sql` versão instalada e esperada (pendente registro formal em issue)

---

## Build

```
vite build — ✓ built in 222ms — 0 warnings, 0 errors
```
