# TRACK: P1 — Materiais + IA + Versões (jornada operacional do aluno)

Status: ACTIVE · Criado 2026-11-14 por ordem do autor · Quadro resumido; texto integral, provas e registro de erros em `DETALHES.md` (mesma pasta). Cada tarefa traz entre parênteses o id antigo `P1-…`, que é o usado em `DETALHES.md`.

> Jornada: importar PDF → escolher páginas → resumo (manual, colado ou IA) → auditar contra a fonte → corrigir só o errado → versões → questões → aceitar.
> Estado real = branch `design/redesign-geral-20261110` + working tree, NADA commitado (árvore mistura várias frentes). Sem push, merge, deploy ou chamada paga de IA.
> Quadro visual: `node scripts/tasklist.mjs conductor/tracks/p1-materiais-ia-versoes-20261114/plan.md --html conductor/tracks/p1-materiais-ia-versoes-20261114/quadro.html` (gerado; `test-results/` é apagado pelo Playwright)

### [✓] A · Regressões que o autor já bateu

- [✓] **IA Aviso de IA desligada (P1-BUG-IA)** — "IA desligada neste ambiente" quando o provedor é simulado
  PROOF: e2e/summary-versions-button.spec.js
- [✓] **COSTANZO Erro ao adicionar o livro (P1-BUG-COSTANZO)** — PDF repetido não duplica; seção grande oferece Parte 1/2/3
  PROOF: source-file 3/3, lesson-limits 8/8, clique com PDF real de 70 páginas na instância sintética
- [✓] **FANTASMA Versões fantasma (P1-BUG-VERSOES-FANTASMA)** — o painel aparecia sem versões; agora é o botão "Versões anteriores"
  PROOF: e2e/summary-versions-button.spec.js

### [ ] B · Limites e regras de bom senso

- [✓] **RG-1 Resumo exige páginas (P1-RG1)** — já garantido pelo banco (páginas NOT NULL)
- [ ] **RG-2 Teto de 30 páginas por aula (P1-RG2)** — acima disso, divide em Parte 1, Parte 2
  PROOF: servidor e aviso na tela, em testes dirigidos
  NOT_PROVEN: falta commit limpo
- [ ] **RG-6 Sem páginas repetidas (P1-RG6)** — só 1 página de fronteira entre aulas do mesmo livro
  PROOF: source-scope.test.js
  NOT_PROVEN: falta commit limpo
- [✓] **RG-3 Revisão só da aula (P1-RG3)** — nunca cobre o livro inteiro
- [✓] **RG-4 Estimativa antes de gerar (P1-RG4)** — páginas, caracteres e minutos de aula
- [ ] **RG-5 Regra geral (P1-RG5)** — situação sem sentido apontada pelo autor vira tarefa com teste que falha primeiro

### [ ] C · Disciplinas, dados e integridade

- [✓] **DISC-1 Tipo da fonte e disciplina vazia (P1-DISC1)** — apostila/livro/vídeo/outro e estado vazio explícito
  PROOF: source-kind 3/3, accept-draft, logical-restore 20/20, conferido no navegador
- [✓] **INTEG-1 Integridade do banco (P1-INTEG1)** — auditoria e reparo na cópia do autor (3 aulas sem resumo removidas)
  PROOF: scripts/db-integrity-audit.mjs e db-integrity-repair.mjs
- [✓] **SEED-1 Dados de teste coerentes (P1-SEED1)** — toda disciplina do seed tem resumo ou diz por que está vazia
  PROOF: seed-dev.test.js 4/4 (o teste novo falhou primeiro em Patologia Geral; correção: `emptyOnPurpose` no seed)
- [ ] **GIT-1 Pôr no Git o que só existe no working tree (P1-1)** — `draft-replacements.js` não rastreado

### [ ] D · Resumo: versões, auditoria e correção

- [ ] **VERSOES-1 Histórico de versões do resumo (P1-4)** — servidor, migração 048 e tela feitos
  PROOF: draft-summary-versions 4/4
  NOT_PROVEN: falta commit limpo
- [ ] **AUDITA-1 Conferir meu resumo contra a fonte (P1-5)** — servidor, rota e botão feitos
  PROOF: summary-audit-on-demand 4/4 (inclui a rota HTTP, sessão e recusa clara)
  NOT_PROVEN: veredito estruturado de omissão; uso com IA real (só com autorização do autor)
- [✓] **CORRIGE-1 Correção por trecho (P1-6)** — original, proposto e motivo; aceita ou dispensa item a item
  PROOF: testes com provedor simulado 7/7
- [ ] **REGERA-1 Regerar partindo do texto do aluno (P1-7)** — opcional
- [ ] **OBJETIVAS-1 Questões objetivas e mistura 50/50 (P1-8)** — decidido NÃO entrar neste track; feature própria com spec
- [ ] **FIDELIDADE-1 Palavras que mudam o sentido (P1-9)** — medida sem IA de negação, qualificador e número perdidos; o prompt NÃO se altera
  PROOF: fidelity-loss 5/5; calibrado no rascunho real do Costanzo (cópia do autor, só leitura): 18 achados falsos → 0, agora "não comparado" por idioma diferente
  NOT_PROVEN: precisão com fonte e resumo no mesmo idioma (só o caso inglês→português existe em dado real); e2e FIDELIDADE-1 passou (resposta real do servidor e ramo "não comparado", 2/2 com o ERROS-1); captura visual não feita

### [>] E · Interface de Materiais

- [✓] **IDX-1 Lista "Explorar os conteúdos" removida (P1-IDX1)** — 31 specs migrados
  PROOF: último lote passou, captura conferida, CSS morto removido (source-proposals passou)
  NOT_PROVEN: e2e/lesson-editor-responsive (migração 49 de outra frente) e realmodel-codex (IA real)
- [✓] **SUMARIO-1 Índice com âncoras no resumo (P1-SUMARIO1)** — botão por título dentro da página
- [✓] **BOTAO-1 Botão Versões anteriores no resumo (P1-VERSOES-UI)** — lista, comparar e restaurar na mesma tela
- [✓] **UX-1 Adicionar material separado de Buscar materiais (P1-UX1)** — um botão principal
  PROOF: draft-acceptance 10/10, captura na instância sintética
  NOT_PROVEN: o autor ver na prévia 5188 com a conta dele
- [✓] **ERROS-1 Mensagens de erro de Materiais (P1-2)** — "Sem conexão" no envio e aviso quando a lista de disciplinas falha
  PROOF: e2e/draft-acceptance.spec.js ERROS-1 passou (52 s, 1/1)
- [ ] **VISUAL-1 Checagem visual (P1-3)** — conta do autor, celular 390 px, tema claro e estados de erro
  PROOF: 2026-11-14, instância sintética 5190, 390 px, tema escuro e claro: Materiais sem rolagem horizontal, CSS aplicado, capturas conferidas (o botão de tema funciona; meu 1º clique por coordenada errou o alvo)
  NOT_PROVEN: conta do autor (5188) e estados de erro na tela

### [✓] F · Validação de dados

- [✓] **VAL-1 Limites de entrada (P1-VAL1)** — servidor e interface, mensagens claras ao aluno
  PROOF: input-bounds 3/3, 587 testes de servidor, HTML 3/3

### [ ] G · Leitura do PDF só das páginas escolhidas

- [ ] **LEITURA-1 Ler qualquer PDF sem o aluno ver nada técnico (2026-11-14)** — texto do pdf.js, conferência automática e OCR invisível (xberg, MIT) só nas páginas reprovadas
  PROOF: PDF só de imagem lido em 2 s com acentos certos; pdf-extraction e extraction-text-fidelity passam (server/src/pdf/ocr-fallback.js)
  NOT_PROVEN: foto isolada (imagem avulsa); livro real escaneado; Android/web (binário nativo só win32); licenças dos modelos baixados; mensagem de página ilegível

- [ ] **FIGURAS-1 Figuras do livro no resumo, escolhidas pelo agente (2026-11-14)** — decisão do autor: PDF sobe, é lido e apagado; ao gerar o resumo das páginas marcadas, as figuras dessas páginas são extraídas de graça (xberg) e o agente que escreve o resumo escolhe quais inserir e onde, conforme o que considera importante
  PROOF: —
  NOT_PROVEN: custo de armazenamento limitado (figura reduzida e comprimida, teto de figuras por resumo e de espaço por aluno, PDF nunca fica); extração das figuras por página; escolha por legenda (barato) ou vendo a imagem (mais tokens); só as figuras inseridas no resumo ficam guardadas (na conta do aluno); todas as outras, e o PDF, são excluídas ao fim da geração; remover figura do resumo apaga o arquivo dela; apagar o PDF após a leitura sem quebrar recorte (pdf-crop-dialog), link do original e visual-assets

## Faltam só do autor

- Ver Materiais na prévia 5188 com a conta dele (UX-1).
- Decidir o commit: a árvore mistura várias frentes e commitar só os meus arquivos deixaria o HEAD inconsistente.
- Autorizar chamadas reais de IA para medir a auditoria do resumo (AUDITA-1, FIDELIDADE-1).
- Política de armazenamento de PDF (hoje o servidor grava e serve).
- Revisão médica dos conteúdos gerados.

## Bloqueios fora deste track

- `AUDIT_RULES_VERSION`: outra frente alterou `draft-audit.js` sem subir a versão.
- Migração 49 de outra frente impede e2e/lesson-editor-responsive.

## Última prova integrada

- 2026-11-14: `draft-acceptance`, `summary-versions-button`, `source-proposals` e `lesson-editor` juntos, 44/44 em 4,3 min (pelo vigia), depois de todas as edições de hoje em `lesson-editor-ui.js`, `styles.css`, i18n e seed. Escopo: working tree atual; não prova o HEAD isolado.
