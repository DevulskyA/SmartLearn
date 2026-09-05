# SmartLearn Input Integrity v2 — Tasks

**Status inicial:** PLANNED. Tempos são envelopes de planejamento, não garantias. Cada tarefa precisa de prova observável; ao faltar tempo, pausar sem rebaixar qualidade.

## Test Coverage Matrix

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Funções puras | Unitário | Corpus + fronteiras + propriedades | test/*validation*.test.js | `node --test <arquivos confirmados>` |
| Handler/fluxo | Navegador real | Clique único, dupla ativação, erro, reload | Runner existente | Confirmar comando/configuração real em T1; não inventar script |
| Repository/DB | Integração | Ambos adapters, falha e rollback | test/* e testes Rust existentes | `npm test`; `cargo test --manifest-path src-tauri/Cargo.toml` |
| Import/migração | Integração adversarial | v1/v2/v3, integrity e no mutation on error | Testes reais de DB | Teste estreito existente + suite relevante |
| Saída visual | Navegador real | Texto seguro, erro visível, item selecionado | Runner real isolado | Método disponível registrado em T1 |

## Gate Check Commands

Os comandos abaixo existiam no projeto reportado e devem ser conferidos no manifest. Não instalar stack nova de teste sem necessidade demonstrada.

| Gate Level | Use | Command |
| --- | --- | --- |
| Quick | Tarefa | `node --test <teste-da-tarefa>` |
| Full JS | Cluster e closure | `npm test` |
| Full Rust | SQL/transação/migration ou closure afetada | `cargo test --manifest-path src-tauri/Cargo.toml` |
| Build | Candidato estabilizado | `npm run build` |
| Formal | Docs | Scripts da skill TLC realmente instalada, caminhos resolvidos pelo conteúdo da skill |

## Execution Plan

Ordem do escritor principal: T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8. Dois leitores opcionais podem antecipar diagnóstico de T5/T6 enquanto T2/T3 executam, sem alterar arquivos. Nada de três workers editando app.js/db.js.

| Tarefa | Minutos orientativos | Foco |
| --- | --- | --- |
| T1 | 12 | Isolamento e recuperação segura de leitura |
| T2 | 18 | Texto médico, normalização e teste do consumidor |
| T3 | 26 | Salvar aula composto: resolução, dedup e rollback |
| T4 | 12 | UI consistente e rascunho seguro |
| T5 | 12 | Datas, tipos, contagens e configuração |
| T6 | 18 | Importação íntegra e compatibilidade |
| T7 | 10 | Jornadas adversariais e cobertura transversal |
| T8 | 23 | Estabilização e verificação final |

Carga total orientativa da fila: 131 min. O fallback operacional atual é 100 min; a fila é um backlog priorizado, não promessa de caber inteira. Se a janela real for menor, preservar T1 e o espaço final de T8; reduzir tarefas iniciadas, não os sensores. Aos DEADLINE-23min, não iniciar novo cluster. Finalizar/reverter apenas edição desta missão não comprovada em cópia segura; preservar diagnóstico/testes novos relevantes e qualquer mudança anterior do usuário. Nunca `reset --hard`, `clean -fd` ou stash coletivo.

Um bloqueio em validação de um campo permite seguir outro campo independente. Um bloqueio de isolamento suspende qualquer execução que possa gravar, mas permite análise estática. Três falhas da mesma abordagem geram BLOCKED com caso mínimo; nenhum loop infinito. Tarefa parcial não vira DONE.

## Task Breakdown

### T1: Isolamento e recuperação segura de leitura

**What**: Reconciliar HEAD/diff; preservar worktree; fixar deadline. Provar que todo teste aponta para storage temporário. Criar sensor de JSON corrompido em sandbox e impedir emptyState/seed/gravação por erro. Não abrir nem reparar a base principal.
**Where**: `src/db.js` (readState/init), test harness existente; `.specs/STATE.md` Handoff
**Depends on**: none
**Reuses**: fachada DB, módulos puros, testes e runner existentes; nomes exatos confirmados em T1
**Requirement**: AC-001, AC-002, AC-003
**Difficulty**: 5/5
**Timebox orientativo**: 12 min
**Status**: PLANNED

**Done when**:
- [ ] Path protegido rejeitado; storage bruto inválido permanece idêntico após init; nenhum reset ou seed; teste usa readState/init real.
- [ ] Sensor reproduziu falha antes da correção, quando houver bug, e passou após a correção.
- [ ] Nenhum dado real tocado; evidência do gate vinculada ao candidato.

- [ ] Gate passes: comando real da tarefa executado com exit 0 e evidencia registrada.

**Tests**: unit/integration/e2e conforme matriz
**Gate**: full
**Gate details**: Teste Node específico do harness/readState; mutation error->emptyState morre.

### T2: Texto médico, normalização e teste do consumidor

**What**: Inspecionar 1b65836; restaurar o caso literal com travessão, sem apagar bons negativos. Separar família nome/título/texto livre mantendo wrapper compatível. Normalização no ponto compartilhado, não dependente de cada caller lembrar trim. Usar corpus de cases.json.
**Where**: `src/naming-validation.js`, consumidores em `src/app.js`/`src/db.js`, teste(s) de naming existentes
**Depends on**: T1
**Reuses**: fachada DB, módulos puros, testes e runner existentes; nomes exatos confirmados em T1
**Requirement**: AC-004, AC-005, AC-006, AC-007, AC-025, AC-026
**Difficulty**: 3/5
**Timebox orientativo**: 18 min
**Status**: PLANNED

**Done when**:
- [ ] Título literal e símbolos médicos aceitos; vazio/invisível/control-only rejeitado; texto livre preservado; módulo real importado; bypass de caller detectado.
- [ ] Sensor reproduziu falha antes da correção, quando houver bug, e passou após a correção.
- [ ] Nenhum dado real tocado; evidência do gate vinculada ao candidato.

- [ ] Gate passes: comando real da tarefa executado com exit 0 e evidencia registrada.

**Tests**: unit/integration/e2e conforme matriz
**Gate**: full
**Gate details**: Teste(s) naming existentes + casos relevantes; mutation em dash reject e bypass consumer mortos; npm test ao fechar bloco.

### T3: Salvar aula composto: resolução, dedup e rollback

**What**: Estabelecer modo explícito da disciplina. Nome ativo equivalente reutiliza ID; nova disciplina faz parte da mesma operação da aula/revisões. Arquivada/ambígua gera erro orientado. Bloquear dupla submissão. Injetar falha após primeira escrita e provar rollback sem compensação DELETE.
**Where**: `src/app.js` handler Salvar aula, `src/db.js` createWithReviews/subjects; helper puro só se necessário; Rust transação se afetado
**Depends on**: T1, T2
**Reuses**: fachada DB, módulos puros, testes e runner existentes; nomes exatos confirmados em T1
**Requirement**: AC-008, AC-009, AC-010, AC-011, AC-012, AC-013, AC-015, AC-017, AC-028
**Difficulty**: 5/5
**Timebox orientativo**: 26 min
**Status**: PLANNED

**Done when**:
- [ ] Salvar aula sozinho conclui intenção; nenhuma duplicata; estado anterior íntegro em falha; discipline existente nunca apagada; comportamento demonstrado nos dois adapters isolados.
- [ ] Sensor reproduziu falha antes da correção, quando houver bug, e passou após a correção.
- [ ] Nenhum dado real tocado; evidência do gate vinculada ao candidato.

- [ ] Gate passes: comando real da tarefa executado com exit 0 e evidencia registrada.

**Tests**: unit/integration/e2e conforme matriz
**Gate**: full
**Gate details**: Teste de operação pública e transação SQLite real; mutation rollback removido deve falhar; full JS + cargo test ao fechar o bloco se Rust/SQL afetado.

### T4: UI consistente e rascunho seguro

**What**: Após sucesso, atualizar lista/dropdown e selecionar ID real. Tratar filtro que esconderia o item. Adicionar/Salvar não requer passo oculto; usar rótulo Criar disciplina para ação separada se ainda ambígua. Em erro manter rascunho; não recriar após falha de render pós-commit.
**Where**: `src/app.js`, labels mínimos de `index.html` se necessário; teste de navegador existente
**Depends on**: T3
**Reuses**: fachada DB, módulos puros, testes e runner existentes; nomes exatos confirmados em T1
**Requirement**: AC-014, AC-015, AC-016, AC-017, AC-029
**Difficulty**: 3/5
**Timebox orientativo**: 12 min
**Status**: PLANNED

**Done when**:
- [ ] Semiologia Médica e aula aparecem imediatamente; nenhum reload manual necessário; erro mantém título/resumo/seleção; criação manual de disciplina continua válida.
- [ ] Sensor reproduziu falha antes da correção, quando houver bug, e passou após a correção.
- [ ] Nenhum dado real tocado; evidência do gate vinculada ao candidato.

- [ ] Gate passes: comando real da tarefa executado com exit 0 e evidencia registrada.

**Tests**: unit/integration/e2e conforme matriz
**Gate**: full
**Gate details**: Navegador isolado: jornada, filtro ativo, Enter/duplo clique e erro; mutation omitir refresh morta.

### T5: Datas, tipos, contagens e configuração

**What**: Exigir data civil completa/calendário real; inteiro seguro em contagens/IDs; separar ausência de zero. Validar booleans/enums/tipos. Percentual derivado. Converter string apenas na fronteira UI ou formato legado explícito; não com Number(value) indiscriminado.
**Where**: `src/db.js` isValidIsoDate/validateImportContent; módulo puro compartilhado existente; review-score e settings callers afetados
**Depends on**: T1, T2
**Reuses**: fachada DB, módulos puros, testes e runner existentes; nomes exatos confirmados em T1
**Requirement**: AC-018, AC-019, AC-020, AC-021, AC-024, AC-027
**Difficulty**: 3/5
**Timebox orientativo**: 12 min
**Status**: PLANNED

**Done when**:
- [ ] Datas impossíveis/sufixos/frações/boolean/null indevido rejeitados; ausência legítima preservada; casos positivos do corpus passam por caminhos públicos.
- [ ] Sensor reproduziu falha antes da correção, quando houver bug, e passou após a correção.
- [ ] Nenhum dado real tocado; evidência do gate vinculada ao candidato.

- [ ] Gate passes: comando real da tarefa executado com exit 0 e evidencia registrada.

**Tests**: unit/integration/e2e conforme matriz
**Gate**: full
**Gate details**: Node testes por campo + mutation data frouxa e c<-q mortos; regressões analytics/score existentes.

### T6: Importação íntegra e compatibilidade

**What**: Converter shape conhecido uma vez e validar candidato completo antes de gravar. Exigir arrays e campos conforme versão; detectar IDs/referências/duplicatas/provenance. Recalcular cache de score. Sem descartar linhas, resetear banco ou fundir nomes silenciosamente. Reusar contratos de T2/T5.
**Where**: `src/db.js` normalize/assert/buildImportStatements/importAll; fixtures legadas e testes SQLite existentes
**Depends on**: T1, T2, T3, T5
**Reuses**: fachada DB, módulos puros, testes e runner existentes; nomes exatos confirmados em T1
**Requirement**: AC-008, AC-021, AC-022, AC-023, AC-024, AC-027, AC-028
**Difficulty**: 5/5
**Timebox orientativo**: 18 min
**Status**: PLANNED

**Done when**:
- [ ] v1/v2/v3 legítimos preservados; backup inválido deixa estado anterior intacto nos dois adapters; byte bruto original do arquivo de backup não é modificado.
- [ ] Sensor reproduziu falha antes da correção, quando houver bug, e passou após a correção.
- [ ] Nenhum dado real tocado; evidência do gate vinculada ao candidato.

- [ ] Gate passes: comando real da tarefa executado com exit 0 e evidencia registrada.

**Tests**: unit/integration/e2e conforme matriz
**Gate**: full
**Gate details**: Testes de roundtrip/rollback com implementação real; fault injection intermediária em sandbox; full JS + Rust relevante.

### T7: Jornadas adversariais e cobertura transversal

**What**: Executar pelo menos J1–J6 de cases.json. Verificar outputs como texto, contrato de whitespace/Unicode, chamadas diretas e import. Inspecionar diff de testes por falso PASS/copiar lógica. Mutação só em scratch. Se restar tempo, rodar casos opcionais de replay/fuzz sem ampliar feature.
**Where**: Testes existentes, cases.json e fluxos Web; módulos alterados apenas se novo defeito reproduzido
**Depends on**: T1, T2, T3, T4, T5, T6
**Reuses**: fachada DB, módulos puros, testes e runner existentes; nomes exatos confirmados em T1
**Requirement**: AC-025, AC-026, AC-027, AC-028, AC-029, AC-030
**Difficulty**: 4/5
**Timebox orientativo**: 10 min
**Status**: PLANNED

**Done when**:
- [ ] Casos nucleares com log/captura quando útil, sem dados reais. Toda mutação relevante tem teste que a mata; sobrevivente vira tarefa e mantém closure aberta.
- [ ] Sensor reproduziu falha antes da correção, quando houver bug, e passou após a correção.
- [ ] Nenhum dado real tocado; evidência do gate vinculada ao candidato.

- [ ] Gate passes: comando real da tarefa executado com exit 0 e evidencia registrada.

**Tests**: unit/integration/e2e conforme matriz
**Gate**: full
**Gate details**: Runner de navegador já instalado e testes focados; registrar comando real, exit e falha sem fabricar PASS.

### T8: Estabilização e verificação final

**What**: Congelar candidato, executar suites relevantes, Web build e regressões import/migração. Um Verifier separado inspeciona o candidato. Correção posterior de código/testes invalida a parte afetada; revalidar o delta final. Registrar validade de cada runtime por SHA; não instalar Windows na base principal.
**Where**: `validation.md`, Handoff, gates de pacote; Verifier recebe somente contrato/delta/evidências
**Depends on**: T1, T2, T3, T4, T5, T6, T7
**Reuses**: fachada DB, módulos puros, testes e runner existentes; nomes exatos confirmados em T1
**Requirement**: AC-030, AC-031, AC-032
**Difficulty**: 3/5
**Timebox orientativo**: 23 min
**Status**: PLANNED

**Done when**:
- [ ] READY_LOCAL_AUDIT apenas com ACs locais obrigatórios comprovados; senão CHECKPOINT_PARCIAL. Nenhuma tarefa ativa esquecida nem publicação; produto relevante todo em commits coerentes.
- [ ] Sensor reproduziu falha antes da correção, quando houver bug, e passou após a correção.
- [ ] Nenhum dado real tocado; evidência do gate vinculada ao candidato.

- [ ] Gate passes: comando real da tarefa executado com exit 0 e evidencia registrada.

**Tests**: unit/integration/e2e conforme matriz
**Gate**: full
**Gate details**: npm test; cargo test --manifest-path src-tauri/Cargo.toml; npm run build; scripts existentes de E2E e validators canônicos quando disponíveis.

## Backlog seguro se houver folga

Somente após o núcleo: ampliar corpus Unicode/casos de tamanho até limite vigente; propriedade normalize(normalize(x))=normalize(x); roundtrip com texto longo; replay de seed determinístico; coleta de tempos com hardware/ambiente anotados. Adicionar caso apenas quando discriminar algo útil. Sem novos subsistemas, frameworks ou limpeza estética.

## Freedom boundary

Pode escolher solução local melhor, alterar localização de helper ou ordem de tarefas independentes quando demonstrar ganho e preservar ACs. Registrar em duas linhas evidência e impacto. Mudança de requisito, política de nomes preexistentes, migração destrutiva, stack, permissões ou canal de distribuição exige decisão humana. Não pedir decisão humana para fatos que código/configuração esclarecem.
