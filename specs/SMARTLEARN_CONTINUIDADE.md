# SmartLearn — continuidade técnica

**Escopo deste documento:** fotografia verificável do repositório em 2026-11-07 para outro agente retomar o trabalho. Este arquivo é um handoff técnico; não substitui Git, código, testes nem os documentos canônicos.

## 1. Estado atual

### Fatos comprovados

- Repositório: `C:\Projetos\SmartLearn`.
- Branch atual: `codex/restore-pdf-parity`.
- HEAD: `37b17e7779c19bef2edb16032ec61c131821e164` (`fix(ui): restore readable theme semantic colors`).
- Remoto: `https://github.com/DevulskyA/SmartLearn.git`.
- A branch atual não foi observada nos heads remotos. Heads relevantes observados: `main=0b6da3e`, `claude/smartlearn-v1-complete=ed15172` e `codex/fix-desktop-study-journey=d11255f`.
- O worktree `C:\Users\Ariel\smartlearn-open-20261105` é separado, está associado a `claude/smartlearn-v1-complete` e HEAD `ed151727...`; não é a versão atual deste documento.
- O worktree atual está sujo. Há alterações em testes, executor Desktop, configuração, Cargo e documentação, além de arquivos não rastreados. Não descartar, limpar, resetar ou assumir que qualquer alteração seja desta investigação.
- O estado canônico de retomada continua em `.specs/EXECUTION.md`, `.specs/STATE.md`, `.specs/ARTIFACTS.md`, Git e código. `.specs/STATE.md` descreve uma política histórica que ainda nomeia `claude/smartlearn-v1-complete`; isso não vence o Git atual.

### Histórico relevante

- `37b17e7`: cores semânticas do tema.
- `6733e1b`: aceitação da capitalização do rótulo de revisão no E2E.
- `95e7a97`: autorização de migrações revisadas do datastore Desktop.
- `ed17c14`: uso de um único caminho local de aplicação.
- `6cbedac`: revisão do provedor Codex no empacotamento Desktop.

## 2. Mapa técnico

### Aplicação e runtime

- `src/app.js`: orquestração principal da interface, estudo, geração, revisão, exercícios, tentativas e persistência.
- `src/api-client.js`: cliente HTTP dos endpoints `/v1`.
- `src/remote-store.js`: implementação de armazenamento remoto; `start()` em torno de `296-301` envia apenas `competencyId`/`reviewTaskId`, enquanto `submit()` em torno de `309-313` aceita `operationKey`.
- `src/db.js`: camada local legada.
- `src/offline-store.js`: fila/recuperação offline.
- `src/lesson-view-model.js`, `src/lesson-editor-ui.js`: modelo e edição do rascunho.
- `src/materials-ui.js`, `src/draft-review-ui.js`, `src/generation-jobs-ui.js`, `src/auth-ui.js`: materiais, revisão, jobs de geração e autenticação.
- `shared/review-schedule.js` e módulos de locale/importação: regras de revisão e suporte compartilhado.

### Backend e dados

- `server/src/main.js`, `server/src/app.js`: inicialização e composição do servidor local.
- `server/src/routes/` e `server/src/services/`: API e regras de negócio.
- `server/src/services/attempts.js`: `start()` em torno de `63-103` insere tentativa `STARTED`; `submit()` em torno de `150-218` já usa idempotência.
- `server/src/services/idempotency.js`: hash canônico, verificação e registro de operações; o registro deve ocorrer na mesma transação.
- Migrações e SQLite ficam no servidor; o banco humano DEV está fora do repositório e é protegido por `.specs/ARTIFACTS.md`.
- PDF, extração, geração e consentimento são implementados no backend/serviços de IA e consumidos pelo frontend por `/v1`.

### Tauri/WebView2

- `src-tauri/tauri.conf.json:7`: `frontendDist=../dist`.
- `src-tauri/tauri.conf.json:28-32`: empacota `server-runtime`, `shared`, `dist-runtime` e `node-runtime`.
- `src-tauri/src/lib.rs:253-272`: resolução dos recursos standalone; há testes de runtime próximos de `791`, `824` e `879`.
- `scripts/package-standalone.mjs`: prepara servidor, migrações, dependências, `shared`, `dist` e runtime Node.
- `scripts/build-identity.mjs:31,50`: calcula `inputsHash` e identidade de commit/dirty/channel.
- `scripts/require-work-branch.mjs:10,53-56`: guardrail de build que exige `claude/smartlearn-v1-complete` e emite `SMARTLEARN_WRONG_WORKTREE` fora dela.

### Executor Desktop

- `scripts/desktop-study-journey.mjs`: usa Playwright (`:21`) e `chromium.connectOverCDP` (`:148`) no WebView2 do Tauri.
- Usa banco, diretório de fontes, cabeça de build, consentimento CODEX e perfil WebView temporários (`:50-63`); não usa o banco humano.
- `SL_JOURNEY_NO_MOVE=1` (`:112-116`) mantém o mouse físico livre.
- `waitForGenerationJob()` (`:216-234`) observa `/v1/generation-jobs?proposalId`, estado, fase e `lastActivityAt`; o limite de segurança é cinco minutos, mas a conclusão é orientada por estado.
- `step()` (`:263`) registra passo, resultado, DOM/API e eventual evidência de tela. A última jornada não produziu screenshots (`screenshots=null`).
- O fluxo atual contém 23 passos, cobrindo importação de PDF, recorte, geração, revisão, exercícios, estudo, reteste, configurações e persistência.

## 3. Evidências de testes existentes

### Jornada Desktop — fato histórico comprovado

Comando usado anteriormente, no worktree atual, sem mouse físico:

```powershell
Set-Location C:\Projetos\SmartLearn
$env:CARGO_TARGET_DIR='C:\Users\Ariel\AppData\Local\Temp\smartlearn-codex-target-37b17e7'
$env:SL_JOURNEY_EXE="$env:CARGO_TARGET_DIR\debug\smartlearn.exe"
$env:SMARTLEARN_AI_PROVIDER='CODEX'
$env:SMARTLEARN_AI_CONSENT='true'
$env:SL_JOURNEY_NO_MOVE='1'
node scripts/desktop-study-journey.mjs
```

Resultado observado: **23 PASS, 0 FAIL, código 0**, aproximadamente 121,9 s; geração CODEX 48,539 s. O título foi `SmartLearn DEV - v0.1.0 - 37b17e7`, `/health/ready` respondeu 200, o provedor foi CODEX e o conteúdo empacotado foi `81d91a45a669`.

Foram observados: PDF importado; uma proposta; três questões; edição e persistência do resumo; revisão 3; aula aceita com três exercícios e 16 revisões; tentativas de estudo submetidas; reteste; persistência após fechar/reabrir; 7 tentativas, 3 evidências, 3 exercícios e 1 unidade. Alertas 401, erro offline e 409 de figura em uso foram esperados no roteiro.

Artefato histórico usado: `C:\Users\Ariel\AppData\Local\Temp\smartlearn-codex-target-37b17e7\debug\smartlearn.exe`.

- SHA-256: `1886CFE987784CB5213CC6C067E3A567592B7CDA3A67409F5C5BB429B3172062`.
- Identidade: `37b17e7+local`.
- `inputsHash`: `81d91a45a669`.

Esses valores são evidência histórica do artefato, não autorização para reconstruí-lo agora.

### E-021 — reteste e idempotência

**Comprovado:** `e2e/study-retest-network.spec.js` foi executado com:

```powershell
npx playwright test e2e/study-retest-network.spec.js --workers=1 --retries=0 --reporter=line --forbid-only
```

Resultado: `3 passed (43.7s)`. A inspeção read-only do SQLite encontrou zero tentativa `STARTED`, duas tentativas iniciais e uma de redo, três eventos de aprendizagem, uma evidência `INITIAL_PRACTICE`, e o par `INCORRECT`/`CORRECT` do exercício errado sem vincular o redo à evidência original.

**Cobertura ainda não comprovada:** duas chamadas simultâneas de `start()` e repetição após perda da resposta de rede de `start()`. O teste atual intercepta a perda em `submit()` (`e2e/study-retest-network.spec.js:150+`), não em `start()`.

**Risco técnico confirmado por inspeção:** `ensureAttemptStarted()` em `src/app.js:5605` não mantém Promise em andamento; `DB.attempts.start` é chamado após a checagem do dataset. `recordStudyNowReveal()` está em `src/app.js:4335`; `judgeStudyNow` em `:4354`. O servidor `attempts.start()` não consulta nem registra chave idempotente, embora `submit()` já tenha esse mecanismo. Portanto, o caminho sequencial de reteste passou, mas a proteção contra corrida/replay de criação permanece hipótese de defeito até teste dirigido.

### Outros itens

- E-013, E-016 e E-022 foram tratados como aprovados na baseline anterior e não foram repetidos nesta documentação. Preservar a evidência existente em `specs/ui-test-errors.md` e nos relatórios relacionados.
- O primeiro executor Desktop falhou no passo 5 por esperar 30 s por `.lesson-editor` enquanto a geração ainda avançava. A correção do executor passou a observar estado real do job; isso é defeito histórico do harness (E-024), não defeito confirmado do produto.
- Os relatórios existentes incluem `specs/ui-test-errors.md`, `specs/desktop-journey-handoff-report.md` e `specs/ui-fast-pilot.result.md`. Eles são evidência histórica e devem ser consultados antes de alterar qualquer conclusão.

## 4. Pendências e riscos

1. **E-021 residual — criação idempotente:** ainda falta provar concorrência e replay de `start()` após resposta perdida. A causa provável está na ausência de chave estável e de deduplicação em `attempts.start()`; é hipótese até reproduzir.
2. **Frontend concorrente:** avaliar Promise compartilhada por tentativa lógica em `ensureAttemptStarted()`; não criar uma Promise global que misture tentativas genuinamente novas.
3. **Servidor:** reutilizar o mecanismo de idempotência existente de `idempotency.js`, com chave estável por tentativa lógica e transação atômica. Não copiar a lógica de `submit()` sem verificar o contrato de dados.
4. **Identidade de build:** o guardrail exige outra branch que não é a branch atual. Qualquer novo executável requer primeiro autorização/procedimento documentado e verificação de commit, `inputsHash` e recursos. Não contornar o guardrail silenciosamente.
5. **Cobertura visual:** a jornada comprovou interação no WebView2, mas não gerou screenshots. Se a aceitação exigir prova visual, fazer uma execução visual específica depois das correções focadas; não confundir isso com a prova automatizada já obtida.
6. **Dados humanos:** nunca apontar testes ao banco DEV real, ao PDF protegido original ou a migrações destrutivas; usar cópias temporárias conforme `.specs/ARTIFACTS.md`.

## 5. Decisões a preservar

- `main` é somente leitura para agentes; não fazer push, merge, deploy, rebase ou reset destrutivo.
- Não usar Computer Use, mouse físico ou navegador visual como executor do teste; Desktop deve ser Tauri real + Playwright/CDP no WebView2.
- Uma única jornada final é suficiente para benchmark após testes focados passarem; não repetir chamadas CODEX caras em cada correção lógica.
- Diferenciar fato comprovado, histórico e hipótese. Uma resposta HTTP 200 ou um build não prova a jornada real.
- Reutilizar o watchdog orientado a transições de estado; não substituir progresso real por `sleep` ou timeout arbitrário.
- Preservar alterações sujas e arquivos não rastreados até classificação explícita; não limpar o worktree para “organizar”.

## 6. Próxima sequência recomendada

1. Ler este arquivo e conferir `git status`, HEAD e `scripts/desktop-study-journey.mjs`; não repetir a jornada Desktop ainda.
2. Criar/ajustar teste dirigido de E-021 para: (a) duas criações simultâneas da mesma chave lógica; (b) criação no servidor seguida de resposta perdida e retry; (c) reteste genuíno com chave diferente; (d) tentativa legitimamente interrompida.
3. Reproduzir e inspecionar o banco após cada cenário. Critério: uma linha para a tentativa lógica repetida, nenhuma tentativa órfã, reteste novo separado e tentativa interrompida preservada.
4. Aplicar a menor correção: Promise compartilhada no frontend somente por chave lógica e idempotência atômica no servidor, aproveitando `server/src/services/idempotency.js`.
5. Executar apenas `e2e/study-retest-network.spec.js` e os testes dirigidos. Registrar código de saída, duração e consultas SQLite. Não executar CODEX nesta etapa.
6. Se os testes focados passarem, validar a identidade do executável existente. Só gerar novo artefato se o executável não corresponder ao código; respeitar o guardrail de branch e reaproveitar cache.
7. Fazer uma única jornada Desktop final com CODEX real e registrar duração por etapa, duração total, transições do job, identidade do build e falhas. Atualizar os relatórios existentes sem duplicar tarefas.

## 7. Comandos essenciais para retomada

```powershell
Set-Location C:\Projetos\SmartLearn
git status --short
git branch --show-current
git rev-parse HEAD
git worktree list
npm run context:resume
npx playwright test e2e/study-retest-network.spec.js --list
npx playwright test e2e/study-retest-network.spec.js --workers=1 --retries=0 --reporter=line --forbid-only
```

Para a jornada Desktop, só depois dos testes focados e da verificação do artefato:

```powershell
Set-Location C:\Projetos\SmartLearn
$env:SMARTLEARN_AI_PROVIDER='CODEX'
$env:SMARTLEARN_AI_CONSENT='true'
$env:SL_JOURNEY_NO_MOVE='1'
node scripts/desktop-study-journey.mjs
```

## 8. Prompt curto de retomada

> Leia `C:\Projetos\SmartLearn\specs\SMARTLEARN_CONTINUIDADE.md` e os arquivos canônicos nele citados. Trabalhe no worktree atual, preserve alterações e não repita suítes aprovadas. Conclua o E-021 residual com testes de concorrência e replay de `start()`, usando SQLite para distinguir duplicação de interrupção legítima. Corrija somente a causa comprovada, valide os testes focados, confira identidade do executável respeitando o guardrail de build e então execute uma única jornada Tauri/WebView2 via Playwright/CDP com CODEX real. Registre evidências e benchmark; não use cloud, Computer Use, banco humano, push, merge, deploy ou reset destrutivo.

## 9. Limites desta fotografia

Este levantamento não executou build, não modificou o produto, não repetiu testes aprovados e não consultou cloud/Planban. As memórias usadas foram apenas as memórias locais do Codex; elas serviram como contexto e não substituem as evidências do repositório. A fonte de verdade para a próxima execução é Git + código + testes + `.specs/`.
