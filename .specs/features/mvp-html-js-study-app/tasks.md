# tasks.md — MVP HTML/JS Study App

**Feature:** mvp-html-js-study-app
**Total de tasks:** 17
**Status geral:** Pendente (correção arquitetural aguardando revisão humana)

---

## Legenda de status

- `[ ]` Pendente
- `[~]` Em andamento
- `[x]` Concluída
- `[!]` Bloqueada

## Política Git obrigatória

- TASK-000 cria o repositório local e o primeiro commit com specs aprovadas e estrutura inicial.
- Cada task posterior deve ser concluída em commit separado e deixar o repositório funcional.
- Não misturar alterações de tasks diferentes no mesmo commit.
- Codex cuida de GitHub, branches remotas e pull requests.
- Claude não cria repositório GitHub nem faz push remoto sem instrução explícita.

---

## Visão geral

| Task | Título | Status | Depende de |
|------|--------|--------|------------|
| TASK-000 | Preparar Git e base do projeto | [x] | — |
| TASK-001 | Estrutura visual mínima + navegação | [x] | TASK-000 |
| TASK-002 | Camada SQLite via Tauri SQL (`src/db.js`) | [x] | TASK-001 |
| TASK-003 | Cadastro de disciplinas | [x] | TASK-002 |
| TASK-004 | Cadastro de estudo (studyRecord) | [ ] | TASK-003 |
| TASK-005 | Geração automática de revisões | [ ] | TASK-004 |
| TASK-006 | Tela Hoje — cards mobile | [ ] | TASK-005 |
| TASK-007 | Tela Hoje — tabela desktop | [ ] | TASK-006 |
| TASK-008 | Marcar revisão como feita | [ ] | TASK-006 |
| TASK-009 | Registrar questões e acertos | [ ] | TASK-006 |
| TASK-010 | Comentário por tarefa | [ ] | TASK-009 |
| TASK-011 | Tela Estatísticas — métricas | [ ] | TASK-009 |
| TASK-012 | Gráfico de evolução das notas | [ ] | TASK-011 |
| TASK-013 | Exportar backup JSON | [ ] | TASK-002 |
| TASK-014 | Importar backup JSON | [ ] | TASK-013 |
| TASK-015 | Tauri 2 — validação Android e preparação iOS | [ ] | TASK-002 |
| TASK-016 | Polimento — acessibilidade e responsividade | [ ] | TASK-014, TASK-015 |

---

## TASK-000 — Preparar Git e base do projeto

**Status:** [x] Concluída em 2026-06-22

**Objetivo:**
Criar a base local do projeto, inicializar Git e preparar a estrutura mínima antes da
implementação funcional.

**Arquivos afetados:**
- `.gitignore` (criar)
- `README.md` (criar)
- `package.json` (criar)
- `vite.config.js` (criar)
- `index.html` (estrutura inicial sem funcionalidade de produto)
- `src/` (estrutura inicial)
- `src-tauri/` (estrutura inicial do Tauri 2)
- `.specs/project/STATE.md` (registrar execução quando ocorrer)

**Passos:**
1. Inicializar o repositório Git local e criar `.gitignore` para `node_modules/`, `dist/`,
   `target/`, artefatos de plataforma, logs e arquivos locais de IDE.
2. Inicializar o projeto npm e instalar somente a base arquitetural aprovada:
   ```bash
   git init
   npm init -y
   npm install
   npm install @tauri-apps/api @tauri-apps/plugin-sql
   npm install -D @tauri-apps/cli vite
   npx tauri init
   ```
3. Documentar no README os pré-requisitos Rust e Tauri 2 para desktop, a toolchain Android
   posterior e a exigência de Apple/Mac para build real de iOS.
4. Criar a estrutura vazia `src/` e inicializar `src-tauri/`, sem implementar fluxos do produto.
5. Configurar scripts mínimos de Vite/Tauri em `package.json` e integração em
   `src-tauri/tauri.conf.json`.
6. Documentar que o plugin SQL será registrado e configurado funcionalmente em TASK-002.
7. Criar o primeiro commit local contendo apenas specs aprovadas e estrutura inicial.

**Critérios de aceite:**
- `git init` executado e `git status` funcional.
- `.gitignore` criado.
- `npm install` executa sem erros.
- `package.json`, Vite e Tauri 2 inicializados.
- Estrutura mínima `src/` e `src-tauri/` criada.
- SQLite via `@tauri-apps/plugin-sql` documentado nas specs e no README.
- Primeiro commit local criado com specs e estrutura base.
- Nenhum código funcional do produto implementado.
- Nenhum repositório GitHub, branch remota, pull request ou push criado por Claude.

**Nota da execução:** O repositório e o remoto já possuíam um commit inicial antes da execução
desta task. O histórico existente foi preservado; a base técnica foi registrada em commit próprio
da TASK-000, sem reescrever `main`.

**Como testar manualmente:**
1. Executar `git status` e confirmar que o repositório local existe.
2. Conferir o conteúdo do primeiro commit.
3. Verificar que a estrutura esperada existe.
4. Confirmar que não há implementação de tela, regra de revisão ou acesso ao banco.

---

## TASK-001 — Estrutura visual mínima + navegação

**Status:** [x] Concluída em 2026-06-23
**Depende de:** TASK-000

**Objetivo:**
Criar o shell visual mínimo da aplicação e a navegação entre as quatro telas, mantendo
Detalhes/Hoje como tela inicial e sem implementar persistência ou regras funcionais.

**Arquivos afetados:**
- `index.html`
- `src/styles.css`
- `src/app.js`

**Passos:**
1. Criar `index.html` com meta viewport, charset e entrada JavaScript do Vite.
2. Adicionar navegação: Hoje, Cadastro, Estatísticas e Configurações.
3. Adicionar as seções `#screen-today`, `#screen-register`, `#screen-stats` e
   `#screen-settings`, ainda sem funcionalidade de produto.
4. Implementar `showScreen(id)` em `src/app.js` e os eventos da navegação.
5. Definir `#screen-today` como tela padrão.
6. Criar reset, tokens CSS mínimos, navegação responsiva e utilitário `.hidden`.
7. Validar a interface no desktop por `npm run tauri dev`.

**Critérios de aceite:**
- Aplicação abre no desktop Tauri sem erro.
- Detalhes/Hoje é a primeira tela exibida.
- Cada item de navegação exibe somente a seção correta.
- Estrutura visual responde em 375px e em desktop.
- Nenhum banco, SQL, cadastro ou geração de revisões foi implementado nesta task.
- Commit local contém somente a TASK-001 e deixa o app executável.

**Como testar manualmente:**
1. Executar `npm run tauri dev`.
2. Clicar em cada item de navegação.
3. Confirmar a tela inicial e a responsividade.
4. Verificar que não há erro no console.

---

## TASK-002 — Camada SQLite via Tauri SQL (`src/db.js`)

**Status:** [x] Concluída em 2026-06-23
**Depende de:** TASK-001

**Objetivo:**
Criar `src/db.js` como única camada de dados, usando `@tauri-apps/plugin-sql`, com as quatro
tabelas e a API pública `DB.*`. Nenhum outro arquivo pode chamar SQL diretamente.

**Arquivos afetados:**
- `src/db.js` (criar)
- `src/app.js` (inicialização por `DB.init()`)
- `src-tauri/Cargo.toml` (dependência Rust do plugin SQL)
- `src-tauri/src/main.rs` (registro do plugin)
- capacidades/permissões Tauri necessárias ao plugin SQL

**Passos:**
1. Registrar o plugin SQL no bootstrap Rust e conceder somente as permissões necessárias.
2. Criar `src/db.js` e carregar o banco local SQLite pelo plugin Tauri SQL.
3. Implementar `DB.init()` para abrir o banco, aplicar migrations e garantir as tabelas
   `subjects`, `study_records`, `review_tasks` e `settings`.
4. Implementar `DB.subjects`:
   - `getAll()` → `SELECT * FROM subjects ORDER BY name`
   - `create(name)` → `INSERT INTO subjects (name, created_at, updated_at) VALUES (?, ?, ?)`
5. Implementar `DB.studyRecords`:
   - `create(data)` → INSERT em study_records
   - `getAll()` → SELECT * FROM study_records
6. Implementar `DB.reviewTasks`:
   - `createBulk(tasks)` → INSERT múltiplos em uma transação
   - `getAll()` → SELECT * FROM review_tasks
   - `getForToday(today)` → `WHERE due_date = ? AND review_done = 0`
   - `getOverdue(today)` → `WHERE due_date < ? AND review_done = 0`
   - `getCompletedToday(today)` → `WHERE completed_at LIKE ? AND review_done = 1`, valor: `today + '%'`
   - `getTomorrow(tomorrow)` → `WHERE due_date = ? AND review_done = 0`
   - `update(id, fields)` → construir UPDATE dinâmico com os campos fornecidos
7. Implementar `DB.settings`:
   - `get()` → `SELECT * FROM settings WHERE key = 'main'`
   - `update(fields)` → UPDATE settings WHERE key = 'main'
8. Implementar `DB.exportAll()` — busca todos os registros das 4 tabelas e retorna objeto.
9. Implementar `DB.importAll(data)` — DELETE + INSERT para todas as tabelas.
10. Chamar `DB.init()` no início de `src/app.js` e aguardar antes de qualquer render.

**Decisão de nomes:** As colunas SQL usam snake_case (`study_date`, `review_done`).
O retorno das queries pode ser consumido diretamente no app.js como snake_case,
ou mapeado para camelCase dentro do `db.js`. Escolher uma convenção em TASK-002 e manter.

**Contrato de isolamento:**
`src/app.js`, `src/stats.js` e componentes de UI usam somente métodos `DB.*`.
IndexedDB e localStorage não são banco principal, fallback, cache ou buffer.

**Critérios de aceite:**
- `DB.init()` executa sem erros no desktop via `npm run tauri dev`.
- `await DB.subjects.create('Matemática')` salva no banco.
- `await DB.subjects.getAll()` retorna o registro criado.
- `DB.settings.get()` retorna o singleton com `app_version = '1.0.0'`.
- `DB.reviewTasks.getForToday('2026-06-22')` retorna apenas revisões do dia (se houver).
- Ao reabrir o app desktop, os dados persistem no SQLite local.
- Busca no projeto confirma que somente `src/db.js` contém comandos SQL da aplicação.
- Commit local contém somente a TASK-002 e deixa o app executável.

**Como testar manualmente:**
1. Iniciar `npm run tauri dev`.
2. No console da aplicação, executar:
   ```javascript
   await DB.subjects.create('Matemática')
   await DB.subjects.getAll()
   ```
3. Verificar que o retorno contém o registro criado.
4. Fechar e reabrir a aplicação e confirmar persistência.
5. Auditar que nenhum arquivo além de `src/db.js` executa SQL.

---

## TASK-003 — Cadastro de disciplinas

**Status:** [x] Concluída em 2026-06-23
**Depende de:** TASK-002

**Objetivo:**
Implementar a interface para criar disciplinas na Tela Cadastro.
Disciplinas alimentam o select do formulário de estudo.

**Arquivos afetados:**
- `index.html` (adicionar UI de disciplinas em `#screen-register`)
- `src/styles.css` (estilos do input inline de nova disciplina)
- `src/app.js` (lógica de criar disciplina e atualizar select)

**Passos:**
1. Em `#screen-register`, adicionar select `#subject-select` com opção padrão "Selecione...".
2. Adicionar botão "＋ Nova disciplina" abaixo do select.
3. Ao clicar, exibir input inline `#new-subject-input` com botão "Adicionar".
4. Ao confirmar, chamar `DB.subjects.create(name)`.
5. Após criar, recarregar o select com todas as disciplinas.
6. Ocultar o input inline e selecionar a disciplina recém-criada.
7. Validar: nome não pode estar vazio.
8. Validar: nome duplicado exibe mensagem de erro amigável (não alert()).

**Critérios de aceite:**
- Criar "Matemática" → aparece no select imediatamente.
- Tentar criar "Matemática" novamente → exibe mensagem de erro.
- Campo nome vazio → exibe mensagem de erro.
- Após criar, input some e a nova disciplina está selecionada.
- Ao reabrir o app, disciplinas persistem (dado está no SQLite, não no DOM).

**Como testar manualmente:**
1. Ir para Tela Cadastro.
2. Clicar em "+ Nova disciplina", digitar "Matemática", confirmar.
3. Verificar que aparece no select.
4. Tentar criar "Matemática" novamente e verificar o erro.
5. Fechar e reabrir o app. Verificar que "Matemática" persiste.

---

## TASK-004 — Cadastro de estudo (studyRecord)

**Status:** [ ] Pendente
**Depende de:** TASK-003

**Objetivo:**
Implementar o formulário de cadastro de estudo com os 4 campos obrigatórios/opcionais.

**Arquivos afetados:**
- `index.html` (formulário em `#screen-register`)
- `src/styles.css` (estilos do formulário)
- `src/app.js` (submit do formulário)

**Passos:**
1. Em `#screen-register`, adicionar formulário com campos:
   - Select de disciplina (já criado na TASK-003)
   - Date `#study-date` (default = hoje)
   - Text `#study-content` (obrigatório)
   - Text `#study-source` (opcional)
2. Adicionar botão "Salvar e gerar revisões".
3. No submit, validar campos obrigatórios.
4. Chamar `DB.studyRecords.create({ subjectId, studyDate, content, source })`.
5. Exibir mensagem de sucesso.
6. Limpar formulário (manter data como hoje, manter disciplina selecionada).
7. Não navegar para outra tela automaticamente (o aluno pode querer cadastrar outro).

**Critérios de aceite:**
- Campos obrigatórios vazios → exibe erro, não salva.
- Cadastro bem-sucedido → exibe "Estudo salvo! Revisões geradas." (ou similar).
- Formulário limpa após salvar (exceto disciplina e data).
- `studyRecord` aparece no banco SQLite (verificável via console ou Database Inspector).
- Data padrão é a data atual no formato YYYY-MM-DD.

**Como testar manualmente:**
1. Ir para Tela Cadastro.
2. Selecionar disciplina, preencher conteúdo.
3. Clicar em "Salvar". Verificar mensagem de sucesso.
4. No console, executar `await DB.studyRecords.getAll()` e verificar o registro.
5. Tentar salvar sem conteúdo e verificar o erro.

---

## TASK-005 — Geração automática de revisões

**Status:** [ ] Pendente
**Depende de:** TASK-004

**Objetivo:**
Ao salvar um estudo, gerar automaticamente 16 tarefas de revisão com as datas corretas.

**Arquivos afetados:**
- `src/app.js` (função `generateReviewTasks(studyRecordId, studyDate)`)
- `src/db.js` (método `DB.reviewTasks.createBulk(tasks)`)

**Passos:**
1. Implementar `generateReviewDates(studyDate)` em `app.js`:
   - R1: D+1, R2: D+7, R3: D+15, R4: D+30
   - R5-R16: D+60, D+90, D+120, D+150, D+180, D+210, D+240, D+270, D+300, D+330, D+360, D+390
2. Para cada data, criar objeto `reviewTask` com `reviewDone: false`, `questionsDone: false`, etc.
3. Implementar `DB.reviewTasks.createBulk(tasks)` em `db.js` — insere todos em uma transação.
4. Chamar `generateReviewTasks` imediatamente após criar o `studyRecord`.
5. Não exigir clique extra do usuário.

**Critérios de aceite:**
- Estudo em 2026-06-22 gera R1 em 2026-06-23.
- Gera R2 em 2026-06-29 (D+7).
- Gera R3 em 2026-07-07 (D+15).
- Gera R4 em 2026-07-22 (D+30).
- Gera R5 em 2026-08-21 (D+60).
- Total de 16 revisões por estudo no banco SQLite.
- Revisões criadas sem clique adicional do usuário.
- `reviewDone` e `questionsDone` iniciam como `false`.

**Como testar manualmente:**
1. Cadastrar um estudo.
2. No console, executar `await DB.reviewTasks.getAll()`.
3. Verificar que existem exatamente 16 registros para o estudo.
4. Verificar as datas de R1, R2, R3, R4.
5. No desktop Tauri, fechar e reabrir o app; repetir `DB.reviewTasks.getAll()` para confirmar
   que os registros persistiram no SQLite local.

---

## TASK-006 — Tela Hoje — cards mobile

**Status:** [ ] Pendente
**Depende de:** TASK-005

**Objetivo:**
Implementar a Tela Hoje com os 4 blocos e os cards de revisão para mobile.

**Arquivos afetados:**
- `index.html` (estrutura dos blocos em `#screen-today`)
- `src/styles.css` (estilos dos cards e blocos)
- `src/app.js` (função `renderToday()`)

**Passos:**
1. Em `#screen-today`, criar 4 seções: `#block-overdue`, `#block-today`, `#block-done-today`, `#block-tomorrow`.
2. Cada seção tem um `<h2>` e um contêiner de cards.
3. Implementar `renderToday()` em `app.js`:
   a. Buscar revisões dos 4 grupos via `DB.reviewTasks.*`.
   b. Para cada revisão, buscar o `studyRecord` e `subject` correspondentes.
   c. Montar HTML do card com todos os campos listados na spec.
   d. Inserir nos contêineres corretos.
   e. Ocultar blocos vazios.
4. Chamar `renderToday()` ao:
   - Iniciar o app.
   - Navegar para a Tela Hoje.
   - Após qualquer ação na tela.
5. Estilizar card: borda, sombra leve, padding, badge de status (Atrasada / Hoje / R-number).

**Critérios de aceite:**
- Revisão atrasada aparece no bloco "Atrasadas" com badge amarelo/âmbar.
- Revisão de hoje aparece no bloco "Hoje".
- Revisão feita hoje aparece no bloco "Feitas hoje".
- Revisão de amanhã aparece no bloco "Amanhã".
- Bloco vazio fica oculto.
- Card mostra: disciplina, conteúdo, fonte, data do estudo, tipo de revisão, data prevista.
- Layout responsivo em 375px.

**Como testar manualmente:**
1. Cadastrar um estudo com data de ontem.
2. Abrir Tela Hoje. Verificar que aparece em "Atrasadas".
3. Cadastrar um estudo com data de hoje.
4. Verificar que R1 (D+1) aparece em "Amanhã".
5. Alterar a data do sistema para o dia da revisão e verificar que aparece em "Hoje".

---

## TASK-007 — Tela Hoje — tabela desktop

**Status:** [ ] Pendente
**Depende de:** TASK-006

**Objetivo:**
Adicionar layout em tabela para a Tela Hoje em telas ≥ 768px.

**Arquivos afetados:**
- `index.html` (estrutura alternativa de tabela, opcional — pode ser via CSS)
- `src/styles.css` (media query 768px, estilos da tabela)
- `src/app.js` (ajuste no renderToday se necessário)

**Passos:**
1. Definir estratégia: mesmos cards mas com CSS diferente no breakpoint, ou tabela separada.
   - Abordagem recomendada: usar CSS Grid no card para parecer linha de tabela no desktop.
   - Se isso for difícil, renderizar `<table>` para desktop via JS e ocultar os cards.
2. Em 768px+, transformar o layout dos cards em linhas tabulares.
3. Adicionar cabeçalho de colunas visível no desktop.
4. Manter todos os campos e ações funcionais no layout de tabela.

**Critérios de aceite:**
- Em 375px: layout de cards empilhados.
- Em 768px+: layout de tabela com cabeçalho.
- Nenhuma funcionalidade perdida no desktop.
- Overflow horizontal em tela menor que a tabela (não quebra layout).

**Como testar manualmente:**
1. Abrir no Chrome com DevTools em modo mobile (375px). Verificar cards.
2. Mudar para desktop (1280px). Verificar tabela.
3. Redimensionar a janela e verificar transição.

---

## TASK-008 — Marcar revisão como feita

**Status:** [ ] Pendente
**Depende de:** TASK-006

**Objetivo:**
Implementar a ação de marcar uma revisão como feita (e reverter).

**Arquivos afetados:**
- `src/app.js` (handler de click no checkbox/botão de revisão)
- `src/db.js` (já coberto pelo `update`)

**Passos:**
1. Adicionar checkbox ou botão "Rev feita" em cada card.
2. Ao marcar:
   - `DB.reviewTasks.update(id, { reviewDone: true, completedAt: new Date().toISOString() })`.
3. Ao desmarcar:
   - `DB.reviewTasks.update(id, { reviewDone: false, completedAt: null })`.
4. Após a ação, chamar `renderToday()` para mover o card para o bloco correto.

**Critérios de aceite:**
- Marcar revisão como feita → card move para "Feitas hoje".
- Desmarcar → card volta ao bloco original (Hoje ou Atrasadas).
- `reviewDone` e `completedAt` corretos no banco SQLite.
- Ação ocorre sem recarregar a página.

**Como testar manualmente:**
1. Com uma revisão em "Hoje", clicar em "Rev feita".
2. Verificar que move para "Feitas hoje".
3. Desmarcar e verificar que volta para "Hoje".
4. No console: `await DB.reviewTasks.getAll()` e verificar `review_done` e `completed_at`.

---

## TASK-009 — Registrar questões e acertos

**Status:** [ ] Pendente
**Depende de:** TASK-006

**Objetivo:**
Implementar o registro de questões feitas, quantidade e acertos com cálculo automático do percentual.

**Arquivos afetados:**
- `index.html` (inputs nos cards em `#screen-today`)
- `src/styles.css` (estilos dos inputs inline nos cards)
- `src/app.js` (handlers de blur/change, cálculo de percentual)

**Passos:**
1. Adicionar em cada card:
   - Checkbox "Q feita" → `questionsDone`.
   - Input numérico "Questões" → `questionsCount`.
   - Input numérico "Acertos" → `correctCount`.
   - Span `scorePercent` (read-only, calculado e atualizado em tempo real).
2. Evento `input` em `questionsCount` ou `correctCount` (enquanto digita):
   - Recalcular `scorePercent` e atualizar o display na tela **imediatamente**.
   - Se `questionsCount = 0` ou vazio: exibir "-".
   - **Não salvar no banco de dados neste evento.**
3. Evento `blur` (perder foco) ou tecla `Enter` em `questionsCount` ou `correctCount`:
   - Salvar `DB.reviewTasks.update(id, { questionsCount, correctCount, scorePercent })`.
   - Este é o único momento em que o banco SQLite é escrito para esses campos.
4. Ao marcar "Q feita" (change no checkbox):
   - Salvar `DB.reviewTasks.update(id, { questionsDone: true })`.
   - Ao desmarcar: `DB.reviewTasks.update(id, { questionsDone: false })`.

**Critérios de aceite:**
- Digitar 10 questões e 8 acertos → exibe "80.0%" automaticamente.
- Digitar 0 questões → exibe "-".
- Valores persistem após recarregar a página.
- Nenhum botão "Salvar" explícito necessário para questões/acertos.
- Divisão por zero não gera erro no console.

**Como testar manualmente:**
1. Abrir uma revisão na Tela Hoje.
2. Digitar 5 em "Questões" e 4 em "Acertos".
3. Clicar fora do campo. Verificar que exibe "80.0%".
4. Recarregar a página e verificar que os valores persistem.
5. Digitar 0 em "Questões". Verificar que exibe "-".

---

## TASK-010 — Comentário por tarefa

**Status:** [ ] Pendente
**Depende de:** TASK-009

**Objetivo:**
Implementar campo de comentário opcional por revisão com salvamento automático.

**Arquivos afetados:**
- `index.html` (textarea/input de comentário nos cards)
- `src/app.js` (handler de blur no comentário)

**Passos:**
1. Adicionar textarea ou input de comentário em cada card.
2. Ao perder foco (`blur`), salvar `DB.reviewTasks.update(id, { comment: value })`.
3. Exibir comentário salvo ao renderizar o card.
4. Campo vazio é válido (comentário é opcional).

**Critérios de aceite:**
- Digitar comentário e clicar fora → salvo automaticamente.
- Comentário persiste após recarregar a página.
- Campo comentário não é obrigatório.
- Nenhum botão "Salvar" necessário.

**Como testar manualmente:**
1. Digitar um comentário em uma revisão.
2. Clicar fora do campo.
3. Recarregar a página.
4. Verificar que o comentário persiste.

---

## TASK-011 — Tela Estatísticas — métricas

**Status:** [ ] Pendente
**Depende de:** TASK-009

**Objetivo:**
Implementar a Tela Estatísticas com todos os totais, médias e contadores.

**Arquivos afetados:**
- `index.html` (estrutura de `#screen-stats`)
- `src/styles.css` (estilos dos cards de estatísticas)
- `src/stats.js` (criar: `Stats.calculate(reviewTasks, studyRecords, subjects)`)
- `src/app.js` (chamar Stats.calculate e renderizar)

**Passos:**
1. Criar `stats.js` com função `Stats.calculate(reviewTasks, studyRecords, subjects)`.
   - `reviewTasks`: todos os registros do store reviewTasks.
   - `studyRecords`: todos os registros do store studyRecords (necessário para o join subjectId).
   - `subjects`: todos os registros do store subjects.
2. Calcular:
   - `totalQuestions`: soma de `questionsCount` onde `questionsDone = true`.
   - `totalCorrect`: soma de `correctCount` onde `questionsDone = true`.
   - `avgScore`: `(totalCorrect / totalQuestions) * 100` (ou 0 se 0 questões).
   - `avgBySubject`: join `reviewTask.studyRecordId → studyRecord.subjectId → subject.name`,
     agrupar por disciplina e calcular média de `scorePercent` onde `questionsDone = true`.
   - `reviewsDone`: count onde `reviewDone = true`.
   - `reviewsPending`: count onde `reviewDone = false` e `dueDate >= hoje`.
   - `reviewsOverdue`: count onde `reviewDone = false` e `dueDate < hoje`.
3. Renderizar na `#screen-stats`:
   - Cards de resumo com as métricas acima.
   - Tabela de médias por disciplina.
   - Placeholder para o gráfico (`<canvas id="evolution-chart">`).
4. Chamar `renderStats()` ao navegar para a tela.

**Critérios de aceite:**
- Total de questões, acertos e média geral corretos.
- Média por disciplina calculada corretamente.
- Contadores de revisões corretos.
- Tela atualiza a cada visita.
- Funciona com 0 dados (exibe zeros, sem erro).

**Como testar manualmente:**
1. Cadastrar 2 estudos com disciplinas diferentes.
2. Registrar questões em algumas revisões.
3. Navegar para Estatísticas.
4. Verificar que os totais e médias batem com os dados registrados.

---

## TASK-012 — Gráfico de evolução das notas

**Status:** [ ] Pendente
**Depende de:** TASK-011

**Objetivo:**
Implementar o gráfico de evolução do percentual de acertos ao longo do tempo usando canvas nativo.

**Arquivos afetados:**
- `src/stats.js` (função `Stats.renderChart(canvas, dataPoints)`)
- `index.html` (`<canvas id="evolution-chart">` em `#screen-stats`)
- `src/app.js` (chamar `Stats.renderChart` ao renderizar a tela)

**Passos:**
1. Implementar `Stats.renderChart(canvas, dataPoints)` em `stats.js`:
   - `dataPoints`: array de `{ date: 'YYYY-MM-DD', scorePercent: number }`, ordenado por data.
   - Obter contexto 2D do canvas.
   - Definir dimensões e margens.
   - Desenhar eixo X (datas simplificadas, ex: "Jun/10") e eixo Y (0-100%).
   - Desenhar linha conectando os pontos.
   - Desenhar pontos (círculos pequenos) em cada dataPoint.
2. Construir `dataPoints` em `app.js` filtrando revisões que atendam **todas** as condições:
   - `questionsDone = true`
   - `scorePercent != null`
   - `completedAt != null`
   Ordenar pelo campo `completedAt` (ordem crescente). Mapear para
   `{ date: completedAt.slice(0, 10), scorePercent }`.
3. Exibir mensagem "Sem dados suficientes para o gráfico" se `dataPoints.length < 2`.
4. `<canvas>` com `width` e `height` definidos por JS (não CSS) para evitar distorção.

**Critérios de aceite:**
- Gráfico exibe corretamente com 3+ pontos de dados.
- Eixo Y vai de 0 a 100%.
- Eixo X mostra datas legíveis.
- Linha conecta os pontos em ordem cronológica.
- Com menos de 2 pontos, exibe mensagem amigável.
- Gráfico não distorce em diferentes tamanhos de tela.

**Como testar manualmente:**
1. Registrar questões em 3+ revisões diferentes.
2. Navegar para Estatísticas.
3. Verificar que o gráfico aparece com linha e pontos.
4. Verificar eixos e labels.
5. Testar em mobile (375px) e desktop (1280px).

---

## TASK-013 — Exportar backup JSON

**Status:** [ ] Pendente
**Depende de:** TASK-002

**Objetivo:**
Implementar a exportação de todos os dados como arquivo JSON para download.

**Arquivos afetados:**
- `index.html` (botão em `#screen-settings`)
- `src/app.js` (função `exportBackup()`)

**Passos:**
1. Em `#screen-settings`, adicionar botão "Exportar backup".
2. Exibir data do último backup abaixo do botão (lida de `settings.lastBackupAt`).
3. Implementar `exportBackup()` em `app.js`:
   a. Chamar `DB.exportAll()`.
   b. Serializar para JSON com `JSON.stringify(data, null, 2)`.
   c. Criar Blob e URL temporária.
   d. Criar link `<a>` com `download="smartlearn-backup-YYYY-MM-DD.json"` e clicar nele.
   e. Revogar URL temporária.
   f. Atualizar `settings.lastBackupAt` no banco.
   g. Atualizar texto "Último backup" na tela.

**Critérios de aceite:**
- Clique no botão → download do arquivo JSON automático.
- Nome do arquivo inclui a data atual (ex: `smartlearn-backup-2026-06-22.json`).
- Arquivo contém `{ subjects, studyRecords, reviewTasks, settings }`.
- Texto "Último backup" atualiza após a exportação.
- Funciona no desktop Tauri e permanece compatível com os alvos móveis.

**Como testar manualmente:**
1. Cadastrar alguns dados.
2. Ir para Configurações, clicar em "Exportar backup".
3. Verificar que o arquivo é baixado.
4. Abrir o arquivo JSON e verificar a estrutura e os dados.
5. Verificar que "Último backup" foi atualizado.

---

## TASK-014 — Importar backup JSON

**Status:** [ ] Pendente
**Depende de:** TASK-013

**Objetivo:**
Implementar a importação de um arquivo JSON de backup, substituindo todos os dados atuais.

**Arquivos afetados:**
- `index.html` (input de arquivo em `#screen-settings`)
- `src/app.js` (função `importBackup(file)`)

**Passos:**
1. Em `#screen-settings`, adicionar `<input type="file" accept=".json">` e label "Importar backup".
2. Ao selecionar arquivo:
   a. Exibir aviso: "Isso substituirá todos os dados atuais. Continuar?" via `window.confirm()`.
   b. Se cancelar, não fazer nada.
   c. Se confirmar, ler o arquivo com `FileReader`.
3. Parsear o JSON.
4. Validar estrutura mínima: deve ter `subjects`, `studyRecords`, `reviewTasks`.
5. Chamar `DB.importAll(data)`.
6. Exibir mensagem de sucesso e recarregar a Tela Hoje.
7. Tratar erros: JSON inválido, estrutura incorreta.

**Critérios de aceite:**
- Importar arquivo válido → dados substituídos, app recarrega Tela Hoje.
- Importar arquivo inválido (não JSON) → exibe erro amigável.
- Importar JSON sem estrutura correta → exibe erro amigável.
- Cancelar no confirm → nada acontece.
- Dados do backup aparecem corretamente após importação.

**Como testar manualmente:**
1. Exportar um backup.
2. Criar novos dados.
3. Importar o backup antigo.
4. Verificar que os dados voltaram para o estado do backup.
5. Tentar importar um arquivo `.txt` renomeado como `.json`. Verificar erro.

---

## TASK-015 — Tauri 2 — validação Android e preparação iOS

**Status:** [ ] Pendente
**Depende de:** TASK-002

> **Desktop é o primeiro alvo funcional. Esta task valida Android posteriormente e confirma
> que iOS continua preparado na mesma base. O build real de iOS não faz parte desta task,
> pois exige ambiente Apple/Mac.**

**Objetivo:**
Validar a aplicação Tauri 2 no Android usando a mesma interface, a mesma camada `DB.*` e o
mesmo modelo SQLite do desktop, sem criar uma segunda aplicação ou base de código.

**Arquivos afetados:**
- `src-tauri/tauri.conf.json` (ajustes multiplataforma, se necessários)
- `src-tauri/` (configuração mobile gerada pelo Tauri 2)
- capacidades/permissões do plugin SQL para mobile
- `README.md` (instruções verificadas de Android e restrição de build iOS)

**Pré-requisitos obrigatórios (bloqueadores desta task):**
- Toolchain Tauri 2 mobile compatível instalada conforme a versão fixada no projeto.
- Android Studio, Android SDK, NDK e JDK configurados conforme os requisitos dessa versão.
- TASK-002 validada no desktop com SQLite nativo.
- Emulador Android ou dispositivo físico disponível.

**Passos:**
1. Consultar `npx tauri --help` e a documentação correspondente à versão fixada no lockfile;
   registrar no README os comandos Android efetivamente disponíveis antes de executá-los.
2. Inicializar o alvo Android pela CLI Tauri 2 instalada.
3. Confirmar que o plugin SQL e suas permissões estão incluídos no alvo Android.
4. Executar a aplicação no emulador ou dispositivo físico.
5. Verificar Tela Hoje, navegação, persistência SQLite e operação offline.
6. Confirmar que nenhum arquivo específico de Android contém lógica de produto duplicada.
7. Documentar a preparação iOS na mesma base e a exigência de Apple/Mac para o build real.

**Critérios de aceite:**
- Inicialização e execução Android pela CLI Tauri 2 instalada concluem sem erros.
- App instala e abre no emulador ou dispositivo físico.
- Tela Hoje exibe sem crash.
- SQLite nativo persiste dados usando a mesma API `DB.*` do desktop.
- App funciona offline.
- iOS está documentado e preparado na mesma base, sem alegar build validado fora de Apple/Mac.
- Commit local contém somente a TASK-015 e deixa o repositório funcional.

**Como testar manualmente:**
1. Seguir os comandos Tauri 2 registrados no README para a versão instalada.
2. Abrir o app no emulador ou dispositivo físico Android.
3. Navegar pelas quatro telas e criar dados de teste.
4. Fechar e reabrir o app; confirmar persistência.
5. Desativar a rede e confirmar funcionamento offline.
6. Verificar logs Android e confirmar ausência de erros do plugin SQL.

---

## TASK-016 — Polimento — acessibilidade e responsividade

**Status:** [ ] Pendente
**Depende de:** TASK-014, TASK-015

**Objetivo:**
Revisão final de acessibilidade, responsividade e usabilidade antes de considerar o MVP completo.
Só faz sentido executar depois que backup/importação (TASK-014) e a validação móvel Tauri 2
(TASK-015) estiverem prontas, pois o polimento cobre todas as telas e fluxos do app.

**Arquivos afetados:**
- `src/styles.css` (ajustes finais)
- `index.html` (atributos ARIA, labels)
- `src/app.js` (ajustes menores de UX)

**Passos:**
1. Verificar que todos os inputs têm `<label>` visível associado.
2. Verificar área de toque dos botões: mínimo 44x44px no mobile.
3. Verificar checkboxes com área clicável adequada.
4. Verificar contraste de texto (mínimo 4.5:1 para texto normal).
5. Testar navegação por teclado no desktop (Tab, Enter, Space).
6. Adicionar `aria-label` onde necessário (botões sem texto visível, ícones).
7. Verificar que blocos vazios exibem mensagens amigáveis (ex: "Nenhuma revisão atrasada").
8. Testar nos alvos móveis Tauri para iOS e Android quando os ambientes estiverem disponíveis.
9. Verificar que o layout não quebra em 320px (iPhone SE antigo).
10. Corrigir qualquer problema encontrado nos passos acima.

**Critérios de aceite:**
- Todos os campos têm label visível.
- Navegação por teclado funciona nas 3 telas principais.
- Contraste adequado em todos os textos.
- App usável em iPhone SE (320px) e em desktop (1440px).
- Nenhum erro no console da aplicação desktop ou mobile.
- Mensagens de estado vazio amigáveis em todos os blocos.

**Como testar manualmente:**
1. Navegar pelo app desktop usando teclado (Tab, Enter, Space, setas).
2. Verificar contraste com DevTools > Accessibility.
3. Testar no emulador Android com resolução Galaxy S21 (360×800) e Pixel 6 (412×915).
4. Testar no dispositivo físico Android se disponível.
5. Verificar Logcat: nenhum erro ou crash.
6. Verificar console do runtime Tauri durante o desenvolvimento: nenhum warning inesperado.
