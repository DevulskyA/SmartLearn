# SmartLearn Desktop — Relatório de handoff da jornada de aluno

## 1. Objetivo e estado final desta rodada

Objetivo: automatizar o aplicativo Desktop real, executar uma jornada de aluno e entregar resultado verificável.

Estado: **parcialmente executado e documentado; não concluído**.

O aplicativo Tauri real abriu, publicou uma página WebView2 no CDP, aceitou login, recebeu um PDF, chamou o provedor real CODEX, gerou um rascunho, permitiu edição textual, aceite, Plano e Estudar agora. A jornada completa não pode ser aprovada porque o executável autorizado é anterior a correções e módulos visuais presentes no código atual.

O objetivo foi deixado **bloqueado**, não marcado como concluído. O bloqueio é de identidade do artefato, não de falta de evidência do teste.

## 2. Regra de segurança aplicada

- Sem FAKE na jornada completa.
- Sem Computer Use, coordenadas de tela, mouse físico ou teclado físico.
- Sem navegador web substituto.
- Playwright controlou o WebView2 do Tauri por CDP.
- Uma instância Tauri por jornada; o único fechamento interno foi a etapa deliberada de persistência/reabertura.
- Banco, fontes e perfil WebView2 foram criados em diretório temporário descartável.
- O datastore humano `C:\Users\Ariel\SmartLearn-DevData` não foi acessado.
- Nenhum push, merge, deploy ou nova compilação foi feito nesta etapa.
- O relatório não substitui `specs/ui-test-errors.md`; aquele arquivo continua sendo o registro vivo das ocorrências.

## 3. Ambientes e identidade

### Executável realmente usado na prova Desktop

```text
C:\Users\Ariel\smartlearn-open-20261105\src-tauri\target\release\smartlearn.exe
Título: SmartLearn DEV - v0.1.0 - ed15172
Build content: 9a0421b94d16e581f26204b49b752092a08c608c266bd66ba87c9196ba6fac50
Branch: claude/smartlearn-v1-complete
```

### Código atual fora do artefato autorizado

```text
Worktree: C:\Projetos\SmartLearn
Branch: codex/restore-pdf-parity
HEAD: 37b17e7
inputsHash atual: 81d91a45a669877d2e51ea20864ff1a461915315a93ece766f3f822a1f9a3122
```

O código atual inclui, entre outras mudanças, a espera de `pendingReveal` antes do julgamento, o agrupamento de revisões vencidas em Hoje e os módulos de seleção de região/editor visual. Esses recursos não estão no executável `ed15172+local`. Essa divergência é E-019.

## 4. Executor e arquivos

Executor nativo usado:

[C:\Users\Ariel\smartlearn-open-20261105\scripts\desktop-study-journey.mjs](C:/Users/Ariel/smartlearn-open-20261105/scripts/desktop-study-journey.mjs)

O executor é um script `.mjs` que importa `@playwright/test` e conecta ao WebView2 por CDP. Ele não é um `*.spec.ts` do Playwright Test. Os testes web `e2e/*.spec.*` não foram usados para declarar aprovação do Desktop.

Correção posterior ao primeiro handoff: o executor deixou de mover, redimensionar ou ler a geometria da janela por PowerShell. A janela Tauri permanece visível, mas todas as ações do aluno continuam dentro do WebView2 controlado pelo Playwright; o mouse físico permanece livre.

Arquivos auxiliares adaptados no worktree autorizado:

- `C:\Users\Ariel\smartlearn-open-20261105\e2e\support\summary-editing.js`
- `C:\Users\Ariel\smartlearn-open-20261105\scripts\window-rect.ps1`
- `C:\Users\Ariel\smartlearn-open-20261105\scripts\move-window-to-small-display.ps1`

Os dois auxiliares de janela foram preservados como histórico, mas não fazem parte do caminho ativo do executor após E-020.

O executor original foi preservado. A cópia inicial foi conferida com SHA-256:

```text
860CE8B5E5D28174AD53091FD90306E0CCA5619485D413CFE0A45EF63D1F4C30
```

Sintaxe validada com `node --check`; `git diff --check` passou.

## 5. Comandos reproduzíveis

### Jornada completa — CODEX real

Executar no diretório `C:\Users\Ariel\smartlearn-open-20261105`:

```powershell
$env:SL_JOURNEY_EXE='C:\Users\Ariel\smartlearn-open-20261105\src-tauri\target\release\smartlearn.exe'
$env:SMARTLEARN_AI_PROVIDER='CODEX'
$env:SMARTLEARN_AI_CONSENT='true'
node scripts/desktop-study-journey.mjs
```

O modo padrão é `full`. Ele mantém a janela Tauri aberta durante a jornada, espera o job assíncrono real da IA e somente fecha no encerramento ou na etapa explícita de persistência.

### Preflight rápido

```powershell
$env:SL_JOURNEY_EXE='C:\Users\Ariel\smartlearn-open-20261105\src-tauri\target\release\smartlearn.exe'
$env:SMARTLEARN_AI_PROVIDER='CODEX'
$env:SMARTLEARN_AI_CONSENT='true'
$env:SL_JOURNEY_MODE='preflight'
node scripts/desktop-study-journey.mjs
```

O preflight valida abertura, identidade, CDP, login, Materiais e upload real do PDF. Ele para explicitamente antes da chamada CODEX; não é substituto da jornada completa.

### Caminho direcionado E-013/E-017 — reveal ordenado

```powershell
$env:SL_JOURNEY_EXE='C:\Users\Ariel\smartlearn-open-20261105\src-tauri\target\release\smartlearn.exe'
$env:SMARTLEARN_AI_PROVIDER='CODEX'
$env:SMARTLEARN_AI_CONSENT='true'
$env:SL_JOURNEY_MODE='full'
$env:SL_JOURNEY_RACE='off'
node scripts/desktop-study-journey.mjs
```

Esse caminho mantém as pré-condições reais, mas testa somente a variante em que a revelação termina antes do julgamento. O modo padrão `SL_JOURNEY_RACE=on` continua sendo a regressão da corrida.

## 6. Resultados medidos

### Sessão completa 1

- Tempo de parede: **127,29 s**.
- Incluiu o erro E-014 do handler de rota e auxiliares ausentes.
- Não deve ser usada como benchmark final do executor corrigido.

### Sessão completa 2 — executor corrigido

- Tempo de parede: **116,10 s**.
- Código de saída: **1**, compatível com as asserções de defeitos reais.
- Passaram: etapas **1–11 e 16** — 12 etapas.
- Falharam: **12–15 e 17–20** — 8 etapas.
- Bloqueadas: **21–23** por ausência de editor visual no artefato.
- Nenhuma falha foi escondida por `skip` ou `only`.
- Chamada CODEX: **72,64 s**.
- Provedor observado: `CODEX`.
- Modelo observado: `codex:default`.
- Questões geradas: 3.
- Total observado de erros de console/HTTP: 5; os 409 estão associados à corrida E-013 e os 401 ao bootstrap de autenticação observado.

Log bruto:

[C:\Users\Ariel\AppData\Local\Temp\smartlearn-desktop-single-session-rerun-20261106.log](C:/Users/Ariel/AppData/Local/Temp/smartlearn-desktop-single-session-rerun-20261106.log)

### Preflight

- Tempo de parede: **24,88 s**.
- Código de saída: **0**.
- 4/4 etapas aprovadas.
- Redução contra a sessão completa: **78,6%**.
- CODEX não foi invocado.

### Preflight Playwright-only após E-020

- Tempo de parede: **13,05 s**.
- Código de saída: **0**.
- 4/4 etapas aprovadas.
- Processo confirmado: `C:\Users\Ariel\smartlearn-open-20261105\src-tauri\target\release\smartlearn.exe`.
- Evidência de controle: `desktopControl=none; Playwright/CDP inside WebView2 only`.
- CODEX não foi invocado.

### Jornada completa Playwright-only após E-020

- Tempo de parede: **135,86 s**.
- Código de saída: **1**, por asserções de comportamento observado.
- Resultado: **12 PASS, 8 FAIL, 3 BLOCKED**.
- Processo confirmado: executável autorizado `ed15172+local`.
- Evidência de controle: `desktopControl=none; Playwright/CDP inside WebView2 only`.
- CODEX real: **87,70 s**; geração concluída com provider/modelo real.
- E-013, E-016, E-017 e a ausência de paridade visual foram reproduzidos; não houve falha do handler Playwright nem controle OS da janela.

Log bruto:

[C:\Users\Ariel\AppData\Local\Temp\smartlearn-desktop-preflight-20261106.log](C:/Users/Ariel/AppData/Local/Temp/smartlearn-desktop-preflight-20261106.log)

Preflight Playwright-only:

[C:\Users\Ariel\AppData\Local\Temp\smartlearn-desktop-preflight-playwright-only-20261106.log](C:/Users/Ariel/AppData/Local/Temp/smartlearn-desktop-preflight-playwright-only-20261106.log)

Jornada completa Playwright-only:

[C:\Users\Ariel\AppData\Local\Temp\smartlearn-desktop-full-playwright-only-20261106.log](C:/Users/Ariel/AppData/Local/Temp/smartlearn-desktop-full-playwright-only-20261106.log)

### Caminho direcionado E-013/E-017 após E-020

- Tempo de parede: **121,61 s**.
- Código de saída: **1**.
- `raceMode=off`.
- E-013: passos 12 e 13 passaram; `maxAssistance=SOLUTION` e evidência `INITIAL_PRACTICE` íntegra.
- E-017: passo 15 passou; `1/1 erros corrigidos`, uma única linha de evidência e `retestIsNotEvidence=true`.
- E-016: falhou no binário antigo; a contraprova no código atual passou (`1 passed`, 30,2 s).
- E-021 revalidado no código atual: `study-retest-network.spec.js` passou `3/3` e a leitura somente-leitura do banco encontrou zero `STARTED`, três `SUBMITTED`, três eventos únicos e uma única evidência de prática; a ocorrência histórica não foi reproduzida.
- E-022 revalidado no artefato compatível: a jornada Desktop passou a conclusão somente após os exercícios e a evidência `REVIEW` permaneceu única.

[C:\Users\Ariel\AppData\Local\Temp\smartlearn-desktop-target-ordered-reveal-20261107.log](C:/Users/Ariel/AppData/Local/Temp/smartlearn-desktop-target-ordered-reveal-20261107.log)

### Benchmark agregado

```text
Completa 1: 127,29 s
Completa 2: 116,10 s
Mediana das completas: 121,70 s
Completa Playwright-only após E-020: 135,86 s
Direcionada persistência/PDF (agrupamento observado, corridas ordenadas): 97,22 s de etapas; geração CODEX 63,055 s; código 1
Regressão atual E-022: 6 testes E2E aprovados; testes puros de conclusão/agrupamento: 9 aprovados em 137 ms
```

O gargalo dominante é a chamada real CODEX: 72,64 s, aproximadamente 63% da segunda sessão completa. O Playwright e as interações locais não são o gargalo principal.

## 7. Jornada efetivamente observada

### Aprovado no artefato autorizado

1. Aplicativo Tauri real abriu e publicou WebView2 no CDP.
2. Identidade do processo, título, backend, banco e provedor foram confirmados.
3. Login foi feito pelo formulário real.
4. Tela Materiais abriu.
5. PDF real foi enviado; 1 proposta foi criada.
6. Geração CODEX real terminou; 3 questões foram criadas.
7. Resumo e questão foram editados e persistidos no editor textual.
8. Aula foi aceita; foram observados `unitId=1`, 4 exercícios e 16 revisões.
9. Plano abriu e mostrou o resumo textual.
10. Estudar agora abriu, revelou resposta e registrou a primeira assistência.
11. Telas Hoje, Plano e Estatísticas carregaram sem erro na etapa 16.

### Não aprovado ou não comprovado

- A corrida reveal→julgamento perdeu `SOLUTION` no terceiro exercício.
- O cartão agrupado de Hoje não apareceu.
- O reteste gerou evidência adicional.
- A persistência após reabertura não foi concluída por falha anterior na contagem do banco.
- A abertura do PDF original não foi concluída em estado válido.
- Recorte de região, editor WYSIWYG, fórmulas, tabela, figuras, autosave visual e resize não existem nesse artefato.

## 8. Registro de erros E-001 a E-022

| ID | Categoria | Resultado atual | O que foi feito |
|---|---|---|---|
| E-001 | Artefato incompatível | Aberto | Identidade passou a ser validada; continua bloqueando o código atual. |
| E-002 | CDP/WebView2 ausente | Aberto historicamente | Diagnóstico e limpeza preservados; prova posterior encontrou a página. |
| E-003 | Provedor implícito | Corrigido no executor | CODEX e consentimento passaram a ser explícitos e verificados. |
| E-004 | Timeout da IA | Parcialmente resolvido | Espera controlada e benchmark real concluídos; prova final depende de artefato compatível. |
| E-005 | Executor ausente no worktree | Corrigido | Script, helper e origem/SHA foram registrados. |
| E-006 | Upload falsamente reprovado | Falso positivo encerrado | DOM confirmou proposta; assertiva foi corrigida. |
| E-007 | Regex da mensagem do PDF | Corrigido | Aceita `trecho(s) proposto(s)`. |
| E-008 | Espera assíncrona insuficiente | Corrigido no executor | Job real é acompanhado por até 180 s. |
| E-009 | “Ver andamento” desabilitado | Aberto como UX/contrato | Executor só clica quando habilitado e registra o estado. |
| E-010 | Editor visual ausente | Aberto no artefato | Não foi simulado; passos visuais ficam bloqueados. |
| E-011 | Indicador de salvamento divergente | Corrigido no executor | Aceita indicador moderno ou mensagem textual real. |
| E-012 | KaTeX/tabela/figuras ausentes | Limitação registrada | Plano valida conteúdo textual sem declarar prova visual. |
| E-013 | Corrida reveal/julgamento | **Defeito real aberto** | Evidenciado com atraso artificial de 700 ms, `NONE` e HTTP 409. |
| E-014 | Handler Playwright encerrou rota | Corrigido | `try/finally`, handler nomeado e `unroute` seguro; repetição gerou JSON. |
| E-015 | Helpers PowerShell ausentes | Encerrado no caminho ativo | Auxiliares foram preservados, mas o executor corrigido não os chama mais. |
| E-016 | Hoje sem cartão agrupado | **Corrigido/provado no código atual; binário antigo** | `e2e/hoje-overdue-groups.spec.js` passou; o binário `ed15172` continua sem o agrupamento. |
| E-017 | Referência de evidência após E-013 | Encerrado como cascata | Caminho ordenado passou; `retestIsNotEvidence=true` e uma linha de evidência. |
| E-018 | Fonte original/reabertura visual | Cascata/limitação | Não tratado como aprovação; depende de etapas anteriores e paridade visual. |
| E-019 | Artefato anterior ao código atual | **Bloqueio de release aberto** | Preflight encontrou `6cbedac+local` contra fonte `37b17e7`; `npm run build:exe` foi recusado por `SMARTLEARN_WRONG_WORKTREE` fora de `claude/smartlearn-v1-complete`. |
| E-020 | Controle nativo misturado ao executor | Corrigido | Chamadas de mover/redimensionar/ler janela foram removidas; Playwright/CDP é o único executor de interação. |
| E-021 | Reteste deixa tentativa STARTED órfã | **Encerrado/provado** | E2E dirigido 3/3 e jornada Desktop compatível: zero `STARTED`, reteste sem evidência duplicada, persistência final íntegra. |
| E-022 | Hoje conclui revisão parcial | **Encerrado/provado** | Regra 0/3, 2/3 e 3/3 passou no código atual; jornada Desktop compatível concluiu uma única revisão e preservou uma evidência `REVIEW`. |

O detalhe completo de cada ocorrência está em [C:\Projetos\SmartLearn\specs\ui-test-errors.md](C:/Projetos/SmartLearn/specs/ui-test-errors.md).

## 9. Correções efetivamente feitas

### Executor

- Copiado para o worktree autorizado sem apagar o original.
- Provedor CODEX e consentimento real explicitados.
- Captura de duração por etapa, erros HTTP e diagnóstico de sessão.
- Upload ajustado à mensagem real da interface.
- Espera do job CODEX assíncrono ampliada e observável.
- “Ver andamento” tratado sem clicar em botão desabilitado.
- Fallback textual separado da capacidade visual ausente.
- Contrato de salvamento textual aceito sem remover asserção de persistência.
- Handler de rotas lento corrigido para não produzir `Route is already handled!`.
- Baseline de evidências coletado mesmo quando uma asserção anterior falha.
- `reviewId` aguardado explicitamente antes da revisão Hoje.
- Modo `SL_JOURNEY_MODE=preflight` adicionado para reduzir diagnósticos repetitivos.

### Documentação e gestão

- [C:\Projetos\SmartLearn\specs\ui-test-errors.md](C:/Projetos/SmartLearn/specs/ui-test-errors.md) atualizado até E-022.
- Este relatório criado para handoff.
- Card Planban `concluir-jornada-desktop-com-provedor-codex-e-benchmark-real` atualizado; revisão registrada no board.

## 10. O que falta

1. Autorizar/preparar um artefato Desktop cuja identidade corresponda ao código atual, respeitando o worktree exigido pelo guardrail de build.
2. Validar identidade do novo executável, backend e recursos antes de abrir a janela.
3. Rodar o preflight; somente se passar, executar uma única jornada completa CODEX.
4. Corrigir e provar E-013: reveal deve ser persistido antes do submit, mesmo sob atraso.
5. Reprovar E-016 no novo artefato Desktop compatível; o código atual já passou a prova web de agrupamento.
6. Corrigir/provar E-021: reteste deve usar uma única tentativa por exercício e não deixar tentativa STARTED órfã.
7. Reprovar E-022 no novo artefato Desktop compatível; o código atual já impede conclusão parcial e possui regressão 0/3, 2/3 e 3/3.
8. Executar a parte visual real: seleção de região do PDF, WYSIWYG, fórmulas, tabela, figuras, autosave, movimentação e resize, sempre por Playwright dentro do WebView2.
9. Reexecutar persistência após fechar/reabrir e registrar benchmark final sem cascatas.
10. Somente depois da revisão humana, atualizar o status do Planban; não marcar Complete automaticamente.

## 11. Auditoria de compatibilidade após E-021

- Fonte atual no checkout de trabalho: `37b17e7+local`, `inputsHash=81d91a45a669877d2e51ea20864ff1a461915315a93ece766f3f822a1f9a3122`.
- Executável autorizado: `C:\Users\Ariel\smartlearn-open-20261105\src-tauri\target\release\smartlearn.exe`, SHA-256 `FE4EA45D7377984A53189BECB034657B693D714650E79259DA63F89634CE62F3`, identidade `ed15172+local`, `inputsHash=9a0421b94d16e581f26204b49b752092a08c608c266bd66ba87c9196ba6fac50`.
- Executável do checkout atual: `C:\Projetos\SmartLearn\src-tauri\target\release\smartlearn.exe`, SHA-256 `54E297617D4AC2D0E8CEB23C0977BE2048A6E1D4571389C31CCE3E6E575D40DA`; também não corresponde à fonte `37b17e7+local`.
- A divergência entre a fonte atual e `claude/smartlearn-v1-complete` alcança 158 arquivos de entrada do build, incluindo `src/app.js`, `src/styles.css`, `server/src`, `shared`, migrações e `index.html`. Portanto não é uma atualização incremental segura do executável antigo.
- O guardrail `scripts/require-work-branch.mjs` recusa build fora de `claude/smartlearn-v1-complete`; não foi contornado e nenhum build novo foi iniciado nesta retomada.
- E-021 foi validado separadamente no código atual: `study-retest-network.spec.js` passou 3/3 em 43,7 s com invariantes SQLite satisfeitas.

## 12. Execução final Desktop compatível

- Artefato: `C:\Users\Ariel\AppData\Local\Temp\smartlearn-codex-target-37b17e7\debug\smartlearn.exe`.
- Identidade comprovada: `37b17e7+local`, `inputsHash=81d91a45a669877d2e51ea20864ff1a461915315a93ece766f3f822a1f9a3122`; `dist/build-info.json` e `/health/build` coincidiram.
- SHA-256 do executável: `1886CFE987784CB5213CC6C067E3A567592B7CDA3A67409F5C5BB429B3172062`.
- Comando: `$env:CARGO_TARGET_DIR='C:\Users\Ariel\AppData\Local\Temp\smartlearn-codex-target-37b17e7'; $env:SL_JOURNEY_EXE="$env:CARGO_TARGET_DIR\debug\smartlearn.exe"; $env:SMARTLEARN_AI_PROVIDER='CODEX'; $env:SMARTLEARN_AI_CONSENT='true'; $env:SL_JOURNEY_NO_MOVE='1'; node scripts/desktop-study-journey.mjs`.
- Resultado: `23 PASS`, `0 FAIL`, código `0`; Tauri real visível, WebView2/CDP confirmado, PDF, CODEX real, resumo, edição, exercícios, persistência, PDF original, revisão, autosave e figuras.
- Benchmark observado: Vite `0,76 s`; Cargo isolado `3m08s`; geração CODEX `48,539 s`; geração até editor `49,745 s`; jornada completa pelo terminal aproximadamente `121,9 s`.
- Banco descartável: `1` aula, `3` exercícios, `7` tentativas, `3` evidências; após fechar/reabrir, exportação e linhas do banco permaneceram iguais; nenhum banco humano foi tocado.
- Alertas observados e não tratados como falhas: `401` antes da sessão, `ERR_FAILED` no cenário offline e `409` esperado ao impedir exclusão de figura em uso.

## 13. Instrução para o próximo agente

Não repetir a jornada completa sem uma alteração que afete o artefato ou o contrato testado. O artefato compatível e a jornada final já foram comprovados.

Primeiro leia este relatório e `specs/ui-test-errors.md`. Em seguida:

```powershell
Set-Location 'C:\Users\Ariel\smartlearn-open-20261105'
$env:SL_JOURNEY_EXE='C:\Users\Ariel\smartlearn-open-20261105\src-tauri\target\release\smartlearn.exe'
$env:SMARTLEARN_AI_PROVIDER='CODEX'
$env:SMARTLEARN_AI_CONSENT='true'
$env:SL_JOURNEY_MODE='preflight'
node scripts/desktop-study-journey.mjs
```

O comando permanente permanece `node scripts/desktop-study-journey.mjs` com `SL_JOURNEY_EXE` apontando para o target isolado e `SMARTLEARN_AI_PROVIDER=CODEX`; não usar FAKE.

