# design.md — MVP HTML/JS Study App

**Feature:** mvp-html-js-study-app
**Fase:** 1 — MVP Local

---

## Arquitetura geral

Aplicação Tauri 2 com interface web (SPA manual). A interface é HTML/CSS/JS puro,
empacotada por Vite e executada por Tauri no desktop, iOS e Android a partir da mesma base.
Desktop é o primeiro alvo local; Android vem depois e o build real de iOS exige Apple/Mac.
O banco é SQLite nativo no dispositivo, acessado via `@tauri-apps/plugin-sql`.
A navegação entre telas usa CSS display toggle (sem router externo).

```
index.html                  — shell da aplicação e entrada do Vite
src/styles.css              — estilos mobile-first, variáveis CSS, componentes
src/app.js                  — orquestrador: inicialização, eventos, navegação, UI
src/db.js                   — única camada autorizada a acessar SQLite
src/stats.js                — cálculos estatísticos e renderização do gráfico
src-tauri/tauri.conf.json   — configuração multiplataforma do Tauri 2
src-tauri/src/main.rs       — bootstrap e registro de plugins Tauri
package.json                — dependências npm (Tauri API + plugin SQL + Vite)
```

---

## Estrutura de arquivos

```
SmartLearn/
├── .git/
├── .gitignore
├── .specs/
├── package.json
├── vite.config.js
├── index.html
├── src/
│   ├── app.js
│   ├── db.js
│   ├── stats.js
│   └── styles.css
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       └── main.rs
└── README.md
```

**Setup inicial do projeto (TASK-000, sem código funcional):**
```bash
npm init -y
npm install
npm install @tauri-apps/api @tauri-apps/plugin-sql
npm install -D @tauri-apps/cli vite
npx tauri init
```

Rust, os pré-requisitos do Tauri 2 e o registro Rust do plugin SQL devem ser documentados
em TASK-000. A configuração funcional do banco pertence à TASK-002.

**Execução local desktop:**
```bash
npm run tauri dev
```

Android é validado posteriormente pela CLI Tauri 2 e toolchain Android compatível.
iOS usa a mesma base, mas o build real é executado apenas em ambiente Apple/Mac.

---

## Responsabilidades por arquivo

### index.html

- `<head>` com meta viewport, tema e entrada JavaScript do Vite.
- Nav bar com 3 tabs: Hoje, Cadastro, Estatísticas.
- Seção `#screen-today` — Tela Detalhes/Hoje.
- Seção `#screen-register` — Tela RP/Cadastro.
- Seção `#screen-stats` — Tela Estatísticas.
- Seção `#screen-settings` — Configurações e backup (acessível via ícone ou link).
- Nenhuma lógica JavaScript inline.

### styles.css

Organização:
1. Reset e variáveis CSS (`--color-primary`, `--color-bg`, `--font-size-base`, etc.)
2. Base (body, tipografia)
3. Nav bar
4. Componentes: card, badge, checkbox, input, button
5. Tela Hoje (cards mobile, tabela desktop)
6. Tela Cadastro
7. Tela Estatísticas
8. Tela Configurações
9. Utilitários (hidden, sr-only, etc.)
10. Media queries (breakpoint principal: 768px)

### db.js

Expõe um objeto global `DB` com métodos assíncronos.
Usa `@tauri-apps/plugin-sql` como driver SQLite. Toda query é SQL parametrizado.
A interface pública permanece igual ao que `app.js` espera — o que muda é a implementação.
Nenhum outro arquivo pode importar o plugin SQL nem executar comandos SQL.

```javascript
DB.init()                               // abre o banco SQLite, cria tabelas, insere settings
DB.subjects.getAll()                    // SELECT * FROM subjects ORDER BY sort_order, name
DB.subjects.getActive()                 // SELECT ativos para o select de estudo/RP
DB.subjects.create(name)                // INSERT INTO subjects ...
DB.subjects.update(id, fields)          // editar name, isActive, sortOrder
DB.subjects.deactivate(id)              // is_active = 0, preservando histórico
DB.subjects.deleteCascade(id)           // apaga review_tasks, study_records e subject da disciplina
DB.sources.getAll()                     // SELECT * FROM sources ORDER BY sort_order, name
DB.sources.getActive()                  // SELECT fontes ativas para o select de estudo/RP
DB.sources.create(name)                 // INSERT INTO sources ...
DB.sources.update(id, fields)           // editar name, isActive, sortOrder
DB.sources.deactivate(id)               // is_active = 0, preservando histórico
DB.studyRecords.create(data)           // INSERT INTO study_records com subjectId e sourceId
DB.studyRecords.getAll()               // SELECT * FROM study_records
DB.reviewTasks.getAll()                // SELECT * FROM review_tasks
DB.reviewTasks.getForToday(today)      // WHERE due_date = ? AND review_done = 0
DB.reviewTasks.getOverdue(today)       // WHERE due_date < ? AND review_done = 0
DB.reviewTasks.getCompletedToday(today)// WHERE completed_at LIKE ? AND review_done = 1
DB.reviewTasks.getTomorrow(tomorrow)   // WHERE due_date = ? AND review_done = 0
DB.reviewTasks.update(id, fields)      // UPDATE review_tasks SET ... WHERE id = ?
DB.reviewTasks.createBulk(tasks)       // INSERT em transação única
DB.exportAll()                         // retorna { subjects, sources, studyRecords, reviewTasks, settings }
DB.importAll(data)                     // DROP + CREATE + INSERT de todos os dados
```

`today` e `tomorrow` são strings `"YYYY-MM-DD"` passadas de `app.js`.
`getCompletedToday(today)` usa `completed_at LIKE '2026-06-22%'` para comparar apenas a data.

`DB.init()` também executa seed idempotente inicial:
- disciplinas: `Língua Portuguesa`, `Conhecimentos sobre o DF`, `Legislação`, `Administração`,
  `AFO`, `Arquivologia`, `Recursos Materiais`;
- fontes: `Grancursos`.

O seed normaliza nomes antes de comparar, não duplica registros, preserva `sort_order` e não
sobrescreve dados existentes.

**Padrão de query parametrizada:**
```javascript
const rows = await db.select(
  'SELECT * FROM review_tasks WHERE due_date = $1 AND review_done = 0',
  [today]
);
return rows;
```

Colunas SQL (snake_case) são convertidas para camelCase no retorno, ou consumidas diretamente
se a diferença não impactar a lógica. Decisão de implementação a tomar em TASK-002.

### app.js

- Chama `DB.init()` ao carregar.
- Gerencia qual tela está ativa.
- Escuta eventos da nav bar.
- Renderiza a Tela Hoje chamando `DB.reviewTasks.*` e montando o HTML dos cards.
- Escuta eventos dos cards: checkboxes, inputs de questões/acertos, comentário.
- Chama `DB.reviewTasks.update()` ao detectar mudança (blur/change).
- Renderiza a Tela Cadastro com o form.
- Escuta submit do form, chama `DB.studyRecords.create()` e recarrega a Tela Hoje.
- Delega cálculos e gráfico para `stats.js`.
- Gerencia exportação e importação de backup.

### stats.js

Expõe funções:

```javascript
Stats.calculate(reviewTasks, studyRecords, subjects) // retorna objeto com todas as métricas
Stats.renderChart(canvas, dataPoints)                // desenha o gráfico de evolução no <canvas>
```

`Stats.calculate` recebe os três stores porque o cálculo de `avgBySubject` exige o join:
`reviewTask.studyRecordId` → `studyRecord.subjectId` → `subject.name`.

O gráfico usa `<canvas>` nativo (2D context). Linha simples de percentual × tempo.
Não usa Chart.js ou outra biblioteca. Justificativa: o gráfico é uma linha simples;
a complexidade de uma biblioteca não se justifica para este caso.

Se durante a implementação a renderização nativa se mostrar muito custosa para o prazo,
rever esta decisão e registrar em STATE.md. Chart.js (CDN) é a alternativa preferida
por ser leve e ter boa reputação, mas só se necessário.

---

## Layout — Tela Hoje (Detalhes)

### Mobile (< 768px) — Cards

```
┌─────────────────────────────┐
│ [badge: ATRASADA]           │
│ Direito Constitucional       │
│ Princípios fundamentais      │
│ Fonte: Apostila XYZ          │
│ Aula: 2026-05-10  Rev: R3   │
│ Previsto: 2026-06-25         │
│─────────────────────────────│
│ [✓] Rev feita               │
│ [✓] Q feita                 │
│ Questões: [___]  Acertos: [___]  %: 75.0% │
│ Comentário: [________________________]     │
└─────────────────────────────┘
```

Cards empilhados verticalmente por bloco.
Cabeçalho do bloco colapsável (opcional, mas não obrigatório no MVP).

### Desktop (≥ 768px) — Tabela

```
┌──────┬─────────┬───────────┬──────┬─────┬──────┬───────┬────┬────┬─────┬───────────────┐
│ Rev  │ Discipl.│ Conteúdo  │ Fonte│Aula │ Prev.│RevOK │QOK │ Q  │ Ac. │  %   │Comentário│
├──────┼─────────┼───────────┼──────┼─────┼──────┼───────┼────┼────┼─────┼───────────────┤
│ R3   │ Dir.Const│Princípios│Apost.│05/10│06/25 │  [✓] │[✓]│[5] │[4] │ 80% │ [_____]   │
└──────┴─────────┴───────────┴──────┴─────┴──────┴───────┴────┴────┴─────┴───────────────┘
```

---

## Layout — Tela Cadastro (RP)

```
┌─────────────────────────────┐
│ Disciplina *                 │
│ [Select ▼                 ] │
│ [+ Nova disciplina]          │
│                              │
│ Data da aula *               │
│ [2026-06-22              ] │
│                              │
│ Conteúdo *                   │
│ [________________________] │
│                              │
│ Fonte *                      │
│ [Select ▼                 ] │
│ [+ Nova fonte]               │
│                              │
│ [    Salvar e gerar revisões ] │
└─────────────────────────────┘
```

"Nova disciplina" abre um input inline (sem modal).
Ao confirmar, a disciplina é persistida em `subjects`, o select é recarregado e a nova disciplina
fica selecionada no cadastro atual. O fluxo normal usa seleção por `subject_id`; não há digitação
livre de nome de disciplina no estudo.

"Nova fonte" segue o mesmo padrão: input inline, persistência em `sources`, recarga do select e
seleção automática da fonte recém-criada. Se `Grancursos` for a única fonte ativa, fica
pré-selecionada automaticamente. O fluxo normal usa seleção por `source_id`; não há digitação livre
de fonte no estudo.

---

## Layout — Área de Disciplinas

Área própria para gerenciamento de disciplinas, acessível pela tela Cadastro/RP ou seção equivalente.

```
┌─────────────────────────────┐
│ Disciplinas                 │
│ [Nova disciplina]           │
│                             │
│ Matemática        [Editar] [Desativar] [Excluir] │
│ Direito Civil     [Editar] [Desativar] [Excluir] │
└─────────────────────────────┘
```

Regras:
- Listar disciplinas por `sort_order`, depois `name`.
- Criar disciplina com nome obrigatório.
- Normalizar nome com `trim()`, colapso de espaços múltiplos e comparação case-insensitive antes de salvar.
- Editar disciplina inline ou em bloco simples, sem fluxo profundo.
- Desativar disciplina com `is_active = 0`; não apagar registros históricos.
- Excluir disciplina é destrutivo: apagar `review_tasks` dos estudos da disciplina, depois
  `study_records` da disciplina e por fim a linha em `subjects`.
- Excluir exige confirmação explícita com aviso de perda de todos os dados relacionados.
- Disciplinas desativadas não aparecem no select normal de novo estudo.

---

## Layout — Área de Fontes

Área própria para gerenciamento de fontes, acessível pela tela Cadastro/RP ou seção equivalente.

```
┌─────────────────────────────┐
│ Fontes                      │
│ [Nova fonte]                │
│                             │
│ Grancursos        [Editar] [Desativar] │
└─────────────────────────────┘
```

Regras:
- Listar fontes por `sort_order`, depois `name`.
- Criar fonte com nome obrigatório.
- Normalizar nome com `trim()`, colapso de espaços múltiplos e comparação case-insensitive antes de salvar.
- Editar fonte inline ou em bloco simples, sem fluxo profundo.
- Desativar fonte com `is_active = 0`; não apagar registros históricos.
- Fontes desativadas não aparecem no select normal de novo estudo.
- `Grancursos` vem do seed inicial e deve existir automaticamente na primeira abertura.

---

## Layout — Tela Estatísticas

```
┌────────────────────────────────────┐
│ Resumo                              │
│ Questões: 320   Acertos: 248        │
│ Média geral: 77.5%                  │
│                                     │
│ Por disciplina                      │
│ Dir. Const.    85.0%  (120q / 102a) │
│ Matemática     68.0%  (200q / 136a) │
│                                     │
│ Revisões                            │
│ Feitas: 45   Pendentes: 12          │
│ Atrasadas: 3                        │
│                                     │
│ Evolução das notas                  │
│ ┌─────────────────────────────┐    │
│ │  %                          │    │
│ │ 100 ┤         ╭──╮          │    │
│ │  75 ┤    ╭────╯  ╰──        │    │
│ │  50 ┤────╯                  │    │
│ │     └───────────────── data │    │
│ └─────────────────────────────┘    │
└────────────────────────────────────┘
```

---

## Layout — Tela Configurações / Backup

```
┌─────────────────────────────┐
│ Configurações                │
│                              │
│ [Exportar backup JSON]       │
│ Último backup: 2026-06-20    │
│                              │
│ [Importar backup JSON]       │
│ ⚠ Substitui todos os dados  │
│                              │
│ Versão: 1.0.0                │
└─────────────────────────────┘
```

---

### Reset total da base local

A tela de Configurações deve expor uma ação destrutiva separada do backup/importação. O botão "Apagar base local" fica visualmente agrupado com o backup, mas com tratamento de perigo distinto.

Regras de interface:
- Exibir aviso antes da ação, reforçando que o backup deve ser exportado previamente.
- Exigir confirmação explícita antes de executar.
- Depois da limpeza, o app deve voltar ao estado inicial com os seeds padrão reaplicados.
- A ação não deve confundir importação com limpeza: importar restaura um arquivo; apagar base reinicia o banco local.

---
## Paleta de cores (sugestão inicial)

```css
--color-primary:    #2563EB;   /* azul — ações principais */
--color-success:    #16A34A;   /* verde — revisão feita */
--color-warning:    #D97706;   /* âmbar — atrasada */
--color-danger:     #DC2626;   /* vermelho — erro */
--color-bg:         #F8FAFC;   /* fundo geral */
--color-surface:    #FFFFFF;   /* cards, formulários */
--color-border:     #E2E8F0;   /* bordas */
--color-text:       #1E293B;   /* texto principal */
--color-text-muted: #64748B;   /* texto secundário */
```

Revisável antes da implementação do M8 (polimento).

---

## Tipografia

- Fonte do sistema: `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- Sem Google Fonts no MVP (performance, privacidade, offline).
- Base: 16px / 1.5 line-height.
- Headings: 1.25rem (h3), 1.5rem (h2), 2rem (h1).

---

## Gráfico de evolução — implementação canvas

```javascript
// Entrada esperada por Stats.renderChart:
dataPoints = [
  { date: '2026-05-10', scorePercent: 60 },
  { date: '2026-05-17', scorePercent: 72 },
  { date: '2026-06-01', scorePercent: 80 },
]

// canvas: elemento <canvas> já no DOM
// Desenha: linha, pontos, eixos básicos, labels de data (simplificado)
```

Sem animação no MVP. Rendering síncrono simples.

---

## Tauri 2 — execução e empacotamento multiplataforma

Tauri 2 executa os assets gerados pelo Vite em uma aplicação nativa. O app funciona offline,
sem backend e sem depender de armazenamento do navegador como banco principal.

**Ordem de validação:**
1. Desktop local como primeiro alvo durante a implementação.
2. Android como alvo móvel posterior na TASK-015.
3. iOS preparado na mesma base; build real somente em ambiente Apple/Mac.

**Configuração `src-tauri/tauri.conf.json`:**
- Comandos de desenvolvimento e build apontam para os scripts Vite.
- Diretório de frontend aponta para a saída do Vite.
- Identificador da aplicação: `com.devulsky.smartlearn`.
- Permissões do plugin SQL são explícitas e mínimas.

**SQLite nativo:**
O plugin `@tauri-apps/plugin-sql` abre o banco local da aplicação. A URL/conexão SQLite,
migrations e queries ficam encapsuladas em `src/db.js`; nenhum componente de UI acessa SQL.

**Modelo de disciplinas:**
`subjects` é entidade própria e reutilizável, com `id`, `name`, `created_at`, `updated_at`,
`is_active` e `sort_order`. `study_records.subject_id` é o vínculo obrigatório com a disciplina.
O app nunca usa nome digitado livremente como vínculo normal entre estudo e disciplina.
Desativar disciplina preserva histórico. Excluir disciplina remove em cascata todos os dados ligados
a ela no SQLite: revisões, estudos e a própria disciplina.

**Modelo de fontes:**
`sources` é entidade própria e reutilizável, com `id`, `name`, `created_at`, `updated_at`,
`is_active` e `sort_order`. `study_records.source_id` é o vínculo obrigatório com a fonte.
O app nunca usa `source TEXT` como contrato normal do fluxo RP/Cadastro. Fonte é selecionada por lista
e pode ser criada por quick add sem sair do cadastro atual.

---

## Decisões de design registradas

| Decisão | Escolha | Motivo |
|---------|---------|--------|
| SPA routing | CSS display toggle | Zero overhead, sem libs, suficiente para 4 telas |
| Banco de dados | SQLite via Tauri SQL | Nativo e independente de IndexedDB/localStorage |
| Plugin SQLite | `@tauri-apps/plugin-sql` | API oficial integrada à base Tauri 2 |
| Empacotamento | Tauri 2 | Uma base HTML/CSS/JS para desktop, iOS e Android |
| Gráfico | Canvas nativo | Linha simples não justifica Chart.js no MVP |
| Fonte | System font stack | Performance + offline + sem dependência |
| Framework CSS | Nenhum (CSS puro) | Sem overhead além do necessário |
| Modais | Sem modais | Confirmação de importação usa `confirm()` nativo |

---

## Modo de desenvolvimento

O fluxo funcional roda no desktop Tauri por `npm run tauri dev`, usando o mesmo SQLite nativo
da aplicação. O servidor Vite isolado pode servir apenas para trabalho visual anterior à TASK-002;
ele não substitui o runtime Tauri nem fornece um banco alternativo.

**Restrição invariável:** IndexedDB e localStorage não são usados como banco principal,
fallback de produção, cache ou buffer. Não há mock persistente paralelo ao SQLite.

---

## Riscos e mitigações

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Canvas nativo trabalhoso | Média | Se demorar >2h, usar Chart.js via CDN |
| SQLite plugin verboso | Baixa | Wrapper interno em `src/db.js` isola as queries |
| Toolchain Tauri/Rust ausente | Média | Documentar pré-requisitos em TASK-000 e validar desktop primeiro |
| Setup mobile Tauri complexo | Média | Android fica na TASK-015; iOS real exige Apple/Mac |
| Layout tabela complexo no mobile | Baixa | Tabela HTML padrão com overflow-x |
| Import de backup corrompido | Alta | Validar estrutura do JSON antes de importar |
| snake_case vs camelCase no retorno SQL | Baixa | Decidir em TASK-002: converter no db.js ou adaptar app.js |
