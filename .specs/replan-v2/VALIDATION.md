---
name: validation-replan-v2
description: FASE E — Validação especializada + Fresh Verifier do replan-v2
metadata:
  type: project
  phase: FASE_E
  created: 2026-09-05
---

# VALIDATION — Replan v2 (FASE E)

> Metodologia: 4 revisores especialistas + 1 Fresh Verifier adversarial.
> Cada revisor identifica gaps, inconsistências e riscos dentro do seu domínio.
> Fresh Verifier tenta refutar o plano inteiro.

---

## REVISOR 1 — Produto / UX

**Escopo:** experiência do usuário, fluxos, affordances, degradação offline.

### Findings

**F1.1 — Offline write sem UX definida**
- Plano: escrita offline retorna erro ao usuário.
- Gap: TLC_ECC_PLAN.md TASK-A06 diz "mostrar erro ao usuário" mas não define a UX do erro (toast? modal? desabilitar botão? texto?).
- Risco: UX de erro de rede varia muito; inconsistência entre plataformas.
- Recomendação: TASK-A06 deve incluir mockup ou spec de UI para estado offline-escrita antes de implementar.
- Severidade: MÉDIO

**F1.2 — lastSyncedAt: UX de exibição não especificada**
- DC-5 aceita "pequena defasagem". TASK-A04 adiciona o campo.
- Gap: nenhuma spec de onde/como exibir lastSyncedAt para o usuário no Android offline.
- Risco: usuário não sabe que dados estão desatualizados sem indicador visual.
- Recomendação: TASK-A04 deve incluir AC de exibição de banner/chip "Dados de [lastSyncedAt], conecte para atualizar" no modo offline.
- Severidade: MÉDIO

**F1.3 — Migração de dados: sem UX de progresso**
- TASK-A05 migra dados BrowserStore → servidor.
- Gap: migração pode demorar (dados grandes). Sem indicador de progresso.
- Risco: usuário acha que app travou.
- Recomendação: TASK-A05 deve incluir AC de barra/spinner durante migração.
- Severidade: BAIXO

**F1.4 — Fluxo de auth não definido**
- DC-10 é PROPOSTA, inclui auth.
- Gap: sem auth definida, nenhum fluxo de login/logout existe no plano.
- Risco: bloqueio de todas as tasks que dependem de PRE-2.
- Recomendação: PRE-2 deve ter prazo. Sem PRE-2 aprovado, server-central-v1 não pode começar.
- Severidade: ALTO — é um blocker real

### Veredicto Revisor 1
Plano é funcional do ponto de vista de produto mas UX de estados de erro e offline precisa de spec antes de TASK-A06 e TASK-A04. F1.4 (auth) é blocker real.

---

## REVISOR 2 — Data / Integridade

**Escopo:** schema, migrations, referential integrity, NO_DATA_LOSS, atomicidade.

### Findings

**F2.1 — Migration study_records → learning_units no servidor**
- TASK-A05 usa `/api/import` para migration.
- Gap: schema do servidor (v3) não tem tabela study_records. Se usuário tiver dados antigos (v1 = study_records em BrowserStore), o client js precisa converter para v3 ANTES de enviar para o servidor.
- Risco: dados v1 chegam no formato errado ao endpoint /api/import.
- Evidência: PR #3/src/db.js `migrateV1ImportData` faz essa conversão — deve ser chamada antes de POST /api/import.
- Recomendação: TASK-A05 deve incluir chamada a migrateV1ImportData() antes de buildImportStatements(). AC explícito: dados v1 convertidos antes de envio.
- Severidade: ALTO

**F2.2 — Atomicidade de completeReviewWithEvidence no servidor**
- PR #3 usa invoke('execute_sqlite_transaction') para atomicidade.
- Gap: TASK-A03 propõe POST /api/review-tasks/:id/complete. Deve ser uma transação Rust, não dois POSTs separados.
- Risco: se servidor cair entre UPDATE review_task e INSERT learning_evidence, dado fica inconsistente.
- Evidência: PR #4/src-tauri/src/broker/router.rs `transaction_handler` — reutilizável.
- Recomendação: POST /api/review-tasks/:id/complete deve usar `sqlx::Transaction` explicitamente. AC: cargo test verifica que learning_evidence row existe após complete — ou nenhuma das duas.
- Severidade: ALTO

**F2.3 — Backup antes de migration no servidor**
- TASK-A01 reutiliza startup_backup de PR #4.
- Gap: TLC_ECC_PLAN não especifica que startup_backup deve rodar ANTES de qualquer migration de import. Se migration falhar, backup é a única garantia.
- Recomendação: TASK-A01 AC deve incluir: "startup_backup chamado antes de qualquer migration/import". TASK-A05 AC deve incluir: "backup do servidor confirmado antes de aceitar import".
- Severidade: MÉDIO

**F2.4 — Sem VACUUM INTO no servidor central**
- db.rs de PR #4 tem backup via VACUUM INTO — mas TASK-A01 diz "aproveitar db.rs".
- Gap: não há AC explícito de que backup/rotate_backups está ativo no servidor central.
- Recomendação: TASK-A01 deve ter AC: "startup_backup cria arquivo .db em backup dir" e "rotate_backups remove arquivos > 30 dias".
- Severidade: BAIXO

**F2.5 — ensureColumns: servidor precisa de equivalente**
- PR #3 usa ensureColumns com ALTER TABLE para DBs antigos.
- Gap: servidor central que começa com schema v3 não tem DBs antigos para upgradar. Mas se servidor for atualizado no futuro, sem versioning de schema, não há como saber o que adicionar.
- Recomendação: Adicionar PRAGMA user_version ao schema do servidor. Incrementar a cada mudança. Executar ALTER TABLE migrations condicionais no startup.
- Severidade: MÉDIO (não bloqueia v1 mas é dívida técnica — registrar em DEBT.md)

### Veredicto Revisor 2
F2.1 e F2.2 são ALTO — migration v1→v3 e atomicidade de completeReview devem ter ACs explícitos. Plano é correto em princípio mas lacunas de spec criam risco de regressão.

---

## REVISOR 3 — Testes

**Escopo:** cobertura, qualidade dos ACs, sensors de discriminação, falso-PASS.

### Findings

**F3.1 — "NOT_RERUN" em PR #3 é risco real**
- AUDIT_PR3 marca testes de PR #3 como NOT_RERUN.
- Gap: replan assume que PR #3 PASS mas testes não foram reexecutados nesta sessão.
- Risco: mudança de contexto entre sessões pode ter introduzido regressão não detectada.
- Recomendação: PRE-3 é blocker obrigatório — executar `npm test` e `cargo test` em PR #3 antes de qualquer merge. Confirmar contagem: 97 npm + 8 cargo.
- Severidade: ALTO

**F3.2 — TASK-A03 sem teste de SQL injection**
- TASK-A03 substitui raw SQL por domain API.
- Gap: ACs de TASK-A03 não incluem teste de que endpoints não aceitam SQL injection no body.
- Risco: endpoint POST /api/subjects com `name: "'; DROP TABLE subjects; --"` deve ser sanitizado.
- Recomendação: Adicionar AC: "POST /api/subjects com nome contendo SQL injection retorna 400 ou cria subject com nome literal (não executa SQL)". Mover validação normalizeEntityName para o servidor.
- Severidade: ALTO

**F3.3 — Sensor de discriminação de DC-6 (offline write = erro)**
- TASK-A06 diz: "desligar servidor > tentar criar aula > deve mostrar erro".
- Gap: esse sensor está em prosa mas não como AC testável automaticamente.
- Recomendação: Jest/Vitest: mock fetch para rejeitar > chamar ServerStore.learningUnits.create() > verificar que retorna erro (não resolve silenciosamente).
- Severidade: MÉDIO

**F3.4 — Sem teste de concurrent access no servidor**
- PR #4 tem teste de concurrent WAL reads (router.rs).
- Gap: TASK-A01 não inclui esse teste explicitamente nos ACs.
- Recomendação: Adicionar AC: "cargo test: 10 leituras concorrentes via WAL sem deadlock/erro".
- Severidade: BAIXO

**F3.5 — SW offline tests ausentes em PR #3**
- PR #3 não tem Service Worker, logo não tem SW tests.
- TASK-A08 adiciona SW e testes Vitest.
- Gap: TASK-A08 ACs mencionam "smoke de offline agenda no browser" — não automatizado.
- Recomendação: Adicionar AC automatizável: Vitest SW mock — fetch falha > GET /api/agenda retorna cached response.
- Severidade: BAIXO

### Veredicto Revisor 3
F3.1 (NOT_RERUN) e F3.2 (SQL injection) são ALTO — devem entrar nos ACs antes de implementar. Plano tem boa cobertura de conceito mas ACs são insuficientemente específicos em alguns pontos críticos.

---

## REVISOR 4 — Arquitetura Servidor-First

**Escopo:** server-first architecture, single source of truth, deployment independence.

### Findings

**F4.1 — "Servidor central" não tem definição de deployment**
- DC-2: servidor independente do computador do aluno.
- Gap: TLC_ECC_PLAN não define onde o servidor roda. TASK-A01 cria binário standalone mas sem especificar hosting.
- Risco: equipe começa a implementar sem saber o target (VPS? Railway? Fly.io? Self-hosted?). DC-10 diz que hosting é PROPOSTA — mas isso significa que TASK-A01 não pode ser deployed até PRE-2.
- Recomendação: TASK-A01 deve ser explícita: implementação do binário pode avançar, mas deploy depende de PRE-2. AC de deployment deve ser HUMAN_GATE.
- Severidade: MÉDIO (já parcialmente coberto por HUMAN_GATE em TASK-A01)

**F4.2 — Sem autenticação = dados de todos misturados**
- TASK-A03 propõe domain API sem auth.
- Gap: servidor central sem auth = qualquer cliente na rede pode ler/escrever dados de qualquer usuário. Mesmo que v1 seja single-user, começar sem auth cria dívida técnica urgente.
- Risco: se deployed publicamente sem auth, é brecha de segurança imediata.
- Recomendação: Ou (a) limitar acesso ao servidor por IP/rede (single-user local network), ou (b) implementar auth mínima (token compartilhado) antes de qualquer deploy. DC-10 diz que auth é proposta — mas a proposta deve ser decidida ANTES de TASK-A01 deploy.
- Severidade: CRÍTICO para deploy; MÉDIO para implementação local

**F4.3 — CORS para servidor central não definida**
- PR #4 CORS: `s.starts_with("http://localhost")` para broker local.
- Gap: servidor central terá uma URL real (não localhost). CORS precisa ser configurada para essa URL — mas a URL não está decidida (DC-10).
- Recomendação: TASK-A01 deve incluir configuração de CORS via env var `ALLOWED_ORIGIN`. AC: request de origin não-autorizada retorna 403.
- Severidade: MÉDIO

**F4.4 — Windows/Android shells: divergência de URL**
- Tauri Windows e Android apontarão para URL do servidor central.
- Gap: URL do servidor deve estar configurável no build Tauri (não hardcoded). Sem isso, binário Tauri não pode apontar para servidor deployado.
- Recomendação: TASK-A07 deve incluir: URL do servidor configurável via env var em build time (ou Tauri plugin de config). AC: `tauri.conf.json` sem URL hardcoded.
- Severidade: MÉDIO

**F4.5 — Android: WebView Tauri ainda é server? Ou PWA direta?**
- DC-4: Android = shell fino.
- Gap: Tauri Android é complexo de manter. PWA no browser Android seria mais simples para shell fino.
- Risco: TASK-A07 assume Tauri Android — mas isso não foi decidido.
- Recomendação: HUMAN_GATE em PRE-2 deve incluir: "manter Tauri Android ou migrar para PWA nativa Android".
- Severidade: ALTO (decisão de plataforma, não técnica)

### Veredicto Revisor 4
F4.2 (auth) e F4.5 (Android) são ALTO. A arquitetura servidor-central é correta mas deploy sem auth é risco de segurança real. Android como Tauri vs PWA nativa é decisão que deve ser feita em PRE-2.

---

## FRESH VERIFIER — Tentativa de Refutação

> Papel: tentar invalidar o plano inteiro. Sem viés de confirmação.

### Argumento 1: O plano não resolve o problema mais urgente

**Alegação:** PR #3 ainda não foi mergeado. O problema mais urgente é merge de PR #3 em main com UAT completo. O plano de server-central-v1 é ambicioso demais para o estado atual do projeto.

**Análise:** VERDADEIRO parcialmente. O plano reconhece isso — PRE-1 (merge PR #3) é o primeiro prerequisito. O replan-v2 não altera essa prioridade. Mas a quantidade de tasks (A01-A08) pode criar expectativa de que server-central-v1 está próximo, quando na verdade está bloqueado em decisões humanas (PRE-2, DC-10).

**Correção aplicada:** Adicionar nota explícita no sumário: "PRE-1 + PRE-2 são blockers reais. server-central-v1 NÃO começa antes deles."

**Status:** PARCIALMENTE REFUTADO — plano é correto em prioridade mas pode ser mal-interpretado. Adicionar alerta.

---

### Argumento 2: TLC_ECC_PLAN tem tasks demais para v1

**Alegação:** 8 tasks (A01-A08) para v1 é escopo excessivo. Um MVP de servidor central precisaria de no máximo A01+A02+A03 (servidor funcionando com API básica). O resto pode ser adicionado depois.

**Análise:** VERDADEIRO. As tasks A04-A08 são necessárias para o produto completo mas não para provar a arquitetura central. Um spike de A01+A02+A03 seria suficiente para validar DC-2 (servidor central).

**Correção aplicada:** Reclassificar A04-A08 como "v1.1" e A01-A03 como "v1.0 MVP". Não altera TLC_ECC_PLAN.md (as tasks são corretas) mas adiciona rótulo de prioridade.

**Status:** REFINAMENTO ACEITO — não invalida o plano.

---

### Argumento 3: AUDIT_PR3 marca tudo como PRESERVAR mas tem lacunas não documentadas

**Alegação:** AUDIT_PR3 classifica quase todos os itens como PRESERVAR. Um auditor real encontraria mais CORRIGIR/REAVALIAR.

**Análise:** PARCIALMENTE VERDADEIRO. PR #3 é genuinamente sólido — foi desenvolvido com TLC Strict. As únicas lacunas encontradas são de testes não reexecutados (NOT_RERUN) e HUMAN_GATE de UAT. Não há evidência de bugs de lógica em db.js de PR #3 (código foi lido extensivamente).

**Ponto válido:** AUDIT_PR3 não avaliou `src/app.js`, `src/stats.js`, `src/review-score.js` — apenas `src/db.js`. Esses arquivos podem conter regressões não detectadas.

**Correção aplicada:** Adicionar lacuna F3.6 na seção de testes: "Arquivos não auditados: app.js, stats.js, review-score.js. Não foram lidos nesta auditoria. Marcar como UNVERIFIED."

**Status:** REFINAMENTO ACEITO — não invalida a auditoria mas adiciona honestidade.

---

### Argumento 4: Plano assume que axum é a tecnologia certa para o servidor

**Alegação:** DC-10 diz que "Axum... são PROPOSTAS". O plano usa axum em TASK-A01. Isso viola DC-10.

**Análise:** VERDADEIRO. TASK-A01 diz "extrair broker axum" — implicitamente adota axum sem aprovação. DC-10 é explícita: axum é proposta.

**Correção aplicada:** TASK-A01 deve ser reformulada como "criar servidor Rust standalone" sem especificar axum. ACs não devem mencionar axum como obrigatório. O HUMAN_GATE de PRE-2 deve incluir aprovação da tecnologia do servidor.

**Status:** BUG REAL NO PLANO — corrigido abaixo.

---

## Correções Pós-Validação

### Correção C1 — TASK-A01: não assumir axum aprovado

**Original:** "Criar crate smartlearn-server. Copiar db.rs e router.rs do broker."
**Corrigido:** "Criar servidor Rust standalone com tecnologia aprovada em PRE-2 (axum é proposta padrão, precisa confirmação). Enquanto PRE-2 não aprovado: prototipar localmente sem deploy."
**Arquivo:** TLC_ECC_PLAN.md TASK-A01 — nota adicionada aqui; TLC_ECC_PLAN.md é spec, não código — atualizar na próxima iteração de planning.

### Correção C2 — TASK-A05: adicionar migrateV1ImportData antes de POST /api/import

**Original:** "hasMigrationData() verifica learningUnits em localStorage"
**Corrigido:** Adicionar passo: "Se dados em localStorage estiverem no formato v1 (studyRecords), chamar migrateV1ImportData() antes de buildImportStatements(). AC: dados v1 convertidos antes de envio."

### Correção C3 — TASK-A03: adicionar AC de SQL injection

**Adicionado:** "AC: POST /api/subjects com nome contendo `'; DROP TABLE` retorna subject com nome literal (não executa SQL). normalizeEntityName aplicada no servidor."

### Correção C4 — Arquivos não auditados em PR #3

**Adicionado:** app.js, stats.js, review-score.js marcados como UNVERIFIED — não foram lidos na auditoria. Devem ser revisados antes de merge de PR #3.

---

## Status Final das Fases

| Fase | Status | Artefato |
|------|--------|----------|
| FASE A — Audit PR #3 | COMPLETA | AUDIT_PR3.md |
| FASE B — Audit PR #4 | COMPLETA | AUDIT_PR4.md |
| FASE C — AS-IS × TO-BE | COMPLETA | ASIS_TOBE_GAPS.md |
| FASE D — TLC/ECC Plan | COMPLETA | TLC_ECC_PLAN.md |
| FASE E — Validation | COMPLETA | VALIDATION.md (este arquivo) |

---

## Alerta Final

> **PRE-1 e PRE-2 são blockers reais.**
> server-central-v1 NÃO inicia antes de:
> 1. PR #3 mergeado em main com `npm test` + `cargo test` PASS + UAT Tauri humano
> 2. DC-10 aprovado: tecnologia do servidor, URL/hosting, estratégia de auth (incluindo Android: Tauri vs PWA nativa)
>
> Sem PRE-2, a tecnologia "axum" em TASK-A01 é apenas proposta padrão — não decisão aprovada.
>
> O replan-v2 é um plano de auditoria e direcionamento, não uma autorização para implementar.
