# spec.md — MVP HTML/JS Study App

**Feature:** mvp-html-js-study-app
**Fase:** 1 — MVP Local
**Status:** Especificação aprovada com correção obrigatória de modelagem para `sources`. TASK-018 pendente antes de retomar implementação funcional.

---

## Objetivo

Implementar a aplicação completa de controle de estudos e revisões periódicas como uma
single-page application em HTML, CSS e JavaScript puro, empacotada com Tauri 2,
funcionando como uma única aplicação para desktop, iOS e Android.
Desktop é o primeiro alvo de execução; Android vem depois e iOS permanece preparado
na mesma base para build real em ambiente Apple/Mac.

---

## Requisitos funcionais

### RF-01 — Cadastro de disciplinas

O aluno pode gerenciar disciplinas em área própria (ex: "Direito Constitucional", "Matemática").
Disciplina é entidade reutilizável do sistema, não texto livre repetido no cadastro de estudo/RP.
A lista de disciplinas ativas é usada como select no cadastro de estudo.

**Campos mínimos da entidade `subjects`:**
| Campo | Tipo | Obrigatório | Observação |
|-------|------|-------------|------------|
| `id` | INTEGER | Sim | Chave primária |
| `name` | TEXT | Sim | Único, case-insensitive |
| `created_at` | TEXT | Sim | ISO string |
| `updated_at` | TEXT | Sim | ISO string |
| `is_active` | INTEGER | Sim | 1 = ativa, 0 = desativada |
| `sort_order` | INTEGER | Sim | Ordem manual/futura; padrão incremental |

**Ações obrigatórias:**
- Listar disciplinas.
- Criar disciplina.
- Editar nome da disciplina.
- Desativar disciplina sem apagar histórico.
- Excluir disciplina apagando todos os dados relacionados no banco.

**Critérios de aceite:**
- Campo nome obrigatório.
- Antes de salvar, o nome é normalizado com `trim()`, colapso de espaços múltiplos e comparação case-insensitive.
- Disciplina duplicada não é aceita, incluindo variações por caixa ou espaço.
- Após criar, aparece imediatamente no select de cadastro de estudo/RP.
- Editar disciplina atualiza a lista sem quebrar estudos antigos.
- Desativar disciplina remove do fluxo normal de novos estudos, mas preserva vínculos históricos.
- Excluir disciplina é ação destrutiva: apaga a disciplina, seus estudos (`study_records`) e todas as
  revisões relacionadas (`review_tasks`).
- Excluir disciplina exige confirmação explícita informando que todos os dados relacionados serão apagados.
- Não há limite de disciplinas no MVP.

**Seed inicial obrigatório de disciplinas:**
- `Língua Portuguesa`
- `Conhecimentos sobre o DF`
- `Legislação`
- `Administração`
- `AFO`
- `Arquivologia`
- `Recursos Materiais`

O seed roda na inicialização do banco, é idempotente, não duplica registros, preserva `sort_order`
e não sobrescreve registros existentes.

---

### RF-01A — Cadastro de fontes

O aluno pode gerenciar fontes de estudo em entidade própria `sources` (ex: "Grancursos").
Fonte é entidade reutilizável do sistema, não texto livre opcional repetido no cadastro de estudo/RP.
A lista de fontes ativas é usada como select no cadastro de estudo.

**Campos mínimos da entidade `sources`:**
| Campo | Tipo | Obrigatório | Observação |
|-------|------|-------------|------------|
| `id` | INTEGER | Sim | Chave primária |
| `name` | TEXT | Sim | Único, case-insensitive |
| `created_at` | TEXT | Sim | ISO string |
| `updated_at` | TEXT | Sim | ISO string |
| `is_active` | INTEGER | Sim | 1 = ativa, 0 = desativada |
| `sort_order` | INTEGER | Sim | Ordem manual/futura; padrão incremental |

**Ações obrigatórias:**
- Listar fontes.
- Criar fonte.
- Editar nome da fonte.
- Desativar fonte sem apagar histórico.

**Critérios de aceite:**
- Campo nome obrigatório.
- Antes de salvar, o nome é normalizado com `trim()`, colapso de espaços múltiplos e comparação case-insensitive.
- Fonte duplicada não é aceita, incluindo variações por caixa ou espaço.
- Após criar, aparece imediatamente no select de cadastro de estudo/RP.
- Se houver apenas uma fonte ativa, ela é pré-selecionada automaticamente.
- O seed inicial cria `Grancursos`; portanto, `Grancursos` aparece selecionado por padrão na primeira abertura.

**Seed inicial obrigatório de fontes:**
- `Grancursos`

O seed roda na inicialização do banco, é idempotente, não duplica registros, preserva `sort_order`
e não sobrescreve registros existentes.

---

### RF-02 — Cadastro de estudo (modelo RP)

O aluno registra o que estudou: disciplina, data da aula, conteúdo e fonte.
A disciplina é selecionada por `subject_id` a partir das disciplinas cadastradas e ativas.
A fonte é selecionada por `source_id` a partir das fontes cadastradas e ativas.
O fluxo normal não permite digitar nome de disciplina nem fonte como texto livre.

**Campos:**
| Campo | Tipo | Obrigatório |
|-------|------|-------------|
| Disciplina | Select (lista de `subjects` ativos, valor = `subject_id`) | Sim |
| Data da aula | Date | Sim |
| Conteúdo | Text | Sim |
| Fonte | Select (lista de `sources` ativas, valor = `source_id`) | Sim |

**Criação rápida de disciplina:**
- A tela RP/Cadastro deve oferecer `+ Nova disciplina` próximo ao select.
- A criação rápida abre input inline, sem modal e sem trocar de tela.
- Ao concluir, cria a disciplina em `subjects`, recarrega a lista e deixa a nova disciplina selecionada
  no cadastro atual.
- O objetivo é reduzir cliques e evitar digitação repetitiva.

**Criação rápida de fonte:**
- A tela RP/Cadastro deve oferecer `+ Nova fonte` próximo ao select.
- A criação rápida abre input inline, sem modal e sem trocar de tela.
- Ao concluir, cria a fonte em `sources`, recarrega a lista e deixa a nova fonte selecionada
  no cadastro atual.
- Se `Grancursos` for a única fonte ativa, ela fica pré-selecionada automaticamente.

**Critérios de aceite:**
- Data da aula padrão = hoje.
- Salvar sem disciplina válida é proibido.
- Salvar sem fonte válida é proibido.
- `study_records.subject_id` é obrigatório e referencia `subjects.id`.
- `study_records.source_id` é obrigatório e referencia `sources.id`.
- Ao salvar, cria `studyRecord` e gera `reviewTasks` automaticamente.
- O aluno não clica em "gerar revisões". Acontece automaticamente.
- Formulário limpa após salvar.
- Erro amigável se campo obrigatório estiver vazio.

---

### RF-03 — Geração automática de revisões

Ao salvar um estudo, o sistema gera 16 revisões automaticamente.

**Regra de datas:**
| Revisão | Offset |
|---------|--------|
| R1 | D+1 |
| R2 | D+7 |
| R3 | D+15 |
| R4 | D+30 |
| R5 | D+60 |
| R6 | D+90 |
| R7 | D+120 |
| R8 | D+150 |
| R9 | D+180 |
| R10 | D+210 |
| R11 | D+240 |
| R12 | D+270 |
| R13 | D+300 |
| R14 | D+330 |
| R15 | D+360 |
| R16 | D+390 |

Onde D = data da aula (studyDate).

**Critérios de aceite:**
- Exatamente 16 revisões geradas por estudo.
- Datas calculadas a partir de `studyDate`, não da data de cadastro.
- Cada revisão começa com `reviewDone = false`, `questionsDone = false`.
- Revisões criadas na mesma transação do studyRecord.

---

### RF-04 — Tela Detalhes / Hoje

Tela principal. Exibe as revisões organizadas por categoria.

**Blocos exibidos:**
1. **Atrasadas** — `dueDate < hoje` e `reviewDone = false`
2. **Hoje** — `dueDate = hoje` e `reviewDone = false`
3. **Feitas hoje** — `completedAt.slice(0,10) === hoje` e `reviewDone = true`
4. **Amanhã** — `dueDate = hoje + 1` e `reviewDone = false`

**Nota de implementação — comparação de datas:**
`completedAt` é armazenado como ISO string (ex: `"2026-06-22T14:30:00.000Z"`).
Para comparar com a data de hoje, usar `completedAt.slice(0, 10) === today`
ou `completedAt.startsWith(today)`, onde `today` é uma string `"YYYY-MM-DD"`.
Nunca comparar a ISO string diretamente com a data.

**Informações em cada card/linha:**
- Disciplina
- Conteúdo
- Fonte
- Data do estudo original
- Tipo de revisão (R1, R2, ... R16)
- Data prevista (dueDate)
- Status: Rev feita (checkbox)
- Status: Q feita (checkbox)
- Quantidade de questões feitas
- Quantidade de acertos
- Percentual (calculado automaticamente)
- Comentário (campo de texto)

**Critérios de aceite:**
- Bloco sem itens fica oculto ou mostra mensagem vazia.
- A tela atualiza ao marcar qualquer ação.
- No mobile: layout em cards.
- No desktop (≥768px): layout em tabela.

---

### RF-05 — Marcar revisão como feita

O aluno marca uma revisão como feita com um clique (checkbox ou botão).

**Critérios de aceite:**
- `reviewDone = true` salvo no banco SQLite imediatamente.
- `completedAt` recebe a data/hora atual (ISO string).
- O card/linha move para o bloco "Feitas hoje".
- Ação é reversível (pode desmarcar).

---

### RF-06 — Registrar exercícios

O aluno registra se fez questões, quantas e quantos acertou.

**Fluxo:**
1. Marcar checkbox "Q feita" (`questionsDone = true`).
2. Digitar quantidade de questões (`questionsCount`).
3. Digitar quantidade de acertos (`correctCount`).
4. Percentual calculado automaticamente: `scorePercent = (correctCount / questionsCount) * 100`.
5. Campo comentário opcional.

**Comportamento dos inputs quando `questionsDone = false`:**
Os campos `questionsCount` e `correctCount` permanecem **visíveis e editáveis** mesmo quando
`questionsDone = false`. O aluno pode preencher os valores antes de marcar o checkbox.
A diferença é que revisões com `questionsDone = false` **não entram nas estatísticas**
(totais, médias, gráfico), independente de terem valores preenchidos.

**Regra de salvamento dos inputs numéricos:**
- Evento `input`: recalcula e atualiza o display de `scorePercent` na tela em tempo real.
  Não salva no banco de dados.
- Evento `blur` (perder foco) ou tecla `Enter`: salva `questionsCount`, `correctCount` e
  `scorePercent` no banco SQLite.

**Critérios de aceite:**
- Percentual exibido com 1 casa decimal (ex: 75.0%) enquanto o aluno digita (tempo real).
- Se `questionsCount = 0` ou vazio, exibe "-" (sem divisão por zero).
- Valores salvos no banco SQLite ao sair do campo (blur) ou pressionar Enter.
- Revisões com `questionsDone = false` não aparecem nos totais das estatísticas.
- Não requer botão "Salvar" explícito por campo.

---

### RF-07 — Estatísticas básicas

Tela de estatísticas com resumo do desempenho.

**Métricas exibidas:**
- Total de questões resolvidas (soma de `questionsCount` onde `questionsDone = true`)
- Total de acertos (soma de `correctCount`)
- Média geral de acertos (%)
- Média por disciplina (%)
- Total de revisões feitas
- Total de revisões pendentes
- Total de revisões atrasadas
- Gráfico de evolução das notas ao longo do tempo

**Critérios de aceite:**
- Gráfico obrigatório (ver INV-09).
- Gráfico mostra percentual de acertos no eixo Y, tempo no eixo X.
- Filtro por disciplina é desejável mas não obrigatório no MVP.
- Dados atualizados a cada vez que a tela é aberta.

---

### RF-08 — Exportar backup em JSON

O aluno pode exportar todos os dados como arquivo JSON.

**Critérios de aceite:**
- Botão "Exportar backup" disponível em Settings ou na navegação.
- Arquivo gerado: `smartlearn-backup-YYYY-MM-DD.json`.
- Conteúdo: todos os `subjects`, `sources`, `studyRecords`, `reviewTasks` e `settings`.
- Arquivo JSON gerado e disponibilizado pelo runtime Tauri 2.
- `settings.lastBackupAt` atualizado após exportação.

---

### RF-09 — Importar backup em JSON

O aluno pode importar um arquivo JSON de backup.

**Critérios de aceite:**
- Input de arquivo aceita apenas `.json`.
- Antes de importar, exibe aviso: "Isso substituirá todos os dados atuais. Continuar?"
- Após confirmação, apaga o banco atual e importa os dados do arquivo.
- Exibe mensagem de sucesso ou erro.
- Não importa arquivo inválido (sem estrutura esperada, incluindo `sources`).

---

### RF-10 — Aplicação multiplataforma via Tauri 2

A aplicação é empacotada com Tauri 2 a partir da mesma interface HTML/CSS/JS.

**Critérios de aceite:**
- `src-tauri/tauri.conf.json` define a aplicação e integra o build Vite.
- Plugin `@tauri-apps/plugin-sql` instalado e configurado nos lados JavaScript e Rust.
- A aplicação abre localmente no desktop via Tauri.
- Android usa a mesma base em etapa móvel posterior.
- iOS permanece preparado na mesma base; o build real é posterior em Apple/Mac.
- App funciona offline nativamente.
- SQLite inicializa corretamente na primeira abertura.

---

## Requisitos não-funcionais

### RNF-01 — Mobile-first
Layout pensado primeiro para telas de 375px. Adaptado para ≥768px (desktop/tablet).

### RNF-02 — Performance
App abre em menos de 2 segundos após acionamento (assets locais, sem rede necessária).

### RNF-03 — Acessibilidade
- Labels visíveis em todos os campos.
- Botões com área de toque ≥ 44x44px.
- Checkboxes com área clicável grande.
- Contraste mínimo WCAG AA (4.5:1 para texto normal).
- Funciona com navegação por teclado no desktop.
- Não depende apenas de cor para transmitir informação.

### RNF-04 — Usabilidade
- Máximo 4 campos obrigatórios para cadastrar um estudo.
- Salvamento automático nos campos de exercícios (blur/Enter).
- Sem modais desnecessários.
- Sem menus profundos (máximo 1 nível de navegação).

### RNF-05 — Compatibilidade
- Desktop — primeiro alvo de execução e validação local
- Android — alvo móvel posterior na mesma base Tauri 2
- iOS — preparado na mesma base; build real posterior em ambiente Apple/Mac
- Interface responsiva entre 320px e 1440px

### RNF-06 — Versionamento Git
- Git local deve ser inicializado antes da implementação funcional.
- O primeiro commit contém somente specs aprovadas e estrutura inicial.
- Cada task deve ter commit próprio e deixar o repositório funcional.
- Codex é responsável por GitHub, branches remotas e pull requests.
- Claude não cria repositório GitHub nem faz push remoto sem instrução explícita.

---

## Modelo de dados (SQLite)

O banco é SQLite nativo no dispositivo, acessado via `@tauri-apps/plugin-sql`.
Convenção de nomes: snake_case para colunas SQL, camelCase no JavaScript.
Booleanos em SQLite são INTEGER: 0 = false, 1 = true.

Somente `src/db.js` pode executar SQL. Toda outra parte da aplicação usa a API pública `DB.*`.

### Tabela: subjects

```sql
CREATE TABLE IF NOT EXISTS subjects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL,
  is_active  INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);
```

### Tabela: sources

```sql
CREATE TABLE IF NOT EXISTS sources (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL,
  is_active  INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);
```

### Tabela: study_records

```sql
CREATE TABLE IF NOT EXISTS study_records (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  source_id  INTEGER NOT NULL REFERENCES sources(id),
  study_date TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);
```

### Tabela: review_tasks

```sql
CREATE TABLE IF NOT EXISTS review_tasks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  study_record_id INTEGER NOT NULL REFERENCES study_records(id),
  review_number   INTEGER NOT NULL,
  due_date        TEXT    NOT NULL,
  completed_at    TEXT,
  review_done     INTEGER NOT NULL DEFAULT 0,
  questions_done  INTEGER NOT NULL DEFAULT 0,
  questions_count INTEGER,
  correct_count   INTEGER,
  score_percent   REAL,
  comment         TEXT,
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_review_tasks_due_date
  ON review_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_review_tasks_study_record_id
  ON review_tasks(study_record_id);
```

### Tabela: settings

Singleton. Uma única linha com `key = 'main'`.

```sql
CREATE TABLE IF NOT EXISTS settings (
  key             TEXT PRIMARY KEY,
  app_version     TEXT,
  review_schedule TEXT,
  last_backup_at  TEXT
);

INSERT OR IGNORE INTO settings (key, app_version, review_schedule)
  VALUES ('main', '1.0.0', '[1,7,15,30,60,90,120,150,180,210,240,270,300,330,360,390]');
```

`review_schedule` é armazenado como JSON string e parseado no JavaScript.

---

## Fora do escopo deste MVP

- Login ou autenticação
- Sincronização em nuvem
- Notificações push
- Redistribuição automática de revisões atrasadas
- Banco de questões
- Caderno de erros estruturado
- IA ou sugestões
- Gamificação
- Interface específica em Swift/Kotlin ou outra base separada por plataforma
- Backend de qualquer tipo
