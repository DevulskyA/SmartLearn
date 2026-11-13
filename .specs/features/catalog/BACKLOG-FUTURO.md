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
