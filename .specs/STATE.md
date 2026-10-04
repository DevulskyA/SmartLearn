# STATE.md — SmartLearn (Memento)

> Snapshot de continuidade. Autoridade em conflito: Git/código/dados reais > validação > decisão humana > spec > este arquivo > plano > chat.
> Histórico integral e intocado: `.specs/archive/STATE-ate-2026-10-04.md` (cópia byte a byte do STATE de 2026-09-10..10-03; seções citadas abaixo por nome). Cockpit de retomada: `.specs/EXECUTION.md`. Posição de sessão: `.specs/HANDOFF.md` (local, ignorado pelo Git).

**Atualizado:** 2026-10-04 · **Worktree/branch:** `C:\Projetos\SmartLearn\.claude\worktrees\smartlearn-v1-complete` · `claude/smartlearn-v1-complete` · só local (NO_PUSH / NO_MERGE(main) / NO_DEPLOY / NO_RELEASE)

## Posição
- HEAD de código: `169ec2d`; depois só docs/Prompt Lab (`git log -1` manda). Esquema do banco v30 (migrações 001–030; próxima livre 031). Versão do app `0.1.0`.
- Baseline de testes (T-F0-01, reproduzido por execução em 2026-10-04): ver `.specs/features/hardening-roadmap-v1/validation.md`.
- Plano ativo: `.specs/features/hardening-roadmap-v1/{spec.md,tasks.md}` (ordem: F0, F1, F6 [T-F6-01..03], F2, F4, F3, F8, F5, F7, F9). Track macro: `conductor/tracks/v1-validation/plan.md`; painel: `node scripts/agent-tasklist.mjs`.
- Prompt Lab: harness e baseline em `.specs/features/prompt-lab/` (VALID-4 PASS e VALID-5 PASS de fidelidade em 2026-10-04, com limites; variantes H1–H5 só propostas); saídas reais fora do Git em `C:\Users\Ariel\SmartLearn-PromptLab\`.

## Decisões canônicas em vigor (não reabrir sem decisão humana)
- **Arquitetura (ARCH-01, 2026-09-11):** Desktop local-first; backend Node local em loopback (LOCAL-01A/01B); servidor central só é autoridade no modo remoto/Companion. Seção "ARCHITECTURE SUPERSESSION" do arquivo morto.
- **Filosofia:** SMARTLEARN_PRODUCT_FIRST_V1 (valor ao aluno acima de processo). Constituição `.specs/governance/SMARTLEARN_PRODUCT_CONSTITUTION_V1.md` (§0.1 desempata direção); padrões `02_SMARTLEARN_QUALITY_STANDARD_V1.md` e `SAFE_SOFTWARE_EVOLUTION_PRINCIPLES_V2.md` (v2.1.0; §4.33/I11 superfícies protegidas, ADR-0001: Estatísticas protegida).
- **IA como produto (AI_AS_PRODUCT_SPEC, 2026-09-12):** provedor/modelo/esforço/versão de prompt são variáveis de produto que o assistente nunca escolhe nem muda em silêncio; `AI_SILENT_FALLBACK=FORBIDDEN`; conteúdo curado manualmente é `CURATED_CONTENT_TEST`, nunca evidência de qualidade de IA.
- **Provedor ativo:** CODEX (decisão humana 2026-10-03: `codex exec` com o login existente, sem API key; `SMARTLEARN_AI_PROVIDER=CODEX` + `SMARTLEARN_AI_CONSENT=true`; falha fechada, nunca FAKE). A decisão de 2026-09-12 (`AI_PROVIDER_DECISION`: OPENAI gpt-5.6-luna, esforço alto) continua implementada e selecionável, mas NÃO é o provedor ativo (EXECUTION.md ainda a cita: reconciliar em T-F0-03). Prompt do produto = versão 5; não mudar sem decisão humana.
- **Dados:** HUMAN DEV DATA != TEST DATA; banco DEV canônico `C:\Users\Ariel\SmartLearn-DevData\smartlearn-dev.db` (fora de qualquer worktree, nunca tocado por teste); migrações só para a frente e com backup; backups (`C:\Projetos\SmartLearn-db-backups`) e fontes importadas nunca são apagados por rotina; bancos legados #1/#3/#5 preservados sem mesclar.
- **Aula (contrato LESSON):** Resumo + Questões + Fonte + Auditoria como entidades separadas; ids de questão estáveis e nunca reutilizados; edição granular por entidade; questão rejeitada nunca vira exercício; abrir um rascunho NÃO recalcula nem grava e NÃO reaudita (decisão humana; reauditar só como ação explícita futura, HG-02).
- **Codex:** zero chamada em testes, fixtures e validação de UI; geração real só pelo runner do Prompt Lab (`scripts/prompt-lab/run-generation.mjs`, ≤ 3 rodadas, só em cópia sob `SmartLearn-PromptLab`) ou por ação explícita do usuário.
- **Processo:** tasklist visual é capacidade canônica (GOV-2 opção A: skill `tlc-spec-driven-strict`; `plan.md` é só o ledger macro; exatamente uma tarefa `[>]`); nada de push/merge/deploy/release sem ordem explícita por ação.
- **DEV/Desktop:** launcher canônico `npm run dev:desktop` (fixa banco/fontes, verifica o executável); sessão DEV persistente só por `SMARTLEARN_DEV_PERSISTENT_SESSION` do launcher (recusada em produção); autenticação de produção inalterada (INV-08).

## NOT_PROVEN / abertos
`VALID_8` e `REALMODEL_CONTENT_QUALITY_PROVEN` (decisão/confirmação humana, HG-06; 1 unidade, avaliação por IA) · `VISUAL_VALIDATION` da janela nativa (aguarda humano) · suíte "materiais 45/45" sem definição reproduzível (T-F6-01) · fumaça Windows nativa de IMPORT-1/VERDICT-1 · qualidade médica semântica entre idiomas além dos sensores determinísticos · defeito D1 de extração por colunas (T-F5-08).
Flakes pré-existentes sob carga: `content-quality-flow.spec.js`, `hoje-block-retest.spec.js` (ver EXECUTION.md).

## Decisões humanas pendentes (HUMAN_GATES; detalhe em `hardening-roadmap-v1/spec.md` §8)
HG-01 volume de questões · HG-02 reauditar como ação explícita · HG-03 destino dos bancos legados · HG-04 retirar o release instalado de 10/09 · HG-05 estratégia de integração/destino de `content-quality` · HG-06 avaliação humana VALID-4/5/8 · HG-07 orçamento de chamadas do Codex no Prompt Lab · HG-08 política de PDFs de teste · HG-09 recuperação de atraso/onboarding · HG-10 push/merge/deploy/release.

## Não rastreados (T-F0-04)
`src-tauri/resources/`: resolvido — os 4 `.gitkeep` voltam a ser rastreados (o conteúdo gerado por `package:standalone` segue ignorado; teste `test/resources-placeholders.test.js`). `.impeccable/` (`config.json` + `hook.cache.json`, 16 KB) e `.specs/benchmarks/reasoning-effort/` (3 arquivos, 28 KB): decisão PROPOSTA, não aplicada — ignorar `hook.cache.json`, decidir se `config.json` é rastreado; rastrear `benchmarks/` como documentação do Codex se o humano confirmar a origem.

## Recuperação
`git worktree list` → entrar na worktree de `claude/smartlearn-v1-complete` → `git branch --show-current`, `git rev-parse HEAD`, `git status --short` → `.specs/EXECUTION.md` → `.specs/HANDOFF.md` (se existir; Git vence) → ledger/tarefa ativa. Nunca inspecionar/editar `main`. Sensor de preservação deste arquivo: `node scripts/check-state-ids.mjs <rev-anterior>`.
