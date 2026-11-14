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
7. FEITO em parte (05aeae4f): o banco privado é consultado antes do modelo ao pedir as perguntas de um rascunho (mesma fonte, páginas contidas no texto, outra aula). Falta usar o ISBN/edição/ano de `sources` em vez do ano derivado do nome do arquivo e o DERIVE.
8. `resolveReviewNeed` AGUARDA consumidor: a revisão de hoje só reapresenta exercícios existentes e não gera perguntas, então não há ponto de decisão REUSE/DERIVE/GENERATE para ligar. Só vale criar quando existir uma revisão que gere itens novos (decisão de produto).
11. Compartilhamento entre instalações (reaproveitamento, hoje por conta no mesmo servidor, migrações 046/047): o acervo `shared_content` é uma tabela chaveada por (digest do texto enviado ao modelo, idioma), sem identidade de quem contribuiu exposta. Para duas instalações, o mesmo registro (digest, idioma, resumo, perguntas, versões do modelo/prompt, base jurídica declarada) pode trafegar por um serviço central que só armazena e entrega esse registro; o receptor continua auditando de novo contra o próprio texto e revisando como rascunho. Falta decidir: serviço central e autenticação, retirada (WITHDRAWN) propagada, e moderação. Não implementado; sem publicação.
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
  Medir com Codex real continua com o dono. (O job das perguntas foi entregue: ver "Perguntas depois" abaixo.) O texto seguinte é o histórico do que faltava.
- (histórico) Falta para ligar a flag por padrão: botão "Gerar perguntas" no rascunho `questionsDeferred` (UI mista com outra frente) e, opcionalmente, rodar
  isso como job (`generation_jobs.kind`, migração própria) para sobreviver a reinício e entrar no orçamento. Plano original do job: job de perguntas em segundo plano (`generation_jobs.kind`, migração própria)
  que gera só as perguntas necessárias. Restrição de segurança: pergunta de IA NUNCA entra numa lição aceita sem revisão humana
  (invariante AI_OUTPUT = DRAFT); portanto as perguntas chegam num rascunho de perguntas a revisar, ou são anexadas ao rascunho ainda aberto.
- Medição com Codex real (o dono executa): `node scripts/real-codex-generation.mjs --authorize-real-codex --pdf <arquivo> --from 267 --to 273 --mode summary-first`
  (modos: split, summary-first, single). Compare `ms` entre os três.

## Perguntas depois, aula já aceita e job (2026-11-13)
Jornada: o aluno aceita o Resumo Mestre sem perguntas e depois quer perguntas para essa aula, com revisão humana e sem perder o que já existe.
Defeitos achados e corrigidos nesta jornada (registro: onde / esperado × observado / causa / correção):
- **D-1 UI** (editor, `renderAccept`): esperado = aceitar um resumo-primeiro sem perguntas, como o servidor já permite; observado = "Aceitar e criar aula" ficava DESABILITADO (`kept === 0`), então a jornada não era possível pela tela. Causa: regra de "pelo menos uma questão" anterior ao resumo-primeiro. Correção: rascunho `questionsDeferred` sem questões aceita-se como aula sem exercícios, com nota própria ("as perguntas você pode pedir depois, em Materiais"). Provado: e2e `lesson-questions-later` falhou antes (botão desabilitado, 64 tentativas) e passa.
- **D-2 servidor** (aula aceita sem perguntas): esperado = poder pedir perguntas depois; observado = nenhuma ação (só o rascunho aberto tinha `generate-questions`). Correção: `POST /learning-units/:unitId/questions-draft` abre um rascunho de perguntas ligado à aula (`generated_drafts.target_unit_id`, migração 045) que o aluno revisa como qualquer saída de IA; aceitá-lo ACRESCENTA exercícios à aula (depois dos que existem, que não são tocados), sem nova aula nem novo calendário de revisões. Materiais mostra "Gerar perguntas da aula" ou "Revisar perguntas da aula"; esse rascunho nunca aparece como "o rascunho da unidade" (a aula continua sendo a resposta) e o resumo dele é só leitura.
- **D-3 servidor** (perguntas depois, rascunho com perguntas do aluno): esperado = preservar o que o aluno já escreveu/aprovou; observado = a geração SUBSTITUÍA todas as questões do rascunho. Correção: as perguntas geradas são acrescentadas depois das existentes (id, texto, status e origem intactos) e uma repetida não entra duas vezes. Provado por mutação (voltar a substituir faz o teste falhar).
Job: `generation_jobs.kind` DRAFT|QUESTIONS e `target_draft_id` (migração 045, no contrato imutável). `POST /generation-jobs { draftId }` cria o job de perguntas: mesmo registro, mesmo orçamento (1 chamada reservada; liberada se nada saiu, liquidada pela estimativa se pode ter saído; nunca duas vezes), mesmo consentimento, cancelamento (processo inteiro) e concorrência (no máximo um job ativo por trecho). Pedir de novo enquanto roda devolve o mesmo job (uma só chamada); depois de prontas não cria nada. Interrompido (queda, parada do servidor): o job falha uma vez (SERVER_RESTARTED), a chamada que pode ter saído é cobrada pela estimativa uma vez, o rascunho fica intacto e a nova tentativa é um job novo, pedido pelo aluno, nunca automático. Job ainda QUEUED é retomado na partida. Resumo editado durante a geração é mantido. Ao voltar ao editor com o job rodando, a tela o acompanha em vez de pedir de novo.
Provas: `server/test/lesson-questions.test.js` (3) e `lesson-questions-job.test.js` (9) e `e2e/lesson-questions-later.spec.js`; suíte completa do servidor 1347/1349 (as duas falhas: classificação do POST novo, corrigida, e `AUDIT_RULES_VERSION`, da outra frente). Aberto: medir tempo/custo com o Codex real (dono); a rota síncrona `/drafts/:id/generate-questions` continua existindo (agora também com orçamento) mas a tela usa o job.
