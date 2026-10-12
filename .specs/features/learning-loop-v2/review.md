# Revisão de engenharia e de metodologia — ciclo pedagógico do SmartLearn (2026-10-12)

Origem: definição do usuário em 2026-10-12 ("se não está desse jeito, está errado"). Esta revisão compara a definição com o produto REAL (código, testes, Git) e com a metodologia de avaliação em uso (Prompt Lab). Nada aqui altera código; o plano da §5 só executa depois dos portões da §6.

## 1. Definição adotada (decisão humana, 2026-10-12)

1. O SmartLearn não começa no resumo: começa no conhecimento que o aluno JÁ estudou na fonte.
2. O Resumo Mestre REATIVA a memória: dá pistas para o aluno reconstruir o conteúdo essencial sem reler o capítulo. Não substitui a fonte e não precisa conter tudo o que os exercícios podem exigir.
3. Os exercícios têm três funções: (a) fortalecer a aprendizagem (prática de recuperação), (b) verificar o que o aluno consegue recuperar, (c) revelar o que precisa ser reestudado.
4. Ciclo: estudo inicial → registro (disciplina, tema, subtema, material) → Resumo Mestre → exercícios → demonstrou? SIM: registrar desempenho e seguir as revisões; NÃO: investigar a dificuldade → VOLTAR AO MATERIAL ORIGINAL → corrigir a compreensão (e revisar o resumo se preciso) → tentar de novo. Tudo alimenta estatísticas por tema e subtema e as próximas revisões.
5. O retorno à fonte é o elemento decisivo do ciclo.
6. Uma resposta errada é SINAL, não diagnóstico. Causas possíveis: esquecimento; compreensão insuficiente; resumo incompleto; conceito equivocado (misconception); falha de pré-requisito. O sistema acumula evidência, de preferência em perguntas DIFERENTES sobre o mesmo conhecimento, antes de sugerir a causa.
7. O diferencial é o mapa do conhecimento (disciplina → tema → subtema), com quantidade, tipo e histórico das questões; nome: "Mapa de Conhecimento e Lacunas de Aprendizagem"; desempenho OBSERVADO é separado de domínio INFERIDO.
8. Lógica de apresentação: a IA ajuda no conteúdo; a gestão do estudo organiza a continuidade; os exercícios produzem evidência; as estatísticas dizem onde investir o próximo minuto.
9. Distinção obrigatória: registro de questões, agenda e estatísticas básicas existem; diagnóstico fino por subtema e priorização verdadeiramente adaptativa NÃO existem e exigem desenvolvimento e validação.

## 2. Livro de requisitos (rastreável)

```
R1  Resumo = pistas de reativação, não reprodução da fonte; não precisa cobrir tudo o que as questões exigem
R2  Exercícios cumprem as 3 funções (fortalecer, verificar, revelar)
R3  O ciclo completo da §1.4, incluindo o ramo "não demonstrou"
R4  Retorno à fonte é ação de primeira classe (abrir o ponto, registrar, tentar de novo)
R5  Erro ≠ causa: as 5 situações são HIPÓTESES com evidência acumulada em perguntas diferentes
R6  Mapa de Conhecimento e Lacunas por disciplina/tema/subtema, com n, tipo, histórico; observado × inferido
R7  Honestidade de estado: o que existe × o que falta (§1.9)
R8  Metodologia de avaliação mede o que o produto promete (reativação, não só fidelidade e compressão)
INVARIANTES (herdados, não reabrir): I.12 não inventar domínio; REVIEW_TASK ≠ LEARNING_EVIDENCE; IA = rascunho até aceite humano;
  automatizar logística, não o raciocínio do aluno (I.8); mínima carga administrativa; scheduler V1 fixo; sem evidência ≠ 0%;
  Estatísticas é superfície protegida; sourceLanguage ≠ uiLocale ≠ generationLocale; nada de merge/deploy/release sem ordem.
```

Reconciliação com a Constituição (`SMARTLEARN_PRODUCT_CONSTITUTION_V1.md`): §I.4 (resumo = reconstrução), §I.6 (erro → identificar → explicar → corrigir → retestar), §I.7, §I.12 já dizem o essencial; NÃO há conflito. A definição ACRESCENTA: o retorno à fonte como passo explícito, as 5 causas como hipóteses, o nível de subtema e o nome do mapa. Registrado como adendo §I.18.

## 3. Engenharia: o que existe × o que falta (por evidência no código)

| Req | Estado | Evidência | Falta |
|---|---|---|---|
| R2 | PARCIAL-FORTE | `exercise_attempts` + `learning_events` (ledger imutável, CORRECT/INCORRECT/UNKNOWN, ajuda usada, `confidence`, autoavaliação); "Refazer erros" (`e2e/hoje-block-retest.spec.js`, `attempts.priorWrongExercises`) | nada estrutural; medir se "fortalece" exige o mapa (R6) |
| R3 | PARCIAL | ramo SIM existe (evidência + revisões fixas de 16); ramo NÃO existe só como "refazer erros" e reforço por unidade (`reinforcementByUnit`) | investigar → voltar à fonte → corrigir → revisar resumo → tentar de novo não é um fluxo |
| R4 | FRACO | a questão mostra o trecho GUARDADO ("Trecho do material · fonte, página N", `src/app.js:3400`, vindo de `exercise_source_citations.page_index`) | abrir o ponto na fonte original, registrar que o aluno voltou (evento), reapresentar a mesma questão depois do retorno, ligar "resumo incompleto" ao editor |
| R5 | AUSENTE | resultado do ledger é binário/UNKNOWN; sem campo de causa | modelo de hipótese de causa; regras de evidência (n mínimo, perguntas distintas); opção de autorrelato barato |
| R6 | AUSENTE no nível pedido | estatísticas por disciplina e unidade/tema (`src/stats.js`, drill-down); prioridades por unidade; tabela `competencies` existe (rótulo por unidade) mas NADA a preenche: nem a geração, nem o aceite, nem a UI | entidade de conhecimento/subtema ligada às questões; agregação por subtema; rótulo "evidência insuficiente"; n, tipo e histórico visíveis |
| R7 | OK | o texto da §1.9 confere com o código | manter a distinção em toda a apresentação do produto |
| R1 | ALINHADO NA INTENÇÃO, SEM PROVA | v8/v10 e MED-SUM V2.7.5 já pedem "não reprodução abreviada" | ver §4 |

Achados de engenharia que a definição expõe: (E1) não há identidade de "conhecimento" estável entre resumo, questões e estatística; é o pré-requisito de R5 e R6. (E2) o ledger registra COMO o aluno respondeu, mas não O QUE ele fez a seguir (voltar, reestudar, tentar de novo). (E3) a ligação questão → página da fonte existe, mas termina em texto copiado; não há retorno ao material original. (E4) o resumo não tem caminho de realimentação a partir de erro.

## 4. Metodologia: o que a avaliação atual mede × o que o produto promete

O Prompt Lab (`rubric.md`, `coverage.mjs`, canário v8 × v10) mede fidelidade (H1–H8), cobertura de conceitos, razão resumo/fonte e fração de frases com trecho. Isso protege contra erro e cópia, mas:

- (M1) Nenhum critério mede REATIVAÇÃO: só Q10 ("utilidade para recuperação posterior") toca nela, sem procedimento. "Compressão" é proxy de "não é reprodução"; não mede se as pistas bastam para reconstruir.
- (M2) O mapa de conceitos (`source-maps/*.json`) trata os 19 conceitos como equivalentes. A definição exige separar ESSENCIAIS (devem estar no resumo) de PERIFÉRICOS (podem ficar só nas questões e na fonte): a cobertura 19/19 mistura os dois.
- (M3) Questões são avaliadas uma a uma. A definição exige VÁRIAS formulações por conhecimento essencial (para separar esquecimento de má compreensão); nada mede isso (conceito × número de questões distintas).
- (M4) Não há avaliação do ramo "errei": a explicação leva ao ponto certo da fonte? O trecho citado é o que de fato resolve a dúvida?
- (M5) Estatística é avaliada por exatidão de contagem, não por utilidade da decisão (a pergunta §I.7 "o que merece minha atenção agora?").

Revisões metodológicas propostas (sem tocar produto):
1. Rubrica de reativação para o resumo: para cada conceito ESSENCIAL, uma pista suficiente para o aluno que já estudou reconstruir o mecanismo (teste: juiz humano ou IA assistida responde "dado só o resumo, qual é o mecanismo/valor/condição?" sobre uma amostra de essenciais; o resumo NÃO é reprovado por omitir periféricos).
2. Mapa de conceitos v2: cada conceito marcado ESSENCIAL | RELEVANTE | PERIFÉRICO. Cobertura passa a ser: 100% dos essenciais é exigência; periféricos não contam contra.
3. Critério de questões por conhecimento: ≥ 2 formulações distintas (tipos diferentes) por conceito ESSENCIAL; duplicata semântica não conta.
4. Critério de retorno à fonte: cada questão aceita aponta o trecho certo (página + trecho verbatim que resolve a dúvida), verificado pelo servidor (já existe: evidência) e por amostra humana.
5. Hipóteses de causa só são validadas contra evidência real do aluno (piloto, não gerador de IA): um conjunto mínimo de regras ("N erros em formulações distintas do mesmo conceito, com acertos em outros → provável lacuna de compreensão neste conceito") e registro de quanto elas acertam quando o aluno confirma a causa.
6. Reinterpretação do canário v8 × v10: o veredito NOT_PROVEN foi dado com critérios de fidelidade/compressão/ligação; sob a rubrica de reativação ele precisa ser refeito (nova autorização) com o mapa v2; o veredito atual continua válido apenas para esses critérios.

## 5. Plano (menor mudança causal por fatia; cada uma com prova)

```
F0  Governança (só texto, sem custo): adendo §I.18 na Constituição + esta revisão no Git                     PROVA: context:check, revisão do usuário
F1  Metodologia v2 (só texto/scripts, sem modelo): rubrica de reativação, mapa de conceitos v2 (essencial/relevante/periférico) para "Renal Blood Flow", `coverage.mjs` com essenciais, critério ≥2 formulações   PROVA: testes do script; recomputar v8 e v10 SEM nova chamada
F2  Conhecimento como entidade (migração aditiva): `knowledge_units` (disciplina→tema→subtema) com origem no outline da fonte; questões e resumo ligados; preencher `competencies`/atribuição no aceite   PROVA: migração + testes de integridade; nenhum dado existente muda
F3  Retorno à fonte (UX + evento): ação "Voltar ao material" abre a página/trecho da fonte; evento `SOURCE_REVISITED`; "Tentar de novo" reapresenta a questão; "O resumo faltou" abre o editor com o conceito   PROVA: E2E do ramo "não demonstrou"; ledger imutável preservado
F4  Hipóteses de causa (modelo + regras mínimas + autorrelato opcional de 1 toque, pulável)   PROVA: testes de regra; nada de "domínio" inventado (I.12); linguagem de sinal, não de diagnóstico
F5  Mapa de Conhecimento e Lacunas (estatística por subtema; n, tipo, histórico; "evidência insuficiente")   PROVA: E2E + fixtures; superfície protegida de Estatísticas preservada (extensão, não substituição)
F6  Canário de resumo sob a rubrica v2 e revisão médica humana de amostra   PROVA: depende de autorização de chamadas reais
```

Ordem e dependências: F0 → F1 (independentes de código) → F2 (base de F3–F5) → F3 → F4 → F5; F6 depois de F1 e pode correr em paralelo a F2. Nenhuma fatia faz chamada real a modelo sem nova autorização. Cada fatia mantém: IA = rascunho; ledger imutável; sem merge/deploy/release.

## 6. Decisões humanas necessárias (agrupadas)

1. Granularidade do "subtema" (F2): usar as seções do OUTLINE da própria fonte como subtemas (recomendado: automático, sem trabalho do aluno) com etiqueta de conceito vinda da geração, ou o aluno define manualmente? Recomendação do engenheiro: outline + conceito da geração, editável.
2. Autorrelato da causa (F4): oferecer, opcional e pulável, um toque "não lembrava / não entendi / o resumo não tinha / eu pensava outra coisa"? Recomendação: sim, sem bloquear o fluxo (custo administrativo ~0 e é a evidência mais barata e direta de causa).
3. Nome na interface: "Mapa de Conhecimento e Lacunas de Aprendizagem" (proposto na definição) — confirmar.
4. Conflito com HG-13 (idioma da UI) e HG-11/12 não existe; nada disso bloqueia F0–F2.

## 7. Estado de prova desta revisão

DECLARADO/LIDO: Constituição §I.1–I.17 (sem conflito), schema (`009`, `016`, `004`), serviços de tentativa/evidência/prioridades, UI de citação (`src/app.js:3400`), rubrica e canário. NÃO executado: nenhum teste novo, nenhuma mudança de código, nenhuma chamada a modelo. Risco principal: construir F2–F5 sobre uma noção de "conhecimento" mal escolhida; mitigação: decisão 1 antes de F2 e migração aditiva.
