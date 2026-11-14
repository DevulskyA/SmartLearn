# TRACK: PB-CONSOLIDATION — Do quadro Planban a um plano único de conclusão do V1

> Criado em 2026-11-14 a partir de (a) 70 cartões abertos no Planban (revisão 729) e (b) a reconciliação Git somente de leitura de 2026-11-14.
> Este arquivo é um LEDGER MACRO escrito à mão (não é projeção gerada; não alimenta `plan-sync` nem `context:check`).
> Fonte de cada fato: PB = decisão/pedido do dono (cartão por id) · Git/testes = estado · `.specs/features/*/tasks.md` = execução de tarefa.
> Este track NÃO duplica texto dos cartões: aponta para eles pelo id (`planban:smartlearn/<id>`). Estado do cartão muda só no PB.
> Quando uma tarefa daqui virar trabalho de código, ela ganha ID formal em `tasks.md` da feature dona (regra 3 de `workflow.md`).
> REGRA DE CODIFICAÇÃO (ordem do dono, 2026-11-14): todo código escrito sob este track segue `conductor/code_styleguides/smartlearn.md`
> (menor mudança completa; código de IA é rascunho; textos de interface em `src/i18n/`; celular + Windows; sem TypeScript nem mudança de contrato sem autorização; testes proporcionais ao risco, nunca afrouxados). Em dúvida, vale a ordem de autoridade daquele arquivo.

```
Track:    pb-consolidation-20261114            Status: PLANEJADO (nenhuma tarefa ativa)
Base Git: design/redesign-geral-20261110 @ 76747870 (0 atrás de main; 174 à frente; 32 sem push)
Legenda:  [ ] pendente  [>] ativa  [✓] concluída  [!] bloqueada por dependência  [H] decisão humana  [-] adiada
Proibido sem ordem: push, merge, rebase, deploy, migração, chamada paga a IA, apagar branch/worktree, tocar dado humano.
Protegido: Estatísticas (ADR-0001) — qualquer mudança exige decisão humana.
```

## Decisões do dono (2026-11-14) que moldam este track

- Público: lançamento inicial só Medicina; concursos e outros cursos (ex.: fórmulas de Física) ficam para depois, fora do V1.
- Android: ENTRA no V1 com o mínimo (consultar resumos, saber o que estudar, fazer revisões, sem computador). Escopo enxuto, a avaliar pelo uso real (tarefa PBC-1.7).
- Busca em planos de 200+ aulas: já existe no HEAD (`src/app.js` ~1979–2006, busca + página de 20). Lacuna única verificada: ignora maiúsculas mas NÃO acentos (`toLocaleLowerCase` sem normalização); `design/plan-dynamic` (`src/plan-list-model.js`) traz busca sem acento e vários termos. Não planejar funcionalidade nova (PBC-1.4 vira só essa fatia, se confirmada).
- PDFs: política do dono = o aluno mantém seus arquivos, o SmartLearn só lê, não reivindica propriedade, e não os guarda no servidor. DECISÃO ABERTA: o código grava (`source-storage.js`) e serve (`GET /sources/:id/file`) o PDF.
- Filosofia canônica: `.specs/governance/SMARTLEARN_FILOSOFIA_PARA_IA.md` (`PRODUCT_PHILOSOPHY_PATH` em `.specs/STATE.md`).
- Branches e worktrees: preservar tudo; nenhuma consolidação, arquivamento ou descarte automático; qualquer integração futura é proposta separada.

## Andamento

- [✓] **PBC-0.1 / E0 Preservar**: branch local `safety/preserve-working-tree-20261114` @ `6c7b8308` (725 arquivos: 298 M, 407 A, 19 R, 1 D; working tree e HEAD intactos; sem push). Ficaram fora, no disco: `.impeccable/`, `.specs/benchmarks/`, `.playwright-mcp/`, `.codex-temp/`.
- [✓] **PBC-1.2 Fila de evidência** (2026-11-14): `e2e/study-evidence-failure.spec.js` 19/19 passaram em 2,5 min no checkout principal (LOSS-1/2/3/4, EVIDENCE-RECOVERY, REJECTED-1/2), rodado pelo vigia `scripts/watch-run.mjs`. Escopo: inclui o trabalho não commitado da outra frente; NÃO prova o HEAD isolado.

## Achados da reconciliação Git que governam a ordem

- Das 60 commits "fora" por hash, 36 são inéditos por conteúdo (patch-id). O lote de correções de 08/11 (`44251636`, `43802fa0`) e `1ecf734b` JÁ estão na destino (fila `study-evidence-queue.js`, 409 de `operationKey` em `source-openings.js`, `pendingReviewReveals`).
- Inéditos reais: Aceitar a aula (3, `candidate/combinada`), plano pesquisável + Estatísticas por disciplina (8, `design/plan-dynamic`), refino CSS (1), janela do desktop (3 versões), Estatísticas AAA (2), atualizador de componentes (2), docs 25–27/10, interface unificada 30/10 (provável substituída).
- Trabalho só em disco (sem commit): checkout principal 383 itens (outra frente), `smartlearn-integration` 25, `next-sprints` 13, `smartlearn-open-20261105` 5, `combinada` 4, `repair-20261108` 3, Codex `e3c7` 1, `stash@{0}`.
- Nada disso pode ser apagado; decisão do dono de 2026-11-14: preservar integralmente branches e trabalhos locais.

## Fase 0 — Preservar (pré-condição de qualquer integração)

- [ ] **PBC-0.1 Salvar o que só existe em disco** em branch de segurança por worktree, arquivos nomeados, sem tocar o resto (inclui o checkout principal e o stash). Prova: `git status` limpo por worktree + SHA anotado aqui. Risco: perda de trabalho da outra frente; não usar `git add .`.
- [H] **PBC-0.2 Destino final das branches** — um único `main`? Exige autorizar merge e push. Cartões: `branches-consolidar-todos-os-branches-em-um-s-a-integra-o`, `branch-nico-merge-nico-em-main-e-limpeza-de-branches-e-worktrees`, `publicar-na-main-o-trabalho-verificado-da-integra-o` (grupo), `decidir-destino-dos-prs-experimentais-abertos-7-e-8`.
- [H] **PBC-0.3 Branches `product-md-on-*`**: autorizar remoção só depois de PBC-0.1 (cartão `posterior-product-md-levar-2db2853-medicina-desktop-first-s-outr`).

## Fase 1 — Integrar o inédito necessário ao V1 (adaptar, nunca merge cego)

- [✓] **PBC-1.1 Aceitar a aula** (2026-11-14, conferido commit a commit em vez de reaplicar às cegas): `ed3a4284` (selecionar a 1ª disciplina) NÃO foi reaplicado, porque o código atual escolheu o contrário de propósito ("Escolher disciplina": a aula na disciplina errada estragaria estatísticas e plano); `f9f4b6d9` (botões em linha cheia no celular) estava FALTANDO e foi aplicado em `src/styles.css`, com e2e `PBC-1.1` que falhou sem a regra (150 px, esperado > 298 px) e passou com ela; `4131ed54` já estava de fato no código (fallbacks do `index.html` iguais ao catálogo, âncora M2 de `mutation-check.mjs` e guarda de isolamento com `homologation-proof`; `i18n-html` e `test-db-isolation` 5/5). Texto original do cartão: reaplicar `ed3a4284`, `f9f4b6d9`, `4131ed54` sobre o `index.html` atual. Cartões: `design-cart-o-aceitar-a-aula-grade-desbalanceada-bot-es-empilhad`, `fluxo-aceitar-a-aula-bot-es-na-ordem-ver-o-que-ser-criado-aceita`, `materiais-cadastro-de-disciplina-misturado-ao-fluxo-de-aceitar-a`, `design-sobre-o-smartlearn-com-espa-amento-errado-e-sem-harmonia-` (corrigido em `fef4276` na branch `combinada`, conferir se já está na destino). Conflitos: `index.html`, 3 specs, `test-db-isolation.test.js`.
- [✓] **PBC-1.2 Fechar dúvida da fila de evidência** (19/19 em 2026-11-14, ver Andamento): rodar o spec `study-evidence-failure` na destino (LOSS-1/3/4). Barato, resolve o único ponto incerto do lote 08/11. Cartão: `integra-o-branch-combinada-da-evid-ncia-de-estudo`.
- [H] **PBC-1.3 Janela do desktop**: escolher 1 das 3 versões (`03ca6b87`, `08b9d39f`, `c65f53ef`); testar no nativo. Conflitos `lib.rs`, `window_state.rs`. Cartão: `humano-uat-tauri-windows-e-android-decis-es-de-infra-do-pr-1-pod`, `n1-rodar-cargo-test-no-pr-ximo-marco-e-decidir-escopo-android`.
- [H] **PBC-1.4 Plano pesquisável (200+ aulas) é requisito do V1?** Se sim, reaplicar `design/plan-dynamic` em fatias (plano → Estatísticas por disciplina → estilo). Conflitos `index.html`, `app.js`, `styles.css`. Toca Estatísticas: fatia 2 depende de PBC-3.1.
- [H] **PBC-1.5 Interface unificada de 30/10**: liberar, parcial ou adiar/descartar (provável substituída). Cartões: `branch-nico-interface-unificada-e-theme-liberar-ou-adiar-aguarda`, `decis-o-design-unified-experience-20261030-navega-o-menu-mais-e-`, `interface-unificada-e-temas` (grupo).
- [✓] **PBC-1.6 i18n e temas** (2026-11-14, só leitura e prova, sem mudar código): `src/i18n` (96 arquivos) e `src/theme.js` já estão no HEAD; o working tree só os modifica (16 arquivos de locale + `theme.js`), nada ficou só em disco. Contrato dos catálogos: paridade total, 1888 chaves em pt-BR, en e es, sem falta nem sobra. Comportamento: `ui-language-persistence`, `i18n-pseudo-locale` e `theme` 10/10 em 1,6 min (idioma persiste local e na conta sem alterar o idioma de geração; todo texto visível vem do catálogo; tema explícito persiste, "Sistema" segue o SO, alternância rápida volta ao tema escolhido). O bug do cartão ("trocar o idioma não traduz") não reproduz. Texto original do cartão: isolar `src/i18n` e `src/theme.js` preservados e comparar contratos. Cartões: `preservar-a-internacionaliza-o-e-recuperar-o-registro-completo-d`, `bug-trocar-o-idioma-n-o-traduz-a-interface-continua-tudo-em-port` (catálogos en/es), `.specs/features/i18n-clean-code/`.

## Fase 2 — Materiais, resumo, geração e banco de perguntas

- [ ] **PBC-2.1 Materiais — fluxo** (2026-11-14 PARTE FEITA: intervalo por página = P1 RG-2/RG-6; "Explorar conteúdos" foi removido por ordem do autor (P1 IDX-1); abrir material clicando no NOME já existia e agora tem e2e `PBC-2.1` 1/1 (seleção de texto não abre, clique abre). Falta, e é decisão de desenho: biblioteca em 3 páginas, estado por documento, "Mostrar mais 20"): intervalo por página do livro (`materiais-intervalo-por-n-mero-de-p-gina-do-livro-com-pdf-como-a`), abrir material (`materiais-abrir-material-sem-ir-at-o-bot-o-do-canto`), refazer Explorar conteúdos (`materiais-refazer-explorar-os-conte-dos-do-documento-l-gica-conf`; NÃO tocar "Explorar conteúdos" sem ordem), Explorar por faixa (`materiais-explorar-conte-dos-selecionar-por-faixa-de-p-ginas-e-u`), biblioteca em 3 páginas (`design-fluxo-de-materiais-em-3-p-ginas-biblioteca-documento-edit`), estado por documento (`design-biblioteca-estado-por-documento-1-resumo-preparado-exige-`), "Mostrar mais 20" (`design-biblioteca-mostrar-mais-20-na-busca-de-t-tulos-limites-8-`).
- [ ] **PBC-2.2 Resumo** (2026-11-14 PARTE FEITA: descartar com dupla confirmação já existia no código e agora tem e2e `PBC-2.2` em `e2e/source-proposals.spec.js` 1/1: cancelar em qualquer pergunta mantém o rascunho, só o segundo "sim" remove; histórico de versões = P1 VERSOES-1/BOTAO-1; falta traduzir (custo de IA, dono) e o editor no estudo real [H]): descartar com dupla confirmação (`resumo-descartar-rascunho-com-dupla-confirma-o-not-found-no-prev`; `resumo-descartar-rascunho-com-dupla-confirma-o` é DUPLICADO → arquivar), histórico de versões (`design-hist-rico-de-vers-es-do-resumo-tabela-endpoint`), traduzir (`resumo-traduzir-o-resumo-para-outra-l-ngua-dentro-da-rea-do-resu`, custo de IA = dono), editor no estudo real (`humano-validar-o-editor-do-resumo-e-o-rascunho-glomerular-filtra`).
- [ ] **PBC-2.3 Extração e figuras** (2026-11-14 EVIDÊNCIA nova no Costanzo, rascunho real da cópia do autor: o texto extraído de FIGURAS sai com letras espaçadas e rótulos soltos, p. ex. "G lo m erular c a pillary · Net filtration · A Bowman′s space …"; o texto corrido sai limpo. Já mitigado só no efeito: a medida de fidelidade ignora legendas e rótulos de gráfico. A correção da origem (MinerU/Marker) segue [H], instalar é decisão do dono): PDF sem caracteres estranhos (`extra-o-texto-e-f-rmulas-de-pdf-sem-caracteres-estranhos`, [H] instalar MinerU/Marker), figuras do PDF (`figuras-extrair-figuras-do-pdf-medi-o-feita-no-costanzo-s-o-dese`).
- [ ] **PBC-2.4 Banco de perguntas e reaproveitamento** (2026-11-14 RECONCILIADO com o código e o `BACKLOG-FUTURO.md`; `private-bank` + `shared-reuse` 22/22): metadados da obra FEITOS (`447e4125`, migração 044; ISBN/edição/ano ranqueiam candidatos, `a97d105d`); banco privado consultado ANTES do modelo ao pedir perguntas (`05aeae4f`), o que cobre "gerar menos questões quando houver banco" e "guardar"; reaproveitamento entre contas do mesmo servidor FEITO (migrações 046/047, `shared_content`). ADIADO por decisão de backlog: catálogo compartilhado de obras e edições (itens 1-2), compartilhamento entre instalações (11), `resolveReviewNeed` sem consumidor até existir revisão que gere itens novos (8, decisão de produto). Os 4 cartões do Planban podem ser atualizados com isto. Texto original: ligar o que está entregue (`cat-logo-obras-edi-es-mapa-de-conte-dos-e-reutiliza-o-inteligent`, `banco-de-perguntas-gerar-perguntas-em-paralelo-ao-resumo-e-guard`, `reaproveitamento-entre-contas-resumos-quest-es-revisados`, `gera-o-menos-quest-es-geradas-quando-houver-banco-de-perguntas-h`). ATENÇÃO: esses cartões estão desatualizados (não citam `05aeae4f`, `85eb89b7`, `a97d105d`); `resolveReviewNeed` segue sem consumidor (backlog item 8, decisão de produto). Fonte: `.specs/features/catalog/BACKLOG-FUTURO.md`.
- [H] **PBC-2.5 Medir com Codex real** (o dono executa) e decidir IA real no preview: `decis-o-do-dono-ia-real-no-preview-e-banco-a-usar`, `estabiliza-o-decis-es-do-owner-codex-real-e-guardrail-de-branch-`, `testes-pendentes-o-que-j-foi-modificado-e-ainda-n-o-foi-provado`.

## Fase 3 — Estatísticas (superfície protegida, ADR-0001)

- [H] **PBC-3.1 Decidir os ajustes de Estatísticas**: `protegido-estat-sticas-log-exerc-cios-resolvidos-gr-fico-de-evol` (E-01, E-02, KPIs), `design-estat-sticas-v5-superf-cie-protegida-exige-port-o-humano`, `design-estat-sticas-evolu-o-geral-com-gr-fico-cortado-explicar-a`, `design-estat-sticas-resumo-do-topo-com-n-mero-m-dia-geral-despro`, `condicional-defeitos-b06-b07-b12-b13-a-16-e-o-flake-de-summary-v` (A-16), V-01 (`registrar-o-baseline-visual-das-telas-antes-da-recupera-o`, proposta em `.specs/proposals/V-01-stats-390.md`). Inclui destino de Estatísticas AAA (`290219ca`, `088d498a`; 15 conflitos).
- [ ] **PBC-3.2 Estatísticas orientadas a decisão / ajuda progressiva**: cartão `modo-detalhado-evid-ncias-para-estat-sticas-orientadas-a-decis-o`. Só hipótese; depende de PBC-3.1. Nenhum código antes da decisão do dono.

## Fase 4 — Design, temas e telas

- [ ] **PBC-4.1 V7.2 e temas**: `design-integrar-v7-2-editorial-vivo-css-paletas-dos-4-temas`, `design-capturas-finais-v7-2-4-temas-390-768-1440-desktop-baixo-e`, `design-configura-es-tema-com-informa-o-duplicada-e-combo-mais-la`, `hoje-contraste-do-bot-o-revisar-uma-por-vez-no-tema-escuro`, `f5-na-conta-mostra-hoje-por-um-instante-flicker` (dono confere), login (`design-login-corrigir-entrada-com-senha-e-bot-o-de-olho-mostrar-`).
- [H] **PBC-4.2 Tela Hoje**: `design-ux-tela-hoje-centrada-no-dia-o-que-estudar-amanh-e-o-que-`, `design-ux-tela-hoje-com-exerc-cios-dentro-do-cart-o-da-revis-o-t`, `design-de-produto-revis-o-com-acertei-errei-n-o-mede-aprendizado` (misto × só múltipla escolha) — decisão de produto.
- [ ] **PBC-4.3 Auditoria e direção visual**: `auditoria-das-telas-restantes-24-achados-ranqueados-2-p1-13-p2-9`, `elevar-a-qualidade-visual-e-a-responsividade-do-smartlearn` (grupo), `auditoria-de-telas-e-estat-sticas` (grupo), `design-verificar-em-webview2-tauri-e-leitor-de-tela-n-o-provado`, `humano-o-que-n-o-d-para-provar-sem-a-sua-m-quina-leitor-de-tela-`.

## Fase 5 — Estabilização, dados, sessão, segurança

- [ ] **PBC-5.1 Estabilização**: `estabiliza-o-triagem-das-regress-es-c-digo-sem-perda-reproduzir-`, `estabiliza-o-auditoria-de-regress-es-e-013-016-021-022-024-e-mat` ([H] dono confirma qual executável abriu), `pend-ncia-reproduzir-e-resolver-o-problema-da-ess-ncia`, `release-n-o-empacotar-antes-da-paridade-comprovada` (bloqueia empacotar).
- [H] **PBC-5.2 Dados e migrações** (nenhuma sem autorização explícita): `dados-preservar-e-migrar-o-banco-sem-perda-de-conte-do`, `decis-o-migra-o-035-no-banco-humano-e-na-lista-de-migra-es-autor` (premissa "banco humano" é errada: tudo é DEV), `decis-o-evento-voltou-fonte-migra-o-e-contrato-do-ledger`.
- [ ] **PBC-5.3 Sessão persistente** (2026-11-14 RECONCILIADO: login persistente em DEV FEITO e provado, `dev-persistent-session.test.js` 6/6 (reinício mantém o login, logout invalida, sem a flag vale a política de 30 dias, flag recusada em produção); a prévia MANTÉM a cópia entre reinícios (`scripts/design-preview.mjs`, `--fresh` guarda a anterior com data); senha mínima 8 caracteres e troca de senha FEITAS (`passwords`, `auth-routes`, `reset-password`, `auth-abuse` 45/45; rota `/auth/password`). FALTA só a TROCA DE E-MAIL: não existe rota nem tela (é recurso novo, decisão de produto para a V1): `homologa-o-login-persistente-senha-m-nima-8-troca-de-senha-e-e-m`): `sess-o-login-persistente-sem-logoff-a-cada-rein-cio`, `sess-o-preview-mant-m-a-c-pia-entre-rein-cios-login-persistente`, `homologa-o-login-persistente-senha-m-nima-8-troca-de-senha-e-e-m`.
- [H] **PBC-5.4 Segurança e conta**: `triar-relat-rio-de-seguran-a-r-pida-18-alertas` (dono marca 17 alertas), `auth-recupera-o-de-senha-por-e-mail-com-mfa-dupla-autentica-o` (provedor e fator 2), `posterior-lacunas-do-teste-funcional-renomear-cor-excluir-discip` (destino de "Apagar base local").

## Fase 6 — Higiene do quadro (por último)

- [ ] **PBC-6.1 Organização do PB**: `organiza-o-separar-no-quadro-o-que-homologa-o-do-legado-e-revisa` (nada excluído sem ordem); arquivar o duplicado de PBC-2.2; WIP está em 16 (limite 12); 7 cartões "quietos" há 5–8 dias; 12 aguardam o dono.
- [-] **PBC-6.2 Limpeza de branches e worktrees**: `branch-nico-merge-nico-em-main-e-limpeza-de-branches-e-worktrees`; só após PBC-0.1 e PBC-0.2.

## Ordem de execução proposta

PBC-0.1 → PBC-1.2 → PBC-1.1 → (PBC-1.3 e PBC-1.5 conforme decisão) → PBC-2.x em paralelo ao PBC-4.x (arquivos diferentes, exceto `index.html`/`app.js`: serializar) → PBC-3.x só com decisão → PBC-5.x → E2E global uma vez no marco final → PBC-0.2/6.x.

## Decisões humanas que destravam trabalho (resumo)

PBC-0.2 (main/merge/push), PBC-1.3 (janela), PBC-1.4 (plano pesquisável), PBC-1.5 (interface unificada), PBC-2.5 (Codex real), PBC-3.1 (Estatísticas), PBC-4.2 (revisão Acertei/Errei), PBC-5.2 (migrações), PBC-5.4 (segurança/MFA).
