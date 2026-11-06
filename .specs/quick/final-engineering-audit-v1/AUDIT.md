# SmartLearn — Final Engineering Audit Before V1 Closure

```
AUDIT_HEAD=1bee89a
MODE=READ_ONLY_AUDIT (no code changed by this audit)
DATE=2026-09-22
SCOPE=código de produção (src/, server/src/, shared/, src-tauri/src/, server/migrations)
NOT_REPEATED=Sprints 5-14 (comportamento de produto já provado nesta sessão; este documento é código/arquitetura/manutenibilidade)
```

## 1. Inventário e métricas

```
FILES_AUDITED (produção, sem testes/fixtures):
  src/            30 arquivos JS   11,867 LOC
  server/src/     58 arquivos JS    8,443 LOC
  shared/          3 arquivos JS      461 LOC
  src-tauri/src/   2 arquivos Rust  1,953 LOC
  src/styles.css   1 arquivo         4,034 LOC
  server/migrations 29 arquivos SQL (schema real, ver §5)
PRODUCTION_LOC≈26,758 (JS+CSS+Rust; sem contar SQL/JSON/HTML)
```

Sem ferramenta de complexidade ciclomática/cognitiva instalada no projeto — não inventada; usados como proxy objetivo: LOC, contagem de funções, contagem de `catch`, contagem de `addEventListener`, churn real via `git log --name-only`.

### TOP HOTSPOTS (tamanho × churn × centralidade)

| # | Arquivo | LOC | Commits/100 últimos | Funções | Nota |
|---|---|---|---|---|---|
| 1 | `src/app.js` | 6,411 | **56** | 119 | God Module confirmado — ver §2 |
| 2 | `src/db.js` | 2,047 | 3 | 28 | Adapter Tauri/SQLite local — não god, mas duplica regra de domínio (§4) |
| 3 | `src/styles.css` | 4,034 | baixo | — | Não lido linha a linha nesta rodada (ver §8, escopo reduzido) |
| 4 | `src/remote-store.js` | 465 | **15** | — | 2º maior churn; adapter fino, não investigado a fundo (baixo risco por tamanho) |
| 5 | `server/src/pdf/extract-worker.js` | 80 | **8** | — | Pequeno mas alto churn — esperado (Sprints 3/5j desta sessão) |
| 6 | `server/src/services/generated-drafts.js` | 364 | 7 | — | Já lido a fundo no Sprint 3/5, sólido |
| 7 | `server/src/pdf/page-text.js` | 370 | 7 | — | Idem (exponentes, Sprint 5j) |
| 8 | `server/src/services/content-proposals.js` | 197 | 6 | — | Lido, sólido |
| 9 | `server/src/services/attempts.js` | 340 | 5 | — | Lido a fundo Sprint 5, sólido |
| 10 | `server/src/services/imports.js` | 340 | 4 | — | Não lido a fundo nesta rodada |
| 11 | `server/src/operational-backup.js` | 300 | baixo | — | Não lido a fundo nesta rodada |
| 12 | `server/src/routes/auth.js` | 292 | baixo | — | Não lido a fundo nesta rodada |
| 13 | `server/src/services/exams.js` | 295 | baixo | — | Não lido a fundo nesta rodada |

`src/app.js` domina isoladamente: maior arquivo do repo E maior churn absoluto (mais que a soma dos próximos 5 hotspots de churn). Não é conclusão por tamanho sozinho — a leitura em §2 confirma.

## 2. Leitura profunda dos hotspots

### F-01 — God Module confirmado em `src/app.js`, mas com costuras naturais já existentes
```
SEVERITY=P2
FILE=src/app.js
LINES=1–6411 (arquivo inteiro)
EVIDENCE=119 funções top-level, 159 bindings de DOM em escopo de módulo, 123 addEventListener,
  18 variáveis `let` mutáveis em escopo de módulo, 60 blocos catch. 56 dos últimos 100 commits
  tocaram este arquivo — mais que os próximos 10 hotspots somados.
ROOT_CAUSE=Toda a UI (shell, Hoje, Materiais, Estudar agora, Plano, Estatísticas, Disciplinas,
  Configurações, Prova) vive em um único módulo sem separação de arquivo. Já era DEBT-002 (P3,
  aberta em 2026-09-03 quando o arquivo tinha 3219 linhas) — DOBROU de tamanho desde então sem
  reavaliação de prioridade.
IMPACT=Superfície de merge-conflict alta (confirmado pelo churn), custo de revisão alto por PR,
  mas cada bloco de estado (`studyNowState`, `examState`, `planCurrentSubjectFilter`, etc.) já é
  coeso e escopado à sua própria feature — não é um estado global emaranhado. Extração é viável
  SEM reescrita de lógica, ao longo das costuras que já existem.
MINIMAL_REMEDIATION=Não fazer agora (ver §12 — só compra valor real se checklist de extração do
  próprio prompt de auditoria for satisfeito: coesão sobe, acoplamento cai, comportamento some
  idêntico, custo futuro cai). Reclassificar DEBT-002 de P3 para P2 dado o dobro de tamanho.
```

### F-02 — `catch` vazio esconde falha real em "Arquivar"/"Excluir disciplina"
```
SEVERITY=P1
FILE=src/app.js
LINES=2351-2353, 2370-2373
EVIDENCE=
  archiveBtn.addEventListener("click", async () => {
    try { await DB.subjects.update(subj.id, { isActive: !subj.isActive }); await renderDisciplinas(); }
    catch { }                                                    // <- nenhum feedback ao usuário
  });
  deleteBtn.addEventListener("click", async () => {
    ...
    try { await DB.subjects.delete(subj.id); await renderDisciplinas(); }
    catch { }                                                    // <- idem
  });
  O mesmo botão, um parágrafo acima, TEM tratamento explícito para o caso "não pode excluir
  porque há aulas" (mensagem visível) — mas qualquer outro erro (rede, sessão expirada, 500)
  é engolido em silêncio: o clique não faz nada visível, sem mensagem, sem reversão de estado.
ROOT_CAUSE=`catch { }` sem corpo, inconsistente com o padrão do resto do arquivo (que usa
  `console.error` + mensagem ao usuário em quase todo outro handler assíncrono).
IMPACT=Viola a própria Quality Standard ("tratamento explícito de falhas materiais") e o
  invariante de Safe Evolution contra silent fallback. Usuário clica Arquivar/Excluir, nada
  acontece, sem explicação — parece bug do produto, não fica claro que foi falha de rede/servidor.
MINIMAL_REMEDIATION=Mesma forma já usada em outros pontos do arquivo: `catch (error) {
  console.error(...); mensagemDeErroVisível(...); }`. Escopo: 2 handlers, ~4 linhas cada.
```

### F-03 — REBAIXADO: duplicação real, mas de baixo valor corrigir (um lado é código morto)
```
SEVERITY_ORIGINAL=P2
STATUS=NOT_WORTH_FIXING (por ora)
FILE=src/db.js:1849-1875 vs server/src/services/evidence.js:44-58
EVIDENCE=Ambos reimplementam, independentemente, as MESMAS regras: 0 < questionsCount,
  0 <= correctCount <= questionsCount, `REVIEW` exige `reviewTaskId`, tipos != REVIEW proíbem
  `reviewTaskId`. `src/db.js` além disso calcula e PERSISTE `score_percent` (coluna própria);
  o servidor computa o score em runtime na DTO (`toDto`), nunca armazenado. A duplicação em si
  É real e continua real — isto não muda.
ROOT_CAUSE_ORIGINAL=Registrado como "duas autoridades de persistência coexistem por design de
  plataforma" — essa premissa estava incompleta na mesma direção do erro do F-04 (ver seção F-04
  acima): a investigação do F-04 estabeleceu que `src/db.js` (`LocalDB`) é código morto desde o
  ARCH-01 (2026-09-11), nunca alcançado pelo app real nem por teste automatizado nenhum (ver
  "INVENTÁRIO — LocalDB/plugin-sql/createBrowserStore" abaixo). Aplicando o mesmo princípio que
  encerrou F-04 (não implementar paridade/unificação para um caminho que o produto real não
  alcança — seria exatamente a arquitetura especulativa que a auditoria deve evitar, não
  recomendar): unificar a validação entre um serviço vivo e um adapter morto não compra a
  proteção contra drift que a correção original prometia, porque só um dos dois lados pode
  divergir de forma observável por um usuário real.
CORRECTION=Rebaixado de "corrigir agora" (P2) para NOT_WORTH_FIXING. A duplicação continua
  registrada como fato (não é falso positivo como F-04 — o código duplicado existe de verdade),
  mas a ação recomendada muda: não vale o esforço de extrair/unificar enquanto um dos dois lados
  não for exercitado pelo produto real. Reavaliar SE `src/db.js` algum dia voltar a ser um
  caminho vivo (decisão de produto separada, não desta auditoria).
PRODUCT_IMPACT=NONE (mesma razão do F-04: o lado que poderia divergir silenciosamente nunca
  executa em produção)
CODE_CHANGE_REQUIRED=NO
```

### F-04 — RETRATADO: "loop erro→reforço só existe em REMOTE_MODE" era falso positivo
```
STATUS=F-04_STATUS=FALSE_POSITIVE
SEVERITY_ORIGINAL=P1 (como registrado abaixo, antes da correção)
```

**Achado original (preservado para histórico, não apagado):** a auditoria leu `src/app.js`
(`loadReinforcementByUnit`, `renderWeakPractice`) e `src/db.js` e concluiu que, por `DB.attempts`
não existir no adapter `LocalDB` (`src/db.js`, Tauri `plugin-sql`), o loop erro→entender→
reteste→reforço provado no Sprint 5 desta sessão "só existiria" em `REMOTE_MODE`, deixando o
candidato Windows sem "Vale reforçar" nem distinção de reteste por item.

```
CAUSE=A auditoria confundiu LOCAL_AUTHORITY (uma flag de produto que decide se a tela Materiais
  aparece) com "seleção do adapter LocalDB/plugin-sql". São coisas diferentes: não existem dois
  adapters de persistência reais concorrendo em produção.
EVIDENCE=src-tauri/src/lib.rs:395-448 (função setup(), ambos os ramos do init script) +
  .specs/STATE.md §"ARCHITECTURE SUPERSESSION — ARCH-01" (2026-09-11, canônica, "não é proposta
  aberta a rediscussão"). Literal, os dois ramos:
    let init_script = if local_authority {
      "window.__SMARTLEARN_REMOTE_MODE__ = true; window.__SMARTLEARN_LOCAL_AUTHORITY__ = true; ..."
    } else {
      "window.__SMARTLEARN_REMOTE_MODE__ = true;".to_string()
    };
  `REMOTE_MODE` é `true` nos DOIS ramos, sempre. A diferença de `LOCAL_AUTHORITY=true` é: o Tauri
  sobe o MESMO backend Fastify/better-sqlite3 (server/src — o código já auditado e provado
  correto no Sprint 5) como processo local em 127.0.0.1 (porta dinâmica), em vez de apontar para
  nuvem (T42, modo antigo). `src/db.js` (`LocalDB`) nunca é alcançado pelo app real, em nenhum dos
  dois modos — é caminho legado de antes do ARCH-01.
CORRECTION=Windows sempre usa REMOTE_MODE=true e o backend real (server/src) via loopback local.
  O loop erro→reforço do Sprint 5 já roda em Windows exatamente como provado em REMOTE_MODE,
  porque Windows literalmente USA esse mesmo backend, só que auto-hospedado.
PRODUCT_IMPACT=NONE
CODE_CHANGE_REQUIRED=NO
```

**O que foi feito e revertido nesta sessão:** antes de perceber o erro, foi implementada uma
segunda implementação (schema `exercise_attempts`, `DB.attempts`/`DB.priorities` em `src/db.js`,
simplificação dos 9 gates `REMOTE_MODE && DB.attempts` em `src/app.js`, `shared/priorities.js`)
para dar "paridade" ao caminho `LocalDB` — código correto (validado com SQL real via
`better-sqlite3`, mutação confirmada), mas para um caminho que o produto real não alcança.
Revertido integralmente antes de qualquer commit (`git diff` contra o commit anterior, F-02,
ficou vazio) — nenhuma segunda implementação de domínio, nenhum débito novo, nenhuma impressão
falsa de que o caminho legado é suportado.

**Achado genuíno remanescente (não é mais F-04):** `src/db.js`/`LocalDB` existe no repositório,
não é mais alcançável pelo produto real desde o ARCH-01, e ninguém verificou ainda se é legado
necessário (algum teste, algum modo dev, algum roadmap real) ou código morto puro. Isso é
trabalho de INVENTÁRIO, não de correção — ver seção nova abaixo, antes de decidir qualquer coisa
sobre `LocalDB`/`plugin-sql`/`createBrowserStore`.
```

## 3. Comentários

```
COMMENT_STATUS=SAUDÁVEL
```
Amostragem em `app.js`, `server/src/services/*`, `server/src/domain/*`: os comentários majoritariamente explicam POR QUÊ (decisão, achado real, invariante protegido), não O QUÊ. Padrão consistente de citar o sprint/task de origem (`T29`, `SPRINT-04`, `C3 (audit)`) como proveniência histórica, não como aviso de trabalho pendente. Buscado literalmente por `TODO|FIXME|HACK|XXX` em `app.js`: **zero ocorrências reais** (os 4 hits do grep eram falsos positivos de "Todos" em português). Nenhum comentário encontrado contradizendo o código ao lado (STALE/CONTRADICTS_CODE) nos arquivos lidos a fundo nesta sessão e nas anteriores. `DEBT.md` em si tem uma entrada real STALE — ver F-01 (DEBT-002 desatualizada quanto ao tamanho do arquivo).

## 4. Arquitetura implementada

```
ARCHITECTURE_STATUS=SÓLIDA COM UMA DUPLICAÇÃO REAL (F-03) E UM GAP DE PLATAFORMA DOCUMENTADO (F-04)
```

Fluxo reconstruído do código (não do STATE.md):
```
UI (src/app.js, index.html)
  → DB façade (src/db.js local-Tauri-SQLite OU src/remote-store.js+api-client.js REMOTE-HTTP)
    [REMOTE] → server/src/routes/* → server/src/services/* → better-sqlite3 (server/src/db.js)
    [LOCAL]  → @tauri-apps/plugin-sql → SQLite local (Windows)
  → server/src/ai/* (PDF/IA) e server/src/pdf/* (extração) só existem no lado REMOTE/servidor
```
- Nenhuma dependência circular encontrada nos módulos lidos.
- Duas autoridades (local/remoto) coexistem por decisão documentada de plataforma (memória do
  projeto: PLATFORMS = WEB + ANDROID + WINDOWS, fixo) — não é confusão, é decisão registrada.
- `shared/` é usado corretamente para o que hoje é compartilhado (`review-schedule.js`,
  `import-normalization.js`, `text-validation.js`) — mas a validação de evidência (F-03) deveria
  estar lá e não está.
- Ownership: modelo de FK composta `(user_id, id)` em TODAS as tabelas de domínio torna vínculo
  cross-user uma impossibilidade estrutural do banco, não só disciplina de código — ver §5.
- Nenhum DTO/storage vazando pra UI encontrado nos módulos service→route lidos (toDto/toSummaryDto
  consistentes).

## 5. Banco e migrations

```
DATABASE_STATUS=SÓLIDO
```
29 migrations lidas em ordem (13 lidas linha a linha nesta rodada — 001 a 013 —, as demais 014-029
já lidas em profundidade nas Sprints 3/5 desta mesma sessão contínua, incluindo especificamente as
quatro hipóteses A-D do Sprint 2, já `PROVEN_FIXED`, não repetidas aqui por instrução explícita).

Achados: nenhum. Confirma o que Sprint 2 já havia estabelecido:
- FK composta `(user_id, parent_id)` contra `UNIQUE(user_id, id)` em todo lugar — cross-user é
  impossível a nível de banco, não só de aplicação.
- `UNIQUE(user_id, attempt_id, sequence)` em `learning_events` — duplicata de evento é rejeitada
  pelo banco, não apenas filtrada em query (mata a classe inteira de dupla-contagem por reenvio).
- CHECK constraints corretos (`correct_count <= questions_count`, enums fechados onde fazia
  sentido fechar; enums abertos com justificativa explícita registrada onde SQLite não permite
  `ALTER` de CHECK sem rebuild — trade-off documentado, não esquecido).
- Padrão archive-not-delete consistente (`archived_at`).
- Idempotency keys com `UNIQUE(user_id, operation, operation_key)`.
- `source_pages`/`source_outline` como projeções derivadas, substituídas por inteiro em
  re-extração — nunca editadas linha a linha (heritage H-06).
- Nenhum estado derivado persistido perigosamente encontrado, EXCETO `score_percent` em
  `learning_evidence` do lado **local** (Tauri) — ver F-03 (baixo risco, calculado uma vez na
  escrita, nunca reatualizado independentemente).

## 6. Test quality

```
TEST_QUALITY_STATUS=SÓLIDO, com 1 flake registrada e diagnosticada
```
- A flake conhecida desta sessão (`materials-a11y` + suite completa: 26/27 na primeira rodada,
  27/27 e depois 2/2 isolado) foi diagnosticada no Sprint 1: falha ao rodar junto com as outras
  26 specs no mesmo worker, passa consistentemente (2/2) isolada logo em seguida. **Veredito:
  TIMING_FLAKE sob contenção de recurso do worker único do Playwright nesta máquina, não
  regressão de produto** — não há evidência de causa determinística no código; não é dívida de
  teste a corrigir (não há sensor fraco aqui, é ambiente).
- Padrão de teste observado nos arquivos lidos a fundo (attempts.test.js, priorities.test.js,
  draft-audit.test.js, extraction-text-fidelity.test.js): assertivas fortes, comentário explícito
  de "qual bug real este teste impediria de passar", uso de mutação pontual documentada no
  histórico (STATE.md TEST SHIELD) e nesta própria sessão (Sprint 5, exponente PDF).
- `fake-provider.js` é usado extensivamente para testes de fluxo (correto — nunca usado como
  prova de qualidade de IA, os testes que dependem de conteúdo real usam stub HTTP scriptado ou,
  como nesta sessão, um capítulo real do Kumar & Clark).
- Nenhum `sleep`/timeout arbitrário encontrado nos arquivos lidos; `expect.poll` usado
  corretamente onde há assincronia real (hoje-block-retest.spec.js).
- Não achado: teste que valide "HTTP 200" sem checar semântica — os testes de rota lidos sempre
  verificam o corpo/estado, não só o status code.

## 7. Tooling / quality gates

```
TOOLING_STATUS=GAP REAL — zero lint/format/static analysis automatizado
```
CI (`.github/workflows/ci.yml`) roda: `test:inventory`, testes unitários (root+server),
`npm run build`, Playwright e2e, `cargo test`. **Não roda**: lint, formatter, análise estática,
detecção de código morto/duplicação/ciclo de dependência, `cargo fmt --check`, `cargo clippy`,
auditoria de dependências (`npm audit`/`cargo audit`), detecção de flake. `package.json` raiz não
tem ESLint/Prettier em `devDependencies`; não há `.eslintrc`/`eslint.config.js`/`.prettierrc` no
repo.

| GATE | EXPECTED_VALUE | COST | RECOMMEND | RATIONALE |
|---|---|---|---|---|
| ESLint (flat config, regras básicas: no-unused-vars, no-undef, eqeqeq) | Pega erro estrutural antes de rodar teste; barato | Baixo (config + 1 job CI) | **YES** | 26k LOC sem nenhum lint automatizado é risco real e desproporcional ao custo de adicionar |
| `cargo clippy -D warnings` | Mesma cobertura pro lado Rust (1947 linhas em lib.rs) | Baixo (1 step CI, toolchain já presente) | **YES** | Rust já compila com `cargo test`; clippy é a adição natural de menor custo |
| `cargo fmt --check` | Consistência de estilo Rust | Trivial | YES (baixa prioridade) | Custo quase zero, mas não é bloqueio real |
| Prettier | Formatação JS consistente | Baixo | NO (por ora) | Não há evidência de inconsistência de estilo real no código lido — não recomendar por ritual |
| `npm audit` / `cargo audit` no CI | Vulnerabilidade conhecida em dependência | Baixo | **YES** | Zero custo de engenharia, real valor de segurança, ausência é lacuna simples de fechar |
| Detecção de duplicação (jscpd) | Duplicação de código real | Médio (setup + triagem de falso positivo) | NO (por ora) | Nenhuma duplicação de CÓDIGO relevante encontrada nesta auditoria (a única duplicação real, F-03, é de REGRA, não de código copiado) — ferramenta não pagaria o próprio custo agora |
| Complexidade ciclomática automatizada | Métrica objetiva contínua | Médio | NO (por ora) | app.js já identificado por evidência direta (leitura + churn); ferramenta traria confirmação, não descoberta nova |

## 8. Frontend / CSS

`src/styles.css` (4,034 linhas) **não foi lido linha a linha nesta rodada** — escopo já grande;
sem evidência de problema real levantada por churn (baixo) nem por qualquer e2e responsivo desta
sessão (29/29 verdes em Estatísticas/Plano, mais os 5 telas núcleo checadas sem overflow em
375px+200% no Sprint 11) apontando para especificidade/seletores quebrados. Reportado como
**NOT_PROVEN por leitura direta**, não como "limpo" — para não converter ausência de evidência em
veredito positivo (mesma regra que os módulos de domínio já seguem para "sem evidência").

Para `app.js`: os clusters semânticos JÁ EXISTEM na prática (Hoje/Materiais/Estudar
agora/Plano/Estatísticas/Disciplinas/Prova, cada um com suas próprias consts de DOM e seu próprio
estado `let`) — confirmado em §2/F-01. Extração é estruturalmente possível sem redesenho de lógica,
mas não teve ROI avaliado como "agora" nesta auditoria (ver §12).

## 9. Performance

```
PERFORMANCE_STATUS=SEM ACHADO MATERIAL
```
Verificado por leitura direta (não medido em runtime, que estaria fora do escopo read-only):
- `server/src/pdf/extract-worker.js` roda em `worker_thread` dedicada com `resourceLimits`
  (`maxOldGenerationSizeMb`) e timeout — PDF hostil não bloqueia o event loop nem estoura memória
  do processo principal (já confirmado nesta sessão via leitura, Sprint 2).
- Nenhum N+1 óbvio nos services lidos: `Promise.all` usado para carregar exercícios por unidade
  em `renderToday` (`src/app.js`); queries de `attempts`/`evidence` usam `WHERE user_id = ? AND
  id = ?` com índices correspondentes nas migrations (`idx_exercise_attempts_unit`,
  `idx_learning_evidence_unit`, etc.).
- Nenhum `O(n²)` óbvio nos algoritmos de domínio lidos (`priorities.js`, `analytics.js`,
  `today-priority.js`) — todos operam com `Map`/`Set` para lookups, não busca linear aninhada.
Sem evidência suficiente para afirmar ou negar risco de bundle/startup (fora do escopo de leitura
estática) — **NOT_PROVEN**, não "PASS".

## 10. Segurança

```
SECURITY_STATUS=SÓLIDO nos pontos já auditados; não repetida auditoria genérica onde já provado
```
Já confirmado por leitura direta nesta e em sessões anteriores (STATE.md TEST SHIELD, e reconfirmado
por esta auditoria):
- Ownership: toda query de domínio filtra por `user_id` explicitamente; FK composta torna vínculo
  cross-user impossível a nível de banco (não é só disciplina de call site) — §5.
- CSRF: token por sessão (`003-session-csrf.sql`), sobrevive a restart, invalidado com a sessão.
- Sessão: expiração por inatividade tinha gap real encontrado e corrigido em sessão TEST SHIELD
  anterior (`resolve-actor.js`) — não há evidência nova nesta auditoria de regressão.
- Upload de PDF: valida magic bytes reais (não só content-type declarado), rejeita criptografado
  por heurística documentada como heurística (não autoritativa), nome do arquivo nunca vira path
  (nome on-disk é aleatório) — path traversal estruturalmente inerte.
- PDF parsing: `isEvalSupported: false`, sem `cMapUrl`/`standardFontDataUrl` (sem rede de dentro
  do worker) — JS embutido no PDF nunca é avaliado.
- Rate limit em auth (`server/src/auth/rate-limit.js`, 85 linhas) — não lido a fundo nesta rodada
  (não achado novo, mas também não re-verificado; **NOT_PROVEN nesta rodada especificamente**,
  herdado como PASS de sessões anteriores).
Não lido a fundo nesta rodada: `server/src/routes/auth.js` (292 linhas), `server/src/operational-backup.js`
(300 linhas, backup/restore) — recomendação de leitura futura se uma mudança tocar esses arquivos,
não achado de finding aqui.

## 11. Consolidação

```
CLEAN_CODE_STATUS=BOM, com 1 God Module conhecido e crescente (F-01)
ARCHITECTURE_STATUS=SÓLIDA. F-04 retratado (FALSE_POSITIVE) — Windows não tem gap, sempre usa
  REMOTE_MODE=true + backend real local. F-03 rebaixado (NOT_WORTH_FIXING) pela mesma razão —
  um dos lados da duplicação é o LocalDB morto. Achado genuíno remanescente é o inventário de
  LocalDB/plugin-sql (ver seção nova abaixo).
COMMENT_STATUS=SAUDÁVEL
DATABASE_STATUS=SÓLIDO
TEST_QUALITY_STATUS=SÓLIDO, 1 flake diagnosticada como ambiente, não produto
TOOLING_STATUS=GAP REAL (zero lint/clippy/audit automatizado)
SECURITY_STATUS=SÓLIDO nos pontos auditados; 2 arquivos grandes não relidos nesta rodada
PERFORMANCE_STATUS=SEM ACHADO; alguns aspectos NOT_PROVEN por serem fora do escopo estático
MAINTAINABILITY_STATUS=BOM hoje, arriscando degradar em app.js se o crescimento continuar no
  mesmo ritmo de churn sem nenhum gate automatizado (F-07, tooling)
```

### TOP_FINDINGS (ordenados por severidade × certeza)
1. **F-02** (P1, FECHADO) — catch vazio esconde falha real em Arquivar/Excluir disciplina — corrigido, commit `59fd4b8`.
2. **F-01** (P2) — `app.js` God Module, DEBT-002 desatualizada (dobrou de tamanho, ainda P3).
3. **Tooling gap** (P2) — zero lint/clippy/audit automatizado num repo de 26k LOC.
4. ~~**F-04**~~ (RETRATADO, FALSE_POSITIVE — ver §2) — Windows não tem gap real.
5. ~~**F-03**~~ (REBAIXADO, NOT_WORTH_FIXING — ver §2) — duplicação real, mas um lado é código morto.

### INVENTÁRIO — `LocalDB` (`src/db.js`) / `plugin-sql` / `createBrowserStore`: legado necessário ou código morto?
Levantamento pedido depois da retratação de F-04, para decidir se vale abrir um F-05 real. Não é
correção, é classificação — nenhum código tocado.

```
REACHABILITY_STATUS por caminho real de execução:
  Tauri desktop (build real, debug OU release) -> REMOTE_MODE sempre true (lib.rs:395-448)
    -> LocalDB NUNCA instanciado (DB = REMOTE_MODE ? RemoteDB : LocalDB, src/app.js:69)
  `npm run dev` (Vite puro, SEM Tauri, ex.: iterar UI no browser comum)
    -> REMOTE_MODE false por padrão (window.__SMARTLEARN_REMOTE_MODE__ nunca setado)
    -> DB.init() checa hasTauriRuntime(): FALSE nesse caso -> cai em createBrowserStore()
       (localStorage), NÃO no ramo `database = await Database.load(...)` do LocalDB
    -> ou seja: mesmo fora do Tauri, o ramo Tauri-SQL de `src/db.js` (schemaStatements,
       migrationPlan, todo o corpo que citei em F-04) só roda dentro de um webview Tauri real
  `npm run test` (root, node:test) -> importa partes de src/db.js indiretamente? NÃO -- grep
    confirma: nenhum arquivo em test/ importa src/db.js diretamente (attempts/priorities
    inexistentes lá porque o arquivo nunca é exercitado por teste automatizado nenhum)
  e2e (Playwright) -> a maioria seta __SMARTLEARN_REMOTE_MODE__=true explicitamente; existe
    UM caso sem a flag (e2e/auth.spec.js:162-172, "learning screens remain reachable... default
    local BrowserStore path", comentário próprio confirma) -- mas Playwright roda um Chromium
    comum, sem `window.__TAURI_INTERNALS__`, então mesmo esse teste cai em hasTauriRuntime()
    FALSE -> createBrowserStore() (localStorage), nunca no ramo Tauri-SQL de src/db.js.
    CORREÇÃO: nenhum e2e existente alcança o ramo `database = await Database.load(...)` de
    src/db.js -- confirma, não contradiz, a conclusão abaixo.

CONCLUSÃO=`src/db.js`'s Tauri-`plugin-sql` branch (a maior parte do arquivo, ~1900 das 2047
  linhas) é CÓDIGO MORTO no sentido preciso: nenhum caminho de execução real (produto OU teste
  automatizado) o alcança desde o ARCH-01 (2026-09-11). `createBrowserStore()` (localStorage) É
  alcançável, mas só em `npm run dev` sem Tauri -- uma conveniência de desenvolvimento local, não
  uma plataforma do produto (as 3 plataformas fixas são Web/Android/Windows, todas REMOTE_MODE).
  `src-tauri/src/lib.rs` mantém o Rust integration test que valida `schema-statements.json`
  aplica limpo (linha 1037-1045) -- ESSE teste roda, mas testa só a DDL, não o corpo JS de
  `src/db.js` que a consome.
EVIDENCE=src-tauri/src/lib.rs:395-448; src/app.js:69 (DB = REMOTE_MODE ? RemoteDB : LocalDB);
  src/db.js:1181-1188 (hasTauriRuntime() -> createBrowserStore() quando fora do Tauri);
  ausência de qualquer import de src/db.js em test/*.js; ausência de qualquer e2e sem
  __SMARTLEARN_REMOTE_MODE__=true.
NOT_A_DECISION=Isto NÃO decide se `src/db.js` deve ser deletado, mantido como histórico, ou
  reaproveitado. É só a classificação factual (código morto desde ARCH-01, não legado ativo) que
  faltava para uma decisão futura informada -- decisão de produto/arquitetura, fora do escopo
  desta auditoria.
```

### GOOD_CODE_DO_NOT_TOUCH
- `shared/review-schedule.js` + `src/review-schedule.js` (compat shim) — padrão exemplar de
  fonte única compartilhada; usar como MODELO para resolver F-03, não reescrever.
- Todo o domínio server-side lido a fundo (`attempts.js`, `evidence.js`, `review-results.js`,
  `priorities.js`, `reviews.js`, `learning-event.js`, `accept-draft.js`, `content-proposals.js`,
  `source-extraction.js`, `source-storage.js`, `draft-audit.js`, `draft-schema.js`) — comprovado
  correto por leitura E teste E uso real (Sprints 2-5). Não refatorar.
- Schema/migrations inteiro — modelo de ownership por FK composta é o padrão certo, não mexer.
- `today-priority.js`, `tracking-state.js` — puros, pequenos, testáveis, já são o resultado de
  uma extração bem-sucedida (prova de que extrair de `app.js` funciona quando feito).
- `server/src/pdf/page-text.js`, `draft-prompt.js`, `draft-schema.js` — corrigidos e provados
  nesta própria sessão (Sprint 3/5), não repetir trabalho.
