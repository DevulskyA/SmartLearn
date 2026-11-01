# Achados — teste funcional em lote, app nativo isolado (2026-11-01)

Instrumento: `scripts/zz-ui-driver.mjs` em modo `batch` (auto-teste 12/12). Lotes em `lotes/`. Erros causados pelo driver foram descartados e corrigidos antes (ver `descartado-rodada1/`).

## Log por jornada
| Jornada | Resultado | Observação |
|---|---|---|
| J00 Preparação | PASSOU | 23 linhas, 2,6 s; senha curta/e-mail inválido: validação sem erro de console |
| J02 Hoje | PASSOU COM RESSALVAS | "Revisão feita" conclui (vencidas 2→1, "1 feita"); não existe botão "Desfazer" com esse nome |
| J03 Estudar agora | PASSOU | acerto/erro/acerto = 2/3, 66,7%, "Refazer erros (1)", próxima revisão 02/11 |
| J05 Plano filtros | PASSOU | filtros e ordenação sem erro; "Limpar" por seletores |
| J06 Disciplinas | PASSOU (criar) | nome repetido não duplica; vazio é recusado; renomear/cor/excluir NÃO TESTADO em lote |
| J07 Aulas | PASSOU | 62 linhas, 8 s: vazio, espaços, repetido, `<b>x</b>`, aspas, emoji, 300 caracteres, data passada e futura |
| J10 Materiais/PDF | PASSOU | envio do PDF, 1 trecho proposto, rascunho com provedor falso, aceitar aula |
| J11 Estatísticas | PASSOU COM RESSALVAS | 3 questões / 2 acertos / 66,7% coerentes com o estudo |
| J12 Configurações | PASSOU COM RESSALVAS | temas e idioma salvam; "Apagar base local" só mostra aviso de não suportado |
| J13 Conta | PASSOU | senha errada: "incorretos"; entrar de novo ok; 401 no console é esperado |
| J01 Menu | PASSOU COM RESSALVAS | 6 destinos abrem; Materiais e Estatísticas lembram a última subtela (rascunho aberto, aba "Por conteúdo"), o que quebrou as esperas do roteiro, não o produto |
| J04 Revisão focada | NÃO APLICÁVEL COM ESTES DADOS | "Começar agora" abre a revisão vencida da aula sem exercícios (expande resumo e exercícios externos); a revisão focada exige vencida com exercícios, e a aula com exercícios só vence em 02/11 |
| J14 Persistência | PASSOU | F5 em Estatísticas, Plano e Hoje; hash inexistente; voltar e avançar: 13 linhas, 2,7 s, sem erro (requisições abortadas no recarregamento são esperadas) |
| J15 Teclado | PASSOU | Tab, Shift+Tab, Enter e Esc sem erro; foco visual não conferido |
| J08 Editor do resumo | PASSOU | editar, salvar, recarregar: o texto com `<b>`, acentos e emoji persiste e aparece literal (12 linhas, 2,9 s) |
| J09 Provas | NÃO ENCONTRADO | nenhuma entrada de prova visível na interface testada |
| J16 Estresse e janela estreita | NÃO TESTADO | redimensionar a janela e diálogos nativos não são controláveis |

## Achados do produto
| ID | Jornada | Observado | Gravidade |
|---|---|---|---|
| A-01 | J07 | Título de 300 caracteres é cortado em 240 sem aviso; o texto ultrapassa a borda do cartão na lista (`prints/J07-salvar-sem-disciplina.png`) | P2 |
| A-02 | J11/Plano | A mesma nota aparece como 66,7% em Estatísticas e 67% no Plano (arredondamento diferente) | P2 |
| A-03 | J12 | O botão de apagar base local existe mas só responde "ainda não é uma operação suportada no modo servidor" | P2 |
| A-04 | geral | Avisos antigos permanecem visíveis ao trocar de tela (ex.: o de apagar dados, o de "Ainda não há evidência…") | P2 |
| A-05 | J07 | A validação do formulário de aula cobra o conteúdo estudado antes da disciplina | P2 (ordem) |
| A-06 | J00 | Criar conta e Entrar levam ~840 ms cada | atrito |

## Candidato a defeito funcional (a corrigir no 1º sprint)
| ID | Jornada | Observado | Gravidade |
|---|---|---|---|
| A-07 | J06 | Renomear disciplina: **Salvar** grava e persiste após recarregar; **Enter** no campo não grava e a edição segue aberta (sem mensagem, sem erro no console). Reproduzido 3 vezes, também com digitação real (clicar, Ctrl+A, digitar, Enter), lote `lotes/J06b.txt` e variações. O código em `src/app.js:4854` trata Enter, então a causa não está diagnosticada (hipóteses: foco fora do `.inline-edit-input`, ou build do exe diferente do fonte). | P1 candidato |

Nota de método: J04 só pode ser exercido com revisão vencida de aula que tenha exercícios; J08 e a renomeação por **Salvar** passaram.

## Atualização: A-07 corrigido (2026-11-01)
- **Causa:** o formulário de edição dos cartões do catálogo de disciplinas (`src/app.js`, campo `.subject-edit-name`) só tinha os botões Salvar/Cancelar; o tratador de Enter/Esc existia apenas no editor da lista antiga (`inline-edit-input`). O Enter não fazia nada e a edição ficava aberta.
- **Correção:** `keydown` no campo: Enter salva, Esc cancela (5 linhas).
- **Prova:** teste E2E novo em `e2e/feature-parity.spec.js` ("Enter in the rename field saves and Escape cancels"): passa com a correção e FALHA sem ela (`expect(...toBeHidden()) failed`, 94); os dois testes de Disciplinas passam em 19,7 s. Falta reconferir no exe nativo depois de reconstruir.

## Erros do meu próprio instrumento (registrados por regra)
| ID | Onde | Observado | Status |
|---|---|---|---|
| I-01 | driver | número de controle velho esperava 6 s e repetia | corrigido (falha em ~0,2 s) |
| I-02 | driver | clique por texto acertava o título e não o botão ("Criar conta") | corrigido |
| I-03 | driver | clique/preenchimento em elemento escondido (formulário de login sob o de cadastro) | corrigido (`visible=true`) |
| I-04 | driver | `expect` aceitava texto escondido | corrigido |
| I-05 | roteiros | `ensure` necessário: painéis que alternam abrem e fecham com o mesmo botão | corrigido (`ensure`) |
| I-06 | driver | aspas escapadas dentro de argumentos não são entendidas pelo lote | limitação conhecida; usar aspas simples |
| I-07 | operador | pasta `C:\c\` criada por caminho errado | pendente: apagar |

## Reclassificação (2026-11-01)
- **A-05 (ordem da validação) não é defeito:** o código documenta a ordem de propósito (data, conteúdo, depois disciplina, "antes de criar qualquer disciplina", `src/app.js:5842`). Fechado como projeto intencional.
- **A-01 (título de 240 caracteres):** o corte em 240 vem do `maxlength` do campo (digitação real não passa de 240; o `fill` do teste truncou). O defeito real era o texto sem espaços ultrapassar a borda do cartão na lista: corrigido com `overflow-wrap: anywhere` em `.plan-unit-title` (`src/styles.css`). Falta conferir visualmente no app reconstruído.
