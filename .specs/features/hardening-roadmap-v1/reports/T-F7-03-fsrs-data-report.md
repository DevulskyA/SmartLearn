# T-F7-03 — Relatório de dados para a decisão sobre FSRS (PARCIAL)

Data: 2026-10-05 · Escopo: somente leitura, sem código de algoritmo · Requisito: R-11 (AC-11.3), DEBT-003.

## Estado: PARCIAL — as medições empíricas NÃO foram feitas

Motivo (regra absoluta do pedido): só era permitido ler uma cópia de snapshot FEITA PELO PRODUTO (`server/src/dev-snapshot.js`, `VACUUM INTO`, com `manifest.json` e sha256 verificáveis por `isValidSnapshot`). Em `C:\Users\Ariel\SmartLearn-DevData\snapshots` existem só duas pastas, `2026-09-19` e `2026-10-03`, e AMBAS são cópias cruas `db + db-shm + db-wal` (sem `manifest.json`, sem integridade registrada, mtimes de 19/09). Não foram produzidas pelo `VACUUM INTO` do produto e não podem ter a integridade comprovada pelo verificador do repositório. Gerar um snapshot novo exigiria abrir o banco humano, o que é proibido. Nada foi aberto como banco; nenhuma consulta SQL foi executada.

Consequência: carga projetada MEDIDA, taxa de atraso e acertos por intervalo = NÃO MEDIDOS (n = indisponível). Nenhum número empírico é apresentado.

## O que é determinístico (do código, não de dados)

- Agendador atual (`shared/review-schedule.js`): 16 revisões fixas por unidade, offsets de dias `1, 7, 15, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360, 390` (tabela `review_tasks`: `offset_days`, `due_date`, `completed_at`).
- Carga em regime (DEBT-003): `16 x U` tarefas/dia por coorte estacionária, onde U = unidades registradas por dia, após ~390 dias de registro constante (ex.: U = 5 → ~80/dia; a nota "~1190/dia no ano 3" do título de DEBT-003 não é consistente com a própria conta e deve ser revisada se for citada). Isto é uma fórmula do desenho, NÃO uma observação do uso real.
- Origem dos sinais necessários, para quando houver snapshot válido: atraso = `review_tasks` (`due_date`, `completed_at`); acerto por intervalo = `exercise_attempts` (`submitted_at`) ligadas a `learning_evidence`/`learning_events` (resultado CORRECT/INCORRECT; migrações 004, 009, 010, 021) agrupadas por dias desde a tarefa/unidade anterior (buckets 0-1, 2-7, 8-30, 31-90, 91+).

## Plano de medição pronto (read-only, numa cópia em diretório temporário)

1. Escolher o snapshot válido mais novo (`isValidSnapshot`), copiar para o temp do SO, `PRAGMA integrity_check` na CÓPIA, abrir `readonly`.
2. Revisões: agendadas vs feitas, taxa de atraso (`completed_at > due_date` ou ainda aberta vencida), carga projetada dos próximos 14 dias com o agendador atual (`due_date` abertos por dia).
3. Acerto por bucket de intervalo, com n por bucket.
4. Regra de leitura: n por bucket < ~30 ou < 4 semanas de uso => nenhuma conclusão (`adiar`).

## Recomendação (provisória, sem dados)

`ADIAR`. Sem dados reais medidos, a regra do próprio requisito (decidir "com dados do uso real antes de qualquer implementação", AC-11.3) não é cumprida; implementar FSRS ou fixar parâmetros agora seria decidir sem evidência. A decisão adotar/adiar/parâmetros permanece do usuário.

## Para fechar a tarefa

Uma das opções, a critério do usuário: (a) autorizar que o próprio produto gere um snapshot verificado (`takeVerifiedSnapshot`, que abre o banco DEV com `VACUUM INTO`), ou (b) abrir o app normalmente para o snapshot diário ser criado; depois rodar o plano de medição acima e completar este relatório.
