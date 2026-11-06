# Fluxo de teste no Desktop Windows nativo, em instância isolada (aprovado em 2026-10-17)

Autoridade: o Git e os testes vencem este arquivo. Ele registra COMO se testa; o estado do produto está em `STATE.md` e `LOOP_BACKLOG.md`.

## Princípio
Usar a menor capacidade suficiente para produzir o melhor resultado comprovável, sem limitar a inteligência do agente nem sua liberdade de execução. Não transferir ao usuário testes que os agentes conseguem executar.

## Divisão por modelo
- **Haiku, esforço médio:** executa testes de interface, observa comportamento e coleta evidência. Só roda e relata (totais, falhas, saída filtrada).
- **Sonnet, esforço alto:** raciocínio complexo, diagnóstico de falhas, decisões técnicas e correções não triviais; constrói a infraestrutura de teste e commita.
- **Quem coordena:** verifica commits, diff, lint e o conteúdo do relatório sem refazer o trabalho. Em trabalho misto, cada responsabilidade vai ao modelo adequado; escalar só quando a complexidade real justificar. Não trocar modelo ou esforço em silêncio.

## O instrumento
`scripts/desktop-study-journey.mjs` (jornada de 20 passos; o 19º confere o PDF original aberto DENTRO da janela e o 20º o "Revisão feita" da Hoje (conclui uma vez, sai das vencidas, evidência honesta, desmarcar e marcar de novo não duplica); `SL_JOURNEY_SHOTS=<pasta>` salva uma captura por passo) e `scripts/desktop-smoke-import-verdict.mjs`: abrem o `smartlearn.exe` real (Tauri + WebView2) e o dirigem por CDP.
- **Isolamento obrigatório:** banco, fontes, `WEBVIEW2_USER_DATA_FOLDER`, portas e porta CDP descartáveis em `%TEMP%`; binário próprio (`CARGO_TARGET_DIR` fora das worktrees). Os scripts recusam o datastore humano e um exe já em execução.
- **Nunca** reiniciar, reconstruir sobre ou escrever no app aberto do usuário nem em `SmartLearn-DevData`; construir e testar em outra worktree.
- **Sem modelo real:** o rascunho vem do provedor falso do servidor; chamada real exige autorização específica.
- **Identidade da build por conteúdo** (`inputsHash`), com o commit gravado sendo o HEAD ou um ancestral dele.

## Reexecução (cerca de 1,5 min após a build)
1. `$env:SMARTLEARN_BUILD_MODE='DEV'; npx vite build`
2. `node scripts/package-standalone.mjs` (em worktree com `node_modules` por junção, ver a nota abaixo)
3. `cd src-tauri; $env:CARGO_TARGET_DIR="$env:LOCALAPPDATA\Temp\sl-split-fatia2-target"; cargo build`
4. `$env:CARGO_TARGET_DIR=...; node scripts/desktop-study-journey.mjs` (uma linha de JSON; saída 0 só se os 18 passos passam)

## Regras de qualidade da prova
- **Verificação independente:** um segundo executor repete a jornada. Foi assim que se achou um defeito do próprio script que o 18/18 do autor não mostrava.
- **Prova discriminante:** reverter a correção, ver o passo certo falhar, restaurar e ver passar (corrida revelar → julgar, passos 12 e 14).
- **Um escritor por arquivo e por worktree.** Os demais agentes só leem.
- **Poupar tokens:** saída filtrada (totais e falhas), sem captura de tela, sem repetir suíte sem hipótese nova, espera bloqueante em vez de turnos vazios.
- **Honestidade de evidência:** separar executado, relatado e não comprovado; nunca chamar uma falha de ambiental sem prova.

## Armadilhas conhecidas
- `npm run build` recusa qualquer branch que não seja `claude/smartlearn-v1-complete` (usar `npx vite build` em outra worktree).
- `package-standalone` copia como link o `node_modules` ligado por junção; em worktree com junção, forçar a cópia real (dereference) ou construir numa árvore normal.
- Arquivo gravado pelo PowerShell traz BOM: removê-lo antes de `JSON.parse`.
- Um `npm test` interrompido pode deixar um backend órfão na porta 13907 e fazer `dev-lock.test.js` falhar; encerrar só o que a própria execução iniciou.

## Velocidade: regra e prova (2026-11-01)
- **Incidente:** uma rodada de teste funcional levou ~25 min por 7 jornadas. Causa medida (nenhuma mudança de compilador ou de configuração de build desde 2026-10-25): o Haiku operava a UI comando a comando; cada chamada de modelo custa ~3 s e ~10 mil tokens (benchmark: 8 chamadas = 34 s), enquanto o comando do driver custa 4-370 ms. O mesmo teste de 8 passos num único `batch` levou 1,4 s. Um id de controle velho ainda esperava 6 s de timeout, e o agente repetia.
- **Regra:** o Haiku EXECUTA UM SCRIPT OU UM LOTE (como `desktop-study-journey.mjs`: ~1,5 min, uma chamada), nunca opera clique a clique. Jornadas manuais com `scripts/zz-ui-driver.mjs` viram arquivo de lote (`batch <arquivo>`, uma linha por comando, `# keep-going` na 1ª linha para não parar no primeiro erro), rodado em UMA chamada; só o último `snap` imprime inteiro.
- **Travas no código:** timeout de ação 2,5 s; id velho falha em ~0,2 s com a causa; log por comando em `%TEMP%\sl-ui-driver.log` (hora, ms, ok/ERR); aviso `SPEED WARNING` com 8 ou mais chamadas soltas em 60 s.
- **Saúde do instrumento antes de delegar:** `snap` e um `batch` de 8 linhas devem fechar em menos de 3 s no total.
- **Prova das travas:** `node scripts/zz-ui-driver-selftest.mjs` (driver ligado) deve dar 9/9.
- **Todo teste tem tempo medido:** `batch <arquivo> --record` grava tempo e número de passos de uma execução limpa em `lotes/baseline.json`; as execuções seguintes comparam e acusam `PERF DEVIATION` (saída 5) se o tempo sair de [0,5x − 0,5 s, 1,5x + 0,5 s] ou o número de passos mudar, e `NO BASELINE` se o teste nunca foi medido. Mais lento ou mais rápido que o normal é problema a investigar antes de confiar no resultado.
- **Todo erro é registrado na hora**, também os da interface e os do próprio instrumento: `.specs/evidence/ui-funcional-2026-11-01/ACHADOS-PARCIAIS.md`.
