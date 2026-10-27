# Auditoria V2 — Checkpoints 3 e 4: aprendizagem/UX e veredito da V1 (2026-10-27)

Base: `30b7159` (candidato `5cf864f` + correções 2a–2c da auditoria). Branch `claude/audit-v2-5cf864f`, sem merge em `main`.

## Marco 3 — aprendizagem, estatísticas, experiência
| Pergunta | Resultado | Prova |
|---|---|---|
| Calendário de revisões consistente? | Sim: 16 offsets fixos, aritmética UTC de dias, data inválida rejeitada | `reviews`, `review-obligations*` (99 testes de aprendizagem/estatística, 99/99) |
| Resultados medem o desempenho observado? | Sim: evidência separa independente / assistida / desconhecida, sem veredito de domínio; `correctCount ≤ questionsCount` validado | `evidence-profile`, `evidence`, `priorities`, `result-reconciliation` |
| Evidência insuficiente ≠ dificuldade real? | Sim, após correção abaixo (antes: parcial). Prioridades (servidor) e tendências exigem ≥10 questões e dizem "insuficiente". **A cor/faixa de desempenho por disciplina e unidade não**: 0/1 questão aparece vermelha como 0/200 (a contagem de questões aparece ao lado) | leitura de `performance-thresholds.js`/`analytics.js`/`app.js`; sonda: `performanceColor(0, 1)` = vermelho |
| Navegação ao próximo conteúdo; tamanhos e temas | Sem falha: 38/38 E2E (Hoje, prioridades, drill-down de estatísticas, nav móvel, editor 360/768/1280, axe em temas, atalhos de teclado) | `npm run test:e2e` 8 specs, 2,1 min |
| Feedback sem desmotivar artificialmente | Sem achado novo; não há teste de redação do feedback | NÃO VERIFICADO |
| Desempenho sob carga | Não medido nesta auditoria | NÃO VERIFICADO |

### Correção aplicada (commit seguinte a `eaf0ffb`)
`performanceColor` fica neutra abaixo de `MIN_SAMPLE_QUESTIONS` (10), igual a servidor e tendências; a constante do cliente é fixada por teste contra a do servidor. Três testes antigos afirmavam "cor não depende do volume": a intenção (volume grande não tinge a cor) segue valendo **a partir de 10 questões** e eles foram reescritos nesse limite; um teste novo fixa 0/1 e 100/9 = neutro e 0/10 = vermelho. Reversível em 1 linha. Prova: 68/68 (cliente), 16/16 (servidor), eslint limpo, E2E de estatísticas/prioridades/product-value 12/12.

## Marco 4 — fechamento técnico e veredito
### Provas no candidato final `30b7159`
- Jornada: draft-acceptance, student-journey, product-value, content-quality-flow → **12/12** (reexecutado após a correção 2c); study-resume e restore-backup 7/7 em `5cf864f` (sem alteração em seu caminho).
- Servidor dirigido: 86/86 (auditoria) + 58/58 (procedência/aceite) + 99/99 (aprendizagem/estatística); raiz 28/28; eslint limpo.
- Prova anterior de suíte completa: 358/0/2 em `1967909` (anterior às fatias de i18n; não reexecutada, a superfície alterada pela auditoria é pequena e coberta acima).

### Correções da auditoria (todas publicadas)
2a `e8c1449` negação perdida/inventada (HIGH) · 2b `75e27ab` robustez (par de sentenças, só negadores explícitos, sem reparo automático, títulos legíveis) · 2c `30b7159` pergunta humana ≠ `AI_GENERATED`.

### Compatibilidade com outras branches (somente leitura, `merge-tree`, nada integrado)
| Branch @ SHA | À frente | Conflitos com o candidato |
|---|---|---|
| `v1-window-memory-product` @ `ecc2f32` | 3 | `scripts/desktop-study-journey.mjs`, `scripts/window-rect.ps1`, `src-tauri/src/lib.rs`, `src-tauri/src/window_state.rs` |
| `stats-aaa-6405e1` @ `38278f5` | 10 | `src/app.js`, `src/i18n/locales/pt-BR/appStats.js`, `.specs/LOOP_BACKLOG.md`, `.specs/HANDOFF-RESUMO-CIENTIFICO.md` |
Nenhuma integra limpo. Integrar exige resolução manual e nova regressão; decisão do dono.

### Consolidação
- **Capacidades comprovadas (automático):** PDF → rascunho auditado → aceite humano → Resumo → estudo → prova → Estatísticas; persistência após reload/queda de rede/restauração; auditoria determinística de contradições, números, unidades, qualificadores e negação; original preservado após reparo; procedência por pergunta; aceite bloqueado por achado HIGH não decidido; acessibilidade e responsividade nas telas principais.
- **Falhas bloqueantes conhecidas:** nenhuma.
- **Riscos residuais:** heurística de negação sem taxa de falsos positivos em texto médico real; exercício aceito não distingue "IA revisada por humano"; remoto desatualizado (ver abaixo).
- **Evidência que falta:** reinício real do desktop (WebView2/Tauri) neste SHA; capturas nativas; geração real com modelo (paga, não executada); validação médica humana do conteúdo; desempenho sob carga; redação do feedback.
- **Condições para integrar/disponibilizar a V1:** (1) validação nativa neste SHA; (2) revisão médica humana de amostra de lições; (3) push de `figure-width` (11 commits locais) e V1 remota (`ed15172` vs local `ecc2f32`); (5) decidir integração com as duas branches acima.

## VEREDITO: **PRONTA PARA VALIDAÇÃO HUMANA** (com ressalvas)
Sustentado por: nenhuma falha bloqueante reproduzida; jornada, aprendizagem, acessibilidade e responsividade verdes no candidato; lacunas de integridade médica encontradas na auditoria foram corrigidas. **Não** é aprovação médica nem humana: testes automatizados não substituem validação de conteúdo clínico nem a jornada nativa. Vira NECESSITA CORREÇÕES se a validação humana reprovar conteúdo, ou BLOQUEADA se a jornada nativa falhar neste SHA.

## Decisões tomadas por delegação do usuário ("tomando as melhores decisões por mim", 2026-10-27)
| Item | Decisão | Motivo |
|---|---|---|
| Integrar `v1-window-memory-product` (`ecc2f32`) e `stats-aaa-6405e1` (`38278f5`) | **Não integrar** | Conflitos reais (4 arquivos cada, incluindo `src/app.js` e Rust); integração é merge de trabalho alheio, proibida pela missão, e exigiria nova regressão. Ordem sugerida ao dono: primeiro window-memory (isolado em Rust/scripts), depois stats-aaa resolvendo `app.js`/`appStats.js`. |
| Push de `claude/smartlearn-v1-complete` (129 commits à frente do remoto) | **Não fazer** | É a linha de release, não o candidato auditado; publicá-la sugeriria que foi auditada. Decisão de lançamento do dono. |
| Push de `claude/smartlearn-figure-width` (avanço puro, 11 commits) | **Tentado e bloqueado** pelo classificador de permissões da sessão | Para liberar: regra de permissão `git push` no settings do Bash, ou rodar `git push origin claude/smartlearn-figure-width` no terminal. Os mesmos commits já estão publicados como ancestrais de `claude/audit-v2-5cf864f`. |
| Jornada nativa descartável em `4f6723a` | **Tentada e bloqueada** pela salvaguarda do projeto `SMARTLEARN_WRONG_WORKTREE` (build DEV só em `claude/smartlearn-v1-complete`) | Não burlada. Para fechar: trazer o candidato para um checkout em `v1-complete` (decisão de integração do dono) e rodar `npm run build`, `npm run package:standalone`, `cargo build` e `node scripts/desktop-study-journey.mjs`. |
