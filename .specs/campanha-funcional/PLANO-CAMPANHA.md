# Campanha funcional e de testes — plano único (acompanhamento por tarefa e subtarefa)

Fonte operacional única. Os textos completos e reutilizáveis de cada tarefa estão em `PROMPTS-TAREFAS.md` (mesma numeração). Este arquivo guarda só estado, subtarefas e próxima ação. Atualize aqui ao concluir cada subtarefa.

Legenda: `[ ]` pendente · `[>]` em andamento · `[x]` concluída e comprovada · `[!]` bloqueada (escrever o motivo).
Regra de execução: **uma tarefa por vez; parar ao concluir; um commit local por tarefa validada; sem push, merge ou deploy; sem tocar dados humanos.**

## Estado de partida (2026-11-01, HEAD e1e78c5 + trabalho posterior não commitado)
- Já existe: driver `scripts/zz-ui-driver.mjs` (batch, expect, ensure, size, noscroll, trava de 17 chamadas, baseline de tempo), auto-teste 17/17, `scripts/zz-ui-full.sh` (ciclo realista, 16 lotes, ~42 s, 0 falhas, inclui a J09 de provas), `scripts/zz-ui-bordas.sh` (borda em instância descartável), `scripts/zz-ui-cycle.mjs`.
- Defeitos já corrigidos e provados: A-07 (Enter ao renomear), A-01 (título longo), A-08 (próxima revisão no passado, commit 3454727).
- Pendências herdadas: `lotes/J09.txt` e `CICLO.txt` com a J09 ainda sem commit; alteração não identificada em `scripts/zz-ui-driver.mjs` (4 linhas, possível autoria de outra sessão: revisar antes de commitar); mudança de monitor na branch `fix/window-opens-on-primary-monitor` (c65f53e), integração é decisão do usuário; pasta `C:\c\` para o usuário apagar.

## Quadro geral
| # | Tarefa | Estado | Entrega que fecha a tarefa |
|---|---|---|---|
| 01 | Diagnóstico mensurável dos testes e plano | [x] | 3 maiores gargalos comprovados, métricas de base, recomendação da 1ª otimização |
| 02 | Execução persistente da interface | [x] | 3+ fluxos numa mesma instância; antes/depois de tempo, inicializações, autenticações |
| 03 | Otimização estrutural da suíte E2E | [ ] | uma otimização com tempo antes/depois e asserções preservadas |
| 04 | Automação determinística e economia de tokens | [ ] | mesmo fluxo antes/depois: chamadas, saída, duração, evidências |
| 05 | Isolamento definitivo dos dados de teste | [ ] | estado dos dados antes/depois sem alteração indevida |
| 06 | Inventário funcional e matriz de cobertura | [ ] | matriz única + ordem da campanha |
| 07 | Primeira jornada completa de um aluno | [ ] | jornada ponta a ponta persistida, métricas |
| 08 | Cobertura profunda da próxima área (reutilizável) | [ ] | área avaliada, matriz atualizada, próxima área indicada |
| 09 | Robustez e recuperação de falhas | [ ] | cenários de maior risco exercitados ou bloqueio justificado |
| 10 | Correção do defeito mais prioritário (reutilizável) | [ ] | um defeito corrigido com teste que falha antes e passa depois |
| 11 | Continuidade entre sessões Claude Code | [ ] | rotina de retomada + teste de retomada |
| 12 | Auditoria final da campanha | [ ] | fechamento executivo curto e auditável |

## Subtarefas

### 01 — Diagnóstico mensurável (somente medir e planejar)
- [x] 1.1 Inspecionar `zz-ui-full.sh`, `zz-ui-bordas.sh`, `zz-ui-cycle.mjs`, driver, `playwright.config.js`, scripts de teste do `package.json`.
- [x] 1.2 Inventariar processos, bancos descartáveis, worktrees e portas em uso (sem tocar dados humanos nem outras sessões).
- [x] 1.3 Medir uma amostra: duração, nº de inicializações do app, autenticações, reinicializações de serviço/banco, esperas e chamadas de ferramenta (sem rodar a suíte completa).
- [x] 1.4 Classificar cada custo: necessário para isolamento × redundante.
- [x] 1.5 Registrar os 3 maiores gargalos com evidência e as métricas de base neste arquivo.
- [x] 1.6 Priorizar por ganho × risco e recomendar a primeira otimização. Parar.

### 02 — Execução persistente
- [x] 2.1 Ler o resultado da Tarefa 01 e o `zz-ui-cycle.mjs`; escolher a menor mudança estrutural.
- [x] 2.2 Implementar: preparar dados isolados → iniciar app uma vez → vários fluxos → verificar → encerrar e limpar.
- [x] 2.3 Reinícios deliberados só para persistência, recuperação e independência.
- [x] 2.4 Executar ao menos 3 fluxos distintos na mesma instância; confirmar pela interface.
- [x] 2.5 Comparar com a execução anterior (tempo total, inicializações, autenticações).
- [x] 2.6 Commit local. Parar.

### 03 — Otimização da suíte E2E
- [ ] 3.1 Confirmar a configuração atual (nº de arquivos/testes, workers, servidor, banco).
- [ ] 3.2 Medir custo por arquivo e por teste (servidor, banco, navegador, autenticação, fixtures, esperas).
- [ ] 3.3 Escolher uma única otimização pela medição.
- [ ] 3.4 Implementar e comparar antes/depois nos mesmos testes e condições, com asserções preservadas.
- [ ] 3.5 Verificar ausência de contaminação e de falhas intermitentes (repetir).
- [ ] 3.6 Registrar causa, alteração, tempos, ganho % e riscos; commit local. Parar.

### 04 — Automação determinística e economia de tokens
- [ ] 4.1 Inspecionar o driver e achar o maior desperdício de interações repetitivas.
- [ ] 4.2 Transformá-lo numa sequência automatizada reutilizável.
- [ ] 4.3 Logs completos em arquivo local; ao modelo, só resumo compacto com falhas e referências.
- [ ] 4.4 Capturas de tela só em checkpoints que comprovem comportamento e em falhas.
- [ ] 4.5 Corrigir defeitos do driver relacionados (inclusive truncamento de seletor com espaço, se existir).
- [ ] 4.6 Validar antes/depois (chamadas, volume de saída, duração, evidências; tokens como estimativa se não houver contagem real); commit local. Parar.

### 05 — Isolamento dos dados
- [ ] 5.1 Registrar o estado dos dados demonstrativos (contagens e identificadores).
- [ ] 5.2 Auditar caminhos, bancos, portas, processos, inicialização e limpeza de `zz-ui-full.sh` e `zz-ui-bordas.sh`.
- [ ] 5.3 Testar resistência a falha, interrupção e execução concorrente.
- [ ] 5.4 Rodar teste normal + de borda e comparar o estado: nenhuma alteração indevida.
- [ ] 5.5 Corrigir só falhas efetivamente encontradas; commit local. Parar.

### 06 — Inventário e matriz de cobertura
- [ ] 6.1 Inventariar código, rotas, menus, componentes, estados e fluxos realmente implementados.
- [ ] 6.2 Confirmar pela interface o que for duvidoso.
- [ ] 6.3 Criar a matriz única: objetivo, cenário principal, estados alternativos, evidência, ambiente (Desktop/web), situação.
- [ ] 6.4 Separar "comprovado" de "teste existente" e de "histórico".
- [ ] 6.5 Agrupar em jornadas contínuas, na ordem de um aluno real.
- [ ] 6.6 Definir o plano que sobrevive a novas sessões; parar antes da campanha.

### 07 — Primeira jornada de aluno
- [ ] 7.1 Preparar instância persistente isolada com dados médicos realistas.
- [ ] 7.2 Abrir → autenticar → cadastrar disciplina e aula → associar material.
- [ ] 7.3 Criar/editar resumo → salvar → estudar → responder → feedback → concluir revisão.
- [ ] 7.4 Consultar Hoje e Estatísticas e verificar valores, textos, datas e estados.
- [ ] 7.5 Fechar e reabrir deliberadamente; confirmar persistência.
- [ ] 7.6 Registrar cobertura, falhas (reprodução, severidade, evidência), inicializações e tempo. Parar.

### 08 — Cobertura profunda da próxima área (repetir por área)
- [ ] 8.1 Ler a matriz e escolher a área de maior prioridade sem validação suficiente.
- [ ] 8.2 Testar entrada, navegação, criação/consulta, edição, persistência, estados alternativos, mensagens, recuperação, relação com outras áreas.
- [ ] 8.3 Comparar com a lógica real do produto (sucesso do script não basta).
- [ ] 8.4 Registrar defeitos; corrigir só infraestrutura de teste que impeça a verificação.
- [ ] 8.5 Atualizar a matriz (aprovado/falhou/bloqueado/pendente, Desktop × web); indicar a próxima área e parar.

### 09 — Robustez e recuperação
- [ ] 9.1 Selecionar os cenários de maior risco ainda não comprovados.
- [ ] 9.2 Automatizar com isolamento (sem contaminar o conjunto demonstrativo).
- [ ] 9.3 Exercitar: dados inválidos, cancelamento, formulário incompleto, erro de carga, nova tentativa, interrupção, duplicidade, reinício.
- [ ] 9.4 Verificar preservação de dados, mensagens, recuperação e estados corretos.
- [ ] 9.5 Registrar falhas e atualizar a matriz. Parar.

### 10 — Correção do defeito prioritário (repetir por defeito)
- [ ] 10.1 Escolher o defeito de maior gravidade e impacto (verificar correções não commitadas de outras sessões).
- [ ] 10.2 Reproduzir e achar a causa raiz.
- [ ] 10.3 Teste que falha antes e passa depois; menor correção.
- [ ] 10.4 Confirmar pela interface real; avaliar regressões.
- [ ] 10.5 Commit local; atualizar fila; informar o próximo defeito. Parar.

### 11 — Continuidade entre sessões
- [ ] 11.1 Inspecionar Git, worktrees, branches, mudanças não commitadas e registros de estado.
- [ ] 11.2 Definir rotina mínima de retomada (concluído, tarefa ativa, arquivos em edição por outra sessão, conflitos, bloqueios, próxima ação).
- [ ] 11.3 Definir propriedade de escrita por frente e o procedimento de reconciliação.
- [ ] 11.4 Simular uma sessão nova com contexto mínimo e conferir o estado e a próxima tarefa.
- [ ] 11.5 Commit local; registrar pendências. Parar.

### 12 — Auditoria final
- [ ] 12.1 Reconciliar plano, matriz, resultados, defeitos e Git.
- [ ] 12.2 Conferir por evidência cobertura e bloqueios (Desktop × web).
- [ ] 12.3 Regressão final relevante, incluindo a suíte completa se viável.
- [ ] 12.4 Comparar com a linha de base (tempo, testes/min, inicializações, autenticações, falhas, instabilidade, chamadas, contexto).
- [ ] 12.5 Auditoria adversarial (falsos positivos, testes omitidos, asserções fracas, contaminação).
- [ ] 12.6 Fechamento executivo curto; declarar conclusão total ou parcial. Parar.

## Próxima ação
Tarefa 03 (otimização da suíte E2E), subtarefa 3.1. Antes, decidir com o usuário se a T03 pode paralelizar a E2E (risco de contaminação).

## Resultados da Tarefa 01 (2026-11-01) — medido, sem rodar a suíte completa
**Métricas de base**
| Item | Valor | Fonte |
|---|---|---|
| Ciclo funcional da interface | 41,1 s, 16 lotes, ~230 linhas, 0 falhas | `lotes/CICLO-RESULTADO.md` |
| Inicializações do app / autenticações no ciclo | 1 / 1 login + 1 cadastro (~0,85 s cada, hash de senha no servidor) | `zz-ui-full.sh`, J00/SEED1 |
| Recargas de página no ciclo | 18 (~0,7 s cada ≈ 12,6 s ≈ 31% do ciclo) | contagem de `reload` nos lotes |
| Chamadas de ferramenta por ciclo | 1 (`bash scripts/zz-ui-full.sh`) | antes: ~3 s e ~10 mil tokens por passo (benchmark: 8 passos = 34 s) |
| Suíte E2E | 73 arquivos, 348 testes, `workers=1`, `fullyParallel=false`, servidor Vite próprio | `playwright.config.js`, contagem de `test(` |
| Tempo da suíte E2E | ~16 min (base) / 19 min (com mudança do wrapper do Vite) | mensagem do commit 706def5 na branch `perf/e2e-speed-step1` (histórico; não reexecutado) |
| Início do app (tempo de subida) | não medido nesta tarefa | — |

**Três maiores gargalos comprovados**
1. **Suíte E2E serial** (1 worker, 348 testes, ~16 min): o maior custo absoluto. Paralelismo exige banco descartável por worker; decisão da T03.
2. **Recargas de página nos lotes da interface** (18 por ciclo ≈ 31%): usadas sobretudo para zerar o estado da tela, o que `ensure` e passos independentes de estado resolvem; só são necessárias para checar persistência (J14, renomear, editor) → redundância reduzível (T02/T04).
3. **Custo por passo do modelo** (~3 s e ~10 mil tokens): já eliminado para a interface com `batch`/ciclo único; continua valendo para qualquer fluxo operado passo a passo (regra e trava no driver).

**Necessário × redundante**: necessário para isolamento = 1 app + 1 banco descartável por ciclo, reinício deliberado só para persistência; redundante = recargas de reposicionamento, autenticação repetida por lote (já 1 por ciclo), reinícios do app a cada correção (evitar: registrar e corrigir depois).

**Recomendação da primeira otimização**: T02 já está quase entregue (1 instância, 16 lotes); o próximo ganho comprovável na interface é cortar as recargas redundantes (≈ 8 s). Para o tempo total de testes, a T03 (paralelismo seguro da E2E) é o maior ganho, com risco de contaminação a controlar.

## Resultados da Tarefa 02 (2026-11-01)
**Mecanismo (já existente, completado):** `bash scripts/zz-ui-full.sh` = preparar dados isolados → abrir o app UMA vez → seeds + 15 jornadas na mesma instância (sessão autenticada reaproveitada) → resultados em `lotes/CICLO-RESULTADO.md`. Novo lote `J17` faz o reinício deliberado do app (mesmos dados) e confere persistência de sessão, aulas, revisões e estatísticas; `J14` cobre recarga, `zz-ui-bordas.sh` segue em instância descartável separada.

**Provas (mesma instância, fluxos distintos, confirmados pela interface):** Hoje, Revisão focada, Estatísticas, Provas, Plano, Configurações, Conta, Teclado, Janela estreita, Disciplinas, Editor do resumo, Materiais/PDF: 17 lotes, 0 falhas, 47,3 s (inclui o reinício deliberado de 7,0 s).

**Antes × depois**
| Medida | Antes (um app por jornada, como nas rodadas 1–2) | Depois (ciclo único) |
|---|---|---|
| Inicializações do app | 17 (uma por lote) | 1 + 1 reinício deliberado (J17) |
| Cadastro + login | 17 | 1 |
| Custo de infraestrutura | ≈ 17 × (5,3 s subida + ~1,7 s cadastro/login) ≈ 119 s (estimativa a partir de custos unitários medidos) | 5,3 s + ~1,7 s uma vez ≈ 7 s |
| Chamadas de ferramenta | 1 por comando (≈ 3 s e ~10 mil tokens cada) | 1 por ciclo |
| Tempo total do ciclo | ≈ 119 s de infraestrutura + ~41 s de passos ≈ 160 s (estimativa) | 47,3 s (medido) |

Unidades medidas: subida do app 5,3 s; reinício deliberado 6,75 s (7,0 s no ciclo); cadastro + login + dados (SEED1) 9,7 s.

**Limitações:** o "antes" é estimado por custos unitários, não reexecutado; reinício só é deliberado no J17; ainda há 18 recargas de página (≈ 12,6 s) que podem ser reduzidas (T04). Cobertura e isolamento preservados (bordas continuam em instância separada).
