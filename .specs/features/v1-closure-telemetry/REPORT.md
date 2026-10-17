# Fechamento da V1, etapa 1: relatório

HEAD analisado: 0980d48 · 2026-10-17 · natureza: análise e registro (nenhum código, teste ou banco alterado). Interface congelada.

Documentos: `ledger.md` (níveis, status, critérios), `telemetry-audit.md` (campos, pontos de escrita, lacunas TG-01..TG-12), `comparison-plan.md` (plano de comparação).

## 1. Estado por nível

| Nível | Estado | Observação |
|---|---|---|
| Engenharia | EXECUTED, com itens abertos | 130 testes de telemetria do servidor, 9/9 mutantes mortos, lint e guardas PASS. NÃO reexecutados nesta etapa: unitários, servidor completo (2 falhas relatadas), E2E, jornada nativa no HEAD final |
| Qualidade médica | NOT_PROVEN | só avaliação por IA, 1 unidade, sem revisor clínico (HG-06) |
| Eficácia educacional | NOT_PROVEN | sem dado real, sem base de comparação |

## 2. Lacunas de telemetria independentes de HG-09 e de interface (ordem de execução)

Cada fatia: teste vermelho a partir da sondagem, correção mínima, regressão, mutante correspondente.

1. **TG-01** (correção): `evidence_date` de REVIEW usa o dia UTC (`server/src/services/reviews.js:128`); conclusão às 23:30 em São Paulo grava o dia seguinte (P-1). Depende de D-T7.
2. **TG-02** (correção): reabrir e concluir de novo duplica a evidência (8/7 para revisão de 4 questões; afeta estatísticas, analytics e prioridades). Correção na leitura (`isCurrent`), sem mudar esquema (P-2).
3. **TG-04** (correção): API aceita `2099-01-01`, `1900-01-01`, `2026-02-31` (P-5).
4. **TG-03** (aditivo): sem contexto da tentativa (reteste, estudo abandonado e prova indistinguíveis; P-3, P-4). Exige migração 034 (D-T2).
5. **TG-07a/TG-08** (ferramenta): script somente leitura de integridade. Opcional.
6. **TG-05b** (aditivo): `think_ms` (da pergunta mostrada até a revelação); hoje `started_at` é o momento da revelação.
7. **TG-12**: promover os mutantes M-A..M-I para `scripts/mutation-check.mjs`.
8. **TG-09**: teste estático de que nada atualiza nem apaga `learning_events`/`learning_evidence`.
9. **TG-02b**: registro de auditoria de reabertura (mesma migração 034).

Bloqueadas: TG-06 (assistência sempre SOLUTION; sem confiança), TG-07b, TG-05c, TG-10 (sintético × real sem marca), TG-11.

## 3. Decisões humanas abertas

D-T1 manter o banco sintético ou começar limpo · D-T2 autorizar migração 034 · D-T3 compromisso de resposta antes da revelação · D-T4 randomização por unidade e itens retidos · D-T5 captura de tempo de estudo e privacidade · D-T6 revisor médico e amostra · D-T7 fuso que define o dia da evidência · D-T8 interação com HG-09. `T-F4-01` (primeiro estudo real) é só do usuário.

## 4. Fonte

Sondagens P-1..P-5 e mutantes M-A..M-I rodaram em banco temporário e cópia descartável (scripts não versionados). Este resumo repete o relato do agente da etapa; a prova de cada item está em `ledger.md` §5 e deve ser reproduzida ao virar teste.

## 5. Atualização 2026-10-17 (depois do relatório)

- TG-04, TG-02, TG-09, TG-12 corrigidos (e8e46a4, f0aae39, 3742827, 9603f21). TG-01 corrigido (760491c) com D-T7 = fuso do cliente/salvo (America/Sao_Paulo), também no padrão do `exams.finalize`.
- Regra do produto (usuário): tempo de resposta por questão NÃO mede conhecimento nem penaliza o aluno; só avaliação cronometrada de propósito pode usá-lo. TG-05b/TG-05c (`think_ms`) valem apenas como dado de tempo de estudo, nunca entram em domínio, agendamento nem veredito.
