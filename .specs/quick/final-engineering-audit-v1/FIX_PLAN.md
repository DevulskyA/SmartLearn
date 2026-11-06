# SmartLearn — Plano priorizado de correção (pós-auditoria, HEAD 1bee89a)

Não é refactor cosmético, não troca framework, não reescreve código saudável, não cria
arquitetura paralela. Sucesso não é medido por redução de LOC.

---

## P1-1 — Parar de esconder erro em Arquivar/Excluir disciplina — FECHADO

```
STATUS=DONE, commit 59fd4b8
TASK=Substituir os dois `catch { }` vazios em src/app.js (Disciplinas) por tratamento explícito
EVIDENCE=F-02 (AUDIT.md §2) — src/app.js:2351-2353 e 2370-2373
CHANGE=Reusa `.subject-catalog-delete-msg` (já role=alert) existente no card; `catch (error) {
  console.error(...); msg.textContent = "Não foi possível ..."; }`
PROOF=2 e2e novos (e2e/subjects-catalog.spec.js) abortam o PATCH/DELETE real contra servidor real
  e provam a mensagem aparecer e o card não mudar de estado silenciosamente. 16/16 verde no
  cluster de regressão de Disciplinas/Plano (atomic-save.spec.js, smartlearn-plan-flow.spec.js).
```

---

## P1-2 — RETRATADO: não era uma decisão pendente, era falso positivo de auditoria

```
STATUS=F-04_STATUS=FALSE_POSITIVE (ver AUDIT.md §2, seção F-04 corrigida)
```
O item original pedia uma decisão humana sobre uma "lacuna de reforço item-level no Windows"
que a auditoria acreditava existir por `DB.attempts` não existir em `src/db.js` (`LocalDB`).
Antes de qualquer código ser commitado, a leitura de `src-tauri/src/lib.rs:395-448` +
`.specs/STATE.md` §ARCH-01 mostrou que essa premissa é falsa: o Windows real sempre roda com
`REMOTE_MODE=true`, apontando para o MESMO backend (server/src) subido localmente via loopback
— não existe um caminho de persistência alternativo em produção. `src/db.js` nunca é alcançado
pelo app real. **Nenhuma decisão de produto é necessária. Nenhum código foi alterado** (o
trabalho de "paridade" feito antes da correção foi revertido integralmente, `git diff` contra
o commit anterior ficou vazio).

Achado genuíno que sobrou dessa investigação (classificação, não correção — ver AUDIT.md, seção
"INVENTÁRIO — LocalDB/plugin-sql/createBrowserStore"): `src/db.js`'s ramo Tauri-`plugin-sql` é
código morto desde o ARCH-01 (nenhum caminho de execução real, produto ou teste automatizado, o
alcança). Isso não vira tarefa aqui — é observação para uma decisão futura (deletar/documentar
como histórico/reaproveitar), fora do escopo deste plano.

---

## P2-1 — DEBT-002 (app.js) precisa de reavaliação, não de ação imediata

```
TASK=Atualizar .specs/DEBT.md: DEBT-002 está registrada com o tamanho de 2026-09-03 (3219
  linhas); hoje são 6411. Reavaliar prioridade de P3 para P2 no ledger; NÃO extrair código agora.
EVIDENCE=F-01 (AUDIT.md §2)
ROOT_CAUSE=Debt registrada e nunca reavaliada conforme o arquivo cresceu
FILES=.specs/DEBT.md (documentação, não código)
CHANGE=Atualizar métricas na entrada DEBT-002, subir prioridade, registrar que os clusters
  semânticos (Hoje/Materiais/Estudar agora/Plano/Estatísticas/Disciplinas/Prova) já existem como
  costuras naturais (state `let` por feature), citando today-priority.js/tracking-state.js como
  prova de que extração incremental já funcionou antes
WHY_NOW=Documentação, zero risco; mantém a dívida visível e corretamente priorizada
ACCEPTANCE=DEBT-002 reflete o estado real do código
PROOF=Leitura do arquivo atualizado
REGRESSION_SURFACE=Nenhuma (documentação)
DEPENDENCIES=Nenhuma
ESTIMATED_SCOPE=Trivial
DO_NOT_TOUCH=src/app.js em si — nenhum refactor até um sprint dedicado decidir extrair, com
  critério explícito (coesão sobe, acoplamento cai, comportamento idêntico provado, custo futuro
  cai) — exatamente o padrão já usado quando priorities.js/today-priority.js foram extraídos
```

---

## P2-2 — REBAIXADO: NOT_WORTH_FIXING (mesmo raciocínio do F-04)

```
STATUS=F-03 rebaixado em AUDIT.md §2 — um dos lados da duplicação (src/db.js/LocalDB) é código
  morto desde ARCH-01, nunca alcançado pelo produto real. Unificar validação entre um serviço
  vivo e um adapter morto não compra a proteção contra drift prometida (só um lado pode divergir
  de forma observável). Aplicando o mesmo princípio usado para fechar P1-2/F-04: não implementar
  para um caminho que o produto não alcança.
CODE_CHANGE_REQUIRED=NO
```

---

## P2-3 — Fechar o gap de tooling: lint + clippy + audit no CI — FECHADO

```
STATUS=DONE, commit a609eb6
CHANGE=eslint.config.js novo (eqeqeq + no-undef bloqueantes, 0 erros no HEAD; no-unused-vars
  warn-only -- achou lista real de ~20 nomes mortos, não corrigida agora, ver F-06 abaixo).
  cargo clippy --all-targets -- -D warnings no job rust do CI (já limpo, sem calibração
  necessária). npm audit (root + server) no CI -- achou 2 vulnerabilidades reais (nanoid/postcss,
  transitivas do vite, dev-only) e corrigidas via `npm audit fix` antes de tornar o gate
  bloqueante. cargo fmt --check e cargo audit deliberadamente OMITIDOS (fmt = só diff de estilo
  em código Rust já saudável, mesmo raciocínio do Prettier; cargo audit não é subcomando nativo,
  exigiria install próprio no CI, custo real não trivial).
PROOF=npm run lint exit 0 (22 warnings, 0 erros); npm audit limpo nos dois pacotes; cargo clippy
  limpo; testes raiz 401/401; testes servidor 623/623; build limpo; 9 e2e de sanidade verdes
  após o bump de patch do vite (audit fix).
```

### F-06 (novo, achado pelo próprio ESLint) — ~20 nomes mortos reais, não corrigidos agora
```
SEVERITY=P3
STATUS=REGISTRADO, não corrigido (fora de escopo: exigiria editar app.js estruturalmente)
EVIDENCE=`npm run lint` warnings: src/app.js (getDaysBetween, volumeBarWidth, SUBJECT_COLORS,
  sourceMessage, planCurrentSubjectFilter, planCurrentStateFilter, hasData, year/month,
  pluralize), src/analytics.js (weightedAccuracy export não usado internamente, subjectsById),
  src/db.js (mapUsageCount, ensureNamedRows), server/test/reviews.test.js (IdempotencyConflictError,
  pastUnit, unitB), test/learning-units.test.js (callCount), test/performance-thresholds.test.js
  (THRESHOLDS), 2 e2e (unit, before).
WHY_NOT_NOW=São findings reais e de baixo risco individual, mas corrigi-los agora significaria
  editar app.js estruturalmente no meio deste fluxo (F-02→F-04→tooling), o que foi explicitamente
  pedido para não fazer. Ficam rastreados pelo próprio `npm run lint` (warning, não bloqueia CI)
  até um sprint dedicado de limpeza.
```

---

## P3 — somente se trivial

```
Nenhum item P3 identificado nesta auditoria que valha registrar separadamente — os achados
menores (score_percent local, rate-limit.js/routes/auth.js não relidos) são NOT_PROVEN, não
findings, e não geram tarefa: ficam para quando uma mudança futura tocar esses arquivos.
```

---

## Ordem de execução recomendada

1. ~~**P1-1**~~ FECHADO (commit `59fd4b8`)
2. ~~**P1-2**~~ RETRATADO (falso positivo, nenhuma ação necessária)
3. ~~**P2-2**~~ REBAIXADO (NOT_WORTH_FIXING, mesmo raciocínio do P1-2)
4. ~~**P2-3**~~ FECHADO (commit `a609eb6`)
5. **P2-1** (documentação da dívida DEBT-002 — trivial, a qualquer momento) — próximo
6. **F-06** (~20 nomes mortos, achado pelo lint — P3, fora de escopo por ora)

Nenhum destes itens, sozinho ou em conjunto, requer full gate (Sprint 15) — cada um é
pequeno e causalmente isolado, testável no próprio escopo, exatamente como os princípios de
Safe Evolution pedem (§4.5, §4.21).
