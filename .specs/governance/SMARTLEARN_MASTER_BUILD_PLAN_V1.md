# SmartLearn — Master Product Build Plan

```
STATUS=CANÔNICO
FOCO=PRODUTO_REAL
QUALIDADE=TOP_0_1_PERCENT_COMO_PISO
```

/goal Construir o SmartLearn como o sistema de aprendizagem médica mais eficaz, simples e inteligente possível: transformar o material do aluno em um ambiente completo e imediatamente utilizável de estudo, acompanhar longitudinalmente sua aprendizagem por evidência real e converter continuamente desempenho, prática, erros e revisões na melhor próxima ação — reduzindo ao mínimo toda carga administrativa para que sua energia permaneça concentrada em aprender Medicina, com qualidade de produto, pedagogia e experiência top 0,1% como piso.

Este documento é o mandato de execução vigente sobre [[SMARTLEARN_PRODUCT_CONSTITUTION_V1]] — a constituição define intenção/invariantes de produto; este arquivo define a sequência e o padrão de entrega para transformar o produto real.

## 1. Resultado final esperado

Não terminar com arquitetura interessante, design system isolado, páginas bonitas isoladas, endpoints, documentação, protótipos ou mais dashboard/infraestrutura. Terminar com um PRODUTO utilizável de ponta a ponta:

"Enviei meu material. O SmartLearn o preparou. Comecei a estudar. As questões já estavam prontas. Meus resultados foram registrados. Meus erros continuaram disponíveis para correção. As revisões apareceram automaticamente. Consigo ver onde estou bem, onde estou fraco e como estou evoluindo. O sistema me conduz ao que vale fazer agora. Eu praticamente não administro o sistema — eu estudo."

Essa experiência é autoridade sobre todas as decisões seguintes.

## 2. Princípio soberano

SMARTLEARN DEVE MAXIMIZAR APRENDIZAGEM E MINIMIZAR META-TRABALHO. Automatize o trabalho administrativo. Preserve a autoria intelectual.

## 3. Ciclo central

MATERIAL → ESTRUTURAÇÃO → RESUMO → QUESTÕES → ESTUDO ATIVO → PRÁTICA → EVIDÊNCIA → ERROS → REVISÃO → ANÁLISE → DIAGNÓSTICO → PRÓXIMA AÇÃO → NOVA PRÁTICA. Nenhuma feature isolada define o produto — o diferencial está na continuidade.

## 4. O adversário real

Benchmark mínimo: PDF + IA genérica + organização manual. Vantagem precisa aparecer em continuidade, memória longitudinal, material estruturado, proveniência, questões prontas, prática observada, erros persistidos, revisões automáticas, acompanhamento, análise, diagnóstico, próxima ação.

## 5. Princípio product-first

Produto > processo. Valor percebido > completude abstrata. Slice vertical > camada horizontal. Reutilização > reescrita. Evidência > opinião. Uma mudança só merece existir agora quando: (A) melhora materialmente o produto; (B) é necessária para entregar essa melhoria; (C) evita risco real de dados/segurança/continuidade. O resto espera.

## 6. Padrão de qualidade

Top 0,1% é piso, não teto — em aprendizagem, conteúdo médico, design, UX, clareza, interação, acessibilidade, confiabilidade, feedback, estatística, acabamento. Excelência não é complexidade máxima; é a melhor decisão para o objetivo real. Reduza escopo antes de reduzir qualidade.

## 7. Arquitetura da experiência

Um único instrumento, superfícies com função própria (nenhuma tenta responder tudo):

- **Hoje** — "O que preciso fazer agora?"
- **Materiais** — "Como transformo meu material em aprendizagem?"
- **Plano** — "O que já existe no meu percurso e em que estado está?"
- **Estatísticas** — "Como estou, onde estão minhas lacunas e como estou evoluindo?"
- **Acompanhar** — "Qual é o estado longitudinal do que estou aprendendo?"
- **Disciplinas** — "Como meu universo de estudo está organizado?"
- **Configurações** — "Quais preferências secundárias preciso alterar?"
- **Conta** — "Qual é meu contexto pessoal e de dados?"

## 8. Referência da planilha original

8 abas funcionais (referência de FUNÇÃO, não recriar literalmente): Resumo, RP, Detalhe, Estatística 1, Estatística 2, Estatística 3-disable (histórica/experimental), Acompanhamento, Disciplinas. Não adicionar automaticamente simulados/peso das matérias/edital/links/resolvidos/dicas — só mediante decisão explícita nova.

## 9-20. Ciclo de aprendizagem (material → evidência)

- Material é porta de entrada: enviar → preparar → estudar, sem expor complexidade interna (origem/checksum/páginas/estado de processamento).
- Documentos grandes viram unidades semânticas (não divisão arbitrária por página); IA propõe, aluno aceita/corrige/une/divide/renomeia.
- Resumo Mestre: IA acelera o início, nunca é dona do conteúdo intelectual do aluno.
- Caderno manuscrito (foto → interpretação → estruturação) é direção futura aprovada, **não escopo atual** — só evitar decisões que a tornem impossível depois.
- Conteúdo de IA nasce PROPOSTA (source→extraction→proposal→draft→human review→accepted); fidelidade > eloquência.
- Questões prontas antes do estudo, variedade pedagógica real (não só múltipla escolha), resposta ensina, dica ajuda a pensar (não entrega a resposta).
- "Estudar agora" sem dead end: resumo → recuperação ativa → questão → dica → resposta → feedback → próxima → resultado → erros → próxima ação.
- Erro é matéria-prima: identificar → compreender → corrigir → retestar, antes de analytics sofisticado.
- `review_tasks ≠ learning_evidence` (agenda nunca substitui história); sistema nunca redigita o que já observou.
- Prática externa: registrar questões+acertos, sistema calcula percentual, nunca inventa tentativas individuais.
- Denominador importa: guardar `37/50`, não só `74%`.
- Sem evidência ≠ zero, em dados/cálculos/cores/tabelas/gráficos/recomendações.
- V1 = scheduler FIXO, 16 revisões (D+1…D+390). Não implementar agora: FSRS, scheduler adaptativo, ML de retenção, mastery engine.

## 21-25. Hoje, Plano, Acompanhar, Disciplinas

- **Hoje**: superfície de AÇÃO, não dashboard. Prioridade: atrasado → hoje → próxima ação → horizonte próximo.
- **Plano**: inventário longitudinal compacto (disciplina/unidade/data/resumo/prática/última atividade/próxima revisão/estado); não 16 colunas de revisão.
- **Acompanhar**: estado derivado automaticamente (ATRASADO/SEM_EVIDENCIA/EM_REVISAO/EM_ESTUDO/EM_DIA), nunca checkbox manual pra fato que o sistema já sabe.
- **Disciplinas**: identidade visual estável, cor = identidade nunca desempenho, criação inline quando evita interromper o fluxo.

## 26-33. Estatísticas e telemetria

Já resolvida nesta sessão (protótipo isolado + esta conversa) — ver [[project_stats_prototype]]. Um módulo, duas profundidades (Por disciplina / Por conteúdo), desempenho/prática/tendência sempre independentes, `weighted_accuracy = SUM(correct)/SUM(questions)` nunca média simples, sem-evidência nunca fabrica série zerada, feedback de prática reconhece comportamento sem virar segunda nota, próxima ação aproxima diagnóstico de execução (zero busca manual). Telemetria existe pra melhorar a próxima execução, não para produzir gráfico. Personalização por tipo de intervenção é visão futura — não implementar agora, não inferir diagnóstico clínico (TDAH/autismo/etc) de padrão comportamental.

## 34-39. Design, identidade, componentes

- **Autoridade visual atual**: Estatísticas aprovada (este protótipo) + DESIGN.md. Não redescobrir o produto página por página — copiar a LINGUAGEM (tokens/tipografia/ritmo/densidade/cores/radius/controles/motion/acessibilidade), não a geometria literal.
- **Identidade**: preciso, inteligente, contemporâneo, médico sem clichê hospitalar, sofisticado, energético sem fadiga, próprio. Teste: trocar "SmartLearn" por "Sales Analytics" não pode continuar soando natural.
- **Disciplinas**: superfície neutra + faixa lateral da subjectColor + borda discreta + radius compacto. `subjectColor` = categoria, nunca desempenho. Não usar bolinha quando a linguagem estrutural (chip) já resolve.
- **Context switcher de disciplina** (padrão aprovado nesta sessão): trigger = disciplina atual; menu = só as alternativas (disciplina ativa nunca se repete dentro do próprio menu que abre); opções reusam o chip `.subject-cell` real, não bolinha/quadrado/preenchimento sólido.
- **Bibliotecas**: mecânica sim, identidade não — nunca aceitar aparência padrão de biblioteca como design final; não migrar framework só para ganhar um componente.
- **Design system**: tokens → foundations → primitives → composites → shell → famílias de página → exceções. Reutilizar só quando a semântica é a mesma.

## 40-49. Superfícies, qualidade, acessibilidade, motion

Cobrir as superfícies reais do repositório (Hoje, Materiais, Plano, Estatísticas, Acompanhar, Disciplinas, Configurações, Conta) e seus estados (vazio, carregando, erro, densidade real) — sem inventar páginas novas. Critérios por superfície em §41-46 do brief original do usuário (Hoje = ação não estatística; Materiais = arquivo→aprendizado sem expor processamento técnico; Plano = densidade alta, burocracia baixa; Acompanhar = deriva automaticamente; Disciplinas = identidade cromática forte sem virar admin; Configurações/Conta = silenciosas, não competem visualmente com as superfícies centrais). Acessibilidade obrigatória (teclado, foco visível, semântica, contraste, zoom, reduced motion, labels, feedback não só por cor). Mobile preserva decisão e ação, não só encolhe tabela. Motion revela mudança/profundidade/seleção — nunca atrasa o estudo nem existe só pra impressionar.

## 50. Sequência de construção

Trabalhar em famílias coerentes, não página por página isolada:

- **A.** Sistema visual compartilhado (tokens/primitives/shell consolidados a partir do que já foi aprovado em Estatísticas)
- **B.** Fluxo central de aprendizagem (Materiais → unidades → resumo → questões → Estudar agora → erros → revisão)
- **C.** Decisão diária (Hoje)
- **D.** Estado longitudinal (Plano + Acompanhar)
- **E.** Inteligência analítica (Estatísticas por disciplina + por conteúdo)
- **F.** Organização (Disciplinas)
- **G.** Superfícies secundárias (Configurações + Conta)
- **H.** Produto como conjunto (responsividade, acessibilidade, estados, continuidade, acabamento)

## 51-54. Regra de execução

CONSTRUA → USE → OBSERVE → CORRIJA O MAIOR DEFEITO → CONTINUE. Não parar após cada tela; não pedir aprovação pra microdecisão técnica. Voltar ao usuário só quando a decisão muda o produto, altera escopo, cria trade-off importante, tem custo externo, é irreversível, ou contradiz esta especificação. Preservar o que já funciona (pipeline, evidence, reviews, componentes aprovados, design de Estatísticas, context switcher, subject representation) — refatorar só quando melhora ou desbloqueia produto real.

## 55-59. Não fazer / limites

Não: replanejar tudo antes de começar; arquitetura hipotética; reconstruir backend sem necessidade; alterar schema por antecipação; abas históricas extras; House Simulator (permanece separado); FSRS; mastery engine; diagnóstico psicológico; gamificação gratuita; dashboard genérico; copiar visual padrão de biblioteca; métricas duplicadas; dados inventados pra preencher gráfico; mais administração pro aluno; parar em DESIGN.md; considerar página pronta sem ver funcionando. Arquitetura real comprovada do repositório é autoridade — Desktop atual é a autoridade funcional completa; não usar doc histórico pra reverter decisão moderna. IA: mock não prova qualidade, pipeline funcionando não prova pedagogia — só avaliação real com material médico real sem curadoria manual conta.

## 60-63. Critério de sucesso e Definition of Done

Jornada de 17 passos (material → estudar → errar → revisar → Hoje → Plano → Estatísticas → próxima ação) precisa funcionar de ponta a ponta sem buracos importantes. Teste de excelência: "eu escolheria usar isso todo dia pra estudar Medicina?", "é claramente melhor que PDF + IA genérica?", "parece um produto só, do mesmo time?". DONE ≠ "todas as páginas receberam CSS novo". DONE = fluxo principal ponta a ponta, linguagem visual única, conteúdo médico rigoroso, baixa carga administrativa, estatística honesta, evidência preservada, próxima ação compreensível, acessibilidade real, nenhuma superfície claramente inferior às demais, produto percebido como UM sistema.

## 64. Autonomia

Autorizado a executar sem aprovação página a página. Decisões locais/reversíveis/técnicas são do agente. Volta ao usuário só quando a decisão muda produto/escopo, cria trade-off importante, tem custo externo, é irreversível, ou contradiz esta spec.

## 65. Regra de ouro

Construa a coisa que o aluno vai sentir. Prove o suficiente pra confiar nela. Use-a. Corrija o maior atrito. Continue. Na dúvida: "qual é a menor mudança que fará o SmartLearn ajudar alguém a aprender perceptivelmente melhor?" — faça essa mudança.

## Entrega

Sem push, merge ou deploy sem autorização explícita. Relatório final por sessão de trabalho no formato: `PRODUCT_JOURNEY=`, `SURFACES_COMPLETED=`, `DESIGN_SYSTEM=`, `CORE_LEARNING_FLOW=`, `TODAY=`, `MATERIALS=`, `PLAN=`, `STATISTICS=`, `TRACKING=`, `SUBJECTS=`, `SETTINGS=`, `ACCOUNT=`, `ACCESSIBILITY=`, `RESPONSIVE=`, `TESTS=`, `REAL_PRODUCT_VALIDATION=`, `KNOWN_LIMITATIONS=`, `FILES_CHANGED=`, `COMMITS=`, `HEAD=`, `WORKTREE_CLEAN=` — nunca marcar um campo como concluído sem prova real (screenshot/teste executado).
