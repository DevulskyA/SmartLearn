# Integração a partir de f1cddd9 — análise e plano (2026-11-02)

Branch: `integration/v1-recover-20261102` (local, sem push). Base: `f1cddd9` (publicada em `audit/smartlearn-v1-complete-f1cddd9`).
Fonte de verdade para o estado real: `git log`. Este arquivo é análise, não registro de aprovação.

## Já feito nesta branch
| Commit | O quê |
|---|---|
| 2f6d801 | migração pendente no banco DEV persistente exige `SMARTLEARN_AUTHORIZE_MIGRATIONS` por versão |
| a0f7f7e | checagem antes de `openDb` por conexão somente leitura; backup copia "como está" |
| e26c4bc | baseline de prosa do servidor 576→579 (3 mensagens de operador); allowlist do teste de isolamento |
| f7bd054 | `isDevDatastoreDb` reconhece o banco via junction/symlink (teste falhava antes) |

## Registro de erros desta sessão
| Id | Onde | Observado | Causa | Classe | Estado |
|---|---|---|---|---|---|
| I-01 | teste unitário `i18n-scan` e `test-db-isolation` | falharam depois dos meus testes novos | baseline de prosa do servidor (+3 mensagens de operador) e allowlist de testes que usam banco DEV falso | meu erro; regra 3 (nenhuma regra cobria) — o próprio teste guarda | corrigido em e26c4bc |
| I-02 | `isDevDatastoreDb` | um junction para a pasta do DEV fazia o portão (e o lock e os snapshots) não reconhecer o banco | comparação só por `resolve()` | defeito de produto demonstrado por teste que falhava | corrigido em f7bd054 |
| I-03 | E2E focado do editor | 6 falhas, todas no recorte de PDF (pdf.js/KaTeX) | INSTRUMENTO: `node_modules` ligado por junction à worktree vizinha; o Vite recusa servir arquivos fora da raiz (`outside of Vite serving allow list`) | meu erro de instrumento; regra "Integridade do instrumento" 1 e 4 existia e eu não validei o alvo antes de ler resultado | corrigido (cópia real); mesmas 45 specs: 45 passaram em 3,1 min |

| I-04 | `scripts/desktop-study-journey.mjs` passo 7 | `fill` expirou em `.lesson-summary-input` (campo oculto) | INSTRUMENTO velho: o Resumo agora abre como leitura ("Editar resumo"), o E2E já usava `startEditingSummary`, a jornada nativa não | defeito do instrumento (o produto segue a decisão "leitura primeiro") | corrigido: o script chama `startEditingSummary` depois de cada aba Resumo; 23/23 |
| I-05 | E2E completo, `summary-visual-editor.spec.js:523` ("every way out") | `toBeVisible` do aviso `.summary-visual-notice` estourou 5 s uma vez na rodada completa (3 workers) | NÃO provada; o spec passou 3/3 isolado e 45/45 no conjunto focado | provável oscilação sob carga (mesma classe já registrada: ACCESS-5, keyboard-today); sem defeito de produto reproduzido | DECLARADO; sem alteração de código |

| I-05b | mesmo spec | tentativa de reproduzir: 24/24 sob 12 processos de carga (`--repeat-each=12`), 3/3 isolado, 45/45 no conjunto focado; 1 falha em 378 execuções do E2E completo | nenhuma causa provada | oscilação não explicada; o teste digita logo após o clique sem esperar o editor pronto (hipótese, não provada); nenhuma alteração feita | DECLARADO |
| I-05c | editor + autosave, `--repeat-each=3 --workers=6` sob 12 processos de carga (102 execuções) | 101 passaram; 1 falhou: `draft-autosave.spec.js:291` por tempo esgotado (25,6 s); o spec de I-05 passou 3/3 | a classe "estoura tempo sob carga" é REPRODUZÍVEL com carga alta, em teste diferente do original | classe de oscilação de carga confirmada; o teste exato de I-05 continua não reproduzido; produto sem alteração desde 3519915 | DECLARADO (sem correção justificada) |
| I-06 | ensaio de Estatísticas AAA | 38/38 E2E falharam em ~2 s | INSTRUMENTO: um `>` perdido num `styles.css` (o Edit tratou `>>>>>>>` como citação) quebrou o build; as falhas rápidas e idênticas denunciaram o defeito | meu erro; regra "velocidade anômala é sinal" funcionou, "instrumento é código" não foi aplicada antes de rodar | corrigido no ensaio; rodada válida abaixo |

## Ensaio funcional isolado de Estatísticas AAA (worktree descartável, nada commitado na integração)
Base: integração 2cd68bf + merge de `claude/stats-aaa-6405e1`. Resolução: Rust, docs e `feature-parity.spec` pelo lado de f1cddd9; `appStats.js` e `styles.css` união; `analytics.js` e os 4 hunks de `app.js` pelo fluxo da AAA; imports unidos (sem `performanceColor`, que a AAA deixa de usar).
- ESLint 0. Unit: 860 passaram, 2 falhas — (a) conflito de comportamento real abaixo, (b) teste de build do Vite que só falha porque o merge não estava commitado (instrumento).
- E2E (stats-aaa, stats-sorting, study-verdict, feature-parity, select-ui): 37 passaram, 1 falhou.
- **Conflitos de COMPORTAMENTO demonstrados (exigem decisão do usuário, não são só mecânicos):**
  1. Janela do período: AAA usa "últimos N dias contando hoje" (`hoje-(N-1)` até hoje); f1cddd9 usa `hoje-N` inclusive (N+1 dias). Teste `evidenceInPeriod ... today-30 inclusive` de f1cddd9 contradiz a AAA. A AAA também ignora evidência com data futura e exige `correctCount` válido.
  2. Cabeçalho de Estatísticas: f1cddd9 mostra Vencidas / Revisões feitas / Questões; a AAA mostra só o bloco de KPIs de questões (some `#metric-reviews-done`, `#metric-reviews-overdue`). O E2E `feature-parity.spec.js:109` de f1cddd9 falha por isso.
  3. `filterByPeriod` (linhas por última atividade) deixa de existir; a AAA recalcula tudo a partir da evidência do período.
- Conclusão: a fusão é viável em ~2 arquivos de lógica, mas a AAA muda números e remove KPIs; é decisão de produto (superfície protegida, ADR-0001). Nada foi integrado.

## Provas no SHA final 3519915 (+ correção do instrumento)
- Lint 0; unit 859 ok/0 falhas/1 ignorado; servidor 1189/1189.
- E2E completo: 375 passaram, 2 ignorados, 1 falha (I-05), 11,2 min (orçamento ~16 min). Conjunto focado do editor: 45/45.
- Jornada nativa (WebView2 real, exe isolado, dados e perfil descartáveis, título `SmartLearn DEV - v0.1.0 - 3519915`, `inputsHash 2fde0750efe8` igual ao empacotado): 23/23 em 82 s. O exe é o `smartlearn.exe` de f1cddd9 (src-tauri sem diferença) com os recursos empacotados de 3519915.

## Nada a recuperar
- `split-fatia2`: o conserto "esperar o reveal antes de julgar" e os refactors já estão em f1cddd9 (mesmo código, contexto diferente).
- `fix/window-opens-on-primary-monitor`: f1cddd9 já tem DISPLAY1, tamanho de primeira execução, centralização e salvamento posterior (`Saver`).
- `PRODUCT.md`: mesmo blob (`bd1ebd8`) em todas as variantes.

## Tarefa 4 — Estatísticas AAA (somente análise e ensaio isolado)
Fonte mais completa: **`claude/stats-aaa-6405e1` (38278f5, só local)**. A `origin/claude/product-md-on-stats-aaa` (6921f11) NÃO tem `088d498` (tendência histórica como nota compacta) nem as decisões do usuário aplicadas (`38278f5`).
Ensaio de merge sobre f1cddd9+integração: 10 arquivos em conflito, 10 hunks no total (4 em `src/app.js`).

| Arquivo | Natureza | Resolução proposta |
|---|---|---|
| `src-tauri/src/lib.rs`, `window_state.rs` | f1cddd9 já contém o superconjunto (DISPLAY1) | ficar com f1cddd9; descartar o commit `03ca6b8` da AAA |
| `.specs/HANDOFF-RESUMO-CIENTIFICO.md`, `LOOP_BACKLOG.md` | documentos | união dos dois lados |
| `src/i18n/locales/pt-BR/appStats.js` | chaves novas (tendência, evidência, período vazio) | aditivo: manter as duas listas |
| `test/analytics.test.js` | import | adotar a lista da AAA e remover `filterByPeriod` só junto com o código |
| `e2e/feature-parity.spec.js` | f1cddd9 usa `#metric-reviews-done`/Plano; AAA usa `#metric-questions`/`tracking` | ficar com f1cddd9 e acrescentar a asserção nova só se ainda valer |
| `src/analytics.js` | **sobreposição semântica**: f1cddd9 já tem `evidenceInPeriod`/`periodCutoff`/`filterByPeriod`; a AAA define `PERIOD_DAYS`, média agrupada (soma de acertos / soma de questões), "sem evidência" ≠ 0% | decisão técnica após teste de contrato: manter `evidenceInPeriod` único, trazer `periodSubjectRows`, `periodSummary`, `performanceDistribution`, `evolutionSeries` |
| `src/app.js` (4 hunks) | f1cddd9 filtra linhas depois de calcular; a AAA calcula tudo a partir da evidência do período e renderiza cabeçalho e distribuição | adotar o fluxo da AAA; o veredito "estudo funcionando" continua usando todo o histórico válido (já é assim em ambas) |
| `src/styles.css` | f1cddd9 tem estilos de Conta/configurações; a AAA acrescenta tokens de faixa | união; sem sobreposição de seletores |

Pontos que **dependem de aprovação do usuário** (superfície protegida, ADR-0001): o novo cabeçalho/distribuição/tabela de Estatísticas, o rótulo de tendência ("+x p.p."), o texto "Sem questões"/"Nenhuma questão registrada neste período", remoção de `src/stats.js` e `test/analytics-evolution.test.js`. Mudança funcional sem redesign (média agrupada, evidência do período) pode ser aprovada separadamente do visual.

Ordem proposta: (1) portar `periodSubjectRows` & cia com os testes `analytics-period.test.js`; (2) ligar o `app.js`; (3) chaves i18n; (4) estilos; (5) E2E `stats-aaa.spec.js`, `stats-sorting.spec.js`, `study-verdict.spec.js`; (6) captura nativa em três tamanhos e dois temas (`scripts/desktop-stats-capture.mjs`) para revisão visual do usuário.

## Tarefa 5 — `design/unified-experience-20261030` (9 commits) e `perf/e2e-speed-step1`
Conflitos no ensaio contra f1cddd9: `index.html`, `src/app.js`, `src/styles.css`, `e2e/mobile-nav.spec.js`, `.gitignore`.

| Commit | Classe | Encaminhamento |
|---|---|---|
| `1a5d699` unifica navegação, filtros, controles e acessibilidade do tema | **decisão visual de produto** (mexe em menu Mais, tema) | aguardar aprovação; o usuário avisou que a página de Tema foi toda alterada por ele |
| `9c0f08e` separa visualmente destinos de baixa frequência | decisão visual | idem |
| `52f2cde` menu secundário seguro para foco; contrato de identidade da disciplina | correção funcional (foco) + parte visual | reavaliar depois da decisão de navegação |
| `a13f468` foco visível e navegação em 800×600 | correção de acessibilidade | candidato a integração isolada, depende do menu novo |
| `4c9af4c`, `b2b6a3e` testes passam por "Mais" em larguras de celular | testes acoplados à navegação nova | seguem a decisão de navegação |
| `7b08137`, `12833b1`, parte de `3de9bf0` | CI (`.github/workflows/ci.yml`, `test/ci-audit-gates.test.js`) | melhoria técnica independente; integrar em separado com revisão do CI |
| `perf 02e1c6d` (heartbeat e quadro do `test-live`) | melhoria técnica isolada | integrar com medição de antes/depois |
| `perf 706def5` | log do Vite | **não** é ganho de velocidade (a própria mensagem diz 19,0 min contra 16,0 min, uma falha nova) |
| `chatgpt-guard-ci-explicit` (2 commits) | documentos de conclusão autônoma | só registro; baixo valor |

Fluxos aprovados que a proposta precisa preservar: Hoje (cartão de atrasadas agrupado), Plano (UX-1, "Editar questões"), Disciplinas (renomear com Enter/Esc), Tema (combo único Automático/Claros/Escuros), Conta (✓ Conectado).
