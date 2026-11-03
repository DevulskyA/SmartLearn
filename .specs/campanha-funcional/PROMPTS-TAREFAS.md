# Prompts reutilizáveis da campanha (texto original do usuário, 2026-11-01)

Um por vez, na ordem de `PLANO-CAMPANHA.md`. As tarefas 08 e 10 são repetidas até acabarem as áreas e os defeitos.

## TAREFA 01 — Diagnóstico mensurável dos testes e plano de execução
Investigue diretamente a infraestrutura atual de testes do SmartLearn para identificar, com evidências, os maiores desperdícios de tempo, inicializações de aplicativo e consumo de contexto do Claude Code.

Inspecione os scripts reais, a configuração E2E, o driver da interface, os processos, bancos descartáveis, worktrees e os registros recentes. Verifique especialmente `zz-ui-full.sh`, `zz-ui-bordas.sh` e demais scripts existentes.

Meça uma amostra representativa, sem executar a suíte completa: duração, quantidade de inicializações, autenticações, reinicializações de serviços/bancos, esperas e chamadas de ferramentas. Identifique quais custos são necessários para isolamento e quais são redundantes.

Crie ou atualize um único plano operacional persistente, usando a estrutura já existente, com etapas, dependências, métricas iniciais, critérios de conclusão e próxima ação. Priorize os gargalos pelo ganho provável e risco de regressão.

Preserve alterações de outras sessões e dados humanos.

Entregue: os três maiores gargalos comprovados, métricas de base, plano conciso e recomendação para a primeira otimização.

Limite desta tarefa: diagnóstico, medição e plano. Não reestruture ainda os testes nem execute toda a bateria. Encerre após registrar as evidências.

## TAREFA 02 — Execução persistente da interface
Corrija o principal desperdício operacional: abrir e fechar repetidamente o SmartLearn para testar fluxos relacionados.

Utilize os resultados da Tarefa 01. Adapte a infraestrutura existente para executar uma sequência de testes funcionais em uma única instância do aplicativo, reutilizando sessão autenticada e contexto quando seguro.

A execução desejada é: preparar dados isolados → iniciar aplicativo → percorrer vários fluxos → verificar resultados → encerrar e limpar recursos.

Preserve isolamento onde ele realmente for necessário. Reinicializações deliberadas continuam obrigatórias para testar persistência, recuperação ou independência de cenários.

Implemente a menor alteração estrutural capaz de produzir esse comportamento. Evite novos frameworks ou dependências sem necessidade comprovada.

Prova obrigatória: execute pelo menos três fluxos distintos na mesma instância, confirme os resultados pela interface e compare com a execução anterior em tempo total, inicializações e autenticações.

Critério de aprovação: redução comprovada de inicializações redundantes sem perda de cobertura ou isolamento.

Não toque em dados humanos, prompts protegidos nem alterações de outras sessões. Faça commit local da correção validada. Pare após concluir esta melhoria, informando métricas e limitações.

## TAREFA 03 — Otimização estrutural da suíte E2E
Investigue e corrija o gargalo de maior impacto da suíte E2E, preservando integralmente a capacidade de detectar defeitos.

Use as medições existentes e examine custos por arquivo e teste: inicialização de servidores, bancos descartáveis, navegador, autenticação, fixtures, esperas, sincronização e paralelismo.

A suíte historicamente utilizou dezenas de arquivos e centenas de testes. Confirme a configuração atual antes de alterar qualquer coisa.

Escolha uma única otimização de alto impacto e implemente-a: por exemplo, reutilização segura de processos, preparação mais rápida de bancos, remoção de esperas desnecessárias ou paralelismo controlado. A escolha deve decorrer das medições.

Compare antes e depois com os mesmos testes, condições equivalentes e asserções preservadas. Verifique ausência de contaminação entre execuções e falhas intermitentes.

Não aceite aceleração obtida por exclusão de testes, supressão de erros ou redução indevida de verificações.

Entregue: causa identificada, alteração efetuada, testes executados, tempo anterior e posterior, ganho percentual e riscos restantes.

Faça commit local se houver alteração validada. Encerre esta tarefa após comprovar o ganho; deixe outras otimizações para nova execução.

## TAREFA 04 — Automação determinística e economia de tokens
Reduza substancialmente o trabalho repetitivo realizado pelo Claude durante os testes de interface.

Princípio obrigatório: scripts executam sequências; asserções verificam resultados; Claude investiga exceções.

Inspecione o driver atual e identifique interações repetitivas que ainda exigem decisões, leituras ou chamadas de ferramentas desnecessárias. Transforme o maior desperdício em uma sequência automatizada reutilizável.

Conserve logs completos localmente. Exiba ao modelo apenas um resumo compacto, incluindo falhas e referências para evidências detalhadas. Gere capturas de tela nos checkpoints que realmente comprovem comportamento, especialmente nas falhas.

Verifique também seletores, estabilidade da navegação e sincronização. Corrija defeitos do driver diretamente relacionados à melhoria, inclusive o truncamento de seletores com espaços, se ainda existir.

Validação: execute o mesmo fluxo antes e depois; compare chamadas de ferramentas, volume de saída, duração e qualidade das evidências. Identifique estimativas como estimativas quando a contagem real de tokens for indisponível.

Preserve a automação pela interface real, sem substituir ações do usuário por manipulação direta de banco.

Entregue resultados verificáveis, faça commit local e pare nesta tarefa.

## TAREFA 05 — Isolamento definitivo dos dados de teste
Audite e fortaleça a separação entre dados humanos, dados demonstrativos, testes funcionais e testes de borda.

A implementação anterior separou `zz-ui-full.sh` de `zz-ui-bordas.sh`. Confirme se essa proteção continua eficaz e se resiste a falhas, interrupções e execuções concorrentes.

Garanta que os testes extremos utilizem dados descartáveis e que o ambiente demonstrativo mantenha registros médicos realistas e estáveis. Verifique bancos, caminhos, portas, processos, inicialização e limpeza.

Prova obrigatória: registre o estado dos dados demonstrativos; execute testes normais e de borda; compare o estado posteriormente e demonstre ausência de alterações indevidas.

Evite exclusões amplas e qualquer acesso de escrita aos dados humanos.

Corrija somente falhas efetivamente encontradas. Faça commit local e apresente os testes de isolamento aprovados, os riscos remanescentes e a próxima ação.

Encerre após comprovar a independência dos ambientes.

## TAREFA 06 — Inventário funcional completo e campanha de testes
Agora que a infraestrutura de testes foi otimizada, estabeleça a cobertura funcional integral do SmartLearn.

Inspecione código, rotas, componentes, menus, estados, fluxos e funcionalidades realmente implementadas. Confirme o inventário pela interface quando necessário.

Crie uma matriz única de cobertura na estrutura de projeto existente, indicando para cada funcionalidade: objetivo do usuário, cenário principal, estados alternativos relevantes, evidência disponível, ambiente verificado (Desktop nativo ou web) e situação atual.

Diferencie funcionalidades comprovadamente testadas de testes apenas existentes ou resultados históricos.

Agrupe os cenários em jornadas contínuas, minimizando reinicializações, navegações e autenticações repetidas. Organize as áreas na ordem mais eficiente e útil para um estudante real.

Defina um plano de execução que sobreviva a novas sessões do Claude, com progresso, pendências e próxima tarefa explícitos. Evite documentação duplicada.

Critério de conclusão: todas as superfícies materiais descobertas estão inventariadas, cada uma possui um caminho de validação e há uma ordem clara para executar a campanha completa.

Entregue o mapa resumido, a cobertura já comprovada e a próxima jornada prioritária. Pare antes de iniciar a campanha extensa.

## TAREFA 07 — Primeira jornada funcional completa de um aluno
Execute uma jornada realista e contínua de uso do SmartLearn, prioritariamente no Desktop Windows.

Utilize uma única instância persistente sempre que seguro e um ambiente de teste isolado, com dados médicos realistas.

Percorra pela interface: abrir aplicativo → autenticar → cadastrar disciplina e aula → associar material → criar ou editar resumo → salvar → estudar → responder questões → receber feedback → concluir revisão → consultar Hoje e Estatísticas.

Verifique valores, textos, datas, estados e transições durante todo o percurso. Ao final, feche e reabra deliberadamente o aplicativo para confirmar persistência dos dados.

Use conteúdo local ou mecanismos de teste autorizados, sem chamadas pagas de IA. Preserve os estados de rascunho e aprovação humana.

Registre evidências em checkpoints relevantes, evitando screenshots redundantes. Se o Desktop nativo não puder ser controlado, execute a melhor alternativa disponível e identifique claramente a diferença de cobertura.

Critério de aprovação: a jornada inteira termina com resultados corretos e persistidos. Qualquer defeito deve ter reprodução, severidade e evidência.

Essa validação automatizada não substitui a sessão humana reservada ao usuário.

Entregue cobertura obtida, falhas, inicializações e tempo. Pare após esta jornada, sem iniciar redesign ou outras frentes.

## TAREFA 08 — Cobertura profunda da próxima área funcional (reutilizável)
Consulte a matriz de cobertura funcional e selecione a área de maior prioridade ainda sem validação suficiente.

Teste essa área integralmente como um usuário real: entrada, navegação, criação ou consulta, edição quando aplicável, persistência, estados alternativos, mensagens, recuperação e relação com outras funcionalidades.

Utilize a infraestrutura persistente e os dados isolados já preparados. Agrupe os cenários relacionados numa mesma execução, evitando reinicializações sem justificativa.

Inclua todas as ações materiais dessa área. Compare o comportamento observado com os requisitos e a lógica real do produto; não declare sucesso apenas porque o teste automatizado terminou.

Registre cada defeito com reprodução e evidência. Corrija somente problemas locais de infraestrutura de teste que impeçam a própria verificação; encaminhe os defeitos de produto à lista priorizada de correções.

Atualize a matriz: aprovado, falhou, bloqueado ou pendente, com distinção entre Desktop nativo e web.

Critério de conclusão: a área escolhida está completamente avaliada ou possui impedimentos concretos documentados.

Informe a próxima área pendente. Não comece essa próxima área na mesma execução.

Este prompt será reutilizado até que todas as áreas relevantes tenham sido percorridas.

## TAREFA 09 — Robustez funcional e recuperação de falhas
Audite os estados de falha e recuperação dos principais fluxos já mapeados no SmartLearn.

Selecione os cenários de maior risco ainda não comprovados: dados inválidos, operações canceladas, formulários incompletos, erros de carregamento, tentativas novamente, interrupções, perda temporária de serviço, duplicidade de ações e persistência após reinício.

Execute esses casos com automação reutilizável e isolamento adequado. Não contamine o conjunto demonstrativo e não manipule dados humanos.

Para cada cenário, verifique se o aplicativo preserva dados, apresenta mensagens compreensíveis, permite recuperação e mantém estados corretos.

Evite simulações que possam afetar serviços ou processos de outras sessões. Quando for necessário reiniciar o aplicativo, faça-o deliberadamente, uma vez por grupo de cenários compatíveis.

Registre falhas reais com reprodução, severidade e evidências. Atualize a matriz de cobertura.

Critério de conclusão: os cenários de recuperação de maior risco foram efetivamente exercitados ou classificados como bloqueados com justificativa concreta.

Entregue resultados objetivos e pare. Não misture esta auditoria com redesign ou uma refatoração ampla.

## TAREFA 10 — Correção do defeito funcional mais prioritário (reutilizável)
Consulte os defeitos comprovados na campanha funcional e escolha o de maior gravidade e impacto, respeitando dependências e alterações em andamento.

Investigue primeiro a reprodução e a causa raiz. Verifique se há uma correção não commitada de outra sessão e preserve sua autoria e contexto.

Implemente a menor correção adequada, acompanhada de teste que falhe antes e passe depois, sempre que possível. Confirme também o comportamento pela interface real quando o defeito for visível ao usuário.

Examine regressões prováveis. Evite refatorações incidentais, mudanças de design ou alterações de requisitos.

Considere especialmente o defeito `A-08` da data da próxima revisão, caso permaneça aberto, sem presumir que seja necessariamente o mais prioritário.

Faça commit local somente depois da validação.

Entregue: defeito escolhido, reprodução, causa raiz, correção, evidências e riscos restantes. Atualize seu estado na matriz ou fila existente.

Pare após corrigir um único defeito. Informe qual será o próximo, para que eu possa acompanhar cada correção.

Este prompt será reutilizado para os demais defeitos.

## TAREFA 11 — Continuidade confiável entre sessões Claude Code
Corrija a perda de contexto operacional e as interferências entre sessões simultâneas do SmartLearn.

Inspecione Git, worktrees, branches, mudanças não commitadas, decisões vigentes e os registros de estado já existentes.

Estabeleça uma rotina mínima de retomada capaz de identificar automaticamente: trabalho concluído e comprovado, tarefa ativa, arquivos sob edição por outra sessão, conflitos potenciais, bloqueios reais e próxima ação autorizada.

Use as estruturas atuais do projeto, mantendo uma única fonte operacional compacta. Evite criar sistemas de orquestração, documentos ou agentes adicionais sem necessidade demonstrada.

Defina uma convenção simples de propriedade de escrita por frente, incluindo recursos compartilhados relevantes, e um procedimento seguro para reconciliar alterações concorrentes.

Prova obrigatória: simule uma nova sessão com contexto mínimo e verifique se ela consegue identificar corretamente o estado e a próxima tarefa sem reconstruir manualmente a conversa.

Preserve todas as alterações existentes. Não faça push, merge, deploy ou operações destrutivas.

Entregue o mecanismo adotado, o teste de retomada e as pendências. Faça commit local das mudanças validadas e encerre.

## TAREFA 12 — Auditoria final da campanha funcional
Reconcile o plano, a matriz de cobertura, os resultados de execução, os defeitos e o estado real do Git.

Verifique por evidência se todas as funcionalidades materiais identificadas foram testadas, corrigidas ou justificadamente bloqueadas. Separe resultados do Desktop nativo dos obtidos no ambiente web.

Execute a regressão final relevante, incluindo a suíte completa quando tecnicamente viável e necessária para comprovar a integração das mudanças.

Compare com a linha de base: tempo total, testes por minuto, inicializações, autenticações, falhas, instabilidade, chamadas de ferramentas e volume de contexto consumido. Não invente métricas indisponíveis.

Examine adversarialmente os resultados procurando falsos positivos, testes omitidos, asserções enfraquecidas e riscos de contaminação.

Produza um fechamento executivo curto e auditável com: cobertura comprovada, desempenho antes/depois, defeitos resolvidos, pendências, bloqueios e próximo marco.

A campanha só pode ser declarada concluída se os critérios materiais estiverem efetivamente satisfeitos. Caso contrário, declare conclusão parcial e identifique a menor ação necessária para avançar.

Não altere o design nem publique código. Pare após a reconciliação e o relatório.
