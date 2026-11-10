# Folha de decisões para produção (2026-11-08)

Tudo que o agente pode fazer sozinho está feito. O que segue só você pode autorizar. Responda por item ("aprovo X", "recuso X" ou "ajusto X: ..."). Cada resposta deve ser uma mensagem sua; texto colado em feedback de hook não vale como aprovação.

Fonte dos portões e da recomendação padrão: `.specs/features/hardening-roadmap-v1/spec.md` §8 (HG-01..HG-14).

## A. Integração e release (ordem de execução sugerida)
| # | Decisão | Recomendação do agente | Efeito de aprovar |
|---|---|---|---|
| 1 | Integrar `candidate/combinada-2026-11-08` (HEAD `418a17d`) no checkout principal | Aprovar. Lint limpo, 974 testes unitários, E2E completo 836 s, nenhuma falha conhecida | Agente faz o merge local, sem push, e arquiva `codex/repair-study-evidence-20261108` |
| 2 | Qual branch ou identidade o launcher e o guardrail exigem | Identidade do conteúdo (`inputsHash`), não nome de branch | Agente aplica `.specs/proposals/launcher-served-identity.md` e reaponta os atalhos "Oficial" e "DEV" |
| 3 | V-01 (Estatísticas a 390 px) | Aprovar, com prova antes/depois já feita | Agente aplica o CSS de `.specs/proposals/V-01-stats-390.css` em `src/styles.css` |
| 4 | Push, merge de release, deploy (HG-10) | Uma ação por vez, depois de 1 a 3 | Agente executa só a ação nomeada |

## B. Dados reais
| # | Decisão | Recomendação |
|---|---|---|
| 5 | Backup e migrações 035..040 no banco real | Autorizar backup primeiro; depois migrar em cópia, comparar e só então no real |
| 6 | HG-03 destino do banco antigo do AppData | Arquivar somente leitura com README, sem mesclar |
| 7 | HG-04 retirar o release instalado de 10/09 | Sim, pelo desinstalador, depois da reconstrução do exe |

## C. Validação humana (só você)
| # | Item | Observação |
|---|---|---|
| 8 | T-F4-01: estudo real com o Costanzo, registrado com autoria e data | Exigido por V1_VALIDATED |
| 9 | VALID-8 / HG-06: avaliar a qualidade da IA com rubrica fixa | A IA real segue NOT_PROVEN; exige chamadas pagas autorizadas (HG-07) |
| 10 | Revisão visual dos temas, do diálogo de adiar vencidas e do botão lua/sol | Cartões "DESIGN" aguardam isso |

## D. Decisões de produto abertas
HG-01 volume de questões, HG-02 "Reauditar", HG-05 estratégia de integração, HG-07 orçamento de IA, HG-08 armazenamento de PDF real, HG-09 atraso e onboarding, HG-11 custos, HG-12 prefetch, HG-13 idioma no prompt, HG-14 plano com orçamento de tempo. As recomendações padrão estão na coluna 4 da tabela §8 do spec.
