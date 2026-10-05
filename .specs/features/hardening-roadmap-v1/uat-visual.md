# Roteiro de validação visual humana (≤ 15 min) — T-F4-01

Quem executa: a pessoa que usa o app. Como: `npm run dev:desktop` (única entrada; confira em Configurações > Sobre: versão `0.1.0`, canal DEV, commit = o do checkpoint). Nenhum passo gera conteúdo com IA nem altera dados de forma irreversível (os passos de edição usam o rascunho do Costanzo; "Salvar" é reversível reeditando).
Registro: para cada passo, responda **claro? confortável? o que incomodou?** (uma linha). Cada incômodo vira um achado F-xx priorizado (P0 perda/risco · P1 invalida o trabalho · P2 fricção · P3 melhoria). `VISUAL_VALIDATION` só vira `PASS` por declaração sua.

| # | Tela / ação | Resultado esperado | Claro? | Confortável? | O que incomodou |
|---|---|---|---|---|---|
| 1 | Abrir o app | Entra logado (sessão DEV persistente), sem tela branca; rodapé mostra versão/commit | | | |
| 2 | Configurações > Sobre | Versão 0.1.0, canal DEV, build/commit do checkpoint | | | |
| 3 | Hoje | Uma ação principal clara; revisões vencidas listadas sem parede de itens expandidos | | | |
| 4 | Plano | Unidades legíveis em 1 linha de identidade + título completo; detalhe abre/fecha | | | |
| 5 | Estatísticas (Por disciplina / Por conteúdo) | Tabelas legíveis; ordenar por coluna; filtro de período no cabeçalho | | | |
| 6 | Disciplinas | Cartões com faixa de cor; criar/editar sem erro | | | |
| 7 | Materiais | "Rascunhos em andamento" visível sem rolar muito; busca de tópicos funciona | | | |
| 8 | Abrir o rascunho "Glomerular Filtration" | Editor com abas Resumo / Questões / Fonte / Revisão; só a aula aberta aparece | | | |
| 9 | Aba Questões: editar uma questão e salvar | Confirmação perceptível ("salvo"); recarregar (F5) mantém a edição | | | |
| 10 | Aba Questões: rejeitar uma questão | Some do aceite; recarregar mantém rejeitada | | | |
| 11 | Aba Fonte | Nomeia o documento e as páginas da unidade | | | |
| 12 | Aba Revisão | Achados ordenados por gravidade, sem parede de alertas; texto explica o que olhar | | | |
| 13 | Redimensionar a janela (largo → ~800 px → estreito) | Lista e editor empilham sem rolagem horizontal; nada cortado | | | |
| 14 | Teclado: Tab pelas abas e por uma questão | Foco sempre visível; ordem lógica | | | |
| 15 | Fechar o app e reabrir | Mesmo estado (sessão e dados) | | | |

Fronteira de autonomia: os passos MECÂNICOS (1, 2, 9, 10, 11, 15 — abre, build/commit, salvar/rejeitar e recarregar, fonte nomeada, restart mantém estado) podem ser provados sem humano por CDP/Desktop quando o runtime permite, e não são HUMAN_GATE. Somente o JULGAMENTO PERCEPTIVO (colunas "Claro?" e "Confortável?", e os passos 3–8, 12–14) é HUMAN_GATE. Os resultados esperados dos passos 7, 12, 13 e 14 descrevem alvos de F4 (T-F4-02..05); o roteiro só faz sentido após essa fase local (S5), e T-F4-02 depende de T-F2-03/HG-02.

Ao terminar: envie a tabela preenchida (ou só os incômodos). Os achados P0/P1 são corrigidos antes do checkpoint F4; P2/P3 entram priorizados no ledger.
