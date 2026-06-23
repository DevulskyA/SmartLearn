# STATE.md — SmartLearn

Memória persistente do projeto. Atualizar a cada sessão significativa.

---

## Status atual

- **Fase:** UX linear e fontes como entidades reutilizáveis concluídas. TASK-019 concluída.
- **Data:** 2026-06-23
- **Próxima ação:** Revisão humana da UX linear e validação final em Windows/Android.

---

## Decisões registradas

### DEC-001 — Stack puro sem framework
- **Data:** 2026-06-22
- **Decisão:** HTML, CSS e JavaScript puro. Sem React, Vue, Next.js ou TypeScript.
  Vite é apenas o empacotador mínimo e Tauri 2 é a camada multiplataforma.
- **Motivo:** MVP deve ser simples, sem dependências pesadas, sem tooling complexo para manter.
- **Irreversível no MVP:** Sim.

### DEC-002 — ~~IndexedDB como banco local~~ SUBSTITUÍDA por DEC-008

Decisão original (2026-06-22) foi usar IndexedDB. Substituída pela DEC-008 em 2026-06-22.
Ver DEC-008 para a decisão atual sobre o banco de dados.

### DEC-003 — 16 revisões por estudo cadastrado
- **Data:** 2026-06-22
- **Decisão:** Gerar 16 revisões fixas por estudo. R1=D+1, R2=D+7, R3=D+15, R4=D+30, R5+=a cada 30 dias.
- **Motivo:** Quantidade fixa simplifica a implementação. Suficiente para cobrir ciclos longos.
- **Revisável:** Sim, em versão futura se houver feedback.

### DEC-004 — Gráfico via Canvas nativo
- **Data:** 2026-06-22
- **Decisão:** Usar `<canvas>` nativo para o gráfico de evolução. Sem Chart.js ou bibliotecas externas.
- **Motivo:** Zero dependências. Gráfico simples de linha não justifica biblioteca no MVP.
- **Revisável:** Sim, se a implementação nativa for muito custosa.

### DEC-005 — Sem login no MVP
- **Data:** 2026-06-22
- **Decisão:** Sem autenticação, sem conta, sem perfil de usuário no MVP local.
- **Motivo:** Dados são locais. Login adicionaria complexidade sem benefício no MVP.
- **Irreversível no MVP:** Sim.

### DEC-006 — Backup obrigatório via JSON
- **Data:** 2026-06-22
- **Decisão:** Exportar e importar todos os dados como arquivo JSON é parte do MVP, não extra.
- **Motivo:** Substitui sincronização em nuvem para migração entre dispositivos no MVP.
- **Irreversível no MVP:** Sim.

### DEC-008 — ~~Substituição do IndexedDB por SQLite nativo via Capacitor~~ SUBSTITUÍDA por DEC-009
- **Data:** 2026-06-22
- **Decisão histórica:** Abandonar IndexedDB como banco principal e usar SQLite nativo.
  A escolha de Capacitor e `@capacitor-community/sqlite` foi substituída pela DEC-009.
- **Motivo:** IndexedDB é controlado pelo navegador e pode ser apagado pelo sistema operacional.
  SQLite nativo é mais previsível e não depende das políticas de storage do browser.
- **Consequências:**
  - O princípio de SQLite nativo foi preservado.
  - Driver, empacotador e estrutura foram redefinidos pela DEC-009.
- **Status:** Substituída.

### DEC-009 — Tauri 2 como alvo único para desktop, iOS e Android
- **Data:** 2026-06-22
- **Decisão:** Capacitor foi substituído porque o produto não é apenas Android/iOS. O alvo correto
  é desktop + iOS + Android com uma única base. Tauri 2 permite empacotar uma interface web para
  desktop e mobile, preservando HTML/CSS/JS e permitindo SQLite local nativo via plugin SQL.
- **Consequências:**
  - Desktop é o primeiro alvo de execução local.
  - Android é alvo móvel posterior.
  - iOS permanece preparado na mesma base; o build real exige ambiente Apple/Mac.
  - Vite é apenas o empacotador mínimo.
  - `src/db.js` usa `@tauri-apps/plugin-sql` e é o único ponto autorizado a executar SQL.
  - Não usar IndexedDB nem localStorage como banco principal.
- **Irreversível no MVP:** Sim.

### DEC-010 — Git obrigatório desde o início
- **Data:** 2026-06-22
- **Decisão:** O projeto deve nascer versionado em Git. Cada task deve gerar mudanças pequenas,
  revisáveis e com commit próprio. Codex cuidará da integração com GitHub, mas o repositório local
  deve existir antes da implementação.
- **Consequências:**
  - TASK-000 inicializa o Git e cria a base do projeto antes do código funcional.
  - O primeiro commit contém apenas specs aprovadas e estrutura inicial.
  - Tasks diferentes não podem ser misturadas no mesmo commit.
  - Claude não cria repositório GitHub nem faz push remoto sem instrução explícita.
- **Irreversível no MVP:** Sim.

### DEC-011 — Contrato da camada SQLite
- **Data:** 2026-06-23
- **Decisão:** `src/db.js` é o único arquivo autorizado a executar SQL da aplicação. As colunas
  permanecem em snake_case no SQLite e todos os objetos públicos `DB.*` usam camelCase.
  O schema é inicializado de forma idempotente por `DB.init()` antes da renderização da interface.
- **Consequências:**
  - UI, estatísticas e demais módulos não importam o driver SQL diretamente.
  - O plugin oficial `tauri-plugin-sql` 2.4.0 usa a feature SQLite e permissões mínimas de
    leitura/fechamento e execução.
  - Um comando Rust genérico, sem SQL de domínio, executa lotes enviados por `src/db.js` na mesma
    transação SQLite quando uma regra exige atomicidade.
  - Exportação e importação usam o mesmo contrato camelCase da API pública.
- **Irreversível no MVP:** Sim.

### DEC-012 — Disciplina como entidade própria e reutilizável
- **Data:** 2026-06-23
- **Decisão:** Disciplina é entidade própria em `subjects`, cadastrada uma vez e reutilizada por
  `study_records.subject_id`. O fluxo normal de RP/Cadastro seleciona disciplina ativa em lista;
  não digita nome livremente a cada estudo.
- **Campos obrigatórios em `subjects`:** `id`, `name`, `created_at`, `updated_at`, `is_active`,
  `sort_order`.
- **Consequências:**
  - Deve existir área própria para listar, criar, editar e desativar disciplinas.
  - Deve existir exclusão destrutiva de disciplina, apagando todos os dados relacionados no banco.
  - RP/Cadastro deve oferecer quick add `+ Nova disciplina`, sem sair do fluxo, selecionando a
    disciplina recém-criada.
  - Desativação usa `is_active = 0` e preserva histórico, revisões, estatísticas e backups.
  - Exclusão remove `review_tasks` relacionadas, `study_records` da disciplina e a própria linha em
    `subjects`, em transação e após confirmação explícita.
  - Salvar estudo sem `subject_id` válido é proibido.
  - O sistema deve reduzir digitação repetitiva e esforço cognitivo.
- **Status:** Implementada na TASK-017.
- **Irreversível no MVP:** Sim.

### DEC-013 — Disciplinas e fontes como entidades reutilizáveis com seed inicial
- **Data:** 2026-06-23
- **Decisão:** Disciplina e fonte não serão digitadas repetidamente no fluxo normal de RP. Ambas
  são entidades próprias: `subjects` e `sources`. O cadastro RP usa `subject_id` e `source_id`.
  O banco recebe seed inicial com as disciplinas da planilha original e a fonte `Grancursos`.
- **Seed inicial de disciplinas:** `Língua Portuguesa`, `Conhecimentos sobre o DF`, `Legislação`,
  `Administração`, `AFO`, `Arquivologia`, `Recursos Materiais`.
- **Seed inicial de fontes:** `Grancursos`.
- **Normalização obrigatória:** antes de salvar disciplina ou fonte, aplicar `trim()`, colapsar
  espaços múltiplos e comparar case-insensitive para impedir duplicatas por caixa ou espaço.
- **Consequências:**
  - `sources` deve ter `id`, `name`, `created_at`, `updated_at`, `is_active` e `sort_order`.
  - `study_records.source TEXT` deixa de ser o contrato normal; o vínculo correto é
    `study_records.source_id INTEGER NOT NULL REFERENCES sources(id)`.
  - `DB.studyRecords.create()` recebe `{ subjectId, sourceId, studyDate, content }`.
  - RP/Cadastro deve selecionar fonte por lista/autocomplete e oferecer quick add `+ Nova fonte`.
  - `Grancursos` deve existir automaticamente e ficar pré-selecionado quando for a única fonte ativa.
  - Importação de estudos históricos/aulas fica fora desta correção e deve ser task separada.
- **Status:** Implementada na TASK-018.
- **Irreversível no MVP:** Sim.

### DEC-014 — Tela Hoje linear com ReviewRow e cadastro minimalista
- **Data:** 2026-06-23
- **Decisão:** A Tela Hoje deve ser apresentada como uma linha operacional ReviewRow, com os blocos em ordem Atrasadas, Hoje, Amanhã e Feitas hoje. O cadastro deve priorizar Novo estudo, manter disciplina, fonte e data após salvar e tratar o gerenciamento de disciplinas e fontes como ação secundária.
- **Consequências:**
  - As ações diárias ficam sempre visíveis, sem modal, accordion ou card solto como affordance principal.
  - Desktop usa leitura quase tabular; mobile preserva a mesma ordem visual em linha empilhada.
  - Cor por disciplina continua proibida; cores ficam reservadas para status, ação, alerta, erro e sucesso.
- **Status:** Implementada na TASK-019.
- **Irreversível no MVP:** Sim.

### DEC-007 — Correções de consistência das specs antes da implementação
- **Data:** 2026-06-22
- **Decisão:** Aplicadas 9 correções nas specs antes de iniciar qualquer implementação.
- **Motivo:** Revisão humana identificou problemas que causariam bugs na implementação:
  1. Store `settings` agora usa keyPath `"key"` com valor singleton `"main"`.
  2. `Stats.calculate` recebe `(reviewTasks, studyRecords, subjects)` — necessário para join de disciplina.
  3. Bloco "Amanhã" filtra `reviewDone = false` — evita duplicação com "Feitas hoje".
  4. TASK-016 depende de TASK-014 e TASK-015 — polimento só após todas as features.
  5. TASK-009 separa `input` (atualiza display) de `blur/Enter` (salva no banco de dados).
  6. Métodos de query do DB recebem data como parâmetro (`getForToday(today)`, etc.).
  7. Comparação de `completedAt` com hoje usa `slice(0,10)` — não compara ISO string direta.
  8. Inputs de questões visíveis mesmo com `questionsDone = false`; só excluídos das stats.
  9. `dataPoints` do gráfico filtram `questionsDone=true AND scorePercent!=null AND completedAt!=null`.
- **Irreversível:** Sim (são correções de consistência, não mudanças de escopo).

---

## Bloqueadores ativos

Nenhum.

---

## Pendências
- [x] Quick fix executado: criação da tabela review_tasks no schema e reparo de textos UTF-8.

- [x] Revisão humana de todas as specs (concluída em 2026-06-22, 9 correções aplicadas).
- [x] Revisão humana da correção arquitetural Tauri 2 + Git.
- [x] TASK-000 executada em 2026-06-22: Git, Vite, Tauri 2, Rust/MSVC e scaffold desktop.
- [x] TASK-001 executada em 2026-06-23: shell visual, navegação e responsividade desktop/mobile.
- [x] TASK-002 executada em 2026-06-23: plugin SQL, schema, API `DB.*`, persistência e backup lógico.
- [x] TASK-003 executada em 2026-06-23: criação, validação e seleção persistente de disciplinas.
- [x] TASK-004 executada em 2026-06-23: formulário validado e persistência de sessões de estudo.
- [x] TASK-005 executada em 2026-06-23: 16 revisões geradas com datas fixas e gravação atômica.
- [x] TASK-006 executada em 2026-06-23: cards e quatro grupos dinâmicos da Tela Hoje.
- [x] TASK-007 executada em 2026-06-23: layout tabular responsivo da Tela Hoje no desktop.
- [x] TASK-008 executada em 2026-06-23: conclusão reversível de revisões com atualização da tela.
- [x] TASK-009 executada em 2026-06-23: questões, acertos e percentual com autosave controlado.
- [x] TASK-010 executada em 2026-06-23: comentário opcional persistido por revisão.
- [x] TASK-011 executada em 2026-06-23: métricas gerais e médias por disciplina.
- [x] TASK-012 executada em 2026-06-23: gráfico Canvas nativo com notas em ordem cronológica.
- [x] TASK-013 executada em 2026-06-23: exportação JSON e registro do último backup.
- [x] TASK-014 executada em 2026-06-23: importação JSON validada e transacional.
- [x] TASK-015 executada em 2026-06-23: Android SDK/NDK preparado, APK debug gerado e app aberto no emulador.
- [x] TASK-016 executada em 2026-06-23: polimento de acessibilidade, responsividade 320px e safe-area mobile.
- [x] TASK-017 executada em 2026-06-23: disciplinas com CRUD, desativação, exclusão destrutiva em cascata e quick add.
- [x] TASK-018 executada em 2026-06-23: fontes como entidade reutilizável, seed inicial e contrato `source_id`.
- [x] TASK-019 executada em 2026-06-23: Tela Hoje linear com ReviewRow e cadastro minimalista.
- [ ] Executar build real iOS somente em ambiente Apple/Mac.
- [ ] Decidir paleta de cores final (pode ocorrer durante implementação do M1).
- [ ] Decidir ícone do app (pode ocorrer durante implementação do M7 — mobile Tauri 2).

---

## Ideias deferidas (não-MVP)

| Ideia | Motivo do adiamento |
|-------|---------------------|
| Notificações push | Requer service worker mais complexo + permissão do usuário |
| Redistribuição inteligente de revisões atrasadas | Complexidade de UX não justificada no MVP |
| IA para sugerir conteúdo | Fora do escopo do MVP local |
| Modo turbo (apenas revisões críticas) | Decisão de produto a validar com usuários reais |
| Compartilhamento de plano de estudos | Requer backend |
| Banco de questões integrado | Feature independente, não relacionada ao MVP |
| Código de interface específico em Swift/Kotlin | Fora do MVP; uma base Tauri 2 é obrigatória |
| Sincronização em nuvem | Fase 2 |

---

## Lições aprendidas

- O repositório remoto já possuía histórico antes da TASK-000; ele foi preservado sem force-push.
- O bundle identifier não deve terminar em `.app`, pois conflita com bundles macOS.
- O Vite deve ignorar `src-tauri/target/**` para não observar executáveis Rust bloqueados no Windows.
- O README publicado no pacote npm do plugin SQL estava desatualizado sobre iOS; o repositório
  oficial atual classifica SQLite como suporte completo em desktop, Android e iOS.

---

## Preferências do projeto

- Idioma do código: inglês (nomes de variáveis, funções, stores).
- Idioma da interface: português brasileiro.
- Idioma das specs: português brasileiro.
- Comentários no código: apenas quando o "porquê" não é óbvio.
