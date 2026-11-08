# Engineering repair — candidato isolado, 2026-11-08

Base `1470051`, branch `codex/repair-study-evidence-20261108`, worktree `C:/Projetos/SmartLearn-worktrees/smartlearn-repair-20261108`. Duas correções candidatas concluídas e verificadas localmente; desktop humano e integração no checkout principal não foram validados nem alterados.

## Escopo e reversibilidade

Allowlist: exec_command/apply_patch para preservar o candidato, editar fila/ciclo pendingStudyEvidence, testes, source-openings, uma linha de CODEMAP e este relatório; executar validações isoladas e commits locais com caminhos explícitos. Extensão causal autorizada após revisão: `server/src/services/reviews.js`, `server/src/routes/reviews.js`, `server/test/review-obligations-complete.test.js`, somente para vincular a conclusão à etapa original. Antes de cada comando mutante, Resolve-Path de `.` comparado exatamente com a worktree, abortando em divergência.

Sem dependência instalada, dado humano, IA real/paga, Planban, launcher, hook, migração real, mudança de calendário, push/merge/deploy/release. Dependências existentes reutilizadas por junction. Snapshot inicial mantido localmente neste diretório: `initial-candidate.diff`, `initial-study-evidence-queue.js.txt`, `initial-study-evidence-queue.test.js.txt`. Cópias de recuperação não entram nos commits; base/delta finais ficam no Git.

## Contrato → correção → prova

| Contrato / defeito anterior | Alteração | Evidência |
|---|---|---|
| Reset/novo bloco apagava ou substituía único resultado pendente | Fila por API/conta, payload e chave originais, retries serializados, remoção apenas após confirmação | Unitário e E2E: dois blocos, unidades e acertos diferentes, reload e resposta perdida sem duplicação |
| Uma janela não pode apagar pendência de outra | Chaves separadas por intenção, sem sobrescrever snapshot inteiro | Dois sensores multijanelas reproduziram FAIL antes e PASS depois; confirmação atrasada preserva outra intenção |
| Reenvio não pode concluir etapa posterior | expectedReviewTaskId opcional, verificado atomicamente por owner/unidade/etapa; original concluída exige evidência correspondente | HTTP: replay de R1 no dia de R2 mantém R2 pendente, uma evidência e datas/log imutáveis; divergência, owner e unidade incorretos recusados |
| Chave de source-opening deve representar mesmo fato | Compara sourceId/pageIndex normalizado/context; erro existente com HTTP409 | Replay legítimo, três dimensões de conflito, null/omissão, isolamento por usuário e original intacto |

Durabilidade nova somente para `context: INITIAL_PRACTICE`; revisões continuam em memória por reviewTaskId. Primeiro fechamento experimental mantém DECIDED; replay não repete reagendamento. Clientes sem expectedReviewTaskId preservam o contrato anterior. Plano continua ocultando Estudar agora após INITIAL_PRACTICE.

## Comandos e resultados observados

- `node --test test/study-evidence-queue.test.js`: sensores multijanelas primeiro 4 PASS/2 FAIL; final 7/7 PASS. Teste CAS acrescentado ao endpoint também falhou antes da implementação; combinado com fila, final 13/13 PASS.
- `node --test test/study-evidence-queue.test.js test/codemap.test.js server/test/source-openings.test.js server/test/idempotency.test.js server/test/review-obligations.test.js server/test/review-obligations-complete.test.js server/test/review-obligations-decided.test.js server/test/review-obligations-timeline.test.js`: fila/servidor 37/37 PASS. CODEMAP falhou porque o módulo novo ainda não estava indexado, condição exigida pelo próprio teste.
- Após git add explícito dos arquivos novos: `node --test test/codemap.test.js server/test/reviews.test.js server/test/post-route-idempotency-registry.test.js`: 22/22 PASS. São 59 testes distintos verdes nas duas execuções finais.
- ESLint dirigido aos dez JS alterados, via `node node_modules/eslint/bin/eslint.js ... --max-warnings 0`: PASS. Após o último ajuste de teste, lint da spec repetido: PASS. `git diff --check` e `git diff --cached --check`: PASS.
- `E2E_WORKERS=1 node scripts/e2e.mjs e2e/study-evidence-failure.spec.js e2e/study-retest-network.spec.js e2e/study-resume.spec.js e2e/experimental-obligations.spec.js --retries=0 --global-timeout=240000`: 22 PASS, 1 falha instrumental, 0 flaky/skipped, 92s. O teste exigia nota visível dentro do cartão de resultado oculto durante prática; error-context confirmou a nota is-error existente. Produto preservado.
- Ajustada apenas sincronização do teste por erro efetivo do flush e propriedade hidden da nota: `E2E_WORKERS=1 node scripts/e2e.mjs e2e/study-evidence-failure.spec.js --retries=0 --global-timeout=180000`: 13/13 PASS, 0 flaky/skipped, 46s. Junto aos dez cenários das demais specs já verdes no código final, 23 E2E distintos comprovados.
- `node scripts/check-test-inventory.mjs`: PASS, 337 arquivos; `node scripts/context-check.mjs`: PASS. Sem alteração/gravação de baseline; NO BASELINE em execução focada não é falha funcional.

Prova recebida separadamente do orquestrador: sessão inicial75913 do executor anterior teve 22/22 E2E PASS em84s, exit0. Este executor não conseguia anexar à sessão; o orquestrador coletou a saída. Reexecução posterior justificada pelas mudanças reais na fila/CAS.

## Revisão e limitações

Revisão independente identificou os dois P1 acima e liberou o delta final sem achado material remanescente no escopo. Code Preservation Guard aplicado. Condição intermediária type/context incorreta foi corrigida antes da validação final; E2E de reload protege a integração real. Nenhuma regra global ou memória alterada.

Storage bloqueado/quota excedida impede durabilidade, embora preserve pendências na memória; falha de remoção pode causar replay seguro pela chave original. Revisões em memória não têm promessa de recuperação após reload. Provas web/headless/API com bancos descartáveis; suíte completa, build/release, desktop humano e todas as plataformas não foram executados. Candidato isolado, pronto para revisão humana e eventual integração autorizada.

Commits locais causais: `f65a575` para source-openings; segundo commit reúne fila, guarda de etapa, testes/CODEMAP e este relatório. Snapshots locais não rastreados são intencionais; arquivos de implementação/testes/evidência entregues ficam commitados.
