# Bug Audit — SmartLearn

## Ambiente

- Data: 2026-06-27
- Branch base auditada: `main`
- Branch de trabalho: `audit/hidden-bugs`
- Plataforma: Windows + PowerShell
- Escopo auditado: `src/db.js`, `src/app.js`, `src/stats.js`, `index.html`, `src-tauri/**`, `.specs/project/STATE.md`
- Verificações confirmadas nesta sessão: `npm run test` OK (5 testes), `npm run build` OK, `npm run tauri -- dev` abriu `smartlearn.exe`

## Comandos executados

- `git switch -c audit/hidden-bugs main`
- `Get-Content` nos arquivos críticos do app, banco, runtime Tauri e estado do projeto
- validação de UTF-8 por bytes nos arquivos obrigatórios com `UTF-8` estrito
- `node test/review-score.test.js`
- `node test/review-schedule.test.js`
- `node test/stats.test.js`
- `npm run test`
- `npm run build`
- `npm run tauri -- dev`

## Bugs confirmados

### BUG-003
- ID: `BUG-003`
- Severidade: `M1`
- Área: `review score / autosave`
- Evidência: `src/app.js` calculava percentual diretamente a partir dos inputs e aceitava `correctCount > questionsCount`, o que permitia percentual acima de `100%`.
- Causa raiz: faltava uma regra centralizada de normalização e validação para questões/acertos.
- Impacto: métricas incorretas na revisão e persistência de nota inválida no banco.
- Como reproduzir: abrir uma revisão, informar `Questões = 10` e `Acertos = 15`, sair do campo.
- Correção mínima sugerida: centralizar o cálculo/validação e bloquear persistência quando `Acertos > Questões`.
- Teste necessário: validar cálculo com entrada válida, entrada vazia e overflow.
- Status: confirmado

### BUG-004
- ID: `BUG-004`
- Severidade: `M1`
- Área: `estatísticas`
- Evidência: `src/stats.js` fazia média por disciplina usando média simples de percentuais, sem ponderação por quantidade de questões.
- Causa raiz: a agregação usava percentuais prontos em vez de `totalCorrect / totalQuestions`.
- Impacto: disciplina com revisão curta podia distorcer a média final.
- Como reproduzir: registrar uma revisão com `1/1` e outra com `59/99` na mesma disciplina; a média correta é `60%`, não a média simples dos percentuais.
- Correção mínima sugerida: recalcular médias por soma ponderada de questões e acertos.
- Teste necessário: cenário com duas revisões da mesma disciplina com tamanhos diferentes.
- Status: confirmado

### BUG-005
- ID: `BUG-005`
- Severidade: `M1`
- Área: `autosave / UX de erro`
- Evidência: os autosaves de comentário, status de questões e score não restauravam o valor anterior nem exibiam erro operacional consistente se o `update` falhasse.
- Causa raiz: handlers assíncronos sem rollback visual do estado comprometido.
- Impacto: a interface podia mostrar um valor não persistido e induzir o usuário a erro.
- Como reproduzir: forçar falha em `DB.reviewTasks.update(...)` durante edição de comentário, checkbox ou score.
- Correção mínima sugerida: guardar estado comprometido, restaurar em falha e exibir mensagem discreta no dashboard.
- Teste necessário: simular falha de persistência em cada autosave.
- Status: confirmado

### BUG-007
- ID: `BUG-007`
- Severidade: `M2`
- Área: `testes`
- Evidência: `package.json` não possuía script `test`, o que deixava a suíte criada sem entrada padrão de execução.
- Causa raiz: ausência de convenção mínima de teste no projeto.
- Impacto: validação automatizada inconsistente entre sessões.
- Como reproduzir: executar `npm run test` na base anterior.
- Correção mínima sugerida: adicionar script `test` apontando para o runner nativo do Node.
- Teste necessário: execução da suíte local.
- Status: confirmado

## Bugs prováveis

- Nenhum bug adicional classificado como provável após a auditoria estática e a validação local.

## Bugs descartados na auditoria

### BUG-001
- ID: `BUG-001`
- Severidade: `M0`
- Área: `schema`
- Evidência: `src/db.js` já contém `CREATE TABLE IF NOT EXISTS review_tasks (...)` na branch auditada.
- Causa raiz: relato antigo não corresponde ao estado atual da base.
- Impacto: nenhum no estado atual.
- Como reproduzir: não se aplica nesta base.
- Correção mínima sugerida: nenhuma.
- Teste necessário: `DB.init()` em base limpa.
- Status: descartado

### BUG-002 — Encoding UTF-8
- ID: `BUG-002`
- Severidade: `M0`
- Área: `encoding`
- Evidência: validação por bytes executada em `src/db.js`, `src/app.js`, `index.html` e `.specs/project/STATE.md`; `UTF-8 estrito: OK` em todos; padrões corretos encontrados; padrões corrompidos não encontrados.
- Causa raiz: saída do terminal/PowerShell com mojibake visual, não corrupção real de arquivo.
- Impacto: nenhum no conteúdo dos arquivos auditados.
- Como reproduzir: abrir os mesmos arquivos no terminal com renderização ruim e comparar com a leitura por bytes.
- Correção mínima sugerida: não tratar como bug de arquivo sem evidência por bytes.
- Teste necessário: repetir a validação por bytes ao suspeitar de novo caso.
- Status: descartado

### BUG-006
- ID: `BUG-006`
- Severidade: `M0`
- Área: `persistência / path do SQLite`
- Evidência: `src/db.js` usa `sqlite:smartlearn.db`; o plugin SQL resolve o caminho relativo ao diretório de configuração do app; `src-tauri/src/lib.rs` usa o mesmo arquivo para transações.
- Causa raiz: hipótese de bancos separados não se confirmou com a leitura do código e da documentação do plugin.
- Impacto: nenhum confirmado nesta base.
- Como reproduzir: não se aplica nesta base.
- Correção mínima sugerida: nenhuma.
- Teste necessário: validação runtime em ambiente desktop real já com app aberto.
- Status: descartado

## Riscos

### RISK-001
- ID: `RISK-001`
- Severidade: `M2`
- Área: `segurança frontend`
- Evidência: `src-tauri/tauri.conf.json` mantém `"csp": null`.
- Causa raiz: política de conteúdo não definida.
- Impacto: superfície maior para carregamento indevido de conteúdo no webview.
- Como reproduzir: inspecionar `src-tauri/tauri.conf.json`.
- Correção mínima sugerida: definir CSP mínima compatível com o app e com Vite/Tauri.
- Teste necessário: build e smoke test após restrição da política.
- Status: confirmado

## Correções mínimas recomendadas

- Centralizar regras de score em módulo próprio reutilizado por UI, banco e estatísticas.
- Bloquear persistência de score inválido no frontend e no backend JS do SQLite.
- Tornar autosaves reversíveis em caso de erro, com mensagem visível e sem perder o estado confirmado.
- Formalizar script `test` para reduzir drift entre sessões.
- Planejar uma task separada para CSP mínima do Tauri.

## Ordem de implementação

1. Corrigir score inválido e persistência defensiva.
2. Corrigir estatísticas por média ponderada.
3. Corrigir rollback e feedback de autosave.
4. Formalizar cobertura mínima por testes.
5. Endurecer CSP em task isolada.

## Testes necessários

- Score: `Acertos <= Questões`, `Acertos > Questões`, campos vazios e percentual recalculado.
- Estatísticas: média ponderada geral e por disciplina.
- Autosave: comentário, checkbox de revisão, checkbox de questões e score com falha forçada.
- Runtime Tauri: abrir app desktop, editar revisão e confirmar persistência visual e no banco.
- Segurança: smoke test depois de introduzir CSP.
