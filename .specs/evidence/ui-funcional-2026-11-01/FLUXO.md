# Fluxo de teste FUNCIONAL como usuário comum — SmartLearn (app original)

Alvo: o app DESKTOP ORIGINAL (Tauri + WebView2, `smartlearn.exe` com o backend dele), build DEV do commit `04930d8`, em instância isolada com banco, fontes e perfil WebView descartáveis em `%TEMP%` (nenhum dado humano, nenhum modelo real). A janela abre vazia, pedindo conta.
Como agir (um comando por vez, a partir de `C:\Projetos\SmartLearn\.claude\worktrees\smartlearn-v1-complete`; NÃO use Playwright MCP nem navegador):
- `node scripts/zz-ui-driver.mjs snap` lista o que está na tela: URL, títulos, avisos, controles numerados `[n]` e o texto. `text` mostra mais texto.
- `click <n|texto>`, `dblclick`, `hover`, `fill <n> <texto>` (substitui), `type <n> <texto>` (digita), `select <n> <rótulo>`, `check/uncheck <n>`, `key <Tecla>` (ex.: `Enter`, `Escape`, `Tab`, `Control+Z`), `upload <n> <arquivo>`, `goto <#hash>`, `reload`, `back`, `forward`, `wait <ms>`.
- `shot <caminho.png>` tira print da janela; `console` mostra erros de console/página/rede e diálogos acumulados (`console clear` zera); `dialog dismiss|accept` define a resposta a confirmações do navegador.
- `restart` fecha o app e abre de novo com os MESMOS dados (teste de persistência de verdade). Rodar `snap` depois de cada ação que muda a tela. NÃO rode `quit` (o coordenador encerra no fim).
- Contas de teste (valores descartáveis, só nesta instância): e-mail `aluno1@example.com`, senha `uma senha longa de teste 1`.
- PDF de teste para envio: `C:\Projetos\SmartLearn\.claude\worktrees\smartlearn-v1-complete\.specs\evidence\ui-funcional-2026-11-01\farmacologia-teste.pdf` (3 páginas). Diálogos do sistema operacional (escolher arquivo, salvar backup) NÃO são controláveis: use `upload` para PDFs; registre como NÃO TESTADO o que depender de diálogo nativo.
Objetivo: achar erros FUNCIONAIS (o app faz a coisa errada, perde dado, trava, mostra número inconsistente, botão sem efeito, estado que não persiste). Estética e design só entram como observação curta em FRICCAO.

## Regras do executor
0. **J00 Preparação (feita pelo lote A, uma vez):** criar a conta (testar antes e-mail inválido, senha curta, senha diferente), entrar, sair e entrar de novo; criar 2 disciplinas, 3 aulas; enviar o PDF de teste e gerar/aceitar o rascunho (provedor falso do servidor); estudar e revisar o bastante para Hoje, Plano e Estatísticas terem dados. Lotes B e C partem desse estado (o app continua aberto entre lotes).
1. Aja como estudante: só clique, digite e use teclado, pelo comando do driver. Nada de ler código do projeto nem alterar arquivos.
2. Para CADA ação que muda dado, verifique a consequência em OUTRAS telas (ex.: marcar revisão feita em Hoje → conferir Plano, Estatísticas, Histórico; renomear disciplina → conferir onde mais ela aparece; criar aula → conferir Plano e Hoje). Esse cruzamento é o principal detector de bugs.
3. Depois de cada jornada: recarregue a página (F5) e confira que o que deveria persistir persistiu e o que não deveria sumir não sumiu. Leia `browser_console_messages` (erros/avisos) e `browser_network_requests` (requisições com falha) e registre qualquer erro.
4. Ao achar um erro: registre e CONTINUE. Nunca pare. Não corrija, não diagnostique causa, não edite arquivos do projeto.
5. Tire print em cada tela nova e em cada erro, salvando em `prints/<jornada>-<descricao>.png`.
6. A janela tem o tamanho que o app escolheu; não há redimensionamento por comando (J16 em 390 px fica NÃO TESTADO nesta rodada). Materiais/PDF existe no Desktop: teste de verdade.
7. Entradas de teste obrigatórias nos formulários: vazio, só espaços, 300 caracteres, acentos e emoji, aspas e `<b>x</b>`, nome repetido, data no passado e no futuro, número negativo/zero quando houver número.

## Jornadas
- **J01 Estado inicial**: abrir; o que há em cada destino do menu (anote os nomes exatos); dados de exemplo coerentes entre telas (contagens de Hoje × Plano × Estatísticas).
- **J02 Hoje**: lista de revisões do dia e vencidas; agrupamento por aula; "Vale reforçar"; resumo do dia; marcar/estudar uma revisão; desfazer; estado "tudo em dia".
- **J03 Estudar agora**: iniciar a sessão; responder certo, errado, deixar em branco; dica; ver resposta/explicação/fonte; progresso; retomar sessão interrompida (recarregar no meio); tela final; "Refazer erros" (não deve contar como evidência nova).
- **J04 Revisão diária focada**: "Revisar uma por vez"; abre na primeira não respondida; progresso; sair e voltar; tela final lista erros; "Concluir revisão"; próxima data de revisão atualizada corretamente.
- **J05 Plano e Acompanhar**: lista de atividades, busca, filtros (disciplina, status, período), ordenação, "Limpar filtros", seleção de várias, ações em lote, "Acompanhar" (progresso por disciplina/unidade) e filtro de disciplina que reflete disciplinas novas.
- **J06 Disciplinas**: criar, renomear (Enter e botão; Esc cancela), trocar cor, nome repetido/vazio, apagar/arquivar (a confirmação diz exatamente o que será removido? o cascata confere?), disciplina nova aparece em todos os seletores.
- **J07 Cadastro de aula/unidade**: nova aula com disciplina existente e com disciplina nova; título vazio/duplicado; data de início; a aula aparece em Plano/Hoje com a agenda de 16 revisões correta (datas coerentes).
- **J08 Resumo da lição (editor)**: abrir; ler; editar texto, negrito, lista, imagem, fórmula; salvar; descartar; recarregar e conferir persistência; histórico/versões; modo Visual × código sem perda de bytes.
- **J09 Provas (modo exame)**: iniciar, navegar, deixar em branco, enviar, resultado, resultado reflete em Estatísticas.
- **J10 Materiais/PDF e rascunhos**: enviar PDF de exemplo se disponível, ou ver explicação de indisponibilidade; rascunho: revisar, aceitar, rejeitar; geração (SEM chamar modelo real: só se houver modo de teste; senão registrar NÃO TESTADO).
- **J11 Estatísticas**: abas, períodos, filtros, ordenação, drill-down por disciplina, atalho "estudar", números conferem com o que você fez nas jornadas anteriores (acertos × tentativas); estado vazio.
- **J12 Configurações**: temas (todos), idioma/preferências, tamanho de fonte, backup/exportar e restaurar (usar apenas arquivo gerado por você; conferir que restaurar traz de volta o mesmo estado), "apagar dados locais" (ver o que a confirmação promete × o que acontece).
- **J13 Conta**: tela deslogada/logada, entrar com credenciais inválidas, mensagem de erro, sair; o que muda nas outras telas.
- **J14 Persistência e recarga**: F5 em cada tela, botão voltar/avançar do navegador, abrir `#hash` inexistente, abrir duas abas do app e alterar dados em uma.
- **J15 Teclado**: executar J02, J03 e J05 só com teclado; atalhos documentados na tela funcionam; foco nunca se perde.
- **J16 Estresse do usuário**: duplo clique rápido em salvar/marcar feita/criar; criar 30 aulas seguidas; texto longo em todos os campos; ações com a janela estreita (390 px).

## Formato dos relatórios (na pasta desta evidência; cada lote usa seu sufixo A, B ou C)
- `ERROS-<lote>.md`: `ID | jornada/passo | esperado | observado | gravidade (P0 perde dado/quebra, P1 função errada ou número inconsistente, P2 menor) | como reproduzir (passos numerados) | print | console/rede relevante`.
- `FRICCAO-<lote>.md`: `ID | jornada | tarefa | cliques | espera percebida | dificuldade | print`.
- `LOG-<lote>.md`: uma linha por jornada: PASSOU / PASSOU COM RESSALVAS / FALHOU / NÃO TESTADO (motivo).
