# Resumo Mestre: abre em leitura, edição iniciada pelo usuário (desenho, não aplicado)

Pedido: "Leitura: nenhuma barra de edição permanente, alça ou sintaxe técnica. Edição: somente os controles necessários, surgindo no contexto. Imagens: mover e redimensionar diretamente. Não criar novos motores."

## Menor mudança que cumpre (reutiliza o editor Tiptap; sem motor novo)
1. `createVisualSummaryEditor(textarea, { ..., startReading })`: o editor nasce com `editor.setEditable(false)` (mesmos nós, mesma renderização de fórmulas, tabelas e figuras que o aluno vai editar: a leitura é fiel ao que ele edita).
2. Em leitura: barra de ferramentas `hidden`; alças de redimensionar escondidas (`ResizableNodeView` só ativa com editor editável: conferir `isEditable`); clicar em fórmula NÃO abre o campo (guarda `if (!ed.isEditable) return` em `startEdit`); clicar na figura continua ampliando (visualizador existente).
3. Um botão primário "Editar resumo" (no lugar do seletor Visual/Código-fonte, que só aparece editando). Ao clicar: `setEditable(true)`, mostra barra e seletor, foco no texto. Botão "Concluir edição" (secundário) volta à leitura após `flush()`; se o editor estiver bloqueado (`isBlocked()`), mantém o aviso e a confirmação já existentes.
4. Autosave, cópia local, bloqueio por conversão infiel, "Salvar resumo": inalterados (o editor só fica não editável, os dados não mudam).
5. Reversível por um ponto: constante `SUMMARY_OPENS_IN_READING = true` em `src/summary-toolbar.js`; preferência `smartlearn.summary-start = 'edit'` (localStorage) faz abrir editando, que é como os testes antigos continuam funcionando (init script em `e2e/support/session.js`, igual ao que já existe para `summaryMode`).

## Onde (arquivos)
- `src/summary-toolbar.js` (`createModeSwitch`, `show`, `setMode`, `readMode`): estado `reading` + botões "Editar resumo"/"Concluir edição".
- `src/summary-visual-editor.js`: opção `startReading`, `setReading(bool)` exposto, guardas de `startEdit`, esconder `toolbar` (`toolbar.hidden`).
- `src/styles.css`: nenhum estilo novo além de `hidden`; o botão reutiliza `.primary-button`/`.secondary-button`.
- Plano (resumo expandido) usa o mesmo `createSummaryAuthoring`: herda sem trabalho extra.

## Testes
- Novos (`e2e/summary-reading.spec.js`): abre sem barra nem alça; clicar fórmula não abre campo; clicar figura amplia; "Editar resumo" mostra barra e permite digitar; "Concluir edição" volta à leitura e o texto salvo é o mesmo; reabrir volta em leitura.
- Existentes: `signInRegistered` ganha `summaryStart: 'edit'` por padrão (opt-out para os novos).
- Jornada: passo 21/23 clica "Editar resumo" antes de editar.

## Riscos
- Muitos specs interagem direto com o editor: o init script de preferência evita reescrevê-los.
- `ResizableNodeView` com `isEditable=false`: confirmar que as alças ficam inertes (senão `display:none` via CSS `.summary-visual[data-reading] [data-resize-handle]`).
