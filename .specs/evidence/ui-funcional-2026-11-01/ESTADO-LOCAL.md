# ESTADO LOCAL — registro de continuidade (2026-11-01)

Não é fonte de verdade: ao retomar, reconcile SEMPRE com o Git local (`git status`, `git log`). Evidências ficam em `ACHADOS-PARCIAIS.md`; não duplicar o backlog aqui.

BRANCH: claude/smartlearn-v1-complete · HEAD no momento do registro: 6f1fe2bd1e212cdd2d054cfc89658f73244074c4 · sem push.

## Provas históricas (não refazer)
- Tema (6f1fe2b): combo único Automático/Claros/Escuros, abre com o tema do Windows, preferência só após escolha explícita, "Sistema" volta ao automático. Provas: teste de tema 13/13, eslint 0, build 0.
- Driver de teste nativo: batch, baseline medida com PERF DEVIATION (exit 5), limite de velocidade, evidência por falha, máscara de senha, lock e limpeza de instâncias. Selftest 21/21; ciclo realista de 16 a 17 lotes, 0 falhas, ~50 s. Cobre D1-05..D1-09 e D1-17.
- A-09 (esperar o evento final do PDF), A-11 (senha no snapshot, instâncias esquecidas), A-12 (janelas de teste na tela esquerda, sem console piscando), A-08 (próxima revisão vencida).
- Fixes de produto: Enter/Esc ao renomear disciplina, quebra de título longo no Plano, rótulo "Revisão em atraso desde {data}".
- Antes disso: E2E 259/0 e jornada nativa 18/18. Os itens "V" de D2 a D5 que esses testes já cobrem não devem ser repetidos.

## Feito depois de 6f1fe2b (commits locais, sem push; HEAD 96f2e47)
- A-13 fe4720d: Conta logada mostra "conectado"; senha atrás do botão "Alterar senha".
- A-02 91fe3d9: percentual com uma casa decimal igual em Plano e Estatísticas.
- A-04 b6b53a0: aviso de sucesso some ao sair da tela; erros ficam.
- B03 0348c3d: botão "Editar questões" no Plano.
- A-14 0b6e175: primeira execução centraliza a janela na DISPLAY1 (só essa regra; c65f53e não integrada por conflito, 050985f).
- J02 96f2e47: botão "Desfazer conclusão" em revisão feita (DEC-P01).
- Provas: unit 860/860, lint 0, build ok, tema 13/13, Rust window_state 11/11, grupos E2E focados verdes. E2E completo em HEAD 96f2e47 em andamento. NÃO provado na janela nativa: A-04, B03, J02, A-14.

- E2E completo em 96f2e47: 372 ok, 4 falhas (A-17: 3 testes de tema e UX-1, testes velhos). Corrigidos em c9f797d (14/14 nas duas specs). Novo E2E completo em c9f797d iniciado, resultado em $TEMP/e2e-full2.log.
- Ciclo nativo isolado (zz-ui-full.sh) NÃO rodou: o driver recusa quando o smartlearn.exe do usuário (PID 24480, build antigo) está aberto; o classificador de permissão bloqueou fechá-lo. Nada foi derrubado.
- O usuário avisou (2026-11-02) que a página de Tema foi toda alterada por ele: não mexer em tema. c9f797d tocou e2e/theme.spec.js (combo #theme-select); pode precisar refazer junto com a versão nova dele.

## Pendências
1. Prova nativa (Conta A-13, Editar questões B03, Desfazer J02, aviso A-04, tela 1 A-14): exige fechar o app aberto do usuário ("pode fechar") e rodar `bash scripts/zz-ui-full.sh`. Tema: aguardar a versão do usuário.
2. NOVA TAREFA (pedido do usuário, 2026-11-02): o aluno precisa poder DISPENSAR revisões, principalmente quando há muitas pendentes (ex.: 7 de uma mesma aula; o dev data mostra 36 vencidas em 10 conteúdos). Proposta a validar: ação "Dispensar" por revisão e por conteúdo (todas as vencidas daquela aula), motivo opcional, reversível ("Desfazer dispensa"), auditada, NÃO conta como feita nem entra em desempenho/evidência, some da fila de Hoje. Decidir o efeito sobre as etapas seguintes (R+1...) antes de implementar; é regra de produto de repetição espaçada, não só UI.
3. NOVA TAREFA (pedido do usuário, 2026-11-02, tela Materiais > "Documentos já enviados"): decisão vigente = o app NÃO guarda os livros; ele aponta para o arquivo onde estava. Falta deixar isso claro e tratar o arquivo movido/apagado, que o software não detecta sozinho. Proposta a validar: (a) texto curto na tela dizendo que o PDF precisa ficar na pasta original; (b) ao abrir, checar se o arquivo ainda existe e, se não, dizer "Arquivo não encontrado em <pasta>" com o botão "Localizar arquivo" (escolher o novo caminho, conferido por tamanho, hash e nº de páginas contra o registrado); (c) marcar o documento na lista como "arquivo ausente" para o aluno ver antes de clicar. Aulas e resumos já criados continuam válidos sem o PDF.
4. Só se a jornada real reproduzir: B06, B07, B13, B12; D1-10/D1-11 (lotes B07/B08); A-16 se ACCESS-3 repetir.
3. Resto da branch fix/window-opens-on-primary-monitor: decisão do usuário.

## Decisões humanas
DEC-P02 (data da aula), G-01/G-02 (estudo e validação médica humanos), G-03 (IA paga), G-11 (excluir C:\c\).

## Regras em vigor
Sem push, merge, deploy ou IA paga; dados humanos intocados (nunca abrir C:/Users/Ariel/SmartLearn-DevData); todo teste tem tempo medido; todo erro vai para .specs/evidence/ui-funcional-2026-11-01/ACHADOS-PARCIAIS.md (A-13 e A-14 já registrados); abrir o app nativo na tela 1 (DISPLAY1) e o login de dev é feito pelo agente.

## Pedido
Use isto como fonte e não refaça verificações já provadas. Se discordar de algum item, aponte com arquivo:linha ou comando.

## Fechamento inesperado do app nativo (A-15)
O launcher oficial terminou com código 0, sem processo `smartlearn.exe` residual e sem causa identificada. Não atribuído ao usuário sem evidência.

## Achados de 2026-11-02 sobre as duas tarefas novas (antes de implementar)
- Dispensar revisões: JÁ EXISTE um mecanismo, o experimento HG-09 (D-12/D-13/D-14): pausar/retomar as revisões de um conteúdo (`review_unit_pauses`, migration 035, rotas `/v1/review-obligations/:unitId/pause|resume`, UI em `src/experimental-obligations-ui.js`). Fato do aluno, só acrescenta eventos, não completa nem re-data nada e não conta como aprendizado. A migration 035 só vale para banco descartável: levar ao banco humano é decisão e dado do usuário. Não criar um segundo mecanismo; a tarefa é promover o HG-09 para a tela Hoje (botão "Dispensar" por conteúdo quando houver muitas vencidas, com "Retomar"), depois da autorização do usuário para migrar.
- PDF movido (Materiais): CONFLITO com o código. O app hoje GUARDA uma cópia verificada do PDF (`server/src/services/source-storage.js`, `/v1/sources/:id/file`, pasta SOURCES_DIR) e "Abrir o PDF original, página N" depende dela. O usuário diz que decidimos não armazenar os livros; essa decisão não está registrada em `.specs`. Opções: (A) manter a cópia e só avisar na tela; (B) deixar de guardar a cópia e referenciar o caminho original, com "arquivo não encontrado" e "Localizar arquivo". B muda modelo de dados e quebra as citações com página. Recomendação: A agora, B só com decisão explícita do usuário.
- Atualização (2026-11-02, depois de 09d5892): a pausa (dispensar) JÁ funciona de ponta a ponta em banco descartável: Configurações > interruptor experimental mostra o painel em Hoje, "Pausar" tira o conteúdo da lista e "Retomar" volta; `e2e/experimental-obligations.spec.js` 1/1 verde (12,5 s). Para o banco humano falta só incluir a migration 035 no `server/migrations/manifest.json` (hoje fora do manifesto) e decidir se o painel sai de "experimental". Isso mexe no banco humano: decisão do usuário.
- PDF: decisão A aplicada em 09d5892 (texto em Materiais; reversível por git revert).
