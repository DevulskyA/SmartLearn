# SmartLearn — Product Constitution & Canonical Functional Specification

```
VERSION=1.0
STATUS=CANONICAL_PRODUCT_INTENT
SCOPE=SMARTLEARN
AUDIENCE=ALL_DESIGN_ENGINEERING_AI_PRODUCT_AGENTS
```

## 0. Goal

/goal Construir o SmartLearn como um sistema de execução e otimização da aprendizagem médica em que o aluno fornece o material e estuda, enquanto o sistema prepara o ambiente de aprendizagem, observa a execução, preserva evidência longitudinal e transforma resultados em revisão, diagnóstico e próxima ação, com mínima carga administrativa e qualidade top 0,1% como piso.

## 1. Instrução de persistência

Esta especificação NÃO deve permanecer apenas no chat.

Antes de qualquer nova decisão de produto relevante:

1. reconcilie o estado real do repositório;
2. preserve o Quality Standard canônico existente;
3. preserve o Heritage Contract existente;
4. crie ou atualize UM único documento canônico de produto:

`.specs/governance/SMARTLEARN_PRODUCT_CONSTITUTION_V1.md`

5. grave neste arquivo o conteúdo semântico integral desta especificação;
6. adicione apenas um ponteiro mínimo em STATE.md e EXECUTION.md:

`PRODUCT_CONSTITUTION_PATH=.specs/governance/SMARTLEARN_PRODUCT_CONSTITUTION_V1.md`

7. não duplique o documento em outros lugares;
8. não altere código de produto apenas para persistir esta constituição;
9. não reabra decisões humanas já estabelecidas;
10. não implemente capacidades FUTURAS simplesmente porque aparecem aqui;
11. faça um commit local atômico exclusivamente documental;
12. não faça push, merge ou deploy.

Esta constituição governa INTENÇÃO DE PRODUTO.

Ela NÃO é prova de que determinada função já está implementada.

Para descobrir o estado real de implementação:

código executável → testes/evidência real → validation → decisões registradas → especificações → STATE → plano → chat.

Se código ou testes mostrarem que algo descrito como IMPLEMENTADO aqui não existe mais, classifique como CONFLITO e reconcilie antes de agir.

Para decisões de produto futuras, esta constituição permanece vigente até ser explicitamente supersedida por nova decisão humana registrada.

## 2. Definição do produto

SmartLearn é um SISTEMA DE EXECUÇÃO E OTIMIZAÇÃO DA APRENDIZAGEM MÉDICA.

Seu princípio operacional é:

O ALUNO FORNECE O MATERIAL E APRENDE.
O SMARTLEARN PREPARA, ORGANIZA, OBSERVA E ORIENTA O RESTANTE.

O SmartLearn existe para concentrar a capacidade cognitiva do estudante na aprendizagem médica e retirar dele trabalho administrativo, repetitivo ou decisório que o sistema consegue executar de modo confiável.

Isso inclui, progressivamente:

- receber o material;
- organizar o conteúdo;
- preparar um resumo;
- preparar questões;
- programar revisões;
- apresentar o que exige atenção;
- registrar automaticamente a prática observada;
- preservar acertos e erros;
- acompanhar evolução;
- identificar fragilidades;
- transformar informação em próxima ação.

SmartLearn NÃO é definido por nenhuma dessas funcionalidades isoladamente.

Sua unidade de valor é o CICLO INTEGRADO.

## 3. Problema que o produto resolve

Estudar Medicina impõe duas cargas muito diferentes.

A primeira é inevitável e desejável:

CARGA DE APRENDIZAGEM
- compreender;
- recuperar informação;
- aplicar;
- discriminar;
- raciocinar;
- errar;
- corrigir;
- recordar.

A segunda é em grande parte desperdício:

CARGA ADMINISTRATIVA
- organizar materiais;
- dividir assuntos;
- preparar resumos;
- construir questões;
- lembrar quando revisar;
- procurar onde está cada conteúdo;
- registrar manualmente fatos já observados;
- reunir resultados;
- calcular percentuais;
- interpretar múltiplos painéis;
- decidir repetidamente o que fazer depois.

O SmartLearn deve minimizar agressivamente a segunda sem empobrecer a primeira.

A energia do aluno deve ser preservada para APRENDER.

## 4. Modelo mental: telemetria de alta performance

A telemetria esportiva é uma metáfora útil para compreender o sistema, não uma obrigação estética para a interface.

Um atleta de alto nível não melhora apenas aumentando indiscriminadamente o volume.

Ele: executa → mede → encontra perdas → corrige → executa novamente → compara o resultado.

O SmartLearn aplica princípio semelhante à aprendizagem.

A telemetria educacional deve responder:

- o que foi praticado;
- quanto foi praticado;
- qual foi o resultado;
- quais erros persistem;
- onde houve melhora;
- onde houve regressão;
- quanto fundamento existe para confiar na leitura;
- o que merece acontecer depois.

A finalidade da telemetria não é produzir gráficos.

É MELHORAR A PRÓXIMA EXECUÇÃO.

Portanto: MEDIR SEM ORIENTAR = INCOMPLETO.

## 5. Tese central do SmartLearn

O SmartLearn deve realizar continuamente quatro funções:

1. PREPARAR — transformar material bruto em algo imediatamente utilizável para aprender.
2. EXECUTAR — permitir compreensão, recuperação ativa, questões, revisão e correção.
3. OBSERVAR — registrar honestamente o que aconteceu durante a execução.
4. OTIMIZAR — converter histórico e estado atual em diagnóstico e próxima ação.

Em forma compacta:

MATERIAL → PREPARAÇÃO → APRENDIZAGEM → PRÁTICA → EVIDÊNCIA → REVISÃO → DIAGNÓSTICO → PRÓXIMA AÇÃO → NOVA PRÁTICA.

Esse ciclo é a espinha dorsal do produto.

Nenhuma tela é o produto isoladamente.

## 6. Experiência fundamental

A experiência ideal começa com uma ação extremamente simples: ENVIAR MATERIAL.

A partir daí, o aluno não deveria precisar construir manualmente um sistema de estudos.

Experiência pretendida:

1. o aluno envia um material médico;
2. SmartLearn interpreta a estrutura desse material;
3. propõe unidades de aprendizagem;
4. prepara um Resumo Mestre;
5. prepara questões adequadas;
6. o aluno revisa/aceita/corrige o conteúdo;
7. clica em Estudar agora;
8. estuda;
9. responde;
10. recebe feedback;
11. os resultados tornam-se evidência;
12. revisões já estão programadas;
13. Hoje mostra o que exige atenção;
14. Estatísticas mostram estado e evolução;
15. Acompanhamento mostra o estado longitudinal;
16. o sistema aproxima o estudante da próxima ação.

O aluno não deve perceber o produto como uma sequência de sistemas internos.

A percepção deve ser: ENVIEI O MATERIAL. AGORA POSSO ESTUDAR.

## 7. Princípio de tempo até o primeiro valor

Importar material não é valor final. Extrair PDF não é valor final. Gerar texto não é valor final. Criar banco ou endpoint não é valor final.

O primeiro valor real aparece quando o aluno começa efetivamente a compreender, recuperar, responder, aplicar, errar, corrigir e aprender.

Consequentemente: TIME_TO_FIRST_LEARNING é mais importante que TIME_TO_FIRST_GENERATION.

Cada etapa entre upload e aprendizagem deve justificar sua existência.

## 8. Materiais

Materiais é uma superfície primária do produto Desktop.

Não deve ficar escondida em Configurações.

Fluxo: Materiais → enviar → processar → compreender estrutura → propor unidades → transformar em aprendizagem.

Para PDF/documentos suportados, preservar quando disponível:

- arquivo/origem;
- identidade;
- checksum;
- número de páginas;
- texto extraído;
- relação do texto com páginas;
- proprietário;
- estado de processamento;
- versão relevante.

O sistema não deve tratar um documento grande como um único bloco pedagógico por conveniência técnica.

Estrutura semântica do material deve prevalecer sobre divisão arbitrária por número de páginas.

Uma heurística de páginas pode auxiliar a segmentação. Ela nunca deve substituir compreensão estrutural.

PDF escaneado ou extração inadequada não pode ser interpretado silenciosamente como ausência de conteúdo.

OCR é fallback controlado quando necessário.

## 9. Unidades de aprendizagem

O material deve ser transformado em unidades semanticamente úteis.

Exemplo: capítulo → fisiologia glomerular → filtração → fluxo renal → autorregulação → transporte tubular → ...

A IA pode PROPOR a estrutura. Ela não tem autoridade irreversível sobre a organização pedagógica.

O aluno deve poder, quando necessário: corrigir título; aceitar; rejeitar; unir; dividir; reorganizar uma proposta.

Cada unidade deve manter relação reconstruível com sua fonte.

O sistema deve favorecer: UMA DECISÃO DO ALUNO → MUITOS EFEITOS AUTOMÁTICOS.

Criar/aceitar uma unidade pode desencadear: associação à disciplina; conteúdo; questões; agenda de revisão; tracking; futuras evidências.

Não exigir botões administrativos adicionais para aquilo que decorre naturalmente da criação.

## 10. Resumo Mestre

Cada unidade pode possuir um Resumo Mestre permanente.

Seu objetivo é fornecer ao estudante uma base imediatamente utilizável para compreensão e revisão.

Quando gerado por IA, deve ser: fiel à fonte; clinicamente/medicalmente correto; didático; proporcional à importância; organizado para aprendizagem; suficientemente completo sem virar transcrição; editável; rastreável.

O resumo gerado pela IA NÃO é a versão intelectual definitiva do aluno.

O estudante pode: ler; aceitar; corrigir; melhorar; complementar; reescrever; substituir pelo próprio resumo.

Princípio: AUTOMATIZE O TRABALHO INICIAL. PRESERVE A AUTORIA INTELECTUAL.

O sistema ajuda o estudante a começar rapidamente sem transformar a IA em dona do seu conhecimento.

## 11. Ciclo de vida do conteúdo gerado

Conteúdo gerado por IA nasce como PROPOSTA. Nunca como verdade publicada automaticamente.

Modelo conceitual: SOURCE → EXTRACTION → PROPOSAL → DRAFT → HUMAN REVIEW → ACCEPTED CONTENT.

O aluno deve poder: aceitar; editar; rejeitar; regenerar quando apropriado.

A arquitetura deve manter distinguíveis: conteúdo original; conteúdo extraído; conteúdo inferido; conteúdo gerado; versão aceita.

Uma versão aceita que participou de aprendizagem deve continuar historicamente reconstruível.

## 12. Proveniência

Quando possível, o sistema deve conseguir responder: "De onde veio isto?"

Ideal: afirmação/questão → trecho → página → documento → versão.

Proveniência não precisa dominar visualmente a experiência cotidiana.

Mas precisa existir onde é necessária para: auditoria; correção; confiança; conteúdo médico; reconstrução histórica.

A experiência pode ser simples. A história dos dados não pode ser simplificada até perder significado.

## 13. Questões e exercícios

Questões não são um acessório posterior ao conteúdo. São parte do mecanismo fundamental de aprendizagem.

Ao escolher uma unidade para estudar, o estudante deve encontrar prática preparada, sem precisar construir manualmente seu banco de exercícios.

A geração deve suportar variedade pedagógica real, como: recuperação direta; compreensão conceitual; relação causal; comparação/discriminação; aplicação; interpretação; transferência quando apropriada.

Não reduzir automaticamente todo conteúdo a múltipla escolha.

Cada questão deve possuir, quando aplicável: pergunta; resposta; explicação; pista/dica genuína; relação com a fonte/proveniência.

Resposta de qualidade deve ENSINAR. Não apenas declarar o gabarito.

Dica deve auxiliar recuperação ou raciocínio. Não deve simplesmente revelar a resposta com outras palavras.

## 14. Estudar agora

Depois que uma unidade estiver pronta, o sistema deve diminuir a distância entre preparação e execução.

A ação natural é: ESTUDAR AGORA.

Fluxo mínimo: Resumo Mestre → recuperação ativa → questão → dica quando disponível → revelar resposta → julgamento/resposta → feedback → próxima questão → resultado → erros → próxima revisão.

A unidade recém-preparada não deve ser abandonada em Plano exigindo que o aluno a procure novamente.

Aceitou o conteúdo → Estudar agora.

Esse encadeamento é parte do produto.

## 15. Erro é matéria-prima de aprendizagem

Uma sessão 6/10 não deve terminar em: 60%.

Os quatro erros podem conter mais valor pedagógico que o número final.

O sistema deve facilitar: identificar → compreender → corrigir → retestar.

A experiência já deve privilegiar o acesso aos erros ocorridos na própria sessão.

Regra de produto: NÃO CONSTRUIR ANALYTICS SOFISTICADO ENQUANTO O ALUNO AINDA NÃO CONSEGUE APRENDER BEM COM O ERRO QUE ACABOU DE COMETER.

Pontuação é informação. Erro é oportunidade de intervenção.

## 16. Evidência de aprendizagem

Uma das separações mais importantes do domínio é: review_tasks ≠ learning_evidence.

review_tasks: agenda/projeção do que deveria acontecer.

learning_evidence: história factual observada do que aconteceu.

Nunca usar a agenda como substituto da história real.

Nunca reescrever fatos históricos porque o algoritmo de revisão mudou.

Quando SmartLearn observa uma prática interna, o aluno NÃO deve redigitar: quantidade de questões; quantidade de acertos; data; unidade; contexto.

O sistema já sabe.

Princípio: O ALUNO ESTUDA. O SMARTLEARN ADMINISTRA O RASTRO.

## 17. Evidência = volume + resultado

Não preservar apenas: 74%.

Preservar: 37 corretas / 50 questões.

O percentual é derivado.

Isso importa porque: 90% de 10 questões não possui a mesma base observacional que 90% de 200 questões.

Portanto: DESEMPENHO e PRÁTICA são dimensões distintas.

## 18. Prática externa

O SmartLearn não deve fingir que aprendizagem só existe dentro dele.

Quando o aluno fizer exercícios externos, deve ser possível registrar de modo simples: questions_count, correct_count.

O percentual é calculado pelo sistema.

Não exigir ritual administrativo complexo.

Uma prática externa agregada permanece agregada. Não inventar tentativas individuais que nunca foram observadas.

## 19. Sem evidência não é zero

Estes dois casos são semanticamente diferentes:

A. aluno respondeu 20 questões e acertou zero;
B. aluno nunca respondeu uma questão.

A = desempenho observado de 0%.

B = ausência de evidência.

Jamais converter B em A.

Essa regra deve sobreviver em: banco; analytics; gráficos; cores; texto; filtros; priorização; decisões futuras.

UNKNOWN também deve continuar diferente de ZERO e FALSE quando materialmente relevante.

## 20. Assistência e certeza

Quando futuramente houver evidência item a item mais rica, o sistema deve preservar aquilo que realmente observou, inclusive nível de ajuda quando disponível.

Uma resposta correta depois de ver a solução não possui o mesmo significado que recuperação independente.

Porém: não inventar assistência; não inferir independência quando desconhecida; não converter UNKNOWN em NONE; não criar mastery score autoritativo sem validação.

Observação vem antes de interpretação.

## 21. Revisões

Na V1, o scheduler vencedor é FIXO.

Cada learning unit gera 16 review_tasks.

Offsets atualmente canônicos: D+1, D+7, D+15, D+30, D+60, D+90, D+120, D+150, D+180, D+210, D+240, D+270, D+300, D+330, D+360, D+390.

Criação da unidade + 16 revisões deve respeitar atomicidade onde o contrato vigente a exigir.

Não implementar na V1: FSRS; scheduler adaptativo; ML de memória; algoritmo de retenção personalizado.

Revisão pode existir sem questões.

O aluno pode honestamente registrar que revisou um material sem que o sistema invente score, questions_count, correct_count.

## 22. Hoje

Pergunta central: "O que precisa da minha atenção agora?"

Hoje é SUPERFÍCIE DE DECISÃO.

Não é dashboard. Não é inventário completo. Não é calendário administrativo.

A ordem conceitual é: ATRASADO → HOJE → próxima ação útil → futuro próximo relevante → contexto concluído quando necessário.

O estudante deve perceber rapidamente a ação primária.

Se existem vinte informações mas apenas uma ação imediatamente importante, a interface deve ajudar a encontrar essa ação.

Hoje deve reduzir: decisão, procura, navegação.

## 23. Resumo temporal

A herança funcional da planilha inclui uma visão temporal que relaciona: PASSADO RECENTE → HOJE → PRÓXIMO HORIZONTE.

Essa relação deve ser preservada conceitualmente sem copiar a geometria da planilha.

Ela pode ajudar o aluno a compreender: o que acabou de estudar; o que precisa fazer hoje; o que se aproxima.

Não transformar isso em calendário carregado ou planejamento manual.

## 24. Plano / herança RP

Pergunta central: "O que existe no meu universo atual de aprendizagem e em que estado está?"

Plano é o inventário longitudinal das learning units.

Uma unidade pode apresentar, conforme necessário: disciplina; título; data de estudo; fonte; estado do Resumo Mestre; número de exercícios; evidência; próxima revisão; última atividade; estado atual.

A visualização padrão deve ser compacta. Detalhes aparecem sob demanda.

Não reproduzir 16 colunas de datas apenas porque a planilha fazia isso.

O scheduler é mecanismo interno. O estudante precisa da decisão, não da sua representação tabular integral.

## 25. Acompanhamento

Pergunta central: "Qual é o estado desta unidade no meu processo de aprendizagem?"

Acompanhamento NÃO é outra tela de analytics.

É uma visão longitudinal do estado da learning unit.

Seu estado deve ser DERIVADO sempre que possível de fatos já existentes: resumo existe? exercícios existem? evidência existe? houve prática? revisões feitas? revisões pendentes? última atividade? próxima revisão?

Estados canônicos atuais: ATRASADO, SEM_EVIDENCIA, EM_REVISAO, EM_ESTUDO, EM_DIA.

Evitar checkboxes manuais para fatos que o sistema conhece.

A planilha exigia administração porque era uma planilha.

SmartLearn deve eliminar essa limitação.

## 26. Disciplinas

Disciplina é entidade reutilizável. Deve possuir identidade estável.

Cor de disciplina = identidade categórica. Nunca = desempenho.

Criar disciplina durante outro fluxo deve ser possível inline quando isso evitar interromper o aluno.

Evitar: sair → abrir administração → criar disciplina → voltar → reconstruir contexto.

Baixo atrito é requisito funcional.

## 27. Estatísticas — função

Estatísticas não existe para mostrar números.

Existe para tornar visível o MODELO LONGITUDINAL DE APRENDIZAGEM e ajudar uma decisão.

As perguntas fundamentais são: COMO ESTOU? ONDE ESTÁ A FRAGILIDADE? QUANTO PRATIQUEI? ESTOU MELHORANDO OU PIORANDO? O QUE DEVO FAZER COM ISSO?

A superfície deve evitar vanity analytics.

Um gráfico que não melhora nenhuma decisão é dispensável.

## 28. Estatísticas — arquitetura atual

Existe um único item principal: ESTATÍSTICAS.

Dentro dele existem duas profundidades: [ POR DISCIPLINA ] [ POR CONTEÚDO ]

POR DISCIPLINA responde: "Como estou em cada matéria?"

POR CONTEÚDO responde: "Por que estou assim nesta disciplina, em quais conteúdos está o problema e como esses conteúdos estão evoluindo?"

Não criar "Estatística 1" e "Estatística 2" como nomes públicos.

Esses são apenas ancestrais funcionais da planilha.

## 29. Estatísticas — por disciplina

Entidade principal = disciplina.

Primeira camada deve permitir comparação rápida de: DISCIPLINA, DESEMPENHO, PRÁTICA, TENDÊNCIA.

Ordenação padrão: menor desempenho → maior desempenho.

NO_EVIDENCE fica separado/ao final.

Não transformar a superfície em: ranking redundante; card grid de KPIs; distribuição duplicada; "top 3" decorativo; múltiplas visualizações da mesma informação.

O painel analítico secundário pode mostrar: evolução geral; síntese de prática.

A matriz principal permanece o instrumento de comparação.

Selecionar uma disciplina conduz naturalmente a POR CONTEÚDO com a disciplina já selecionada.

## 30. Estatísticas — por conteúdo

Entidade principal = conteúdo/unidade relevante.

Primeira camada deve permitir comparar: CONTEÚDO, DESEMPENHO, PRÁTICA, TENDÊNCIA.

Ordenação padrão: mais fraco → mais forte.

NO_EVIDENCE separado/ao final.

Sem conteúdo selecionado: mostrar evolução da disciplina e síntese útil de prática.

Com conteúdo selecionado: mostrar contexto específico, por exemplo:

Plexo braquial — 31% atual — 48 questões — ↑ 7 p.p.

e sua evolução real por revisões/evidências.

Objetivo: "É aqui que está a dificuldade." "É assim que ela está evoluindo." "É isto que posso fazer a seguir."

## 31. Desempenho, prática e tendência

São dimensões diferentes.

DESEMPENHO = resultado observado.

PRÁTICA = volume executado e base observacional disponível.

TENDÊNCIA = mudança ao longo do tempo.

Exemplo: "20% desempenho, 200 questões, ↑ 7 p.p." é diferente de "20% desempenho, 5 questões, tendência insuficiente."

Uma única cor, número ou score não deve colapsar as três dimensões.

## 32. Matemática de desempenho

Quando existem contagens:

`weighted_accuracy = SUM(correct_count) / SUM(questions_count)`

Não usar como métrica principal `AVG(percentual_de_sessão)` quando os volumes são diferentes.

Exemplo: sessão A: 1/1 = 100%; sessão B: 50/100 = 50%.

Média simples: 75%. Resultado real: 51/101 ≈ 50,5%.

O denominador é parte da verdade. Preservá-lo.

## 33. Janelas temporais

Quando a interface apresenta "Últimos 90 dias", as métricas exibidas como pertencentes a esse período devem usar dados desse período.

Não misturar performance de 90 dias + volume de toda a vida + tendência de janela diferente sem indicar claramente a diferença.

Tendência compara períodos temporalmente coerentes.

Não trocar apenas o rótulo do eixo e manter os mesmos dados.

## 34. Tendência

Tendência não deve ser exibida como significativa quando a base é insuficiente.

Uma seta é uma afirmação. Portanto precisa de observação suficiente segundo regra definida e testável.

Se não houver base: "Tendência em formação" ou equivalente honesto.

"Estável" deve significar apenas a regra operacional explicitamente definida.

Nunca sugerir equivalência estatística, significância formal, ou estabilidade científica quando isso não foi demonstrado.

## 35. Prioridade

O SmartLearn deve evoluir para ordenar intervenções pela utilidade esperada.

Mas NÃO inventar atualmente uma fórmula de "impacto esperado" sem contrato validado.

Prioridade pode ser afirmada quando existe regra explícita e defensável.

Exemplo já válido em Hoje: atrasado → devido hoje → próxima ação temporal relevante.

Desempenho baixo isoladamente NÃO é sinônimo automático de prioridade.

Uma futura priorização robusta poderá considerar, entre outros fatores: desempenho; prática; recência; tendência; proximidade da revisão; importância curricular; resposta a intervenções.

Mas pesos e fórmula exigem decisão e validação próprias.

## 36. Feedback psicopedagógico

O feedback deve reforçar comportamento controlável: prática; persistência; consistência; ação.

Não rotular inteligência, capacidade ou personalidade.

Um aluno pode ter 20% desempenho + grande volume de prática.

O sistema pode reconhecer positivamente a prática sem sugerir que o resultado está bom.

Exemplos conceituais:

- 0 questões: Comece por aqui.
- pouca prática: Bom começo — continue praticando.
- mais prática: Muito bem — você está construindo uma base melhor.
- base suficiente: Ótimo — já conseguimos acompanhar sua evolução com mais segurança.
- consistência alta: Excelente consistência — continue assim.

Essas frases NÃO constituem uma segunda nota.

Thresholds exatos só devem existir se houver contrato definido.

## 37. Próxima ação

Uma boa aplicação educacional transforma: ESTADO → DECISÃO → AÇÃO.

Não apenas: ESTADO → RELATÓRIO.

Exemplos possíveis, quando sustentados pelo produto: Fazer mais questões deste conteúdo. Revisar erros. Retomar o resumo. Revisar agora. Continuar praticando. Estudar outra unidade. Corrigir material.

Não exibir um CTA que o produto não consegue cumprir.

Diagnóstico e execução devem permanecer próximos.

## 38. Zero busca manual

Quando o SmartLearn já sabe: qual conteúdo está envolvido; onde está a fonte; quais questões pertencem à unidade; quais erros ocorreram; qual revisão está pendente;

não deveria obrigar o estudante a reconstruir esse contexto manualmente.

Recomendação: "Revisar Plexo braquial" deve levar ao contexto necessário para executar a revisão.

Não: mostrar recomendação → obrigar busca manual em outro módulo → procurar documento → procurar página → procurar questões.

## 39. Zero meta-work

Toda informação confiavelmente derivável deve preferencialmente ser derivada.

Evitar que o estudante precise: marcar "resumo existe"; contar questões internas; recalcular percentuais; marcar evidência que o sistema observou; reconstruir próxima revisão; manter checklists administrativos paralelos.

Automação deve reduzir trabalho. Nunca transferir nossa complexidade interna ao estudante.

## 40. Funcionalidade não termina em dead end

Toda etapa importante deve responder: "O que acontece depois?"

Exemplos canônicos:

- aceitou material → Estudar agora.
- terminou prática → Revisar meus erros / próxima revisão.
- abriu Hoje → ação principal.
- identificou conteúdo fraco → ação correspondente quando disponível.

Uma tela sem saída aumenta carga mental.

## 41. Tempo é dado de domínio

Datas, recência, revisão, atraso e tendência dependem de tempo.

Tempo deve ser tratado explicitamente.

Testes relevantes devem evitar dependência acidental do relógio da máquina.

Timezone e fronteiras de data não podem alterar silenciosamente significado.

## 42. Backup, portabilidade e recuperabilidade

O histórico de estudo pertence ao usuário.

Permanecem propriedades do produto: OWNERSHIP, RECOVERABILITY, EXPORTABILITY, NO_DATA_LOSS.

A arquitetura usada para alcançar isso pode mudar. A propriedade não.

Qualquer migração deve preservar significado histórico.

## 43. Arquitetura atual — Desktop

DECISÃO CANÔNICA ATUAL:

SmartLearn Desktop Windows/Tauri é o produto completo e LOCAL-FIRST.

O Desktop deve executar o ciclo completo sem depender da nuvem como autoridade sobre seus dados de estudo.

Arquitetura atualmente comprovada:

Tauri → backend Node/Fastify local → loopback 127.0.0.1 em porta dinâmica → SQLite local no app-data → UI existente.

O runtime Node necessário para o backend está empacotado no aplicativo standalone.

O usuário final não deve precisar instalar Node de desenvolvimento.

Material pesado permanece local.

## 44. Arquitetura atual — Companion

Companion Web/PWA é deliberadamente MENOR.

Primeira versão pretendida: READ-ONLY.

Sua função é responder principalmente: o que preciso fazer agora; o que está atrasado; próximas revisões; estado resumido; desempenho resumido; próxima ação.

Não exigir paridade funcional com Desktop.

Não reconstruir todo o domínio pesado na nuvem apenas para obter Companion.

## 45. Nuvem

A nuvem não é o repositório obrigatório de livros/PDFs do aluno.

Usar dados mínimos necessários para: conta; Companion; futuras projeções/sincronização leves quando explicitamente projetadas.

Não subir material completo apenas para permitir uma visão móvel.

## 46. IA externa e privacidade do material

A arquitetura atual não exige IA local.

Uma função de IA externa pode receber apenas o excerto necessário quando a operação realmente precisar dele.

Evitar enviar o artefato integral quando um trecho é suficiente.

A política precisa permanecer explícita e auditável.

## 47. IA é variável de produto

"Usar IA" NÃO é uma especificação suficiente.

Quando a qualidade depende materialmente do modelo, registrar: PROVIDER, MODEL, REASONING_EFFORT, PROMPT_VERSION, CONTEXT_STRATEGY, FALLBACK_POLICY.

Nunca alterar silenciosamente: provider; modelo; esforço; fallback.

Decisão atual registrada:

```
PROVIDER=OPENAI
MODEL=gpt-5.6-luna
REASONING_EFFORT=high
AI_SILENT_FALLBACK=FORBIDDEN
```

Essa configuração é decisão canônica.

Sua implementação real e sua qualidade pedagógica precisam ser provadas separadamente.

## 48. Estado real da qualidade de IA

NÃO alegar que a geração final de IA está comprovada apenas porque: o pipeline funciona; mocks passam; conteúdo manual ficou bom; a UI exibe resumo e questões.

O benchmark real de geração exige uma chamada real ao provider/modelo decidido, sem edição manual, comparada à fonte.

Registrar no mínimo: SOURCE_FIDELITY, SUMMARY_QUALITY, QUESTION_QUALITY, ANSWER_QUALITY, HINT_QUALITY, PEDAGOGICAL_USEFULNESS.

Conteúdo manual usado para validar UX deve ser identificado como: CURATED_CONTENT_TEST.

Nunca: LIVE_AI_QUALITY.

## 49. Qualidade pedagógica é funcionalidade

No SmartLearn:

- resumo ruim = feature ruim.
- questão trivial = feature ruim.
- resposta que não ensina = feature ruim.
- dica que revela a resposta = feature ruim.
- feedback inútil = feature ruim.
- sequência sem progressão = feature ruim.

A qualidade pedagógica não pode ser terceirizada para a palavra "IA".

Ela deve ser testada no conteúdo real produzido.

## 50. Fidelidade médica

Em conteúdo médico: FLUÊNCIA NÃO SUPERA FIDELIDADE.

Se houver conflito: fidelidade à fonte/verdade > elegância textual.

Conteúdo gerado deve permanecer distinguível da fonte.

Nenhum texto persuasivo compensa erro médico.

## 51. Visão longitudinal do aluno

Com o uso, o SmartLearn constrói progressivamente um histórico de: materiais; unidades estudadas; prática; questões; acertos; erros; revisões; recência; tendência; resposta a intervenções.

Esse histórico é mais importante que qualquer sessão isolada.

Ele permite que o sistema deixe de responder apenas "O que aconteceu agora?" e passe a responder "Como este conteúdo e este aluno estão evoluindo ao longo do tempo?"

## 52. Perfil de competências

O sistema pode construir uma representação dinâmica de forças e fragilidades.

Essa representação: é baseada em observações; muda com novas evidências; não é identidade da pessoa; não é diagnóstico clínico; não deve virar score opaco e absoluto.

O sistema deve distinguir OBSERVAÇÃO de INTERPRETAÇÃO.

## 53. Futuro — otimizar como o aluno aprende

A visão de longo prazo vai além de decidir O QUE estudar.

Com observações suficientes e experimentação válida, o SmartLearn poderá comparar respostas do mesmo aluno a diferentes intervenções.

Possíveis dimensões futuras: duração de sessão; volume de questões; tipo de exercício; ordem das atividades; formato de explicação; tipo de recuperação ativa; forma de remediação; intervalo de revisão; resposta ao feedback.

Pergunta futura: "Qual abordagem faz ESTE aluno aprender melhor ESTE conteúdo?"

Isso transforma telemetria em otimização pedagógica personalizada.

Essa capacidade é VISÃO FUTURA. Não apresentá-la como implementada hoje.

## 54. Não diagnosticar o aluno

Padrões comportamentais não autorizam diagnóstico de: TDAH; autismo; transtornos; inteligência; personalidade; qualquer condição clínica.

O sistema pode observar: "desempenho cai em sessões longas".

Não pode converter automaticamente isso em: "o aluno tem TDAH".

A personalização futura deve responder a comportamento observado, não produzir rótulo clínico injustificado.

## 55. Futuro — caderno manuscrito

Direção futura explicitamente desejada:

o aluno escreve seu próprio resumo em caderno → fotografa/envia as páginas → SmartLearn interpreta a escrita → produz uma representação digital estruturada → o aluno revisa/corrige → o conteúdo passa a integrar sua unidade.

Objetivo: preservar o modo natural de estudar do aluno sem obrigá-lo a redigitar.

Isso NÃO é requisito de V1 atual. Não implementar até tarefa própria.

Mas a arquitetura conceitual deve evitar decisões desnecessárias que tornem essa entrada impossível no futuro.

## 56. Princípio de automação com controle

Automatize aquilo que desperdiça esforço. Preserve aquilo que constitui aprendizagem e autoria.

SmartLearn pode: gerar; extrair; organizar; calcular; agendar; sugerir; priorizar quando houver regra confiável.

O aluno continua podendo: ler; pensar; corrigir; editar; rejeitar; complementar; escolher; escrever.

Regra: AUTOMATIZE O TRABALHO ADMINISTRATIVO. PRESERVE A AUTORIA INTELECTUAL.

## 57. Simplicidade

Simplicidade é uma funcionalidade.

Cada novo botão, configuração, tela, estado, abstração, serviço, score, formulário cobra custo cognitivo e técnico.

Adicionar apenas quando o benefício superar esse custo.

Simplicidade não significa produto primitivo. Significa ALTA DENSIDADE DE VALOR.

## 58. Interface

A interface é parte do produto.

Uma função tecnicamente existente mas difícil de encontrar está parcialmente inexistente para o usuário.

Priorizar: descoberta; continuidade; clareza; hierarquia; feedback; próxima ação; baixo atrito; tempo até valor; acessibilidade; previsibilidade.

O estudante não deve aprender a administrar o SmartLearn antes de conseguir usar o SmartLearn para aprender Medicina.

## 59. Qualidade visual

Qualidade visual e interacional deve atingir padrão de produto digital de classe mundial.

Top 0,1% é piso, não teto.

Porém: beleza não pode destruir leitura; originalidade não pode destruir operação; motion não pode atrasar estudo; densidade não pode virar confusão; minimalismo não pode esconder informação necessária.

Para superfícies operacionais: CLAREZA × DENSIDADE ÚTIL × VELOCIDADE × PERSONALIDADE × LEGIBILIDADE devem coexistir.

Não aceitar estética de: admin dashboard genérico; SaaS template; planilha maquiada; card soup; painel financeiro transplantado; UI gamer sem função.

A aparência deve comunicar SmartLearn sem sacrificar eficiência.

## 60. Liberdade artística

A aparência histórica NÃO é autoridade estética eterna.

Um redesign pode reconsiderar: composição; grid; tipografia; profundidade; superfícies; cor; formas; motion; tratamento de gráficos; representação de disciplinas.

Restrições funcionais e semânticas permanecem.

Preferências estilísticas podem ser substituídas se uma solução materialmente superior for demonstrada.

Não fazer "visual atual + 10% de polish" quando o problema exige novo mundo visual.

## 61. Cores e semântica

Dois sistemas semânticos precisam permanecer independentes:

SUBJECT_COLOR = identidade categórica.

PERFORMANCE_COLOR = desempenho.

Nunca permitir que a mesma cor force o usuário a adivinhar qual significado está sendo comunicado.

NO_EVIDENCE usa estado neutro.

Tendência também deve permanecer semanticamente distinta de desempenho.

## 62. Acessibilidade

Acessibilidade é requisito de produto.

Interfaces relevantes devem suportar: teclado; foco visível; semântica correta; contraste adequado; zoom; labels acessíveis; reduced motion; feedback que não depende apenas de cor.

Não reduzir acessibilidade para atingir estética.

Uma interface bela que exclui utilização real não é excelente.

## 63. Mobile

Mobile deve preservar a DECISÃO. Não a geometria da planilha nem necessariamente a densidade do Desktop.

Tabelas densas podem virar: linhas compactas; agrupamentos; expansão; cartões funcionais; quando isso melhorar a leitura.

Não esconder informação material simplesmente por falta de espaço.

## 64. O adversário real

O adversário não é outra planilha. Nem outro dashboard.

O substituto mais perigoso é: PDF + IA GENÉRICA.

Se o aluno puder enviar PDF → pedir resumo → pedir perguntas e obtiver quase o mesmo valor, SmartLearn não justificou sua existência.

A vantagem precisa aparecer em: CONTINUIDADE + MEMÓRIA DE APRENDIZAGEM + PROVENIÊNCIA + PRÁTICA REAL + ERROS + REVISÃO + EVOLUÇÃO + DIAGNÓSTICO + PRÓXIMA AÇÃO.

## 65. Diferencial estrutural

Nenhuma feature isolada é defensável por muito tempo.

Concorrentes podem copiar: upload; resumo; questões; scheduler; gráfico; flashcard; IA.

O diferencial estrutural pretendido é a integração:

FONTE REAL + CONTEÚDO DE APRENDIZAGEM + AUTORIA + PRÁTICA + EVIDÊNCIA + HISTÓRIA LONGITUDINAL + REVISÃO + DIAGNÓSTICO + AÇÃO.

O sistema conhece não apenas o material. Conhece progressivamente a relação daquele estudante com o material.

## 66. O que SmartLearn não é

SmartLearn não deve degenerar em: leitor de PDF; chat com upload; gerador de resumo; gerador de questões; Anki médico; planner; agenda; calendário; LMS administrativo; dashboard de notas; sistema de gamificação; mecanismo de diagnóstico psicológico.

Esses elementos podem existir parcialmente dentro do produto. Nenhum define o produto.

## 67. Herança da planilha

A planilha original é EVIDÊNCIA DE DESCOBERTA DE PRODUTO. Não é arquitetura alvo.

A planilha original efetivamente analisada como referência do SmartLearn possuía estas abas funcionais:

1. Resumo
2. RP
3. Detalhe
4. Estatística 1
5. Estatística 2
6. Estatística 3 - disable
7. Acompanhamento
8. Disciplinas

Essa é a referência histórica válida para o trabalho atual. "Estatística 3 - disable" permanece referência histórica/experimental e não deve gerar funcionalidade. Contagem exata de abas sujeita a correção futura do usuário — não inferir um número maior que este.

Preservar: cadastro único gerando o restante; baixa carga administrativa; revisão automática; temporalidade; resultado = volume + acerto; evolução; disciplina como identidade; Hoje/Resumo como decisão; RP/Plano como inventário; Detalhe como execução; Estatísticas como diagnóstico; Acompanhamento como estado longitudinal.

Não preservar automaticamente: ranges fixos; fórmulas quebradas; checkboxes manuais; offsets antigos; médias estatisticamente incorretas; limites arbitrários; Apps Script histórico sem contrato; duplicatas; geometria da planilha.

Preservar FUNÇÃO. Eliminar COMPLEXIDADE ACIDENTAL.

## 68. Módulos históricos secundários

A planilha continha também, entre outros: simulados; pesos; resolvidos; links; dicas; edital; cópias históricas; experimentos.

Sua existência não os torna automaticamente requisito atual.

Eles só entram no SmartLearn mediante decisão contemporânea explícita.

Não restaurar feature porque "estava na planilha".

## 69. House Simulator

House Simulator permanece produto/conceito separado.

Não misturar seu domínio ao SmartLearn apenas porque ambos envolvem Medicina.

Integração futura, se houver, exige contrato próprio.

## 70. Estado real já provado

A implementação atual já provou partes relevantes do produto. Entre elas:

- Desktop local-first;
- backend local em loopback;
- persistência local;
- pacote standalone;
- pipeline real de material;
- material → proposta → aceitação;
- unidade aceita;
- Estudar agora;
- prática inicial;
- criação de learning_evidence;
- próxima revisão;
- revisão dos erros da sessão;
- Hoje com ação principal;
- 16 revisões;
- analytics ponderado;
- tracking longitudinal básico.

Não reconstruir sistemas estáveis apenas para encaixar uma preferência nova.

REUTILIZAR É PADRÃO. SUBSTITUIR EXIGE BENEFÍCIO MATERIAL.

## 71. O que ainda não deve ser declarado provado

Não declarar concluído sem evidência real:

- qualidade final da geração live pelo provider/modelo escolhido;
- avaliação pedagógica exaustiva de capítulos inteiros;
- scheduler adaptativo;
- retenção preditiva;
- priorização por impacto esperado;
- perfil psicológico;
- otimização individual de metodologia;
- processamento de caderno manuscrito;
- Companion completo;
- qualquer função futura não implementada.

CAPACIDADE PLANEJADA não é CAPACIDADE IMPLEMENTADA.

## 72. Estado atual de execução

Antes de qualquer trabalho, reler:

```
.specs/EXECUTION.md
.specs/STATE.md
PRODUCT_CONSTITUTION_PATH
QUALITY_STANDARD_PATH
```

No checkpoint atualmente persistido:

```
BRANCH=claude/smartlearn-v1-complete
CURRENT_TASK=SMARTLEARN_STATS_VISUAL_INTELLIGENCE_V1
```

Esse valor é transitório.

Git/EXECUTION atual prevalecem quando mudarem.

Não guardar HEAD transitório nesta constituição como verdade permanente.

## 73. Consequência para SMARTLEARN_STATS_VISUAL_INTELLIGENCE_V1

O redesign atual de Estatísticas NÃO deve tratar a página como dashboard administrativo.

A metáfora funcional correta é: VISUALIZAÇÃO DO ESTADO DE APRENDIZAGEM + INSTRUMENTO DE DECISÃO.

A página precisa tornar perceptível:

1. onde o aluno está;
2. quanto praticou;
3. como está evoluindo;
4. onde está a fragilidade;
5. qual profundidade explica a fragilidade;
6. qual ação se torna relevante.

Não inventar funcionalidades futuras para conseguir um visual interessante.

O design pode expressar: CONTINUIDADE, PROGRESSÃO, PRECISÃO, APRENDIZAGEM, AÇÃO.

Deve evitar aparência intercambiável com: Sales Analytics, CRM, finance dashboard, admin panel.

Teste: se trocar "SmartLearn" por "Sales Analytics" e a interface continuar semanticamente natural, a identidade do produto ainda está genérica demais.

## 74. Design das Estatísticas — invariantes

Preservar independentemente da direção artística:

- um único módulo Estatísticas;
- Por disciplina / Por conteúdo;
- desempenho, prática e tendência independentes;
- no evidence ≠ 0%;
- weighted accuracy correta;
- volume visível;
- período temporal coerente;
- tendência honesta;
- cor de disciplina ≠ desempenho;
- seleção de disciplina conduz ao detalhe;
- conteúdo selecionado revela sua evolução;
- próxima ação só quando sustentada;
- ausência de ranking/card soup redundante;
- gráficos servem decisão;
- leitura rápida;
- acessibilidade.

Todo o restante pode ser redesenhado.

## 75. Futura telemetria mais rica

O sistema poderá futuramente observar sinais adicionais.

Exemplos: tempo por questão; tempo por sessão; uso de dica; solução revelada; repetição do mesmo erro; desempenho retardado; transferência para contexto diferente.

Mas cada sinal deve preservar: observação → interpretação → limite.

Não promover uma heurística a verdade cognitiva.

## 76. Princípio de evidência

OBSERVAR PRIMEIRO. INTERPRETAR DEPOIS. RECOMENDAR SÓ O QUE A EVIDÊNCIA SUSTENTA.

Nunca: atividade = aprendizagem.

Nunca: resposta correta = domínio definitivo.

Nunca: erro = causa cognitiva conhecida.

Nunca: score baixo = baixa capacidade.

## 77. Princípio de produto primeiro

Valor percebido pelo estudante precede completude arquitetural abstrata.

A ordem preferencial é: provar que funciona → provar que é útil → melhorar → robustecer → escalar.

Não inverter essa ordem sem necessidade concreta.

Uma solução arquitetural sofisticada para uma experiência ruim continua sendo produto ruim.

## 78. Não reconstruir o que já funciona

Se já existem: pipeline PDF; extraction; draft; acceptance; exercises; attempts; evidence; reviews;

reutilize.

Não criar "versão 2" simplesmente porque uma abstração parece intelectualmente mais elegante.

Conecte primeiro as peças em uma experiência extraordinária.

## 79. Alteração de schema

Schema e migration possuem custo real.

Antes de criar campo/tabela nova: "A experiência desejada é impossível com o modelo existente?"

Se não: não altere schema.

Dados novos devem nascer de necessidade real de produto, não de antecipação.

## 80. Critério de uma feature

Feature não termina quando: endpoint existe; tabela existe; função existe; teste unitário passa.

Ela termina para o usuário quando a experiência relevante funciona de ponta a ponta.

Exemplo:

não: "suporte a erro implementado".

sim: "depois de errar, o estudante consegue revisar exatamente o que errou."

## 81. Teste de produto

Pergunta de ouro: "Eu consigo pegar um material médico e aprender melhor com SmartLearn do que sem ele?"

Jornada de prova:

1. envio um material real;
2. o sistema o transforma em unidades úteis;
3. recebo conteúdo de estudo utilizável;
4. posso corrigir/assumir autoria;
5. encontro questões adequadas;
6. começo a aprender rapidamente;
7. meus resultados são registrados sem trabalho redundante;
8. meus erros permanecem úteis;
9. minhas revisões aparecem automaticamente;
10. consigo perceber forças e fraquezas;
11. consigo ver evolução;
12. encontro rapidamente a próxima ação.

Se essa sequência não é materialmente melhor que PDF + IA genérica + organização manual, o produto ainda não terminou.

## 82. Métricas de qualidade do produto

Não usar apenas: testes verdes; build; cobertura; número de features.

Perguntas de produto:

- quanto tempo até o aluno começar a aprender?
- quantas decisões administrativas foram removidas?
- a explicação realmente ajudou?
- as questões são pedagogicamente boas?
- os erros ficaram claros?
- revisão apareceu sem esforço?
- a leitura de desempenho é honesta?
- a próxima ação ficou evidente?
- houve dead end?
- o aluno precisou procurar manualmente algo que o sistema já conhecia?
- o usuário preferiria esta experiência a PDF + IA genérica?

## 83. Padrão de qualidade

Top 0,1% é piso, jamais teto.

Isso NÃO significa maximizar complexidade. Significa tomar decisões extraordinariamente boas.

Qualidade deve existir onde produz valor: aprendizagem; fidelidade médica; clareza; confiabilidade; continuidade; dados; feedback; interface; próxima ação.

Excelência também significa saber o que NÃO construir.

Se o escopo competir com excelência: REDUZIR ESCOPO ANTES DE REDUZIR QUALIDADE.

## 84. Critérios de uma boa decisão de agente

Antes de propor qualquer feature, tela, modelo ou abstração, perguntar:

1. Isso ajuda o estudante a aprender melhor?
2. Isso reduz carga administrativa ou decisória?
3. Isso melhora fidelidade, continuidade ou evidência?
4. Isso aproxima diagnóstico da execução?
5. O sistema já conhece esse dado?
6. Estamos obrigando o aluno a informar algo redundante?
7. Existe solução mais simples?
8. Estamos tentando resolver uma necessidade real ou antecipada?
9. Isso fortalece nossa vantagem sobre PDF + IA genérica?
10. Conseguimos provar o benefício no produto real?

Se respostas forem fracas: não construir ainda.

## 85. Regra para decisões de design

Perguntar: "Qual decisão trouxe o estudante até esta tela?"

A tela deve responder essa decisão imediatamente.

- Hoje: o que faço agora?
- Plano: o que existe e em que estado?
- Acompanhamento: qual é o estado desta unidade?
- Estatísticas: como estou, onde está a fragilidade e como evoluo?
- Materiais: como transformo meu material em aprendizagem?
- Estudar agora: como aprendo/pratico este conteúdo?
- Configurações: como altero preferências secundárias?

Nenhuma superfície deve tentar responder tudo.

## 86. Regra para decisões de IA

Antes de usar IA, definir: qual entrada recebe? qual saída precisa produzir? qual conhecimento deve preservar? que erro é inaceitável? como o usuário corrige? como a fonte permanece reconstruível? qual modelo/provider/effort está sendo avaliado? como sabemos que melhorou aprendizagem?

"Vamos usar IA" nunca encerra a especificação.

## 87. Regra para novas métricas

Antes de mostrar uma métrica:

1. qual fato representa?
2. como é calculada?
3. qual denominador possui?
4. que quantidade mínima de observação a sustenta?
5. o que significa ausência?
6. o aluno consegue interpretá-la?
7. que decisão muda por causa dela?
8. qual interpretação errada previsível ela pode causar?

Se não houver resposta adequada: não apresentar.

## 88. Regra para automação

Automatizar quando: fato é observável; cálculo é determinístico; ação administrativa é previsível; risco de interpretação é baixo; automação reduz esforço real.

Solicitar participação humana quando: há julgamento pedagógico; conteúdo pode estar errado; organização admite alternativas relevantes; autoria importa; decisão altera significado; evidência não é suficiente.

## 89. Regra para o futuro

Uma visão futura pode orientar arquitetura. Ela NÃO autoriza implementação prematura.

Para capacidades FUTURAS: preservar opcionalidade razoável ≠ construir infraestrutura agora.

Não criar subsistemas hipotéticos para caderno manuscrito, adaptação metodológica ou predição antes de tarefas próprias demonstrarem necessidade.

## 90. Classificação obrigatória de novas informações

Agentes devem classificar afirmações relevantes como:

- CANÔNICO — decisão vigente.
- IMPLEMENTADO/PROVADO — comportamento sustentado por código/teste/evidência real.
- PARCIAL — existe em parte.
- FUTURO — visão aprovada, não implementada.
- HISTÓRICO — informação preservável, mas não ativa.
- SUPERSEDED — foi explicitamente substituída.
- CONFLITO — afirmações incompatíveis ou sem prova suficiente.

Nunca transformar FUTURO em IMPLEMENTADO.

Nunca transformar HISTÓRICO em CANÔNICO apenas porque foi encontrado num documento antigo.

## 91. Conflitos históricos já resolvidos

Não reabrir sem nova evidência:

A. SERVER-CENTRAL COMO AUTORIDADE UNIVERSAL — SUPERSEDED para Desktop por ARCH-01.

B. 13 REVISÕES DA PLANILHA — HISTÓRICO. V1 atual = 16.

C. FSRS / SCHEDULER ADAPTATIVO — NÃO é V1.

D. CHECKBOXES MANUAIS DE ACOMPANHAMENTO — SUBSTITUÍDOS por estado derivado.

E. MÉDIA SIMPLES DE PERCENTUAIS — NÃO usar como performance agregada quando há denominadores.

F. HOUSE INTEGRADO AO SMARTLEARN — NÃO.

G. IA GERADA = VERDADE — NÃO. DRAFT + revisão/aceitação/proveniência.

## 92. Capacidades futuras não negociadas

Não inferir automaticamente que devem existir: gamificação; rankings entre alunos; social; marketplace; professor dashboard; diagnóstico clínico; modelo de domínio cognitivo complexo; LLM multi-agent interno; scheduler adaptativo; mastery score autoritativo; previsão de nota; recomendação curricular nacional automática.

Qualquer uma exige decisão própria.

## 93. Critério de diferenciação

Uma função isolada pode ser copiada. O ciclo integrado é o ativo.

Teste mental: se removermos a continuidade entre material → conteúdo → prática → evidência → revisão → diagnóstico → ação, SmartLearn vira um conjunto comum de ferramentas.

Se preservarmos essa continuidade e ela for excepcionalmente bem executada, SmartLearn se torna substancialmente mais difícil de substituir.

## 94. Frase canônica curta

SmartLearn transforma material médico em aprendizagem executável e mantém um ciclo longitudinal que observa a prática, identifica fragilidades e conduz o estudante à próxima ação com o mínimo possível de administração.

## 95. Frase canônica completa

SmartLearn é um sistema de execução e otimização da aprendizagem médica: transforma o material do estudante em conteúdo e prática prontos para uso, preserva sua autoria e a proveniência da fonte, observa honestamente o que acontece durante o estudo, constrói um histórico longitudinal de desempenho, prática e revisão e converte esse estado em diagnóstico e próxima ação — retirando do estudante a maior parte possível do trabalho administrativo para que sua energia permaneça concentrada em aprender Medicina.

## 96. Invariantes finais

Uma decisão futura NÃO pode violar silenciosamente estes invariantes:

- **I-01** — O aluno aprende; o sistema administra o rastro.
- **I-02** — Material deve poder virar aprendizagem, não apenas arquivo.
- **I-03** — Automação reduz administração sem retirar autoria intelectual.
- **I-04** — IA gera proposta; autoridade e rastreabilidade permanecem fora do modelo.
- **I-05** — Fonte e conteúdo derivado devem continuar distinguíveis.
- **I-06** — Review schedule e learning history são domínios diferentes.
- **I-07** — Evidência preserva volume + resultado quando conhecidos.
- **I-08** — Sem evidência não é zero.
- **I-09** — Erro deve poder alimentar nova aprendizagem.
- **I-10** — Analytics serve decisão.
- **I-11** — Desempenho, prática e tendência são conceitos independentes.
- **I-12** — Disciplina e desempenho possuem semânticas visuais diferentes.
- **I-13** — A próxima ação deve emergir quando os dados permitem.
- **I-14** — Dados que o sistema observou não devem ser pedidos novamente ao aluno.
- **I-15** — Baixa carga administrativa é requisito, não polimento.
- **I-16** — A experiência não deve expor complexidade arquitetural desnecessária.
- **I-17** — 16 revisões fixas permanecem V1 até decisão explícita em contrário.
- **I-18** — Desktop é o produto completo local-first no contrato arquitetural atual.
- **I-19** — Qualidade pedagógica é funcionalidade.
- **I-20** — Fidelidade médica supera fluência.
- **I-21** — Futuro não pode ser apresentado como implementado.
- **I-22** — Produto real prevalece sobre checklist.
- **I-23** — Se PDF + IA genérica produz quase o mesmo valor, SmartLearn ainda não cumpriu sua proposta.

## 97. Teste de aceitação da constituição

Depois de persistir este documento, valide semanticamente contra: Quality Standard vigente; Heritage Contract; STATE atual; EXECUTION atual; comportamento real; testes relevantes.

Procure especificamente:

- conflito arquitetural antigo server-central vs ARCH-01;
- regressão para 13 revisões;
- confusão review_tasks/learning_evidence;
- no evidence tratado como 0%;
- IA futura tratada como implementada;
- summary gerado tratado como imutável;
- planilha histórica tratada como arquitetura alvo;
- analytics sem denominador;
- diagnóstico sem ação;
- tarefas administrativas desnecessárias;
- funcionalidades futuras sendo puxadas indevidamente para V1.

Se houver conflito real: NÃO o harmonize silenciosamente.

Classifique CONFLITO e preserve a autoridade superior.

## 98. Efeito desta constituição sobre tarefas futuras

Este documento é CONTEXTO DE PRODUTO. Não é backlog.

Não transformar seus 98 itens em 98 tarefas.

Para cada tarefa futura, carregar apenas: objetivo; invariantes relevantes; estado real; arquivos relevantes; critérios de conclusão.

Não despejar esta constituição inteira em todo prompt quando alguns parágrafos forem suficientes.

O objetivo desta persistência é evitar perda de conhecimento. Não aumentar cerimônia.

## 99. Regra de continuidade dos agentes

Ao retomar depois de perda de contexto:

1. ler EXECUTION;
2. reconciliar Git;
3. ler STATE;
4. ler PRODUCT_CONSTITUTION_PATH;
5. ler QUALITY_STANDARD_PATH;
6. ler somente a spec da tarefa atual;
7. continuar da primeira evidência material ainda não provada.

Não reconstruir o chat.

Não pedir ao usuário para repetir decisões que já estão registradas.

## 100. Condição final

O SmartLearn será um produto excelente quando a sofisticação interna desaparecer da experiência externa.

O estudante deve conseguir viver algo próximo disto:

"Enviei o que preciso estudar. O SmartLearn preparou. Eu estudei. Ele sabe o que aconteceu. Ele me mostra o que merece atenção. Eu continuo."

Se essa simplicidade exterior for sustentada por conteúdo médico fiel, evidência honesta, memória longitudinal, revisões automáticas, análise útil e próxima ação clara, o sistema estará cumprindo sua razão de existir.

Se exigir que o estudante se transforme em administrador do próprio sistema, falhou.

Se apenas gerar texto, falhou.

Se apenas registrar notas, falhou.

Se apenas mostrar gráficos, falhou.

Se apenas agendar revisões, falhou.

Se integrar tudo isso para produzir aprendizagem melhor com menos atrito, cumpriu sua função.
