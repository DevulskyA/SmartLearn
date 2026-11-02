# ESTADO LOCAL — registro de continuidade (2026-11-01)

Não é fonte de verdade: ao retomar, reconcile SEMPRE com o Git local (`git status`, `git log`). Evidências ficam em `ACHADOS-PARCIAIS.md`; não duplicar o backlog aqui.

BRANCH: claude/smartlearn-v1-complete · HEAD no momento do registro: 6f1fe2bd1e212cdd2d054cfc89658f73244074c4 · sem push.

## Provas históricas (não refazer)
- Tema (6f1fe2b): combo único Automático/Claros/Escuros, abre com o tema do Windows, preferência só após escolha explícita, "Sistema" volta ao automático. Provas: teste de tema 13/13, eslint 0, build 0.
- Driver de teste nativo: batch, baseline medida com PERF DEVIATION (exit 5), limite de velocidade, evidência por falha, máscara de senha, lock e limpeza de instâncias. Selftest 21/21; ciclo realista de 16 a 17 lotes, 0 falhas, ~50 s. Cobre D1-05..D1-09 e D1-17.
- A-09 (esperar o evento final do PDF), A-11 (senha no snapshot, instâncias esquecidas), A-12 (janelas de teste na tela esquerda, sem console piscando), A-08 (próxima revisão vencida).
- Fixes de produto: Enter/Esc ao renomear disciplina, quebra de título longo no Plano, rótulo "Revisão em atraso desde {data}".
- Antes disso: E2E 259/0 e jornada nativa 18/18. Os itens "V" de D2 a D5 que esses testes já cobrem não devem ser repetidos.

## Pendências
1. A-02/B01: percentual 2/3 diferente em Plano e Estatísticas (src/app.js:1594 ainda usa toFixed(0)).
2. A-04/B02: aviso de tela antigo em outro contexto (reproduzir primeiro).
3. D1-19/B03: editar questão depende da tela oculta #register (confirmar no HEAD).
4. A-13 (relatado pelo usuário): tela Conta logada deixa campos de senha abertos. Esperado: estado "conectado" claro e formulário de senha só atrás de um botão. O usuário estuda medicina, não computação.
5. A-14/B24/G-12: o app abre na tela 2 em vez da tela 1. A correção existe na branch fix/window-opens-on-primary-monitor (c65f53e), não integrada; precisa de prova em tela real e autorização do usuário.
6. Só se a jornada real reproduzir: B06, B07, B13, B12; D1-10/D1-11 (lotes B07/B08).

## Decisões humanas
DEC-P01 (desfazer revisão), DEC-P02 (data da aula), G-01/G-02 (estudo e validação médica humanos), G-03 (IA paga), G-11 (excluir C:\c\).

## Regras em vigor
Sem push, merge, deploy ou IA paga; dados humanos intocados (nunca abrir C:/Users/Ariel/SmartLearn-DevData); todo teste tem tempo medido; todo erro vai para .specs/evidence/ui-funcional-2026-11-01/ACHADOS-PARCIAIS.md (A-13 e A-14 já registrados); abrir o app nativo na tela 1 (DISPLAY1) e o login de dev é feito pelo agente.

## Pedido
Use isto como fonte e não refaça verificações já provadas. Se discordar de algum item, aponte com arquivo:linha ou comando.

## Fechamento inesperado do app nativo (A-15)
O launcher oficial terminou com código 0, sem processo `smartlearn.exe` residual e sem causa identificada. Não atribuído ao usuário sem evidência.
