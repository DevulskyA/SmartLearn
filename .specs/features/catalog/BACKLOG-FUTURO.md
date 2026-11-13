# Catálogo, banco de questões e banco de resumos — backlog futuro

Estado: direção aprovada, implementação integral ADIADA (decisão do dono, 2026-11-13). Nada abaixo é tarefa executável; só vira trabalho
quando trouxer benefício concreto ao fluxo básico e o dono pedir. Prioridade atual: estabilizar geração, revisão e Materiais.

## Já entregue (base mínima)
- Metadados bibliográficos na própria `sources` (migração 044): título, autores, edição, ano, idioma, ISBN, origem por campo; correção do aluno
  por `PATCH /sources/:id/bibliography`; extração nunca sobrescreve campo corrigido. Commit `447e4125`.
- Banco privado sobre o índice do corpus (`server/src/corpus/private-bank.js`, `freshness.js`, `review-need.js`): existe e é testado, mas NÃO está ligado ao fluxo de produção.

## Ideias adiadas
1. Catálogo compartilhado de obras e edições (tabelas próprias, mesclagem por ISBN entre usuários).
2. Correspondência entre edições (mapa de capítulos/páginas, verificação manual ou por texto exato) e regra "edição mais nova só vence se validada".
3. Busca semântica sobre conteúdos.
4. Banco de resumos por edição/cobertura e registro de permissão de reuso.
5. Classificação matéria › assunto › tópico, gravada e buscável por FTS5.
6. Coluna de modalidade (objetiva/discursiva) e estado de validade da questão.
7. Ligar `private-bank.js` ao fluxo (REUSE / DERIVE / GENERATE antes de gerar) e usar o ISBN/edição/ano de `sources` em vez do ano derivado do nome do arquivo.
8. Ligar `resolveReviewNeed` ao fluxo de revisões.
9. Geração automática adicional (títulos com IA real, checagem de duplicatas entre questões geradas).
10. Interface para o aluno ver e corrigir os metadados do material (hoje só a API; a tela de Materiais está em redesenho por outra frente).

## Removido nesta etapa (estava só no repositório local, sem push)
Tabelas `catalog_works`, `catalog_editions`, `catalog_edition_maps`, `source_editions`, o serviço de vínculo de edição e o `reuse-gate.js`.
Recuperáveis no commit `c782bc3c` se a ideia 1 ou 2 for retomada.

## Resumo primeiro (2026-11-13, commit 641cc9b2)
- Entregue: `SMARTLEARN_CODEX_DEFER_QUESTIONS=true` faz a geração Codex escrever só o Resumo Mestre (1 chamada); o rascunho vem marcado
  `questionsDeferred`, pode ser editado e aceito (lição com 16 revisões, sem exercícios; a data do estudo continua sendo a do aceite).
  DESLIGADO por padrão: sem a continuação abaixo, uma lição Codex ficaria sem perguntas.
- Fatia 2 entregue (commit 2582e4b9): `POST /drafts/:id/generate-questions` escreve as perguntas depois, a partir do mesmo texto-fonte, NO MESMO
  rascunho (PROPOSED/FLAGGED, origem GENERATED, nunca ACCEPTED); mantém o resumo do aluno; quantidade = a que o modelo escreveu; repetição é no-op;
  sem citação válida não altera nada. Executa dentro da requisição (sem job), então o tempo é o do Codex; falta a UI chamá-la.
- UI entregue (commit `e1b2fdbe`): botão "Gerar perguntas" nas abas Questões e Revisão do rascunho `questionsDeferred`, com teste de ponta a ponta
  (resumo → perguntas → aceite). Por isso a flag passou a LIGADA por padrão (`SMARTLEARN_CODEX_DEFER_QUESTIONS=false` restaura a chamada única).
  Ainda aberto: rodar as perguntas como job (reinício/orçamento) e medir com Codex real. O texto abaixo é o histórico do que faltava.
- (histórico) Falta para ligar a flag por padrão: botão "Gerar perguntas" no rascunho `questionsDeferred` (UI mista com outra frente) e, opcionalmente, rodar
  isso como job (`generation_jobs.kind`, migração própria) para sobreviver a reinício e entrar no orçamento. Plano original do job: job de perguntas em segundo plano (`generation_jobs.kind`, migração própria)
  que gera só as perguntas necessárias. Restrição de segurança: pergunta de IA NUNCA entra numa lição aceita sem revisão humana
  (invariante AI_OUTPUT = DRAFT); portanto as perguntas chegam num rascunho de perguntas a revisar, ou são anexadas ao rascunho ainda aberto.
- Medição com Codex real (o dono executa): `node scripts/real-codex-generation.mjs --authorize-real-codex --pdf <arquivo> --from 267 --to 273 --mode summary-first`
  (modos: split, summary-first, single). Compare `ms` entre os três.
