# SmartLearn — Plano de correção e melhorias (Roadmap de endurecimento V1)

Status: EM EXECUÇÃO desde 2026-10-04 (F0 fechada; F1 com código completo; demais fases conforme `tasks.md`, cujo `Status:` por tarefa é autoritativo). HUMAN_GATES HG-01..HG-10 (seção 8) permanecem PENDENTES: nenhum está registrado como decidido, e a coluna "Recomendação do plano" é sugestão, não decisão. Ordem de sprints: `PROGRAM.md`.
Data-base: 2026-10-04 · Branch `claude/smartlearn-v1-complete` · HEAD de referência `620307d`
Metodologia: `tlc-spec-driven-strict` (GOV-2 = opção A, sem segunda governança). Este arquivo é a SPEC; o ledger executável está em `tasks.md`.
Hierarquia de autoridade (nesta ordem): Git/código/dados reais > evidência de validação > decisão humana registrada > spec > STATE/handoff > plano > narrativa de agente.

---

## 1. Objetivo

Levar o SmartLearn do estado "arquitetura da aula provada, ambiente DEV estável" para "V1 verificável e entregável": conteúdo médico confiável gerado por IA com rascunho humano obrigatório, dados do aluno protegidos, Desktop DEV inequívoco, regressão automatizada que realmente discrimina, e caminho de integração/entrega sem surpresa. O plano organiza correções de defeitos conhecidos, dívidas registradas e melhorias de produto em fases com portões (gates), cada tarefa independente, verificável e reversível.

Resultado observável ao final:
- O aluno gera, revisa, edita e aceita uma aula a partir de um PDF real com qualidade medida (não suposta) e sem perder trabalho.
- Qualquer bug report responde "qual build, qual banco, qual versão de esquema" sem inferência.
- Nenhum teste automatizado toca dado humano; nenhum processo órfão ou artefato obsoleto se acumula sem ser visto.
- O histórico de commits pode ser integrado (PR/merge) por decisão humana com evidência pronta.

## 2. Estado provado (baseline congelado)

Cada linha abaixo tem evidência atual (sessão de 2026-10-03/04) e vira sensor de não-regressão (seção 6).

| Área | Estado | Evidência |
|---|---|---|
| Contrato da aula | `LESSON = SUMMARY + QUESTIONS[] + SOURCE + AUDIT`; ids estáveis `q<n>`, versão por entidade, `PATCH summary`, `PATCH/DELETE question`, questão rejeitada nunca vira exercício | `server/test/lesson-granular-edit.test.js` (13), `e2e/lesson-editor.spec.js` (11) |
| UI da aula | abas Resumo / Questões / Fonte / Revisão; outras unidades fora do editor; "Rascunhos em andamento" fora do índice colapsado | e2e + inspeção headless com o banco rico |
| Dados DEV | banco canônico `C:\Users\Ariel\SmartLearn-DevData\smartlearn-dev.db`, esquema v30, histórico + Costanzo (1 fonte, 496 páginas, 898 itens de índice, 165 propostas, 1 rascunho) | `integrity_check ok`, `foreign_key_check 0`, tabelas históricas idênticas ao backup |
| Importação | `scripts/dev-import-sources.mjs` determinística, idempotente, tudo-ou-nada | `test/dev-import-sources.test.js` (4) |
| Isolamento | testes não citam o datastore humano nem o AppData | `test/test-db-isolation.test.js` (2) |
| Desktop DEV | launcher fixa banco/fontes, loga executável/banco/versão/HEAD/branch, verifica caminho do processo, recusa build defasado | `test/desktop-entrypoint.test.js` (12) + `last-launch.json` |
| Sessão DEV | cookie persistente + sessão de ~10 anos só com `SMARTLEARN_DEV_PERSISTENT_SESSION=true`; recusada em produção; "Sair" invalida | `server/test/dev-persistent-session.test.js` (6), prova no WebView2 real via CDP |
| Identidade | versão (`package.json` raiz) + commit/canal embutidos no build; rodapé e Configurações > Sobre | `test/version-identity.test.js`, `test/build-identity-ui.test.js` |
| Higiene de disco | `npm run dev:sanitize` com allowlist, dry-run, idempotente (16,7 GiB recuperados) | `test/dev-sanitize.test.js` (5) |
| Regressão | servidor 773/773; frontend 453/453; cargo 30/30; lint 0 erros (23 avisos); inventário de testes PASS (170 arquivos); e2e 201 passaram + 2 opt-in skipped | execuções de 2026-10-04 |
| Codex | `CODEX_CALL_COUNT=0` em toda esta fase; prompt inalterado (versão 5) | — |

Estados explicitamente NÃO provados (mantidos como `NOT_PROVEN`, nunca promovidos por inferência):
- `VALID_4` (canário com PDF médico real avaliado por humano), `VALID_5` (consistência entre gerações), `VALID_8` (decisão de validação V1).
- `VISUAL_VALIDATION` da janela nativa pelo humano.
- Suíte "MATERIALS_E2E=45/45": a composição dos 45 testes não está definida em nenhum artefato (ver T-F6-03).
- Qualidade médica semântica entre idiomas (fonte EN, aula PT).

## 3. Registro de achados (findings)

Severidade: P0 = perda/corrupção de dado ou risco clínico/segurança; P1 = defeito que invalida validação ou trabalho do aluno; P2 = fricção material ou dívida com risco crescente; P3 = melhoria/higiene.
Origem: OBS = observado nesta sessão; REG = registro existente (DEBT/LESSON/plan); NOVO = identificado na análise deste plano (a verificar antes de agir).

### 3.1 Integridade de dados e operação

| ID | Sev | Origem | Achado | Evidência / causa conhecida |
|---|---|---|---|---|
| F-01 | P1 | OBS | O Desktop não adquire o `dev.lock`; só o launcher consulta. `dev:remote` pode abrir o mesmo banco com o Desktop aberto | `scripts/dev-data.mjs` (lock por pid) vs `launch-desktop-dev.ps1` (só leitura do lock) |
| F-02 | P1 | OBS | Backups do banco DEV são manuais (3 cópias em `SmartLearn-db-backups`); o snapshot diário só existe para `dev:remote` | `snapshotDevDbIfNeeded` não é chamado pelo caminho do Desktop |
| F-03 | P1 | OBS | Banco antigo do Desktop (#1, AppData) e legados #3/#5 sem política: ficam intactos, sem dono nem data de revisão | inventário P0 |
| F-04 | P1 | OBS | Processo `node` órfão do backend travou o build do Tauri (`os error 32`); vite/playwright órfãos bloqueiam a porta 5199 | ocorrências desta sessão |
| F-05 | P2 | OBS | Backend filho do Desktop é encerrado só por `Drop`; encerramento forçado deixa órfão. O `codex` filho também escapa quando o Desktop fecha | `LocalBackend` Drop; item "NOT done" do checkpoint |
| F-06 | P2 | OBS | Tabela `sessions` acumula linhas (25 ativas no DEV); sem purga de expiradas/revogadas | consulta ao banco DEV |
| F-07 | P2 | OBS | Launcher rebuilda a cada commit (inclusive só documentação) porque compara commit, não conteúdo de entrada | `distIsCurrent` compara SHA |
| F-08 | P3 | OBS | Janela nativa mostra só "SmartLearn"; versão não aparece na barra de título | `/json/list` title |

### 3.2 Domínio da aula e geração

| ID | Sev | Origem | Achado | Evidência / causa conhecida |
|---|---|---|---|---|
| F-10 | P1 | OBS | `PUT /drafts/:id` (lista inteira) mantém identidade por posição; reordenar com mesmo tamanho troca ids/status entre conteúdos. Quando a contagem muda e há REJECTED agora é recusado, mas o desenho segue posicional | `reviseDraft`/`mergeIdentity` |
| F-11 | P1 | OBS | Auditoria gravada pode ser anterior a uma regra corrigida (67 pontos falsos EN→PT no rascunho real). Decisão humana: NÃO reauditar ao abrir | `findings` todos DETERMINISTIC; decisão registrada |
| F-12 | P1 | REG | Volume de questões sem limite (35 questões para ~6 páginas); prompt diz "quantas a fonte sustentar" | checkpoint "NOT done" |
| F-13 | P1 | REG | Observabilidade de geração ausente: sem job id, fase, última atividade, timeout duro, cancelamento; `codex exec --json` fica em silêncio durante raciocínio longo | probe documentado no checkpoint |
| F-14 | P2 | REG | Geração leva minutos e a tela só mostra tempo decorrido; não está provado que dá para sair e voltar ao rascunho pronto | VALID-6 F1 |
| F-15 | P2 | REG | Explicação é opcional no esquema; uma questão chegou sem "Por quê" em 1 de 3 gerações reais | VALID-6 F2 |
| F-16 | P2 | REG | Sensores determinísticos entre idiomas cobrem só valores, unidades, citações, duplicatas e vazamentos; qualificadores e fatos sem suporte entre idiomas dependem do modelo e do humano | checkpoint |
| F-17 | P2 | REG | Falta regenerar UMA questão (exige contrato de questão única com o modelo) e Resumo Mestre estruturado (exige mudança de prompt) | checkpoint; ambos pertencem ao Prompt Lab |
| F-18 | P2 | NOVO | A auditoria não registra a versão das regras que a produziu; impossível distinguir "obsoleta" de "atual" sem recalcular | `audit` sem `rulesVersion` |
| F-19 | P2 | NOVO | Edição humana não marca proveniência por questão (editada/gerada, versão de prompt, provedor); o Prompt Lab precisará disso para medir | `questions[]` sem `origin` |
| F-20 | P2 | NOVO | Aceitar exige disciplina e data; não há pré-visualização do que será criado além da contagem de exercícios | UI `lesson-accept-note` |

### 3.3 UI/UX e acessibilidade

| ID | Sev | Origem | Achado | Evidência |
|---|---|---|---|---|
| F-30 | P1 | OBS | `VISUAL_VALIDATION=AWAITING_HUMAN`: a janela nativa nunca foi avaliada por pessoa; os testes de Haiku foram inconclusivos | histórico da sessão |
| F-31 | P2 | OBS | Lista de 35 questões e Revisão com ⚠ em todas ("Sinalizada") por auditoria obsoleta; hierarquia cansa mesmo agrupada | screenshot headless |
| F-32 | P2 | OBS | "Rascunhos em andamento" aparece abaixo da busca, perto da dobra | screenshot de Materiais |
| F-33 | P2 | OBS | "Salvar título" no índice não dá confirmação visível | relato do teste visual |
| F-34 | P2 | NOVO | Layout do editor da aula não foi caracterizado em largura < 720 px (duas colunas lista/editor) | sem teste de viewport móvel para o editor |
| F-35 | P2 | NOVO | Foco e anúncio após salvar questão/resumo, troca de aba e rejeição não têm sensor de teclado/leitor de tela além do axe básico | `e2e/accessibility.spec.js` não cobre o editor |
| F-36 | P3 | REG | Cópia de estados (T47) e i18n completo (T46) adiados; risco de regressão de acentuação pt-BR | plan |
| F-37 | P3 | NOVO | Backlog real do aluno-DEV: 27 revisões vencidas, a mais antiga com 104 dias de atraso; o produto não oferece recuperação de atraso | tela Hoje do banco DEV |

### 3.4 Qualidade, testes e infraestrutura

| ID | Sev | Origem | Achado | Evidência |
|---|---|---|---|---|
| F-40 | P1 | OBS | "45 testes de materiais" não é uma suíte definida; nenhum tag/arquivo a reproduz | busca em specs e plan |
| F-41 | P2 | OBS | e2e usa porta fixa 5199 e `reuseExistingServer:false`: qualquer órfão derruba a suíte; falha `ENOENT` de trace quando o diretório `test-results` é tocado por outra execução | execuções com órfãos |
| F-42 | P2 | OBS | e2e completo leva ~16 min em série, sem partição | tempos medidos |
| F-43 | P2 | REG | 23 avisos de lint; aviso de linker do Rust; `DEBT-002` (`app.js` ~3,2 mil linhas ou mais) | lint; DEBT |
| F-44 | P2 | REG | `DEBT-006`: sem contrato de persistência entre adaptadores, IndexedDB e sincronização | DEBT |
| F-45 | P3 | NOVO | Suíte de mutação/discriminação existe de forma ad hoc, não como etapa repetível | LESSONS |
| F-46 | P3 | REG | `DEBT-009`/`DEBT-005`: runtime TLC não resolvível e descompasso de versão do plugin sql | DEBT |

### 3.5 Repositório, integração e documentação

| ID | Sev | Origem | Achado | Evidência |
|---|---|---|---|---|
| F-50 | P1 | OBS | 53 commits locais à frente de `origin/claude/smartlearn-v1-complete`; branches `claude/content-quality` e `tmp/integrate-cq-into-v1` (merge temporário, "not for push") ainda em worktrees | `git branch -vv` |
| F-51 | P2 | OBS | `src-tauri/resources/` (≈208 MB de artefatos empacotados) aparece como não rastreado na worktree; `.impeccable/` e `.specs/benchmarks/` também | `git status` |
| F-52 | P2 | OBS | Checkout principal tem 19 arquivos de skill rastreados deletados e diretórios não rastreados (`.codex`, `.codex-temp`, `.skill-backups`, `stats-prototype`, `test-results`) | `git status` do início da sessão |
| F-53 | P2 | REG | Painel mestre `conductor/tracks.md` defasado (snapshot de 07/09); `STATE.md` com ~2,8 mil linhas | arquivos |
| F-54 | P3 | REG | `DEBT.md`/`LESSONS.md` sem as lições desta fase (datastore, sessões, identidade) | arquivos |

### 3.6 Segurança e empacotamento

| ID | Sev | Origem | Achado | Evidência |
|---|---|---|---|---|
| F-60 | P1 | NOVO | A garantia "flag DEV não existe no pacote" está coberta por teste de texto (launcher/lib.rs), não por inspeção do artefato empacotado | `test/desktop-entrypoint.test.js` |
| F-61 | P2 | NOVO | Senha de fixture DEV (`seed-dev.mjs`) é pública no repositório; correto para DEV, mas precisa ser tratada por gate para nunca existir em build de release | `scripts/seed-dev.mjs` |
| F-62 | P2 | OBS | Release antigo instalado (`AppData\Local\SmartLearn`, 10/09) com instaladores em `release/bundle`: risco de abrir build errada por engano de novo | inventário |
| F-63 | P2 | NOVO | Upload de PDF: limites existem (25 MiB/arquivo, quota 200 MiB), mas não há teste adversarial recente (PDF malformado, bomba de descompressão, texto injetado) fora do canário sintético | testes existentes só sintéticos |

## 4. Requisitos (com critérios de aceitação)

Cada requisito é verificável por sensor. IDs `R-xx`; tarefas em `tasks.md` apontam para eles.

### R-01 — Integridade do datastore DEV
- AC-01.1: QUANDO o Desktop abre, ENTÃO ele adquire o `dev.lock` do datastore e um segundo escritor (`dev:remote` ou outro Desktop) é recusado com mensagem que nomeia o detentor; ao fechar, o lock é liberado; lock de processo morto é retomado.
- AC-01.2: QUANDO o launcher abre o Desktop, ENTÃO existe snapshot do dia (banco+WAL+SHM) com retenção definida, criado antes de qualquer migração.
- AC-01.3: QUANDO uma migração para frente é necessária, ENTÃO há backup verificado (checksum) imediatamente anterior e a migração é rejeitada se o backup falhar.
- AC-01.4: Existe e foi ensaiado um procedimento de restauração (restore drill) com prova de que o banco restaurado abre, passa `integrity_check` e mostra o histórico.

### R-02 — Ciclo de vida de processos
- AC-02.1: QUANDO o Desktop fecha por qualquer via (graciosa ou forçada), ENTÃO backend e `codex` filhos terminam (Job Object do Windows com kill-on-close, ou equivalente comprovado).
- AC-02.2: O launcher encerra apenas processos da própria worktree e relata o que encerrou; nunca toca processos de outras worktrees.
- AC-02.3: A suíte e2e escolhe portas livres e diretório de saída único por execução, e uma execução órfã não derruba outra.

### R-03 — Contrato da aula sem ambiguidade de identidade
- AC-03.1: Nenhuma rota atribui identidade/status por posição; a substituição de lista inteira é removida ou reescrita por id, e reordenar preserva `id`, `status` e `version` do conteúdo correspondente.
- AC-03.2: Toda questão carrega `origin` (`GENERATED` | `HUMAN_EDITED` | `HUMAN_ADDED`), `promptVersion` e `provider` da geração; edição humana muda `origin` sem apagar o histórico de geração.
- AC-03.3: A auditoria carrega `rulesVersion` e `auditedAt`. QUANDO a versão das regras atual difere da gravada, ENTÃO a UI mostra um selo "auditoria com regras antigas" e oferece "Reauditar" como AÇÃO EXPLÍCITA do humano; abrir a aula nunca recalcula nem grava (decisão registrada).
- AC-03.4: Aceitar a aula mostra uma pré-visualização do que será criado (unidade, exercícios, questões excluídas) antes do compromisso.

### R-04 — Jobs de geração observáveis e controláveis
- AC-04.1: Toda geração tem `jobId`, fase (`QUEUED/PREPARING/CALLING_PROVIDER/AUDITING/DONE/FAILED/CANCELLED`), `lastActivityAt`, `startedAt`, limite duro e cancelamento que encerra a árvore de processos.
- AC-04.2: A política de "parada" usa sinal de vida do processo (CPU/handles) além da saída do `codex exec --json`, com limite de silêncio generoso; uma etapa longa e saudável NÃO é marcada como travada.
- AC-04.3: O aluno pode sair da tela durante a geração e voltar ao rascunho pronto (ou à falha explicada); a tela diz que pode levar minutos e mostra fase real, não só cronômetro.
- AC-04.4: Falha e cancelamento não deixam rascunho parcial aceitável nem processo órfão.

### R-05 — Qualidade de conteúdo médico mensurável
- AC-05.1: Existe um Prompt Lab (fase própria) que roda unidades reais fora do produto, com rubrica, métricas e custo controlado, e NÃO conecta seu resultado ao produto sem decisão humana.
- AC-05.2: VALID-4 é executado com o PDF real e avaliação humana; VALID-5 repete a mesma unidade poucas vezes; erro médico sério não detectado em qualquer geração bloqueia `REALMODEL_CONTENT_QUALITY_PROVEN`.
- AC-05.3: Sensores determinísticos entre idiomas cobrem ao menos qualificadores numéricos/temporais/de condição e termos de dose; o que não é determinístico é declarado "depende de humano" na UI.
- AC-05.4: O volume de questões por unidade segue uma política decidida por humano (limite ou escala por tamanho), aplicada por validação, não só por prompt.

### R-06 — UI/UX com validação humana e acessibilidade
- AC-06.1: Roteiro de validação visual executado por pessoa na janela nativa, com registro de achados e `VISUAL_VALIDATION=PASS|FAIL` justificado.
- AC-06.2: O editor da aula funciona de 360 px a 1440 px; abas, lista e editor são operáveis só por teclado; foco e anúncios corretos após salvar, rejeitar, trocar aba e abrir/voltar.
- AC-06.3: Toda ação de salvar do Materiais dá confirmação perceptível e programática.
- AC-06.4: A lista de Revisão prioriza severidade e agrupa por questão sem dominar a tela quando há dezenas de pontos.

### R-07 — Infraestrutura de teste que discrimina
- AC-07.1: Existe tag/projeto Playwright `@materials` que define a suíte "materiais" de forma reproduzível, com contagem registrada em `TEST_COVERAGE_MATRIX.md`.
- AC-07.2: O e2e completo roda particionado e termina em tempo-alvo definido, sem depender de porta fixa.
- AC-07.3: Um sensor de discriminação (mutação de comportamento em worktree isolada) existe como comando repetível para as áreas de alto risco: sessão, identidade de questão, rejeição, import de fonte, sanitizador.
- AC-07.4: Lint sem erros e sem avisos novos; avisos existentes têm dono ou são corrigidos.

### R-08 — Higiene de repositório e documentação
- AC-08.1: `git status` limpo em todas as worktrees além de arquivos deliberadamente ignorados; `src-tauri/resources/` é ignorado por regra; decisão registrada para `.impeccable/` e `.specs/benchmarks/`.
- AC-08.2: `conductor/tracks.md`, `STATE.md`, `DEBT.md`, `LESSONS.md` e `TEST_COVERAGE_MATRIX.md` reconciliados com Git; `STATE.md` compactado em Memento sem perder decisões canônicas.

### R-09 — Segurança e empacotamento
- AC-09.1: Um teste inspeciona o artefato empacotado (recursos do Tauri) e prova que nenhuma variável DEV (sessão persistente, consentimento de IA automático, provedor) é definida por ele.
- AC-09.2: A senha de fixture DEV não aparece em nenhum artefato de release.
- AC-09.3: Testes adversariais de upload de PDF passam (malformado, truncado, grande, texto com instruções injetadas tratado como inerte).
- AC-09.4: Instalação antiga identificada e retirada por decisão humana, com um único caminho oficial de abertura do app.

### R-10 — Entrega e integração
- AC-10.1: Há um plano de integração com ordem, estratégia (merge/squash/rebase) e série de PRs aprovados por humano; nada é enviado sem autorização.
- AC-10.2: Cada fase fecha com `validation.md` baseado em evidência, e `validate_state.py` roda quando aplicável.

### R-12 — Geração progressiva e segura: escopo, reuso e créditos (decisão de produto 2026-10-04)
- AC-12.1: `IMPORTAR != GERAR`. Importar, extrair e estruturar um PDF inteiro nunca autoriza geração pedagógica de todo o documento. Toda chamada ao provedor tem `sourceScope` explícito, validado e com tamanho calculado pelo servidor antes da chamada; "gere o livro inteiro/todos os capítulos" é recusado com orientação para a unidade permitida (nunca vira geração em massa); a API direta obedece às mesmas regras da UI.
- AC-12.2: A geração é JIT por padrão (quando a unidade passa a ser necessária). Conteúdo já gerado e válido é reutilizado: navegar de novo ou repetir o pedido NÃO faz nova chamada externa; regenerar é ação explícita, sujeita aos mesmos limites.
- AC-12.3: Prefetch é opcional e subordinado à unidade atual: janela mínima definida por política (HG-12), só com orçamento confortável, omissível sem degradar o fluxo, nunca fila/capítulo/livro inteiro e nunca batch que contorne limites; o restante da fonte permanece `NOT_GENERATED`.
- AC-12.4: Fronteiras de consumo: máximo por job, franquia semanal, franquia mensal, saldo disponível, saldo reservado por jobs em andamento, consumo efetivo e reconciliação reserva × consumo. Antes da chamada: custo estimado ≤ máximo por job E ≤ restante semanal E ≤ restante mensal; a reserva é atômica (jobs concorrentes nunca gastam o mesmo saldo); falha antes de consumo externo não debita; após a execução reconcilia-se com o consumo medido quando confiável. Quota de armazenamento de PDF, limite de geração, quantidade de questões (R-05/HG-01) e orçamento de modelo são controles distintos.
- AC-12.5: Os valores das franquias e do limite por job são decisão pendente (HG-11): a estrutura é configurável; sem dado medido, não se inventam números.
- AC-12.6: Essas regras vivem no servidor/domínio e não dependem de UI, de texto do pedido nem de cliente alternativo.

### R-13 — Idiomas: fonte, interface e conteúdo gerado (decisão de produto 2026-10-04)
- AC-13.1: `sourceLanguage` (idioma da fonte/unidade), `uiLocale` (interface) e `generationLocale` (conteúdo pedagógico) são estados independentes; nenhum é alias nem sobrescreve outro em silêncio.
- AC-13.2: `generationLocale` é preferência persistente do aluno: inicializada UMA vez, no primeiro uso, a partir do melhor dado disponível (preferencialmente o `uiLocale` suportado ou o locale do sistema); depois nunca muda sozinha (nem por trocar `uiLocale`, importar PDF em outro idioma ou mudar região do sistema) — só por ação explícita do aluno.
- AC-13.3: A geração é direta no idioma alvo (fonte + `sourceLanguage` → conteúdo em `generationLocale`), sem etapa obrigatória de tradução; idioma diferente de `generationLocale` é falha de contrato e o rascunho não é promovido como válido.
- AC-13.4: A evidência original continua rastreável (páginas/spans da fonte, `sourceLanguage`); a localização pedagógica não a apaga.
- AC-13.5: Mudar `generationLocale` afeta só novas gerações; aulas/rascunhos já aceitos permanecem intactos. Traduzir/regenerar conteúdo existente é ação explícita, com custo visível.
- AC-13.6: A UI separa "Idioma da interface" de "Idioma do conteúdo gerado" (nunca um "Idioma" ambíguo). Locales extensíveis (BCP 47); alvo V1: `pt-BR`, espanhol e inglês.

### R-11 — Produto de estudo (melhorias)
- AC-11.1: O aluno com atraso grande tem uma ação de recuperação ("reagendar atrasadas") que preserva histórico e é reversível.
- AC-11.2: Primeira abertura em produção tem onboarding/estado vazio decididos (DEBT-007).
- AC-11.3: A decisão sobre FSRS (DEBT-003) é tomada com dados do uso real antes de qualquer implementação.

## 5. Invariantes a preservar (não podem regredir)

- INV-01 `AI_OUTPUT = DRAFT`: nada gerado por IA vira conteúdo de estudo sem aceite humano explícito.
- INV-02 Questão rejeitada nunca vira exercício nem volta a PROPOSED sem ação humana explícita.
- INV-03 Editar uma entidade (resumo ou questão) nunca substitui a aula inteira; ids de questão são estáveis e nunca reutilizados.
- INV-04 Audit e Source são entidades separadas do conteúdo pedagógico; texto de UI nunca é persistido em conteúdo.
- INV-05 Abrir uma aula não recalcula nem grava estado (decisão humana).
- INV-06 Datastore DEV humano é persistente, único, fora de qualquer worktree e nunca é tocado por teste automatizado (`HUMAN DEV DATA != TEST DATA`).
- INV-07 Migrações só para frente, com backup; nenhuma migração destrutiva sem decisão humana.
- INV-08 Autenticação de produção inalterada: cookie de sessão, 30 dias absolutos, 7 de inatividade; flag DEV recusada em produção.
- INV-09 Zero chamada ao Codex em testes, fixtures e validação de UI; geração real só por ação explícita do usuário ou por fase autorizada (Prompt Lab).
- INV-10 Nada de push, merge, deploy ou release sem autorização humana explícita por ação.
- INV-11 `UNKNOWN != PASS`: ausência de prova vira `NOT_PROVEN`.
- INV-12 Fontes importadas e backups nunca são apagados por rotinas automáticas.
- INV-13 `IMPORTAR != GERAR`: nenhum caminho (rota, job, prefetch, batch) chama o provedor sem `sourceScope` validado, estimativa dentro dos limites e reserva atômica; nenhum job amplia seu escopo depois de criado sem nova validação.
- INV-14 `sourceLanguage`, `uiLocale` e `generationLocale` são independentes; `generationLocale` só muda por ação explícita do aluno.

## 6. Estratégia de proteção de regressão (brownfield)

Antes de tocar qualquer superfície já provada, a tarefa nomeia o sensor que ficaria vermelho se o comportamento bom fosse destruído. Os sensores existentes que formam o escudo mínimo desta fase:

| Superfície | Sensor existente |
|---|---|
| Identidade/edição granular de questão | `lesson-granular-edit.test.js`, `lesson-editor.spec.js` |
| Rejeição e aceite | `accept-draft.test.js`, `draft-acceptance.spec.js`, teste de sequência de 4 questões |
| Persistência e recarga | `lesson-editor.spec.js` (RELOAD), `dev-import-sources.test.js` |
| Sessão e autenticação | `dev-persistent-session.test.js`, `auth-*.test.js`, `session-security.test.js` |
| Identidade/versão | `version-identity.test.js`, `build-identity-ui.test.js`, `health.test.js` |
| Launcher e datastore | `desktop-entrypoint.test.js`, `test-db-isolation.test.js`, teste Rust `with_data_overrides` |
| Sanitização | `dev-sanitize.test.js` |
| Auditoria | `draft-audit*.test.js` (incl. cross-language) |

Regra do Cardboard Test: para cada tarefa de risco médio/alto, perguntar "qual implementação errada plausível ainda passaria?" e, quando a resposta existir, adicionar mutação ou caso adversarial em worktree isolada.

## 7. Fora de escopo deste plano (explícito)

- Qualquer mudança de prompt ou provedor pedagógico alternativo antes do Prompt Lab aprovado — EXCETO a diretiva mínima de idioma de saída exigida por R-13, que depende de HG-13 (ver §11).
- Sincronização multi-dispositivo (DEBT-006 item 3) — exige ADR e decisão de produto próprias.
- FSRS completo (DEBT-003) — só a decisão baseada em dados está no plano.
- Reescrita de `app.js` por estilo; extrações só quando um sensor exigir (DEBT-002).
- Deploy, release, assinatura de código e distribuição pública (T51) — gate humano.

## 8. Decisões humanas necessárias (HUMAN_GATES)

| ID | Decisão | Bloqueia | Recomendação do plano |
|---|---|---|---|
| HG-01 | Política de volume de questões (limite fixo, proporcional ao tamanho, ou por qualidade) | F5, parte de F2 | proporcional ao tamanho da unidade com teto, validada fora do prompt |
| HG-02 | "Reauditar" como ação explícita é aceitável dado que abrir não recalcula? | T-F2-03 | sim, como botão com diff e sem efeito automático |
| HG-03 | Destino do banco antigo do AppData (#1) e dos legados #3/#5 | T-F1-05 | arquivar read-only com README; não mesclar |
| HG-04 | Retirar o release instalado de 10/09 (usar o desinstalador) | T-F8-05 | sim, após F8-04 |
| HG-05 | Estratégia de integração (merge vs squash vs série de PRs), destino de `content-quality` e do merge temporário | F9 | série de PRs pequenos, um por fase, preservando história |
| HG-06 | Avaliação humana de VALID-4/5 (PDF real, rubrica) e decisão VALID-8 | F5 | humano avalia 1 unidade por rodada com rubrica fixa |
| HG-07 | Orçamento de chamadas ao Codex do Prompt Lab | F5 | teto por rodada e por dia, configurável |
| HG-08 | Política de ARMAZENAMENTO de PDF/dados reais usados em teste (nunca no repositório; onde ficam e como são referenciados). Não é pedido de outro PDF: o Costanzo já existe localmente e não deve ser solicitado de novo | F5 | diretório fora do repositório, listado em `.gitignore` global |
| HG-09 | Decisão de produto sobre recuperação de atraso e onboarding | F7 | começar por "reagendar atrasadas" reversível |
| HG-10 | Push, merge, deploy, release | F9 | só por ordem explícita, uma ação por vez |
| HG-11 | Valores e unidade de custo: máximo por job, franquia semanal e mensal (R-12). A estrutura é configurável; faltam dados medidos | T-F10-04 (valores), produção com provedor real | experimento mínimo: medir custo real de 3–5 unidades de tamanhos diferentes por provedor e propor franquias com folga; até lá, limites configuráveis e produção com provedor real recusa subir sem eles |
| HG-12 | Política de prefetch (janela e condição de orçamento) | T-F10-03 (parâmetro), execução de prefetch | JIT puro (janela 0) até medir latência de geração e consumo; janela 1 só com orçamento ≥ 3× a estimativa da unidade seguinte e sem job em andamento |
| HG-13 | Autorizar a diretiva mínima de idioma no prompt (e a mudança de versão do prompt) e confirmar o alcance de `uiLocale` em es/en no V1 (catálogos das chaves existentes + fallback pt-BR, sem tradução completa do app) | T-F10-02b, T-F10-06 | autorizar a diretiva aditiva sem rodar o Prompt Lab; prova com modelo real fica `NOT_PROVEN` até execução manual; UI es/en só nas chaves do catálogo |

## 9. Riscos (resumo; detalhes em `tasks.md`)

R-A Perda de dado humano por operação de limpeza/migração — mitigado por INV-06/07/12, backup verificado, dry-run.
R-B Falso verde: suíte passa mas produto errado — mitigado por validação humana, mutação e dados reais.
R-C Regressão ao mexer em `PUT`/identidade — mitigado por sensores granulares e remoção em vez de remendo.
R-D Gasto/lentidão do Codex no Prompt Lab — mitigado por orçamento (HG-07) e jobs com cancelamento.
R-E Deriva de documentação — mitigado por reconciliação em F0 e Memento.
R-F Integração difícil (53 commits + `content-quality`) — mitigado por série de PRs e prova de integração antecipada.

## 10. Definição de fechamento (critério; o estado vive em `tasks.md`, `validation.md` e `HANDOFF.md`)

Dois fechamentos distintos; o primeiro NÃO implica o segundo:

- **ENGINEERING_LOCAL_CLOSURE** — no HEAD final: todo trabalho local não-`[H]` das sprints do `PROGRAM.md` está `[✓]` (ou OBSOLETE/DUPLICATE com motivo); gates de fechamento verdes no mesmo snapshot; banco canônico íntegro; skips, avisos, gates humanos e resíduos explícitos. Resultados possíveis: `ENGINEERING_LOCAL_PROVEN`, `ENGINEERING_LOCAL_PROVEN_WITH_HUMAN_GATES`, `ENGINEERING_LOCAL_NOT_PROVEN`.
- **V1_VALIDATED** — exige, além do anterior, a decisão humana VALID-8 (HG-06) com `REALMODEL_CONTENT_QUALITY_PROVEN=PROVEN` e a validação visual humana (T-F4-01) registrada com autoria e data. Enquanto VALID-8 estiver `NOT_PROVEN` (estado em `conductor/tracks/v1-validation/plan.md`; VALID-4 e VALID-5 constam ali como PASS de escopo limitado, o que NÃO é o mesmo que a decisão VALID-8), o fechamento local com gates humanos NÃO equivale a V1 integralmente validada.

Fronteira de autonomia no Desktop/CDP: verificações MECÂNICAS (abre, build/commit, persistência após restart, salvar/rejeitar/recarregar, ausência de órfãos, título) são autônomas quando o runtime permite. Somente o JULGAMENTO PERCEPTIVO (claro? confortável?) é HUMAN_GATE. Reabrir o Desktop não é gate.

## 11. DECISION_CONFLICT registrados (decisões de produto novas × decisões canônicas anteriores)

DECISION_CONFLICT-1
DECISION=`uiLocale` é uma preferência do aluno com alvo V1 pt-BR, espanhol e inglês (R-13).
EVIDENCE=`.specs/features/smartlearn-v1-consolidated-v2/design.md` §10 e `src/i18n/index.js`: pt-BR é o único locale da V1; T46 (catálogo i18n completo) foi DEFERIDA por não ter efeito observável (`product-closure/plan.md`).
IMPACT=Médio: trocar `uiLocale` só muda a interface onde houver catálogo; hoje só o módulo de conta usa `t()`; o resto do app tem texto fixo em pt-BR.
MINIMUM_RESOLUTION=HG-13: confirmar que na V1 o `uiLocale` es/en cobre apenas as chaves do catálogo (com fallback pt-BR) e que a tradução completa do app continua adiada (T46). Não bloqueia: o domínio, a preferência e o contrato entram já.

DECISION_CONFLICT-2
DECISION=A geração recebe `generationLocale` e o conteúdo sai direto nesse idioma (R-13).
EVIDENCE=`spec.md` §7 ("nenhuma mudança de prompt antes do Prompt Lab aprovado"), `PROMPT_LAB=MANUAL_GATE` e a política de não mudar o prompt do produto. O prompt atual (`server/src/ai/draft-prompt.js`, promptVersion 5) não tem nenhuma diretiva de idioma de saída.
IMPACT=Alto para a qualidade real: sem a diretiva o idioma de saída do modelo é indeterminado; com o contrato de idioma ativo, saída em idioma diferente do alvo é recusada (fail-closed), o que expõe o problema em vez de escondê-lo.
MINIMUM_RESOLUTION=HG-13: autorizar a diretiva aditiva mínima (bloco OUTPUT LANGUAGE + campo `language` + bump de promptVersion), SEM rodar Prompt Lab/Codex. Enquanto isso o domínio, o contrato de validação, as preferências e o provedor simulado entram (T-F10-01/02a); T-F10-02b fica `[H]`. Não bloqueia.
