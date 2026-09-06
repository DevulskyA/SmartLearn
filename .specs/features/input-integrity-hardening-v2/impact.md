# Impacto da missão

Antes de alterar cada componente, registrar numa linha em validation.md: callers, dependências, ACs, testes e contratos afetados. Linhas abaixo são mapa inicial, não evidência de implementação.

| Área | Chamadores/depêndencias a localizar | Risco | Prova mínima |
| --- | --- | --- | --- |
| naming-validation | handlers de criação/edição de disciplinas, título, DB, import | Rejeitar travessão/Unicode; test-local copy | Corpus + consumo da função real |
| readState/init | todos os métodos BrowserStore e seeder DEV | Sobrescrever dados após erro | JSON malformado + nenhuma escrita/seed |
| save lesson | formulário Plano, resolução de disciplina, scheduler, createWithReviews | parcial, duplicata, ID errado, rascunho perdido | UI + falha transacional + dupla ativação |
| subject resolver | create/update/import, lista de ativos/arquivados | mudança de identidade/duplicação | chave canônica + IDs + caso arquivado |
| validation import | backups v1/v2/v3, mappers, buildImportStatements | perda silenciosa/normalização errada | roundtrip + linha inválida deixa estado intacto |
| date/numbers | revisão, evidência, estatísticas e import | score inventado/NaN/calendário inválido | fração/null/boolean/sufixo/data impossível |
| render/list refresh | dropdowns, filtros de Plano/estatísticas, mensagens | salvo invisível, clique que repete INSERT | navegador com filtros + falha de render |
| SQL boundary | invoke transação e plugin-sql | teste usando DB diferente do app | destino isolado comum e FK/rollback |

Preservar: Tracking Option C, limites aprovados, fonte livre, resumo permanente, agenda≠desempenho, migrações anteriores e suas fixtures. Uma tarefa que afeta esses contratos exige regressão correspondente. Sem hipótese de impacto, não iniciar mudança estrutural.
