# Dados de teste reutilizáveis (seed) — estatísticas e outras jornadas

Criados no app nativo isolado por `lotes/seed/SEED1`, `SEED2b` e `SEED3` (conta `aluno1@example.com`). Rodar uma vez em dados novos; depois reaproveitar sem reiniciar o app.

| Item | Valor |
|---|---|
| Disciplinas | Farmacologia, Anatomia, Fisiologia, Bioquímica |
| Aulas com data (para revisões vencidas e futuras) | Sistema nervoso central 05/10, Membro superior 12/10, Potencial de ação 15/10, Sistema cardiovascular 22/10, Glicólise 28/10, Farmacocinética básica 30/10 |
| Aula com PDF e exercícios | `farmacologia-teste.pdf` (3 questões) em Farmacologia |
| Estudo | acertou, errou, acertou |
| Revisões marcadas feitas | 3 |
| Números esperados em Estatísticas | Vencidas 6, Revisões feitas 7, Média geral 66,7%, Questões 3, Acertos 2 |
| Nota | com menos de 10 questões a tela diz "Ainda não há evidência…" (regra de tendência), mesmo com dados |

Ciclo completo: `node scripts/zz-ui-cycle.mjs` (9 lotes, ~13 s, app aberto uma vez). `--record` grava os tempos de referência.
