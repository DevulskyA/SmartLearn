# INVARIANTS.md — SmartLearn

Estas regras governam a evolução do SmartLearn. Uma feature que precise violá-las exige primeiro uma decisão explícita de produto e atualização deste contrato.

## INV-01 — Energia para aprender, não para gerenciar
O aluno deve gastar energia estudando, não operando o sistema. A sofisticação adaptativa deve permanecer principalmente interna.

## INV-02 — Mobile-first e baixa fricção
A aplicação deve continuar funcional em telas pequenas e ações comuns devem permanecer curtas, claras e previsvisíveis.

## INV-03 — Local-first
Os dados do aluno permanecem no dispositivo no baseline atual. Nenhuma conta, backend ou banco remoto é necessário para usar o produto.

## INV-04 — Uma base Tauri 2
Desktop, Android e iOS continuam compartilhando a mesma base Tauri 2. Não introduzir uma segunda aplicação móvel sem decisão arquitetural explícita.

## INV-05 — SQL isolado
Todo acesso SQLite nativo permanece em `src/db.js`. Módulos de domínio não executam SQL diretamente.

## INV-06 — Backup e restauração preservados
Exportação e importação de backup continuam requisitos do produto. Novas entidades persistidas devem participar do esquema de backup antes de serem consideradas completas.

## INV-07 — Compatibilidade de dados durante a migração
A evolução do motor pedagógico não pode invalidar silenciosamente estudos e revisões existentes. Migrações devem ser aditivas ou possuir transformação e rollback verificáveis.

## INV-08 — Domínio exige independência
Sucesso assistido não pode ser tratado como equivalente a desempenho independente. Uma solução revelada fornece ensino, mas zero evidência positiva de mastery naquela tentativa.

## INV-09 — Domínio exige tempo
O sistema não pode declarar aprendizagem durável apenas com acertos concentrados em uma única sessão. O mastery gate deve exigir evidência retardada enquanto este contrato estiver vigente.

## INV-10 — Transferência é dimensão própria
Retenção e transferência devem permanecer distinguíveis no learner model e nas avaliações. Reescrever superficialmente uma questão não basta para classificá-la como transferência.

## INV-11 — Erro é evidência, não diagnóstico automático
Um único erro não autoriza atribuir uma causa cognitiva definitiva. Causas de erro permanecem hipóteses revisáveis por nova evidência.

## INV-12 — Erro confiante tem tratamento especial
Resposta incorreta acompanhada de alta confiança deve poder gerar hipótese de misconception e falha de calibração; o sistema não deve reduzi-la a simples percentual perdido.

## INV-13 — Assistência sempre observável
Qualquer evento usado pelo learner model deve conseguir representar quanta assistência estava disponível e/ou foi usada.

## INV-14 — Fonte antes da geração
Quando geração por IA entrar no fluxo médico, objetos educacionais devem manter rastreabilidade suficiente para reconstruir a fonte que sustenta o conteúdo.

## INV-15 — Gerador não valida a si mesmo
Uma mesma geração plausível não constitui prova de correção. Conteúdo médico gerado precisa de verificação independente apropriada ao risco antes de virar fonte canônica do aluno.

## INV-16 — Modelo simples antes de modelo opaco
Modelos aprendidos, knowledge tracing complexo ou políticas adaptativas sofisticadas só entram quando superarem um baseline transparente em métrica relevante para aprendizagem.

## INV-17 — Métrica soberana
A prioridade de avaliação é desempenho independente e retardado, transferência e integração. Engajamento, streak, volume de questões e score imediato são métricas auxiliares.

## INV-18 — Mudança pedagógica exige teste
Uma alteração relevante do motor de aprendizagem precisa declarar qual outcome pretende melhorar e como será comparada ao comportamento anterior.

## INV-19 — Complexidade deve pagar aluguel
Nenhuma abstração, modelo ou camada adaptativa entra apenas por elegância técnica. Deve resolver risco real, melhorar observabilidade ou produzir ganho educacional/operacional mensurável.

## INV-20 — Preservar o app funcional durante a evolução
A migração para o novo SmartLearn ocorre incrementalmente. O scheduler, banco e UI legados podem coexistir temporariamente com o novo learning core enquanto cada substituição é validada.

## INV-21 — Regras pedagógicas testáveis
Sempre que uma decisão pedagógica puder ser representada deterministicamente, ela deve viver em módulo testável separado de UI e persistência.

## INV-22 — Incerteza explícita
O learner model deve representar incerteza ou força de evidência. Não apresentar heurísticas como fatos psicológicos sobre o aluno.

## INV-23 — Interface em PT-BR e registro adulto
A interface permanece em português do Brasil, clara, sóbria e sem gamificação infantilizante ou ruído motivacional.

## INV-24 — Um clique quando possível
Ações frequentes continuam priorizando um clique quando isso não sacrificar segurança, significado pedagógico ou integridade dos dados.

## INV-25 — Git e gates obrigatórios
Mudanças materiais devem permanecer rastreáveis em Git, possuir critérios de aceitação e passar pelos gates relevantes antes de integração.

## Regras legadas explicitamente supersedidas
As restrições antigas que proibiam permanentemente IA, banco de questões, caderno de erros, redistribuição adaptativa ou mecanismos inteligentes eram limites do MVP original e deixam de governar a direção do produto. Esses mecanismos agora são permitidos quando entram incrementalmente, preservam as invariantes acima e demonstram valor verificável.
