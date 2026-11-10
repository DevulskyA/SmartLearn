# Handoff para o agente de design — 2026-11-09

Branch `codex/restore-pdf-parity`, HEAD `28a990e` (nada enviado ao remoto: sem push, merge, release). Worktree auxiliar `C:\Projetos\SmartLearn-combinada` (`candidate/combinada-2026-11-08`) já foi integrada aqui por `4e23463`.

## O que mudou (ler estes commits)
- `28a990e` Materiais: intervalo de páginas ("De ... até ...") primeiro, busca por título depois. Arquivos: `index.html` (bloco `.sources-topic`), `src/materials-ui.js` (handler `#sources-range-form`, usa `SourceProposalsUI.approveScope(id, { range })`), `src/styles.css` (final do arquivo: `.sources-range-*`, `.sources-choice-label`, `.sources-or`), `src/i18n/locales/pt-BR/screens.js` (`screens.materials.range.*`, `screens.materials.or`, `screens.materials.topic.byTitle`), `e2e/source-proposals.spec.js` (teste "page range"). Também sincroniza o texto de reserva do idioma em `index.html` com o catálogo.
- `17d0be2` Launcher DEV autoriza as migrações 39, 40 e 41 no banco DEV persistente (autorizado pelo dono em 2026-11-09). Snapshot `pre-migrate-v40` guardado em `C:\Users\Ariel\SmartLearn-DevData\snapshots\`.
- `6a7532d`, `1f9678a` Launcher abre por identidade de conteúdo, não por nome de branch; `scripts/work-branches.json` aceita `codex/restore-pdf-parity`.
- `fd5c6b2`, `ccfa81e` Revisão de design (Revisão de exercícios: cartão, progresso, pergunta/resposta, botões; idioma do conteúdo gerado; escala de títulos em Estatísticas; rodapé da identidade da build).
- `f6e3514`/`f7d36ab` V-01 Estatísticas por disciplina em 390/360 px.

## Estado do app
- App DEV aberto com os dados reais do dono (pid 10716 no momento da escrita), exe `src-tauri\target\release\smartlearn.exe`. O exe NÃO contém o commit `28a990e` (foi compilado antes); para ver a mudança de Materiais, rode `scripts\launch-desktop-dev.ps1` sem `-NoBuild`.
- Banco real: `C:\Users\Ariel\SmartLearn-DevData\smartlearn-dev.db`. Não abrir nem copiar sem autorização do dono.

## Provas
- Passaram: `server/test/migration*.test.js`, `source-openings.test.js`; `test/i18n-*.test.js`; E2E `source-proposals`, `materials-a11y`, `materials-single-eyebrow` (10 + teste novo = 7 em source-proposals).
- NÃO verificado: aparência renderizada do bloco novo de Materiais (espaçamento, 390 px, tema escuro).

## Pendências de design deixadas para você
- Hook impeccable: `flat-type-hierarchy` em `index.html` (atribuição desconhecida; o dono mandou não mexer na tipografia, o design é seu).
- Telas "Sobre o SmartLearn" e "Aceitar a aula" sem revisão visual; "40" repetido em Hoje; bolinha de tema sem rótulo.
- Revisão "Acertei/Errei": problema de produto + avaliação com IA paga, decisão do dono.

## Limites do dono (valem para você)
Preservar dados humanos, credenciais e histórico Git. Sem operação no banco real, atalhos protegidos, push, merge, release ou chamada paga sem autorização específica. Superfície Estatísticas é protegida (ADR-0001).
Decisões de produção pendentes: `.specs/proposals/FOLHA-DE-DECISOES-PRODUCAO-2026-11-08.md`.
