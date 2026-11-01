# Achados parciais (J00, J07) — rodada em lote, app nativo isolado

Instrumento validado antes (auto-teste 11/11). Itens abaixo foram repetidos; erros causados pelo driver já foram descartados (ver `descartado-rodada1/`).

| ID | Jornada | Observado | Gravidade | Situação |
|---|---|---|---|---|
| A-01 | J00 | Criar conta e Entrar levam ~840 ms cada (servidor local) | atrito | medido |
| A-02 | J00/J07 | Mensagens antigas ("Ainda não há evidência…", "Apagar todos os dados ainda não é uma operação suportada…") continuam na região de avisos em todas as telas | P2 | a confirmar em J12 |
| A-03 | J07 | Título com `<b>x</b>`, aspas e emoji é guardado e exibido como texto literal (correto) | OK | passou |
| A-04 | J07 | Título de 300 caracteres é aceito e estoura a linha da lista (sem truncar) | P2 (atrito) | a confirmar no print `prints/J07-estado-final.png` |
| A-05 | J07 | Aula com data no passado (2026-10-20): salvar não completou no lote; investigar com o formulário aberto | pendente | reexecutar |

Pendentes de execução em lote: J01–J06, J08–J16 (roteiros a partir dos ids estáveis: `#plan-*`, `#account-*`, `#sources-*`, `#stats-*`, `#generation-language-*`). Limites: diálogos nativos do sistema e redimensionamento de janela não são controláveis.
