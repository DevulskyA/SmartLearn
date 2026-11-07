# Triagem do quadro Planban, 2026-11-07

Cada cartão aberto (pending, up-next, in-progress) lido com status, tags e próxima ação. Gerado da consulta ao quadro; a coluna "o que falta" é a próxima ação registrada no cartão.

## Decisão ou aprovação do dono (28)

- AUDITORIA — Corrigir os achados restantes das telas [in-progress]: Owner: revisar a barra do celular e os temas. Restam do seu lado A-21 (Configurações) e A-14/A-16/A-17 (Estatísticas, protegida).
- CORREÇÃO — Ocultar “Apagar base local” no modo remoto [in-progress]: Owner: revisar a mudança e confirmar. Não há gate automático pendente neste cartão; complete somente com sua confirmação.
- INTEGRAÇÃO — Reconciliar branch e main [in-progress]: Owner: confirmar se este registro histórico pode ser arquivado ou movido para Complete. Não iniciar trabalho novo aqui; pendências restantes estão nos cartões de validação do dono e migrações.
- AUDITORIA — Cobrir as telas restantes [up-next]: Owner: decidir se o mesmo kit de captura e auditoria vai ao outro agente para as seis telas. Se sim, o agente prepara o pedido; se não, este Item é arquivado.
- DECISÃO — Liberar a interface unificada [up-next]: Owner: responder "liberar tudo", "liberar só: ..." ou "adiar". Se liberar, o agente traz os commits para a integração em uma cópia de ensaio, roda os testes de todas as telas e mostra capturas a 390 px e a 1280 px antes 
- PENDÊNCIA — Reproduzir e resolver o problema da essência [up-next]: Owner: indicar ou reproduzir o problema da essência; depois registrar causa, correção e teste. Não marcar como resolvido sem evidência observável.
- Diagnosticar página WebView2 ausente no CDP [up-next]: Fechar com aprovação do dono; reabrir só se voltar a ocorrer com exe compatível.
- Corrigir assertiva de mensagem do upload PDF no executor Desktop [up-next]: Fechar com aprovação do dono.
- ESTABILIZAÇÃO — E-021: tentativa duplicada em attempts.start() (concorrência e retry) [up-next]: Pronto para revisão do owner. Dívida explícita: rotas UNPROBED no registro server/test/post-route-idempotency-registry.test.js.
- ESTABILIZAÇÃO — Validar o HEAD 37b17e7 e as alterações locais [up-next]: Pronto para revisão do owner. Push/merge só com autorização.
- ESTABILIZAÇÃO — Triagem das regressões: código sem perda, reproduzir no executável [up-next]: Owner: confirmar se o app que você abriu era o da pasta smartlearn-open-20261105 (título mostra o commit). Agente: decidir com você qual branch o launcher deve exigir, para o executável refletir o HEAD atual; até lá não 
- ESTABILIZAÇÃO — Testes rápidos e confiáveis (watchdog, test:ui:fast, baseline) [up-next]: Pronto para revisão do owner. Pendente: baseline por passo da jornada Desktop (cartão N2).
- ANÁLISE — Decidir os ajustes de Estatísticas [pending]: Owner: dizer quais pontos de E-01, E-02 e KPIs repetidos quer mudar e como deve ficar visualmente. Sem sua aprovação visual, nada muda.
- DECISÃO — Destino de “Apagar base local” [pending]: Owner: responder "fazer funcionar, com confirmação" ou "tirar da tela" e revisar a correção de excluir disciplina. Se escolher fazer funcionar, o agente escreve primeiro o teste da confirmação.
- ACESSIBILIDADE — Corrigir contraste e controle de tema [pending]: Owner: revisar visualmente os temas corrigidos, o diálogo de adiar vencidas e o botão lua/sol; informar aprovação ou defeito reproduzível.
- DOCUMENTAÇÃO — Consolidar o PRODUCT.md [pending]: Owner: autorizar a remoção das branches `product-md-on-*`, que já estão contidas na main. Agent: apagar só as autorizadas, em lista exata.
- LIMPEZA — Remover branches e worktrees dispensáveis [pending]: Owner: autorizar excluir apenas smartlearn-window-state (local+remoto, 0 commits únicos). Agent: abrir um sprint por branch com commits únicos (perf/e2e e window-monitor primeiro) para trazer à integração; nenhuma exclus
- VALIDAÇÃO — Verificar a main após os merges [pending]: Owner: revisar visualmente temas, diálogo de adiar vencidas e fluxo de marcação; decidir migrações somente após backup. Agent: não há gate automático pendente nesta integração.
- DECISÃO — Destino dos PRs experimentais [pending]: Owner: fechar/arquivar #7 e #8 ou mantê-los como referência. Se mantiver algum, atualizar base, escopo e provas antes de retirar o rótulo draft ou integrar.
- REGISTRO — Retorno ao texto original após erro [pending]: Owner: responder se quer o evento e quais dados guardar (por exemplo aula, questão e hora). Se quiser, entra no mesmo pacote de migrações do Item 035 a 038.
- PRODUTO — Adiar revisões pendentes [pending]: Owner: revisar visualmente o diálogo e mover para Complete se aprovado. Não executar migração no banco humano sem autorização explícita.
- PRODUTO — Marcar questão problemática [pending]: Owner: revisar o fluxo visual de marcar/retirar questão problemática e informar aprovação ou defeito reproduzível. Não executar migrações no banco humano sem autorização explícita.
- DIAGNÓSTICO — Reproduzir defeitos B12 e B13 [pending]: Owner: descrever B12/B13 e decidir A-16 (Estatísticas protegida). Agent: se a falha do servidor reaparecer, identificar o teste pelo log e registrar em ACHADOS-PARCIAIS.md.
- N3 Sondas de concorrência nas rotas criadoras (classe E-021) [pending]: Pronto para revisão do dono. Sonda real (com PDF) das 11 rotas lidas só por código é opcional; risco baixo.
- N3 Guarda sistêmica: toda rota POST exige operationKey ou justificativa [pending]: Pronto para revisão do dono. O registro não tem mais rota UNPROBED (a6047f9).
- N2/N5 Re-medir baselines E2E em máquina limpa e corrigir CODEMAP [pending]: Pronto para revisão do owner.
- Relatório de aderência: plano E2E vs filosofia (2026-11-07) [pending]: Revisão do dono. Depois, commitar o relatório com arquivo explícito se aprovado.
- ORGANIZAÇÃO — Reorganizar grupos e cartões [pending]: Owner: abrir o quadro, conferir se agora dá para entender cada cartão e dizer o que ainda está confuso. O agente concluiu 11 dos 24 achados da auditoria depois da reorganização.

## Design / posterior (sem ação neste ciclo) (16)

- DIREÇÃO — Qualidade visual e responsividade do SmartLearn [in-progress]: Executar os Items filhos em ordem: baseline visual; preservação de i18n e temas; comparação da versão preservada; Acompanhamento; Estatísticas; Configurações; validação final em 390 px e 1280 px. Não alterar o prompt ori
- REGISTRO — Baseline visual das telas [in-progress]: Preparar capturas do estado atual em 390 px e 1280 px para Acompanhamento, Estatísticas e Configurações, incluindo temas e estados principais; parar quando a matriz de evidências estiver completa.
- ANÁLISE — Versão preservada contra o main [in-progress]: Produzir uma tabela arquivo/símbolo/efeito entre a versão preservada e o main atual, classificando cada mudança como recuperar, adaptar, rejeitar ou investigar; parar antes de qualquer integração.
- RECUPERAÇÃO — i18n e 24 temas [up-next]: Isolar a versão preservada de src/i18n e src/theme.js, comparar contratos e testes com o main atual e preparar uma restauração seletiva; não fazer merge amplo nem apagar o estado atual.
- DESIGN — Hierarquia de Acompanhamento [up-next]: Definir uma hierarquia responsiva para 390 px e 1280 px, agrupar metadados secundários e escolher a ação primária por estado; apresentar proposta visual antes de editar o código.
- DESIGN — Proporção e ritmo de Estatísticas [up-next]: Redesenhar a distribuição entre cabeçalho, KPIs, filtros, tabela/lista e painel de detalhe preservando a leitura rápida; validar proporções em celular e desktop antes da implementação.
- DESIGN — Configurações e temas completos [up-next]: Definir agrupamento, busca ou progressão de temas e comportamento responsivo do seletor; garantir que a escolha, persistência, idioma e contraste permaneçam cobertos.
- VALIDAÇÃO — Experiência responsiva viva [up-next]: Após as propostas aprovadas, executar validação visual em 390 px e 1280 px, temas claros e escuros, estados de foco/erro/vazio e transições; registrar defeitos residuais e deixar a aprovação final para o owner.
- REGRESSÃO — Restaurar o editor visual e imagens [up-next]: Comparar o editor atual com a versão histórica, recuperar somente o que foi perdido e testar inserção, persistência, leitura e edição de uma imagem sem apagar conteúdo.
- REGRESSÃO — Restaurar a área de PDF e o fluxo de importação [up-next]: Reproduzir a ausência no executável atual, localizar a última implementação funcional no histórico e restaurar seletivamente importação, extração e vínculo com o conteúdo; parar quando o fluxo real estiver comprovado.
- PARIDADE — Recuperar PDF, editor com imagens, temas e i18n [up-next]: Comparar o estado histórico com o executável atual por funcionalidade, recuperar apenas o que estiver ausente e validar PDF, resumo, imagens, 24 temas, traduções e contraste.
- ARQUITETURA — Retomar o Desktop nativo sem Node no runtime [up-next]: Comparar o contrato atual do backend Node com a camada Rust/SQLite histórica, listar lacunas e escolher a menor migração segura; parar antes de remover o backend atual sem paridade comprovada.
- Reduzir espera diagnóstica quando o CDP não expõe a página [up-next]: Adicionar diagnóstico incremental e limite curto para CDP ausente, preservando limpeza e evidência do erro.
- N7 Varredura de dead end e tempo até o primeiro valor [pending]: Estender a varredura para conta com dados realistas e as telas exam/study-now; gravar baseline com --record-baseline numa rodada limpa.
- N1 Rodar cargo test no próximo marco e decidir escopo Android [pending]: Decisão do dono sobre o escopo Android. A parte cargo test está feita.
- SKILL — Padronizar títulos de tarefas por tipo [pending]: Propor uma redação curta, orientada por princípios e compatível com o prompt original; medir o impacto textual antes de aplicar e aguardar concordância do autor para integração.

## Restrição: IA paga (4)

- CONTEXTO — Passagem de bastão para o Codex [in-progress]: Owner: revisar visualmente temas, diálogo de adiar vencidas, fluxo de marcação e uso real do editor; autorizar migrações 035–040 somente após backup/revisão. Agent: nenhum gate técnico pendente e não deve abrir nem alter
- Concluir jornada Desktop com provedor CODEX e benchmark real [in-progress]: Revisão do owner: conferir o registro e marcar Complete se aprovado. Aberto: 5 console 401 (cartão N8).
- IA — Confirmar o Codex configurado e o resumo real [up-next]: Verificar provider, consentimento, autenticação e mensagens de falha; executar PDF → Codex → resumo → revisão e registrar o resultado, sem usar fallback silencioso.
- ESTABILIZAÇÃO — Decisões do owner: Codex real e guardrail de branch do build [up-next]: Dono: dizer qual branch o guardrail deve exigir. Sem isso o agente não contorna o guardrail.

## Depende do rebuild do exe (11)

- RELEASE — Não empacotar antes da paridade comprovada [up-next]: Manter o empacotamento bloqueado até os Items de regressão passarem e o fluxo completo ser validado; depois gerar o pacote, testar instalação, abertura, atualização e recuperação.
- NAVEGAÇÃO — Corrigir menus e telas que não abrem [up-next]: Testar cada destino do menu no executável e no modo de desenvolvimento, registrar a primeira transição que falha e corrigir a causa antes de repetir a auditoria visual.
- REGRESSÃO — Recuperar temas, i18n e contraste completo [up-next]: Comparar os temas do histórico com o executável, recuperar o catálogo completo e validar texto/fundo, controles, estados e navegação em todos os temas antes de considerar a interface pronta.
- VALIDAÇÃO — Comprovar o Desktop completo antes de empacotar [up-next]: Montar uma sequência curta de testes automatizados e manuais, executar contra uma cópia segura dos dados e só considerar o pacote depois de todos os fluxos essenciais passarem.
- INICIALIZAÇÃO — Abrir o aplicativo sem console, Node ou npm visíveis [up-next]: Separar claramente o launcher de desenvolvimento do executável nativo e corrigir o atalho para abrir somente a aplicação; medir o tempo de abertura e confirmar que nenhum console fica visível.
- Reconstruir artefato Desktop com identidade atual [up-next]: Release/empacotamento segue bloqueado pelo guardrail de branch (decisão do dono).
- ESTABILIZAÇÃO — Auditoria de regressões E-013/016/021/022/024 e matriz UI/BUILD [up-next]: Dono: confirmar qual executável abriu (REG-01; last-launch.json aponta o build antigo de 05/11) e a branch do guardrail de build.
- DECISÃO — Selecionar mudanças da interface [pending]: Sem ação agora. Ativar somente se o dono escolher liberação parcial; caso contrário, arquivar este cartão como redundante.
- N2 Baseline da jornada Desktop com duração por passo [pending]: Fazer o script gravar duração por passo em arquivo versionado e sair com código de desvio como o e2e.mjs. Gravar a baseline em máquina limpa.
- N8 Investigar 401 no console da jornada Desktop (OBS-J1) [pending]: Rodar a jornada com exe em HEAD quando o dono liberar o build; conferir http401 só com auth/me.
- DESIGN — Hierarquia tipográfica do index [pending]: Sem ação no ciclo atual. Só investigar depois dos gates de release e se uma medição visual confirmar impacto real; caso contrário, arquivar como não prioritário.

## Restrição: banco humano / dados (7)

- DADOS — Recuperar os dados antigos e confirmar a conta de teste [up-next]: Inventariar bancos e usuários sem alterar o banco humano, identificar a conta e a base com dados, fazer backup verificável e conectar o ambiente de teste ao estado correto.
- DADOS — Preservar e migrar o banco sem perda de conteúdo [up-next]: Inventariar schema, caminhos, migrações, PDFs, imagens e dados dos dois modelos; criar backup verificável e definir uma migração reversível antes de alterar qualquer banco.
- DECISÃO — Destino das branches remanescentes [pending]: Owner: dizer o destino dos grupos que restam (janela/monitor, Estatísticas AAA, interface unificada, consertos soltos, fora do produto) e se as 3 worktrees travadas (stats-aaa-port, defeitos-condicionais, e2e-server-read
- MIGRAÇÃO — Aplicar migrações autorizadas [pending]: Owner: revisar a distinção entre banco de desenvolvimento e banco humano e dizer se autoriza as versões pendentes que o portão detectar. Agent: não executar nem abrir o banco humano sem autorização explícita.
- VALIDAÇÃO — Aceitação Tauri, Windows e Android [pending]: Owner: se ainda precisar preservar a decisão de infra, responder "ainda valem" ou "não valem". Se o cartão irmão cobrir tudo que importa, arquivar este cartão como redundante.
- VALIDAÇÃO — Uso real no computador do owner [pending]: Owner: informar quando o agente pode executar leitor de tela, Android, animações e impressão. A interface funcional, a acessibilidade automatizada e a jornada nativa Windows já estão provadas no build atual; qualquer def
- VALIDAÇÃO — Editor do Resumo no estudo real [pending]: Owner: usar o editor com esse rascunho depois do merge e informar o que falha. Cada defeito vira um Item novo; sem defeito, o dono confirma e este Item é concluído.

Aviso: os grupos foram atribuídos por palavras-chave do id, das tags e da próxima ação, então alguns cartões ficam no grupo vizinho (por exemplo, cartões já feitos e só aguardando aprovação aparecem em "rebuild" ou "design"). O texto de cada linha é a próxima ação registrada no cartão e vale mais que o grupo.

Total: 66 cartões.
