# SmartLearn — regressões e plano de verificação

Documento independente do relatório de continuidade. Seu objetivo é informar ao próximo agente **o que foi alterado durante as tentativas anteriores**, onde essas alterações vivem, quais regressões foram observadas e como verificar cada região sem repetir trabalho desnecessário.

## 1. Como este levantamento foi feito

Foram cruzados:

- o estado atual do Git em `C:\Projetos\SmartLearn`;
- os arquivos modificados/não rastreados do worktree;
- os relatórios em `specs/` e `.specs/`;
- as conversas locais do Codex/ChatGPT relacionadas a `SmartLearn`, `Playwright`, `Desktop` e `E-021`.

Não foi usado cloud externo. Conversas e relatórios são evidência histórica; Git e código atual são a autoridade para saber o que realmente permanece.

## 2. Regra de atribuição

**Confirmado como alteração da frente de testes:** arquivos `e2e/`, `scripts/desktop-study-journey.mjs`, `playwright.config.js`, `package.json`, `e2e/support/progress-watchdog.js`, `test/progress-watchdog.test.js`, `e2e/ui-fast-pilot.spec.js` e relatórios de `specs/`.

**Alterado no worktree, mas atribuição não comprovada nesta fotografia:** `.gitignore`, `.specs/LESSONS.md`, `conductor/tracks/hardening-roadmap-v1/plan.md`, `server/test/ai-consent-secrets.test.js`, `src-tauri/Cargo.toml` e remoções em `.claude/skills/tlc-spec-driven/`. Não reverter nem assumir autoria sem comparar o diff e o histórico da conversa que fez a alteração.

**Não tratar como regressão automaticamente:** arquivos não rastreados podem ser artefatos de sessões anteriores. Primeiro classificar; depois testar.

## 3. Alterações e regiões a verificar

### 3.1 Executor Desktop e espera de geração

Arquivo: `scripts/desktop-study-journey.mjs`

Regiões principais:

- imports e inicialização Playwright, aproximadamente `:21` e `:148` (`chromium.connectOverCDP`);
- ambiente isolado de teste, banco/fontes/perfil WebView/provedor/consentimento, `:50-63`;
- proteção do mouse físico, `SL_JOURNEY_NO_MOVE`, `:112-116`;
- espera orientada por estado, `waitForGenerationJob()`, `:216-234`;
- registro de etapas e evidências, `step()`, `:263`;
- sequência de 23 passos da jornada.

Regressão observada: o executor anterior esperava 30 segundos por `.lesson-editor` e falhava enquanto a geração ainda progredia. Isso foi classificado como defeito do harness, não do produto. A correção passou a observar estado/fase/`lastActivityAt` do job. Verificar que a espera termina em `SUCCEEDED/FINISHED`, tolera progresso legítimo e denuncia ausência real de transição; não trocar por `sleep` fixo.

Verificação obrigatória:

1. job rápido;
2. job lento com transições legítimas;
3. job sem mudança de estado, com diagnóstico de último estado, fase e evidência.

### 3.2 Playwright web e descoberta de testes

Arquivos:

- `playwright.config.js` — configuração de projetos, modo headless e diretórios de resultado;
- `package.json` — scripts/dependências do executor;
- `e2e/ui-fast-pilot.spec.js` — piloto UI-FAST;
- `e2e/seed.spec.ts` — fixture/semente não rastreada;
- `e2e/hoje-block-retest.spec.js` — Hoje/bloqueio/reteste;
- `e2e/review-completion-rule.spec.js` — regra de conclusão de revisão;
- `e2e/study-retest-network.spec.js` — retry/reteste/idempotência;
- `e2e/support/progress-watchdog.js` e `test/progress-watchdog.test.js` — watchdog.

Regressão histórica: o primeiro teste visível foi executado pelo navegador/interface do Codex e houve relato de mouse físico. Isso não é prova de Playwright. A execução correta posterior usou comandos de terminal, Playwright/CDP e `SL_JOURNEY_NO_MOVE=1`. O próximo agente deve provar o executor pelo comando, saída, código de retorno e operações `locator`/`getByRole`, sem Computer Use.

Verificação obrigatória:

- `npx playwright test <arquivo> --list` deve descobrir testes;
- execução com `--workers=1 --retries=0 --reporter=line --forbid-only`;
- nenhum `test.skip`, `only` ou filtro usado para ocultar falha;
- código de saída coerente com a saída;
- watchdog testado unitariamente e no fluxo real.

### 3.3 E-021 — criação e submissão de tentativas

Arquivos e regiões:

- `src/app.js:4335` — `recordStudyNowReveal()`;
- `src/app.js:4354` — `judgeStudyNow`;
- `src/app.js:5605` — `ensureAttemptStarted()`;
- `src/app.js:5631` — `flushPendingAttempt`;
- `src/app.js:5684` — `pendingReviewReveals`;
- `src/remote-store.js:296-301` — `start()` sem `operationKey`;
- `src/remote-store.js:309-313` — `submit()` com `operationKey`;
- `server/src/services/attempts.js:63-103` — `start()` insere `STARTED`;
- `server/src/services/attempts.js:150-218` — `submit()` já usa idempotência;
- `server/src/services/idempotency.js` — hash/check/record;
- `e2e/study-retest-network.spec.js:150+` — perda simulada no `submit`, não no `start`.

Regressão/risco confirmado por inspeção: `ensureAttemptStarted()` não compartilha Promise em andamento e o `start()` do servidor não demonstra deduplicação por chave lógica. O teste histórico passou para reteste sequencial e retry de `submit`, mas ainda não prova duas criações simultâneas nem retry após a resposta de `start` se perder.

Verificação obrigatória:

1. duas chamadas simultâneas para a mesma tentativa lógica → uma linha no banco;
2. servidor cria, resposta é perdida, cliente repete → mesma tentativa retornada;
3. reteste genuinamente novo → nova linha própria;
4. tentativa interrompida legitimamente → preservada, não classificada como órfã;
5. submissão final única e evidência sem duplicação.

Critério: consultar SQLite após cada cenário e comparar IDs, estados, eventos, evidências e chaves de operação. Só depois de reproduzir o defeito implementar Promise compartilhada por chave lógica no frontend e idempotência transacional no servidor.

### 3.4 E-022 — conclusão de revisão e exercícios

Região funcional: lógica de conclusão em `src/app.js` e telas/fluxo cobertos por `e2e/review-completion-rule.spec.js`.

Regressão observada historicamente: “Revisão feita” foi marcada depois de apenas 2 de 3 exercícios. O teste de regressão deve cobrir 0/3, 2/3 e 3/3, incluindo persistência e retorno à tela Hoje. Não declarar E-022 resolvido apenas por uma execução de 3/3.

### 3.5 E-016 — cartão Hoje

Arquivo de teste: `e2e/hoje-block-retest.spec.js`.

Regressão observada historicamente: o cartão de Hoje não reaparecia/atualizava como esperado após o ciclo de estudo. Revalidar somente após a lógica de conclusão, separando falha de conclusão de falha de atualização da lista Hoje. Registrar a transição de estado que explica o resultado.

### 3.6 PDF, resumo, editor e persistência

Regiões do produto:

- `src/materials-ui.js` — importação/seleção de material;
- `src/generation-jobs-ui.js` — acompanhamento da geração;
- `src/draft-review-ui.js` e `src/lesson-editor-ui.js` — revisão e edição;
- `src/lesson-view-model.js` — estado do rascunho;
- `server` — PDF, propostas, resumo, perguntas e persistência;
- `src-tauri/tauri.conf.json:7,28-32` e `src-tauri/src/lib.rs:253-272` — recursos empacotados/runtime.

Regressões que já apareceram durante jornadas: tela sem carregar, botão “ver andamento” sem funcionar, geração aparentemente travada e necessidade de confirmar persistência após fechar/reabrir. A jornada Desktop posterior observou geração CODEX com transições, editor, PDF, persistência e figura em uso, mas esses resultados são históricos e devem ser rechecados se houver alteração posterior nesses módulos.

Verificação: PDF abre no WebView2, seleção permanece, geração muda de estado, resumo/perguntas editados persistem, fechamento/reabertura conserva o mesmo conjunto de entidades e erro 409 de figura em uso é tratado como regra esperada.

### 3.7 Tauri, build e identidade

Arquivos:

- `scripts/require-work-branch.mjs:10,53-56` — guardrail que exige `claude/smartlearn-v1-complete`;
- `scripts/build-identity.mjs:31,50` — `inputsHash` e identidade;
- `scripts/package-standalone.mjs` — empacotamento;
- `src-tauri/Cargo.toml` — alteração local não atribuída com segurança;
- `src-tauri/tauri.conf.json` e `src-tauri/src/lib.rs` — recursos/runtime.

Risco: compilar em outra branch/worktree pode gerar executável incompatível ou recompilação fria. Não contornar o guardrail. Antes de novo build, verificar commit, dirty state, `build-info`, `inputsHash` e recursos. O executável histórico `37b17e7+local` passou na jornada, mas não é prova automática de compatibilidade futura.

### 3.8 Autenticação, consentimento e dados

Arquivo alterado no worktree: `server/test/ai-consent-secrets.test.js`.

Verificar que qualquer facilitação para testes não remove autenticação/consentimento do produto e não expõe segredos. Testes devem usar banco, fontes e perfil temporários; nunca o banco DEV humano descrito em `.specs/ARTIFACTS.md`.

## 4. Matriz de regressões

| ID | Sintoma/regressão | Estado | Teste de confirmação |
|---|---|---|---|
| E-013 | etapa/fluxo de geração ou revisão com resultado inválido | baseline histórica aprovada | teste focado existente; só repetir se código afetado |
| E-016 | cartão Hoje não reaparece/atualiza | revalidar após E-022 | `e2e/hoje-block-retest.spec.js` |
| E-021 | tentativa duplicada em corrida/retry de `start` | não comprovado; risco forte | teste simultâneo + resposta perdida + SQLite |
| E-022 | revisão concluída antes de 3/3 exercícios | correção histórica; proteger | `e2e/review-completion-rule.spec.js`, cenários 0/3, 2/3, 3/3 |
| E-024 | executor falhava enquanto a geração ainda progredia | corrigido no harness, preservar | watchdog rápido/lento/travado |
| UI-01 | teste anterior controlou interface visual/mouse | comprovado historicamente | somente Playwright/CDP via terminal |
| UI-02 | “ver andamento”/geração parecia travada | observado em jornadas anteriores | estados do job + logs de progresso real |
| UI-03 | tela Desktop não carregava em executor incompatível | histórico de infraestrutura | Tauri real, `/health/ready`, título e CDP |
| BUILD-01 | executável/worktree incompatível e build frio | risco de infraestrutura | identidade + guardrail + recursos |

IDs sem causa comprovada devem permanecer como sintomas/riscos, não como defeitos corrigidos.

## 5. Bateria que o próximo agente deve executar

### Fase A — leitura e classificação

1. Ler este documento, `specs/SMARTLEARN_CONTINUIDADE.md`, `CLAUDE.md`, `CODEMAP.md` e `.specs/EXECUTION.md`.
2. Conferir `git status`, branch, HEAD, worktrees e diffs.
3. Classificar cada arquivo modificado como necessário, histórico ou preexistente. Não limpar o worktree.

### Fase B — regressões focadas, sem CODEX

1. E-021: concorrência/replay de `start`, SQLite e idempotência.
2. E-022: 0/3, 2/3, 3/3 e persistência.
3. E-016: atualização do Hoje após conclusão.
4. Watchdog: rápido, lento com progresso e travado.
5. PDF/editor/persistência apenas nos módulos tocados por correções.

### Fase C — contraprova Desktop única

Depois das fases focadas:

1. confirmar executável e identidade;
2. abrir Tauri visível;
3. conectar Playwright/CDP ao WebView2, mantendo mouse livre;
4. executar uma jornada com CODEX real;
5. registrar duração por etapa, transições, entidades no banco, falhas e evidências;
6. comparar com a baseline histórica de 23 PASS e aproximadamente 121,9 s, sem tratar esse número como limite rígido.

## 6. Comandos exigidos para provar a execução

```powershell
Set-Location C:\Projetos\SmartLearn
npx playwright --version
npx playwright test e2e/study-retest-network.spec.js --list
npx playwright test e2e/study-retest-network.spec.js --workers=1 --retries=0 --reporter=line --forbid-only
npx playwright test e2e/review-completion-rule.spec.js --workers=1 --retries=0 --reporter=line --forbid-only
npx playwright test e2e/hoje-block-retest.spec.js --workers=1 --retries=0 --reporter=line --forbid-only
```

Para o Desktop, usar `node scripts/desktop-study-journey.mjs` somente depois da validação focada, com `SMARTLEARN_AI_PROVIDER=CODEX`, `SMARTLEARN_AI_CONSENT=true` e `SL_JOURNEY_NO_MOVE=1`. Não usar `--headed`, Computer Use, coordenadas, navegador web substituto, `FAKE` ou banco humano.

## 7. Entrega esperada do próximo agente

O próximo agente deve devolver uma tabela por ID com: arquivo/região, causa, teste, saída real, duração, código de retorno, estado (corrigido/não reproduzido/pendente) e evidência SQLite ou WebView2. Deve separar regressões do produto, regressões do executor e bloqueios de build. Nenhum item deve ser marcado como corrigido apenas porque a tela carregou ou porque um processo iniciou.

### Prompt de retomada

> Leia `C:\Projetos\SmartLearn\specs\SMARTLEARN_REGRESSOES_E_VERIFICACAO.md`. Faça uma auditoria de regressão, não uma nova investigação geral. Preserve o worktree. Classifique as alterações por arquivo/região. Execute primeiro E-021 (corrida/retry de `start` com SQLite), depois E-022, E-016 e o watchdog. Só após as provas focadas faça uma única jornada Tauri/WebView2 com Playwright/CDP e CODEX real. Registre causas e evidências. Não use cloud, Computer Use, mouse físico, `FAKE`, banco humano, build desnecessário, push, merge ou deploy.
