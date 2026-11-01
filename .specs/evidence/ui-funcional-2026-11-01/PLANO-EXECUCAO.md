# Plano de execução do teste funcional (feito a partir da interface; nenhum passo é decidido durante a execução)

Interface mapeada (ids estáveis): navegação `[data-screen=today|materials|plan|stats|settings|account]`; Conta `#account-register-*`, `#account-login-*`, `#account-logout-btn`; Plano `#plan-manage-subjects-btn`, `#plan-new-unit-btn`, `#plan-subject-select`, `#plan-study-source|date|title|summary`, `#plan-unit-save-btn`, filtros `#plan-filter-subject|state|period`, `#plan-sort`; Disciplinas `#subjects-show-create-btn`, campo "Nome da nova disciplina", Editar/Arquivar/Excluir; Materiais `#sources-file-input`, `button[data-action=generate-draft]`, rascunho `#lesson-<id>-subject`; Estatísticas `#stats-unit-filter-period`, `#tab-stats-subject|unit`; Configurações `#generation-language-select|save`, temas, `#export-backup`.

Regras: app aberto uma vez; nenhuma correção durante a execução (só registro); um comando só (`scripts/zz-ui-full.sh`); sem capturas de tela, só texto (screenshot só em falha); cada lote tem tempo medido.

| Ordem | Lote | Cobre | Resultado esperado |
|---|---|---|---|
| 1 | seed/SEED1 | J00 conta, 4 disciplinas, 6 aulas com datas | 0 falhas |
| 2 | seed/SEED2c | J10 PDF, rascunho, aceitar aula com data passada (revisões vencidas com exercícios) | 0 falhas |
| 3 | J01 | menu: 6 destinos | 0 falhas |
| 4 | J07 | aulas: vazio, espaços, repetido, HTML, emoji, 300 caracteres, data passada/futura | 0 falhas |
| 5 | J02 | Hoje: revisão feita | 0 falhas |
| 6 | J04 | revisão focada, 3 questões, resultado | 0 falhas |
| 7 | J05, J11 | filtros do Plano; Estatísticas coerentes | 0 falhas |
| 8 | J12, J13 | temas, idioma, apagar base; login inválido | 0 falhas |
| 9 | J14, J15 | recarga, voltar/avançar, hash inexistente; teclado | 0 falhas |
| 10 | J08 | editor do resumo: salvar e persistir | 0 falhas |
| 11 | J16 | janela 420 px: cada tela sem rolagem horizontal | 0 falhas |
| 12 | J06c–e | renomear (Enter/Esc), cor, arquivar, reativar, excluir | 0 falhas |

Fora do alcance: J09 (não há entrada de provas na interface) e diálogos nativos do sistema (arquivo, backup).
