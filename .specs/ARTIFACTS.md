# ARTIFACTS.md — registro de artefatos EXTERNOS ao repositório

Este arquivo é o ÚNICO registro rastreado de tudo que o projeto precisa e que NÃO está no Git (dados, livros, backups, instruções
do usuário, ferramentas). Ele guarda metadados e localização, nunca o conteúdo: material privado, protegido por direitos autorais
ou volumoso (livros/PDF médicos, bancos de dados) NÃO entra no Git para resolver persistência de contexto.

- Várias localizações na mesma entrada: separe por " ; ".
- Regra: todo caminho absoluto fora do repositório citado em um documento canônico precisa de uma entrada aqui
  (`npm run context:check` falha se faltar).
- Disponibilidade medida em 2026-10-05 (`EXISTS` = encontrado nessa data; confirme antes de depender).
- Se um artefato sumir, registre `MISSING_EXTERNAL_ARTIFACT` aqui e diga qual trabalho depende dele. Nunca recrie material de
  fonte a partir de memória.

Campos por entrada: ID · NAME · PURPOSE · CANONICAL_LOCATION · SHA256 · REQUIRED_FOR · AVAILABILITY · SENSITIVITY.

## A-01 — Livro médico real "Costanzo" (PDF, 496 páginas)
- NAME: Costanzo (fisiologia), PDF usado como fonte real
- PURPOSE: dado representativo de PDF médico real para provas somente-leitura de extração e geração (VALID-4/5/8)
- CANONICAL_LOCATION: C:/Users/Ariel/SmartLearn-DevData/sources/7c2e0168880f65b135f4f63daf07831e.pdf
- SHA256: b0a8da11631acaa2939ae8278d521d80f16d38e89e0c78b2a18531d5a01ac81c
- REQUIRED_FOR: T-F5-08 (prova real págs. 267–273), T-F2-04 (verificação no rascunho real), VALID-4/5/8, T-F4-01 (UAT visual: abrir o rascunho "Glomerular Filtration"), HG-06/HG-08
- AVAILABILITY: EXISTS (2026-10-05). O banco DEV referencia a fonte por este arquivo; NÃO pedir outro PDF ao usuário
- SENSITIVITY: DO_NOT_COMMIT (direitos autorais). Usar só por leitura ou por CÓPIA em diretório temporário

## A-02 — Banco DEV humano (dados reais do aluno)
- NAME: smartlearn-dev.db (+ `-wal`, `-shm`) e `dev.lock`, `last-launch.json`
- PURPOSE: datastore persistente único do Desktop DEV; contém histórico real e o rascunho do Costanzo
- CANONICAL_LOCATION: C:/Users/Ariel/SmartLearn-DevData/smartlearn-dev.db
- SHA256: n/a (banco vivo, muda a cada uso)
- REQUIRED_FOR: uso real; fumaça nativa (T-F1-09, em CÓPIA); INV-06
- AVAILABILITY: EXISTS (2026-10-05, esquema ≥ v30; as migrações 031 e 032 só entram quando o app for aberto)
- SENSITIVITY: HUMAN_DATA. NUNCA tocar por teste automatizado. Qualquer prova mutável usa cópia (db + wal + shm) fora do repositório

## A-03 — Snapshots verificados do banco DEV
- PURPOSE: ponto de restauração diário e pré-migração (T-F1-02) e ensaio de restauração (T-F1-03)
- CANONICAL_LOCATION: C:/Users/Ariel/SmartLearn-DevData/snapshots
- SHA256: por snapshot, no manifesto do próprio snapshot (`scripts/dev-snapshot.mjs`, verificação por `integrity_check`)
- REQUIRED_FOR: recuperação do banco DEV; T-F1-03/T-F1-05
- AVAILABILITY: EXISTS (2026-10-05)
- SENSITIVITY: HUMAN_DATA; nunca apagar por rotina automática (INV-12)

## A-04 — Backups do banco (P0)
- PURPOSE: cópias anteriores a operações de risco (p0-*, work-merge-*)
- CANONICAL_LOCATION: C:/Projetos/SmartLearn-db-backups
- SHA256: por pasta (não registrado aqui); verificar com o procedimento de T-F0-01 em `validation.md`
- REQUIRED_FOR: INV-07 (backup antes de migração destrutiva), recuperação
- AVAILABILITY: EXISTS (2026-10-05): p0-20261004-003912, p0-devdata-20261004-005048, work-merge-005231
- SENSITIVITY: HUMAN_DATA. Não abrir os originais; usar cópia. Nunca apagar (INV-12)

## A-05 — Protótipo autoritativo de Estatísticas
- PURPOSE: autoridade visual da superfície protegida Estatísticas (ADR-0001)
- CANONICAL_LOCATION: C:/Projetos/SmartLearn-Stats-Prototype
- SHA256: n/a
- REQUIRED_FOR: qualquer mudança em Estatísticas (HUMAN_GATE para redesenho; ver `.specs/adr/ADR-0001-protected-surfaces-design-non-regression.md`)
- AVAILABILITY: EXISTS (2026-10-05)
- SENSITIVITY: nenhuma

## A-06 — Bundle Git de segurança de `content-quality`
- PURPOSE: backup do ramo `claude/content-quality` em 2026-09-30
- CANONICAL_LOCATION: C:/Projetos/SmartLearn-backups
- SHA256: e2eb4d90e95cb9edd8a64ad8d737518b7f62185a74aa47eb1c54009e67948eb4 (smartlearn-cq-v1-20260930.bundle)
- REQUIRED_FOR: recuperação do histórico de `content-quality` (HG-05)
- AVAILABILITY: EXISTS (2026-10-05)
- SENSITIVITY: nenhuma

## A-07 — Release instalado antigo e banco legado do AppData
- PURPOSE: destino/descarte decididos por HG-03 (bancos legados) e HG-04 (retirar o release de 10/09)
- CANONICAL_LOCATION: C:/Users/Ariel/AppData/Local/SmartLearn ; C:/Users/Ariel/AppData/Roaming/com.devulsky.smartlearn/smartlearn.db
- SHA256: n/a
- REQUIRED_FOR: T-F1-05 (`[H]`, HG-03), T-F8-04 (`[H]`, HG-04)
- AVAILABILITY: EXISTS (2026-10-05); o banco legado fica em C:/Users/Ariel/AppData/Roaming/com.devulsky.smartlearn/smartlearn.db (EXISTS)
- SENSITIVITY: HUMAN_DATA (banco legado). Não mesclar; arquivar read-only conforme a recomendação de HG-03

## A-08 — AgentCoord (protocolo de dois agentes, histórico)
- PURPOSE: coordenação antiga CLI/GUI (GUI.md, CLI.md) e cópia do painel de tarefas
- CANONICAL_LOCATION: C:/Users/Ariel/SmartLearn-AgentCoord
- SHA256: n/a
- REQUIRED_FOR: nada de autoridade. DERIVADO: o painel é regenerado por `node scripts/agent-tasklist.mjs`; GUI.md/CLI.md são histórico de 2026-09-19/20
- AVAILABILITY: EXISTS (2026-10-05)
- SENSITIVITY: nenhuma

## A-09 — Outras worktrees e checkouts
- PURPOSE: ramos paralelos: `main` (somente leitura para o agente), `claude/content-quality`, `tmp/integrate-cq-into-v1` (merge temporário "não enviar") e uma worktree do Codex
- CANONICAL_LOCATION: C:/Projetos/SmartLearn ; C:/Users/Ariel/.codex/worktrees/0603/SmartLearn
- SHA256: n/a (a verdade é o Git)
- REQUIRED_FOR: T-F0-05 e T-F9-01 (HG-05, destino das branches); nada de estado do programa
- AVAILABILITY: EXISTS (2026-10-05): main f645a07, content-quality 01c67f7, integrate-tmp 6f2e816, C:/Users/Ariel/.codex/worktrees/0603/SmartLearn (detached f645a07)
- SENSITIVITY: nenhuma

## A-10 — Instruções globais do usuário (fora do repositório)
- PURPOSE: preferências de trabalho do usuário herdadas por TODO projeto (método de ledger de requisitos, anti-esquecimento, `/goal`/`/loop`, idioma, política de interrupção)
- CANONICAL_LOCATION: C:/Users/Ariel/.claude/CLAUDE.md (inclui `@AGENTS.md`) e C:/Users/Ariel/.claude/AGENTS.md
- SHA256: 336cc4fbf19beaada7ccf9986414fa91851a8d7a07dfb3ccbe800a69eed0ab49 (CLAUDE.md); c88826e9184bb8ae67a0843aefc6da82f4300c5aaed3a6d698f2ddaff5b094d3 (AGENTS.md)
- REQUIRED_FOR: método de execução (não o estado do projeto); sem elas o repositório continua retomável, mas o agente precisa receber essas preferências de novo
- AVAILABILITY: EXISTS (2026-10-05)
- SENSITIVITY: USER_PRIVATE (não copiar para o repositório)

## A-11 — Skills de metodologia
- PURPOSE: `tlc-spec-driven-strict` (ledger por feature, checkpoint, recuperação), `code-preservation-guard`, `codex-portuguese-i18n-repair`, `tcl-governance-pack`
- CANONICAL_LOCATION: C:/Users/Ariel/.claude/skills
- SHA256: n/a (diretórios)
- REQUIRED_FOR: método; as regras que o projeto depende de estar valendo estão em `CLAUDE.md` e em `.specs/governance/`
- AVAILABILITY: EXISTS (2026-10-05)
- SENSITIVITY: nenhuma

## A-12 — Auto-memória do agente
- PURPOSE: conveniência (preferências e fatos recorrentes); NUNCA autoridade
- CANONICAL_LOCATION: C:/Users/Ariel/.claude/projects/C--Projetos-SmartLearn/memory
- SHA256: n/a
- REQUIRED_FOR: nada: tudo que importa está no Git
- AVAILABILITY: EXISTS (2026-10-05)
- SENSITIVITY: USER_PRIVATE

## A-13 — Mensagens do usuário que originaram decisões (SOMENTE CHAT)
- PURPOSE: textos originais das decisões de produto de 2026-10-04 (geração segura e idiomas) e do programa de sprints
- CANONICAL_LOCATION: nenhuma — texto original NÃO preservado
- SHA256: n/a
- REQUIRED_FOR: nada além do que já foi transcrito: a forma durável é `spec.md` (R-12, R-13, INV-13, INV-14, HG-11..13, §11, §12), `PROGRAM.md` e `tasks.md` (F10)
- AVAILABILITY: MISSING_EXTERNAL_ARTIFACT (o texto literal; o conteúdo normativo está rastreado)
- SENSITIVITY: nenhuma. Em dúvida sobre a intenção, a autoridade é o texto rastreado; não reconstruir o original de memória

## A-14 — Referências remotas citadas em `EXECUTION.md` (arquivado)
- PURPOSE: PR #6 e uma execução de CI no GitHub (DevulskyA/SmartLearn); nada foi enviado/mesclado desde então
- CANONICAL_LOCATION: https://github.com/DevulskyA/SmartLearn/pull/6
- SHA256: n/a
- REQUIRED_FOR: HG-05/HG-10 (integração e entrega)
- AVAILABILITY: NOT_CHECKED_OFFLINE
- SENSITIVITY: nenhuma
