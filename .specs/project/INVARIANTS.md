# INVARIANTS.md — SmartLearn MVP

Estas regras são invariantes obrigatórias. Nenhuma decisão de implementação pode violá-las.
Se uma funcionalidade exige violar uma invariante, a funcionalidade está errada, não a invariante.

---

## INV-01 — Menos trabalho que a planilha

O sistema nunca deve exigir do aluno mais trabalho do que a planilha original exigia.
Se a planilha resolvia algo com uma célula, o app deve resolver com no máximo um clique.

## INV-02 — Tela principal é Detalhes

A tela principal do app é o equivalente à aba `Detalhes` da planilha.
É a primeira coisa que o aluno vê ao abrir o app.

## INV-03 — Cadastro é equivalente à aba RP

A tela de cadastro é o equivalente à aba `RP / Revisões Periódicas`.
O aluno registra o que estudou. O sistema faz o resto.

## INV-04 — Revisões geradas automaticamente

O aluno cadastra o estudo uma vez. O sistema gera todas as revisões automaticamente.
O usuário não clica em "gerar revisões". Isso acontece no momento do cadastro.

## INV-05 — Usuário nunca cria revisões manualmente

No fluxo normal, o usuário nunca cria uma revisão manualmente.
Revisões só existem porque um estudo foi cadastrado.

## INV-06 — Registro de exercícios é simples

Registrar exercícios não pode ser complexo. O aluno está cansado.
Interface mínima: checkbox "fez questões", campo quantidade, campo acertos.

## INV-07 — Percentual calculado automaticamente

O percentual de acertos é sempre calculado pelo sistema.
Fórmula: `scorePercent = (correctCount / questionsCount) * 100`.
O aluno nunca digita percentual.

## INV-08 — Estatística mostra evolução

A tela de estatísticas deve mostrar a evolução do desempenho ao longo do tempo.
Não é suficiente mostrar apenas totais acumulados.

## INV-09 — Gráfico de evolução é obrigatório

O gráfico de evolução das notas (percentual de acertos ao longo do tempo) é obrigatório no MVP.
Não é opcional. Não pode ser substituído apenas por tabela de números.

## INV-10 — Uma aplicação para desktop, iOS e Android

O produto usa uma única base Tauri 2 para desktop, iOS e Android.
Desktop é o primeiro alvo de execução local. Android é o alvo móvel posterior.
iOS deve permanecer preparado na mesma base, com build real posterior em ambiente Apple/Mac.

## INV-11 — Mobile usa cards

No celular, a tela principal (Detalhes/Hoje) usa cards.
Cada tarefa de revisão é um card com todas as informações e ações visíveis.

## INV-12 — Desktop pode usar tabela

No desktop, a tela pode usar layout em tabela, semelhante à planilha original.
O layout muda por breakpoint, não por modo manual.

## INV-13 — Dados locais em SQLite nativo

Todos os dados ficam em banco SQLite nativo no próprio dispositivo.
O banco pertence ao app, não ao navegador. Nenhum dado é enviado a servidor externo no MVP.

## INV-14 — Exportação de backup é obrigatória

Exportar os dados como arquivo JSON é parte obrigatória do MVP.
Não é funcionalidade extra. É requisito.

## INV-15 — Importação de backup é obrigatória

Importar um arquivo JSON de backup é parte obrigatória do MVP.
O aluno deve conseguir migrar dados entre dispositivos via arquivo.

## INV-16 — Sem Supabase

Não usar Supabase em nenhuma fase deste MVP.

## INV-17 — Sem backend

Não usar nenhum backend neste MVP. Nem Node.js, nem Python, nem PHP, nem qualquer servidor.

## INV-18 — Sem banco remoto

Não usar banco de dados remoto neste MVP. Nem PostgreSQL, nem MySQL, nem SQLite em servidor.

## INV-19 — Interface web, empacotamento com Tauri 2

A interface é feita em HTML, CSS e JavaScript, com Vite apenas como empacotador mínimo.
O empacotamento multiplataforma usa Tauri 2. Não usar React, Vue, Next.js, Ionic, Flutter,
React Native, Kotlin ou Swift na camada de interface do MVP.

## INV-24 — Acesso ao SQLite isolado em db.js

SQLite local nativo é acessado pelo plugin SQL do Tauri exclusivamente por `src/db.js`.
Nenhuma outra parte da aplicação pode executar SQL diretamente.

## INV-25 — Git obrigatório desde o início

O repositório Git local deve existir antes da implementação funcional. Cada task deve produzir
um commit próprio e deixar o projeto funcional. Tasks diferentes não podem ser misturadas.
Codex é responsável por GitHub, branches remotas e pull requests. Claude não cria repositório
GitHub nem faz push remoto sem instrução explícita.

## INV-20 — Sem complexidade extra no MVP

Não adicionar no MVP:
- IA ou sugestões inteligentes
- Gamificação
- Banco de questões
- Caderno de erros complexo
- Redistribuição avançada de revisões
- Arquivamento sofisticado

Essas funcionalidades podem existir em versões futuras, nunca neste MVP.

## INV-21 — Automático por padrão

Se algo puder ser feito automaticamente, deve ser automático.
O aluno não deve tomar decisão que o sistema pode tomar por ele.

## INV-22 — Um clique por ação

Se algo puder ser feito com um clique, não deve exigir dois.
Confirmações desnecessárias são proibidas.

## INV-23 — Energia para estudar, não para gerenciar

O aluno deve gastar energia estudando, não operando o sistema.
Qualquer fluxo que exija mais de 3 passos para uma ação comum é candidato a simplificação.
