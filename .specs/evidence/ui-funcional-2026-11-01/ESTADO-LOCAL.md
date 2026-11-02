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

## Pendências
1. Prova nativa (Tema, Conta, Editar questões, Desfazer conclusão) após o E2E completo.
2. Só se a jornada real reproduzir: B06, B07, B13, B12; D1-10/D1-11 (lotes B07/B08); A-16 se ACCESS-3 repetir.
3. Resto da branch fix/window-opens-on-primary-monitor: decisão do usuário.

## Decisões humanas
DEC-P02 (data da aula), G-01/G-02 (estudo e validação médica humanos), G-03 (IA paga), G-11 (excluir C:\c\).

## Regras em vigor
Sem push, merge, deploy ou IA paga; dados humanos intocados (nunca abrir C:/Users/Ariel/SmartLearn-DevData); todo teste tem tempo medido; todo erro vai para .specs/evidence/ui-funcional-2026-11-01/ACHADOS-PARCIAIS.md (A-13 e A-14 já registrados); abrir o app nativo na tela 1 (DISPLAY1) e o login de dev é feito pelo agente.

## Pedido
Use isto como fonte e não refaça verificações já provadas. Se discordar de algum item, aponte com arquivo:linha ou comando.

## Fechamento inesperado do app nativo (A-15)
O launcher oficial terminou com código 0, sem processo `smartlearn.exe` residual e sem causa identificada. Não atribuído ao usuário sem evidência.
