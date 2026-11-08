# Lote 1: triagem, versão do app aberto e auditoria do fluxo principal (2026-11-08)

HEAD `ab75fe0` (código idêntico a `c393210`), branch `codex/restore-pdf-parity`, sem push. Nenhum cartão foi alterado e nenhum código de produto foi tocado. Tudo abaixo é leitura de Git, arquivos, atalhos e evidências já registradas; o que não foi verificado está marcado.

## 1. Triagem: contradições e reclassificação por evidência

Base: `TRIAGEM-PB.md` (66 cartões, agrupados por palavra-chave, então o grupo vale menos que o texto da próxima ação). A contagem de 67 do revisor não foi reconciliada: não achei qual cartão é o 67º (NÃO VERIFICADO). Os IDs abaixo são os do Planban.

Classes: ENTREGUE-REVISÃO (código e prova existem, falta o dono), TÉCNICO (trabalho restante), DONO (decisão), DUPLICADO, INSUFICIENTE.

| ID | Classe | Evidência | Próxima ação |
|---|---|---|---|
| `regress-o-recuperar-temas-i18n-e-contraste-completo` | ENTREGUE-REVISÃO (o texto "recuperar" está desatualizado) | `src/theme.js` `THEME_OPTIONS` = 24 (auto + 23); `src/i18n/locales` existe; axe 28/28 (`8611b86`); contraste aritmético em `test/theme-contrast.test.js` | Revisão visual do dono; reescrever o título para refletir "validar" |
| `regress-o-restaurar-o-editor-visual-e-imagens` | ENTREGUE-REVISÃO | Jornada nativa passos 21 e 23 (fórmulas, tabela, 2 figuras, arrastar e redimensionar, autosave) 23/23 em `e3b91b7` | Dono usa o editor; defeito vira cartão novo |
| `regress-o-restaurar-a-rea-de-pdf-e-o-fluxo-de-importa-o` | ENTREGUE-REVISÃO | Passos 4, 5 e 19 (PDF fixture, proposta, geração CODEX real, PDF original servido) | Idem; falta PDF real longo (ver 3.2) |
| `paridade-recuperar-pdf-editor-com-imagens-temas-e-i18n` | DUPLICADO dos três acima | Mesmo escopo, mesma evidência | Arquivar após decisão do dono |
| `navega-o-corrigir-menus-e-telas-que-n-o-abrem` | ENTREGUE-REVISÃO | `scripts/desktop-nav-n7.mjs` 6/6 (`da1d852`); matriz a 390/1280 já em evidência | Dono confirma o aceite e decide Complete |
| `estabiliza-o-triagem-das-regress-es-c-digo-sem-perda-reproduzir-no-execut-vel` e `ESTABILIZAÇÃO — Auditoria de regressões … matriz UI/BUILD` | TÉCNICO RESOLVIDO pelo diagnóstico da seção 2 | REG-01 confirmado: o app aberto não é o do HEAD | Dono escolhe a solução do launcher (seção 2) |
| `valida-o-comprovar-o-desktop-completo-antes-de-empacotar` | ENTREGUE-REVISÃO parcial | Jornada 23/23 com dados descartáveis; faltam as verificações do dono (leitor de tela, Android, banco real) | Dono |
| `concluir-jornada-desktop-com-provedor-codex-e-benchmark-real` | ENTREGUE-REVISÃO | `e3b91b7`, baseline 147,7 s; N8 (401) registra a URL de cada 401 e a varredura N7 nativa não teve 401 após o login | Dono confirma Complete |
| `registrar-o-baseline-visual-das-telas-antes-da-recupera-o` | ENTREGUE-REVISÃO + DONO | Baseline 390/1280; V-01 com proposta isolada (`c393210`) | Dono aprova ou adia V-01 |
| `release-n-o-empacotar-antes-da-paridade-comprovada` e `reconstruir-artefato-desktop-com-identidade-atual` | DONO (bloqueados pelo guardrail do launcher) | Seção 2: `expectedBranch` fixo | Dono diz a branch |
| `inicializa-o-abrir-o-aplicativo-sem-console-node-ou-npm-vis-veis` | INSUFICIENTE | O atalho "Oficial" abre o `.exe` direto; o atalho DEV chama PowerShell. Se aparece console NÃO foi medido | Técnico: medir a abertura pelos dois atalhos |
| `dados-recuperar-...`, `dados-preservar-e-migrar-...`, `migra-es-do-banco-real-...` | DONO (banco humano) | Nada foi aberto ou alterado no banco humano | Dono autoriza backup e migrações 035+ |
| `arquitetura-retomar-o-desktop-nativo-sem-node-no-runtime` | DONO (direção de produto) | Sem prova de necessidade; o backend Node atual é o provado | Dono decide ou arquiva |
| `ia-confirmar-o-codex-configurado-e-o-resumo-real` | TÉCNICO PARCIAL | O Codex real rodou no passo 5 da jornada; qualidade do resumo segue NOT_PROVEN (`project_content_quality`) | T-F4-01 com o dono |
| `teste-ponta-a-ponta-correcoes-do-relatorio-de-aderencia`, N2, N3, N5, N7, N8 | ENTREGUE-REVISÃO | Commits `ea3d70e`, `cdef1a3`, `7f2877f`, `5a9fa7f`, `a6047f9`, `d54ad03` | Dono |
| Demais cartões de decisão e limpeza (branches, PRs, PRODUCT.md, "Apagar base local") | DONO | Texto de cada próxima ação em `TRIAGEM-PB.md` | Dono |

Regra aplicada: nenhum cartão foi dado como resolvido só pelo resumo; cada "entregue" aponta o commit ou o passo da jornada que o prova.

## 2. Diagnóstico: qual aplicativo está sendo aberto

Fatos (leitura de arquivos e atalhos):

| Ponto de entrada | Aponta para | Idade e identidade |
|---|---|---|
| Atalho "SmartLearn Oficial" (06/11 00:37) | `C:\Projetos\SmartLearn\src-tauri\target\release\smartlearn.exe` | `.exe` de release de 06/11 05:26; há 29 commits desde 05:26 (os de hoje, 07/11, não estão nele). Identidade interna NÃO verificada |
| Atalho "SmartLearn DEV" (03/10) | `...\.claude\worktrees\smartlearn-v1-complete\scripts\launch-desktop-dev.ps1` | A pasta existe mas está VAZIA: o atalho está quebrado e não abre nada |
| `~/SmartLearn-DevData/last-launch.json` | `C:\Users\Ariel\smartlearn-open-20261105\src-tauri\target\debug\smartlearn.exe`, branch `claude/smartlearn-v1-complete`, head `ed15172`, 05/11 01:47 | `ed15172` é de 16/10 e está 536 commits atrás do HEAD atual (é ancestral) |
| `.exe` de debug do HEAD (jornada) | `C:\Projetos\SmartLearn-journey-target\debug\smartlearn.exe` (07/11 20:48) | É o que a jornada e o N7 testam; conteúdo do frontend `b23dbf19…` = o do HEAD |
| `launch-desktop-dev.ps1` (a única entrada humana de DEV) | `$expectedBranch = 'claude/smartlearn-v1-complete'` fixo | Recusa abrir em qualquer outra branch: com o trabalho em `codex/restore-pdf-parity` ele não abre nada |

Conclusão: o último app que você abriu pelo launcher foi o `smartlearn-open-20261105` em `ed15172` (16/10), antes de praticamente todas as correções; o "Oficial" é um release de 06/11 sem as correções de 07/11. Nenhum dos dois reflete o HEAD. Isso explica "reproduzir no executável" sem achar as correções (REG-01). Os dois usam, ou podem usar, o mesmo banco humano `~/SmartLearn-DevData` (não aberto por mim).

Solução proposta para o launcher (NÃO aplicada; precisa de decisão do dono sobre a branch):
1. Trocar a branch fixa por checagem de identidade: o launcher abre se o conteúdo da build (`inputsHash`) é o do código atual e mostra no título `commit + branch`, em vez de exigir um nome de branch. Mantém o guardrail contra build velha, que é o objetivo dele, sem prender o trabalho a uma branch.
2. Corrigir o atalho DEV quebrado (apontar para a worktree em uso) e fazer o "Oficial" abrir o `.exe` do HEAD ou ser retirado.
3. Dados: não mudam. O banco humano continua único e só abre com a build escolhida pelo dono; migrações 035 a 040 só após backup e autorização.
Teste que prova a mudança: o `.exe` aberto mostra no título o commit do HEAD, e um teste do launcher recusa uma build com `inputsHash` diferente.

## 3. Auditoria do fluxo principal

Fluxo: PDF → geração → resumo → editor e imagens → estudo → revisão → persistência após reinício.

### 3.1 Comportamento comprovado (jornada nativa 23/23, `e3b91b7`, dados descartáveis, Codex real)
Importar PDF (4), gerar rascunho com Codex (5), abrir Resumo e Questões (6), editar e recarregar (7), aceitar (8), Resumo Mestre (9), Estudar agora (10 a 12), persistência das tentativas por API e por banco após fechar (13, 17, 18), PDF original servido (19), erro e reteste (15), revisão em Hoje (14, 20), Hoje, Plano e Estatísticas sem erro (16), editor visual com fórmulas, tabela e figuras (21), autosave sob falha de conexão e processo morto (22), arrastar e redimensionar figura (23).

### 3.2 Lacunas (ordem de prioridade; nenhuma é defeito reproduzido hoje)
| # | Lacuna | Tipo | Impacto | Evidência | Critério de correção |
|---|---|---|---|---|---|
| 1 | App aberto pelo dono não é o do HEAD (seção 2) | Defeito de processo, reproduzido por leitura | Alto: o dono valida código velho | `last-launch.json`, atalhos, `expectedBranch` | Launcher mostra commit e branch; abrir pelo atalho dá o HEAD |
| 2 | T-F4-01: estudo real (Resumo Mestre e 35 questões, estudar, histórico, reinício) nunca feito pelo dono | Validação ausente | Alto: é a única prova de utilidade | `tasks.md` T-F4-01 aberto | Roteiro executado com a build do checkpoint; P0/P1 corrigidos ou aceitos |
| 3 | A jornada usa PDF de teste pequeno e dados controlados (3 a 4 questões), não um PDF real longo com imagens extraídas | Validação ausente | Médio: extração de imagens do PDF e limites de tamanho/tempo não provados | Passos 4 e 5; as figuras do passo 21 são PNG sintético | Uma geração real com PDF autorizado do dono, registrando tempo, questões e figuras |
| 4 | Qualidade médica do conteúdo gerado (MED-SUM) | Validação ausente (NOT_PROVEN) | Alto para o produto, fora do alcance de teste automático | `project_content_quality` | Revisão médica humana da amostra |
| 5 | V-01: Estatísticas a 390 px corta texto | Defeito reproduzido, correção pronta e não aplicada | Médio (leitura no celular) | `V-01-stats-390.md`, `c393210` | Aprovação do dono, aplicar o CSS, rodar specs de Estatísticas e axe |
| 6 | Banco humano: migrações 035 a 040 não aplicadas e comportamento do app novo sobre ele não testado | Validação ausente | Alto se abrir o app novo no banco real sem backup | Cartões de migração | Backup verificável, cópia, migrar a cópia, teste, só então o real |
| 7 | Leitor de tela, Android, animações e impressão | Validação ausente (só no dono) | Médio | Cartão "Uso real" | Dono informa quando o agente pode executar |
| 8 | Abertura sem console visível | Insuficiente | Baixo | Seção 1 | Medir a abertura pelos atalhos |

## 4. Retorno pedido
- IDs trabalhados: os da seção 1.
- Alterações: só este relatório (`.specs/evidence/teste-ponta-a-ponta-2026-11-07/LOTE1-RELATORIO-2026-11-08.md`); nada de produto, nada no Planban, nada no banco humano.
- Testes executados: nenhum novo; leitura de Git, atalhos, `last-launch.json`, `THEME_OPTIONS` (24), `build-identity`.
- Pendências: contagem 67 versus 66; identidade interna do release `.exe` de 06/11; abertura sem console; decisão do dono sobre a branch/identidade do launcher.
