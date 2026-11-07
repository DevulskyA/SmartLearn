# SmartLearn — plano de teste ponta a ponta e relatório de aderência (2026-11-07)

Escopo: planejar como provar o produto de ponta a ponta, cruzando o plano com a filosofia do projeto, o código e a memória, e listar o que bate e o que não bate. Este documento é análise e plano. Nenhum código de produto foi alterado para produzi-lo.

Classes de evidência usadas: **(A)** fato observado nesta sessão (arquivo, grep, execução), **(B)** inferência provada, **(C)** hipótese ou lacuna.

## 1. Fontes consultadas

- `.specs/governance/SMARTLEARN_PRODUCT_CONSTITUTION_V1.md` (seções 6, 40, 62, 63, 70, 71, 80–82, 96–97)
- `.specs/governance/02_SMARTLEARN_QUALITY_STANDARD_V1.md` (integral)
- `CODEMAP.md`, `CLAUDE.md`, `.specs/STATE.md` (marcos e portões), `specs/SMARTLEARN_REGRESSOES_E_VERIFICACAO.md`, `specs/ui-test-errors.md` (cabeçalhos), `specs/ui-fast-pilot.plan.md`
- Memória: blockers antes do PR, registro de defeitos VALID-4, plataformas fixas, retomada de 07/11
- Código: `.github/workflows/ci.yml`, `playwright.config.js`, `server/src/routes/*.js`, inventário de `e2e/`, `server/test/`, `test/`
- Execuções desta sessão: `npm test` raiz 949/949; servidor 1230/1230; E2E completo 441 passados, 0 falhas, 2 ignorados; jornada Desktop com Codex real 23/23 (HEAD `3575715`)

Não lidos nesta análise (limite declarado): seções 7–39 e 41–61 da Constituição em detalhe, `spec.md` das features e os 16 portões humanos um a um.

## 2. O que a filosofia exige que o teste prove

O critério do projeto não é "testes verdes". A Constituição (§80–82) diz que uma feature termina quando a experiência funciona de ponta a ponta, e o Padrão de Qualidade exige comportamento idempotente, seguro sob concorrência, retries, reloads e falhas parciais, e histórico reconstruível. Disso saem cinco perguntas que o plano precisa responder com prova:

1. O aluno consegue percorrer a jornada de prova de 12 passos (§81) sem dead end (§40) e sem meta-trabalho (§39)?
2. Cada gravação sobrevive a retry, corrida, reload e queda sem duplicar nem perder dado (Padrão de Qualidade, "Excelência funcional")?
3. Os invariantes I-01..I-23 (§96) continuam verdadeiros, em especial I-04 (IA só propõe), I-05 (fonte ≠ derivado), I-06, I-07, I-08 (sem evidência ≠ zero), I-17 (16 revisões)?
4. Isso vale no artefato que o aluno realmente abre (Desktop/WebView2), não só no navegador de teste?
5. O que não é automatizável (qualidade pedagógica e fidelidade médica, I-19/I-20, portões humanos) está declarado como NÃO PROVADO, sem ser maquiado por teste verde (§71)?

## 3. Pirâmide atual (A)

| Camada | O que existe | Última execução | Custo |
|---|---|---|---|
| L0 estático | `lint`, `test:inventory`, `codemap.test`, `context:check` | lint OK nesta sessão | ~3 min o lint completo |
| L1 unidade/contrato raiz | 99 arquivos em `test/` | 949/949 | 40 s |
| L1 servidor (SQLite real) | 138 arquivos em `server/test/` | 1230/1230 | 123 s |
| L1 Rust | 49 `#[test]` em `src-tauri/src` | não executado hoje; CI roda em job próprio no Linux | n/d |
| L2 E2E web (Chromium) | 95 specs, ~441 testes | 441/0/2 em 894 s | suites: smoke 62 s, summary 269 s, materials 238 s |
| L3 Desktop real (WebView2 + Tauri + backend local) | `scripts/desktop-study-journey.mjs`, 23 passos | 23/23 hoje, Codex real, geração 70 s | poucos minutos + build debug 3,5 min |
| L4 qualidade real do modelo | `realmodel-codex.spec`, canário `realpdf-canary`, prompt-lab | canário v8×v10 NOT_PROVEN (12/10) | exige autorização por uso |
| L5 julgamento humano | portões HG-01..HG-13 (STATE.md) | abertos | humano |

## 4. Plano proposto de teste ponta a ponta

Princípio: uma prova por risco, na camada mais barata que a falsifica; o Desktop real roda uma vez por lote, nunca por correção.

**Gate de alteração (a cada mudança):** `eslint` dos arquivos tocados → teste dirigido (unidade ou servidor) → `node scripts/e2e.mjs --changed`. Meta: menos de 3 min.

**Gate de lote (antes de commit coeso):** `npm test` raiz + `npm --prefix server test` + suite E2E da área (smoke, summary ou materials). Meta: menos de 10 min.

**Gate de marco (antes de declarar estável):** E2E completo (shards como no CI) + `cargo test` + uma jornada Desktop com build do HEAD exato. Registrar duração por passo e comparar com baseline.

**Jornada de prova de 12 passos (§81), uma coluna por passo:**

| # | Passo | Prova hoje | Lacuna |
|---|---|---|---|
| 1 | Enviar material real | `large-pdf`, `source-proposals`, jornada passo 4, canário | PDF real só em 1 teste de canário |
| 2 | Virar unidades | `unit-kind`, `outline-units`, `source-proposals` | cobertura de PDFs reais variados (capítulo inteiro) |
| 3 | Conteúdo de estudo utilizável | `draft-acceptance`, `content-quality-flow`, auditoria determinística | utilidade e fidelidade médica não são automatizáveis (L5) |
| 4 | Corrigir/assumir autoria | `lesson-editor`, `summary-visual-editor`, `author-why` | nenhuma relevante |
| 5 | Questões adequadas | `question-flag`, `draft-audit-questions` | qualidade pedagógica só humana |
| 6 | Começar rápido | `study-now-flow`, `plan-study-now`, jornada | sem teste que meça tempo até o primeiro valor (§7) |
| 7 | Resultado vira evidência sem retrabalho | `attempts`, `study-evidence-failure`, `study-retest-network` (E-021 agora coberto) | classe E-021 em outros endpoints (ver N3) |
| 8 | Erros úteis | `exercise-attempt-review`, `hoje-block-retest` | nenhuma relevante |
| 9 | Revisões aparecem sozinhas | `review-obligations*`, `smartlearn-plan-flow`, `hoje-*`, `review-completion-rule` (0/3, 2/3, 3/3) | nenhuma relevante |
| 10–11 | Forças, fraquezas, evolução | `stats-*`, `analytics*`, `longitudinal-trend` | honestidade estatística coberta; valor percebido é humano |
| 12 | Próxima ação | `today-primary-action`, `priorities-hoje` | sem varredura sistemática de dead end em todas as telas |

**Novas camadas a criar (ver tarefas):**

- **Guarda sistêmica de idempotência:** um teste que enumera as rotas `POST` e exige `operationKey` ou justificativa registrada de idempotência natural. Isso aplica a regra "mesma classe de erro duas vezes = guarda em código".
- **Varredura de dead end:** um E2E que visita cada tela e exige uma ação seguinte visível (§40), com dados realistas.
- **Medição de tempo até o primeiro valor** (§7) como número registrado, não como limite rígido.
- **Baseline da jornada Desktop** com duração por passo, sob a regra "todo teste tem tempo medido".

## 5. O que bate

| # | Fato (classe A) | Contra o quê |
|---|---|---|
| B1 | Rota `POST /generation-jobs/:id/cancel` existe (`server/src/routes/generation-jobs.js:56`), `unit-kind.js` trata `FRONT_MATTER`, `source-scope.test.js` e `generated-drafts.js` tratam o escopo de páginas | defeitos P0 do VALID-4 (SL-JOB-03, SL-PDF-02, SL-PDF-04) têm contraparte no código |
| B2 | `deleteCascade` não existe mais em `src/` nem em `server/src/` | blocker 3 de 2026-09-04 (hard-delete de disciplina) |
| B3 | `shared/review-schedule.js` e `test/review-schedule.test.js` existem e citam 16 | I-17 |
| B4 | Testes de "sem evidência" em `analytics*`, `longitudinal-trend`, `persistence-adapter-contract` | I-08 |
| B5 | CI roda lint, inventário, unidade, servidor, build, E2E em 3 shards, job de UI protegida e job Rust | Padrão de Qualidade: regressão automática |
| B6 | E-021 corrigido com teste discriminante e mutação provada; jornada Desktop real 23/23 no HEAD `3575715` | regressões 3.3, 3.6, 3.7 do documento de regressões |
| B7 | Jornada isolada em diretório temporário, `humanDevDatastoreTouched=false` | memória "dados isolados" |

## 6. O que não bate

| # | Divergência | Evidência | Classe | Severidade |
|---|---|---|---|---|
| N1 | Memória "Plataformas fixas" diz WEB+ANDROID+WINDOWS e que PASS em uma não prova outra. Não existe teste Android (`e2e/` sem Android; nenhum job no CI). WebView2/Windows só é provado pela jornada manual, fora do CI. A Constituição I-18 diz que o Desktop é o produto e §71 diz que o Companion não está completo. | `ls e2e`, `ci.yml`, memória, Constituição | A | Média. É conflito de autoridade: classificar, não harmonizar (§97). |
| N2 | A regra "todo teste tem tempo medido" não vale para a jornada Desktop: só há um número histórico em documento (~121,9 s) sem baseline gravado. Os baselines E2E atuais estão contaminados pela máquina ocupada (full 895 s contra 702 s anterior). | `specs/SMARTLEARN_REGRESSOES_E_VERIFICACAO.md` §5, `e2e/.duration-baseline.json` | A | Média |
| N3 | Classe E-021 (criar sem chave lógica) permanece possível em rotas criadoras sem `operationKey`: `POST /learning-evidence`, `/exams`, `/exams/:id/submit`, `/subjects`, `/generation-jobs`, `/proposals/:id/drafts`, `/drafts/:id/accept`, `/imports/:id/commit`, `/sources`, `/learning-units/:unitId/exercises`. Hoje usam `operationKey` apenas `attempts`, `learning-units`, `reviews`, `sources` (aberturas), `visual-assets`. Algumas podem ser idempotentes por estado; isso não foi verificado. | grep de `app.post(` e `operationKey` em `server/src` | A para a lista; C para o risco real | Média a alta. Verificar com sondas concorrentes. |
| N4 | Qualidade real da IA e fidelidade médica: NOT_PROVEN. Canário v10 não passou; 16 portões humanos abertos. Um E2E verde não pode ser apresentado como prova (I-19, I-20, §71). | `.specs/STATE.md`, memória | A | Informativa. Precisa de decisão humana, não de teste. |
| N5 | `CODEMAP.md` diz que o E2E completo leva "≈ 8 min"; a medição de hoje foi 894 s (~15 min), anterior 702 s. Documento desatualizado e sem baseline limpo. | `CODEMAP.md`, execução | A | Baixa |
| N6 | O guardrail de build exige a branch `claude/smartlearn-v1-complete`, mas todo o trabalho recente está em `codex/restore-pdf-parity`. `npm run build` foi bloqueado hoje (`SMARTLEARN_WRONG_WORKTREE`); a jornada só funcionou porque o `dist` existente era recente. Risco de testar artefato velho sem perceber. | saída do build, `scripts/require-work-branch.mjs` | A | Média. Decisão do dono. |
| N7 | Não há varredura sistemática de dead end (§40), de zero meta-trabalho (§39) nem medida de tempo até o primeiro valor (§7). Existem testes pontuais. | inventário de specs | C (ausência não provada em todos os specs) | Média |
| N8 | Jornada Desktop registrou 5 `console.error` "401 Unauthorized" (passos 1, 2, 22, 23). Causa não investigada. | `ACHADOS-PARCIAIS.md`, OBS-J1 | A para a ocorrência; C para a causa | Baixa |
| N9 | REG-01: o último executável aberto pelo dono (`last-launch.json`) é o build antigo de 05/11 (`ed15172`), sem E-021 e sem os temas atuais. Explica prováveis "regressões" relatadas, mas só o dono pode confirmar. | `~/SmartLearn-DevData/last-launch.json` | A para o arquivo; C para a causa | Alta para a percepção do dono |
| N10 | Contagem de classes: o relatório de regressões lista UI-02, UI-03 e BUILD-01 como "observados" sem causa; continuam não reproduzidos nesta sessão. | relatório de regressões §4 | A | Baixa |

### Atribuição parcial do +20% do `full@3w` (702 s em 03/11 → 842 s; nova rodada com relatório JSON: 813 s)

- A rodada de 813 s confirma que 842 s é reproduzível (diferença de 3,5%).
- `e2e/accessibility.spec.js` soma 266 s de tempo de teste, o maior arquivo. No commit da baseline antiga (`4044b25`) o laço de temas tinha 4 entradas (`paper`, `sepia`, `night`, `contrast`); hoje tem 12, desde o commit `75ced8d` (04/11). Cada tema roda um axe de 15 a 42 s. Os 8 temas a mais custam cerca de 177 s de tempo de teste, ou algo como 60 s de relógio com 3 workers (classe B: inferência por contagem, não medida).
- Isso explica algo como 40% da diferença. Os cerca de 80 s restantes não foram atribuídos (candidatos: `draft-autosave.spec.js` com 183 s, `summary-visual-editor`, 7 testes novos). Não há duração por spec de 03/11 para fechar a conta.
- Conclusão: o aumento é majoritariamente cobertura nova e desejada (temas WCAG), não lentidão do produto. Não é regressão.

### Resultado das sondas de N3 (2026-11-07, `server/test/creator-routes-concurrency.test.js`)

Duas chamadas simultâneas idênticas, banco descartável: `POST /subjects` seguro (200 e 409, 1 linha); `POST /exams` seguro (201 e 200, retoma, 1 exame); `POST /learning-units/:id/exercises` DUPLICA (201 e 201, 2 linhas); `POST /learning-evidence` EXTERNAL DUPLICA (201 e 201, 2 linhas). O caminho INITIAL_PRACTICE da evidência é protegido no cliente por `attemptIds` (`ATTEMPT_IN_OTHER_EVIDENCE`). Os dois casos que duplicam estão como testes `todo` (esperam o mesmo `operationKey` = 1 linha) e passam a verdes quando as rotas aceitarem a chave. Rotas com fixtures (`/generation-jobs`, `/proposals/:id/drafts`, `/drafts/:id/accept`, `/imports/:id/commit`, `/sources`) ainda não sondadas.

## 7. Limites desta análise

- Não executei `cargo test`, nem sondas de concorrência nas rotas do N3, nem axe de acessibilidade além do que o E2E completo já rodou.
- A cobertura de acessibilidade (zoom, reduced motion) não foi auditada; só sei que `axe` aparece em 7 specs.
- A relação "teste X cobre invariante Y" vem de nomes de arquivo e greps, não da leitura de cada teste. Onde importa, a tarefa de correção começa lendo o teste.

## 8. Tarefas de correção geradas (cartões Planban)

Ordenadas por valor de prova por custo. Todas pequenas e reversíveis; nenhuma altera código de produto sem teste discriminante antes.

1. **Sondas de concorrência nas rotas criadoras (N3):** duplicata simultânea por rota; classificar cada uma como idempotente por estado, corrigir só as que duplicam.
2. **Guarda sistêmica de idempotência (N3):** teste que enumera `app.post(` e exige `operationKey` ou justificativa registrada.
3. **Baseline da jornada Desktop (N2):** gravar duração por passo e total num arquivo versionado; desvio vira alerta.
4. **Re-medir baselines E2E em máquina limpa (N2, N5):** corrigir `CODEMAP.md` com o número medido.
5. **Varredura de dead end e tempo até o primeiro valor (N7).**
6. **Investigar os 401 da jornada (N8):** reproduzir, classificar sonda esperada ou defeito.
7. **Decisão do dono: plataformas e Android (N1)** e **branch do guardrail (N6)** e **executável aberto (N9)** — no cartão de decisões já existente.
8. **Rodar `cargo test` no marco seguinte e registrar (N1).**
