# LEIA PRIMEIRO (agente de design)

Repositório: https://github.com/DevulskyA/SmartLearn
Branch para ler: `handoff/design-2026-11-09` (este arquivo é `.specs/HANDOFF-DESIGN-2026-11-09.md`). Commit: ver `git log -1` da branch.
Esta branch é cópia da linha de trabalho local `codex/restore-pdf-parity`; não é a `main` e nada foi mesclado nem lançado.

## Como a aplicação funciona, de ponta a ponta

Fontes: `CODEMAP.md`, `.specs/governance/SMARTLEARN_PRODUCT_CONSTITUTION_V1.md` §6–§14, `shared/review-schedule.js`.

**Arquitetura.** Cliente (`src/`, HTML/CSS/JS dentro de uma janela Tauri 2) fala HTTP `/v1` com um servidor Node local (`server/src/`) que guarda tudo em SQLite (`server/migrations/*.sql`). Funções puras compartilhadas ficam em `shared/`. O servidor é a autoridade dos dados; todo `/v1` exige sessão real. O Desktop abre o próprio servidor em loopback e serve o front empacotado.

**Menu lateral** (`index.html`, `data-screen`): Hoje, Materiais, Plano, Estatísticas, Configurações, Conta.

**Fluxo do aluno (a ideia do produto é: "ENVIEI O MATERIAL. AGORA POSSO ESTUDAR."):**
1. **Materiais → Selecionar PDF.** O servidor guarda uma cópia, extrai texto por página (`server/src/pdf/`) e propõe trechos/unidades a partir do índice do documento. Nada vira aula sozinho.
2. **Escolher o que estudar.** Três caminhos: (a) **por páginas** (De/até, novo em 28a990e), (b) **por título da seção** (busca) e (c) **Índice do documento** (trechos propostos). Páginas editoriais (capa, prefácio) ficam separadas e não geram conteúdo. Só o texto do escopo aprovado vai à IA (`approveScope` em `server/src/services/content-proposals.js`).
3. **Gerar rascunho.** Um job chama o provedor de IA (padrão CODEX, `server/src/ai/`) com um prompt fixo e valida o resultado contra um esquema; sensores determinísticos auditam fidelidade à fonte (`draft-audit.js`, `risk-checks.js`). IA produz PROPOSTA, nunca verdade publicada.
4. **Revisão humana do rascunho.** Editor da aula (`lesson-editor-ui.js`): resumo editável (Tiptap), questões com resposta/explicação/pista e proveniência (página citada). O aluno corrige, rejeita ou regenera.
5. **Aceitar a aula** (`accept-draft.js`). Uma decisão cria muitos efeitos: unidade de aprendizagem vinculada à disciplina, conteúdo, exercícios e a agenda fixa de 16 revisões (`REVIEW_DAY_OFFSETS` = 1, 7, 15, 30, 60, 90 … 390 dias).
6. **Estudar agora.** Resumo Mestre → recuperação ativa → questão → dica opcional → revelar resposta → julgamento do aluno → feedback → próxima → resultado e erros. Cada resposta vira evidência imutável (`/v1/evidence`, `attempts`). Sem evidência não é 0%.
7. **Hoje** mostra o que exige atenção (revisões vencidas, prioridades); **Plano** mostra a agenda; **Estatísticas** (superfície protegida, ADR-0001) mostram estado e evolução só a partir de histórico observável, sem inventar "domínio".
8. **Prova** (`exams`) e **Revisão** reaproveitam o mesmo ledger de evidências.

**Dados e canais.** Homologação (porta 3000/5183 em modo código vivo, banco `SmartLearn-Homologacao-Data`), DEV persistente (`SmartLearn-DevData`, dados humanos do dono) e testes (bancos descartáveis). Nunca misturar.

**Interface.** Só pt-BR (`src/i18n/locales/pt-BR/`); o único seletor de idioma é o do conteúdo gerado, não o da interface. Textos novos entram no catálogo e o `index.html` repete o texto de reserva (teste `i18n-html` confere).

---

# Estado e mudanças

Branch `codex/restore-pdf-parity`, com a mudança de código até `28a990e`. Só a branch `handoff/design-2026-11-09` foi enviada ao GitHub (autorizado pelo dono em 2026-11-09); nenhum merge, release ou push em outra branch. Worktree auxiliar `C:\Projetos\SmartLearn-combinada` (`candidate/combinada-2026-11-08`) já foi integrada aqui por `4e23463`.

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
