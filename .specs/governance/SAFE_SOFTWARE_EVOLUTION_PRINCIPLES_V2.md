# Safe Software Evolution Principles — Canonical, Inherited

```
SAFE_EVOLUTION_STANDARD_ID=SMARTLEARN_SAFE_EVOLUTION_V2
SAFE_EVOLUTION_STANDARD_VERSION=2.1.0
SAFE_EVOLUTION_STANDARD_STATUS=CANONICAL
SUPERSEDES=SMARTLEARN_NON_REGRESSION_V1
ADOPTED=2026-09-14
AMENDED=2026-09-16 (§4.33 + I11, protected-surfaces design non-regression — see ADR-0001)
```

## Status and inheritance

```
PROJECT GOVERNANCE (00_PROJECT_GOVERNANCE_STANDARD.md)
  → QUALITY STANDARD (02_SMARTLEARN_QUALITY_STANDARD_V1.md)
    → SAFE SOFTWARE EVOLUTION PRINCIPLES (this file)
      → PHASE CONTRACT (.specs/features/**)
        → TASK ACCEPTANCE CRITERIA (tasks.md / acceptance.md)
          → IMPLEMENTATION
```

This document applies to every current and future change on this project, not only the task in flight when it was adopted. It outranks any earlier task-specific instruction that conflicts with it. A task-local spec, an ADR, or an acceptance criterion may **add** precision on top of it; none may **silently reduce** it. If a genuine conflict is found between an approved functional contract and this standard, preserve the approved functional contract and flag the incompatibility explicitly (DEBT item or validation.md note) rather than silently changing behavior to satisfy this document.

This document is edited only as a deliberate, explicit governance change — never incidentally while a normal task is in flight, and never merely to make a task pass.

This is a **generalization**, not a narrower replacement: it broadens the prior "non-regression" framing into a full doctrine of safe evolution — covering the same ground plus explicit epistemic-safety rules for AI agents — and carries forward, without weakening, every principle the prior version established. See §12 for the explicit reconciliation against the superseded version.

## Relation to Project Governance

`00_PROJECT_GOVERNANCE_STANDARD.md` defines the mandatory change lifecycle, artifacts, and gates — the **mechanisms**. This document defines the **principles** those mechanisms exist to serve. Concretely:

1. These principles govern the WHY.
2. Impact analysis, sensors, gates, commits, and review govern the HOW.
3. Procedural compliance does not substitute for conformance with these principles.
4. A completed checklist does not authorize a result the real product contradicts.

## Relation to the Quality Standard

`02_SMARTLEARN_QUALITY_STANDARD_V1.md` remains the authority on **how good SmartLearn must be**. This document governs **how the product can evolve without losing that quality**. They are not duplicates and should not be read as competing checklists — apply both, and where a genuine conflict is found between them, escalate rather than silently resolving it in either document.

## 1. Princípio fundamental

SOFTWARE EVOLUTION = CONTROLLED CHANGE UNDER PRESERVED INVARIANTS.

Operacionalmente:

ENTENDA A VERDADE ATUAL.
DEFINA O QUE PODE MUDAR.
PRESERVE O QUE NÃO PODE.
CONTENHA O BLAST RADIUS.
FAÇA A MENOR TRANSFORMAÇÃO COMPLETA.
TENTE REFUTÁ-LA.
OBSERVE O PRODUTO REAL.
APRENDA COM QUALQUER FALHA.
SÓ ENTÃO TORNE O NOVO ESTADO CANÔNICO.

A qualidade de uma mudança é medida tanto pelo valor que acrescenta quanto pelo que conseguiu não destruir.

## 2. Axiomas

**A1. AUTHORIZED CHANGE** — `CHANGE_SCOPE <= AUTHORIZED_SCOPE`. Uma tarefa só concede autoridade para modificar aquilo que precisa mudar. Tudo fora do escopo permanece invariável por padrão.

**A2. PROOF FOLLOWS IMPACT** — `PROOF_SCOPE >= REAL_BLAST_RADIUS`. A validação deve cobrir onde a mudança pode produzir efeitos, não apenas onde o código foi editado.

**A3. SEMANTIC REUSE** — `ABSTRACTION_SCOPE <= SEMANTIC_EQUIVALENCE_SCOPE`. Compartilhar implementação somente enquanto os consumidores compartilharem significado, contrato e modelo de interação.

**A4. MONOTONIC IMPROVEMENT** — `UNAUTHORIZED_QUALITY_REGRESSION = 0`. Melhorar uma dimensão não autoriza deteriorar outra silenciosamente.

**A5. EVIDENCE AUTHORITY** — `EVIDENCE > NARRATIVE`. Código executável, comportamento observado, dados e artefatos reais prevalecem sobre relatórios, comentários, nomes, intenção e memória.

**A6. EPISTEMIC HONESTY** — `UNKNOWN != PASS`. Propriedade necessária não verificada = `NOT_PROVEN`.

**A7. DATA SOVEREIGNTY** — `REAL_USER_DATA_MUTATED_FOR_TESTING = 0`. Dados reais do usuário nunca são instrumento de teste.

**A8. RECOVERY** — `PROVEN_GOOD_STATE > UNPROVEN_RECENT_STATE`. Quando a causalidade ou confiança se perde, o último estado comprovadamente bom é referência superior ao código apenas mais recente.

## 3. Princípios de engenharia

**4.1 Correção é conformidade com o contrato.** A implementação não define sozinha o comportamento correto. Direção da prova: REQUISITO/INVARIANTE → COMPORTAMENTO REAL → EVIDÊNCIA. Nunca transformar acidentalmente IMPLEMENTAÇÃO → TESTE QUE A DESCREVE → "REQUISITO".

**4.2 Invariantes precedem alterações.** Antes de mudar comportamento existente, identificar o que precisa continuar verdadeiro: função, dados, significado, UX, acessibilidade, segurança, performance, compatibilidade, responsividade, histórico. A implementação pode mudar. O contrato preservado, não.

**4.3 Qualidade é multidimensional.** Não existe uma única nota capaz de autorizar regressões ocultas: correção × confiabilidade × UX × acessibilidade × segurança × desempenho × manutenção × compatibilidade × integridade × testabilidade. Melhor A + pior B ≠ automaticamente melhor. Trade-off material exige autoridade de produto explícita.

**4.4 O estado bom é evidência.** Uma implementação comprovadamente boa é ativo de produto e controle experimental. `NEW != BETTER`. `RECENT != CANONICAL`. `GREEN != CORRECT`. Quando necessário: `KNOWN_GOOD → RESTORE → PROVE → REAPPLY_INCREMENTALLY`.

**4.5 Evolução deve ser incremental e reversível.** Prefira mudanças pequenas, causalmente isoladas, observáveis, testáveis, reversíveis. Cada mudança material deve permitir responder: "O que exatamente isto deveria alterar?"

**4.6 O blast radius define o risco.** Risco não é proporcional ao número de linhas modificadas. `RISK ≈ IMPACT × REACH × UNCERTAINTY × IRREVERSIBILITY`. Primitive compartilhado, contrato, persistência, navegação global e responsive podem possuir blast radius desproporcionalmente grande.

**4.7 Arquitetura boa contém mudanças.** Mudança local deve produzir predominantemente efeito local. Efeitos colaterais distantes são sinal para revisar acoplamento, boundary, contrato, abstração, fonte de verdade.

**4.8 Semântica prevalece sobre DRY.** Código visualmente parecido não implica responsabilidade igual. `SEMANTIC_COHESION > CODE_REUSE`. Duplicação pequena e explícita é preferível a uma abstração compartilhada semanticamente falsa.

**4.9 Generalização é uma decisão arquitetural.** `LOCAL_SUCCESS != SYSTEM_STANDARD`. Uma regra validada para um componente permanece local até que equivalência dos demais consumidores seja demonstrada. Não promover exceções a padrões globais por conveniência.

**4.10 A estrutura da UI segue a tarefa.** Escolher representação segundo a tarefa cognitiva e a topologia da informação, não segundo o markup legado. Comparação de muitos registros → estrutura comparável. Fila de ações → estrutura operacional. Objeto único → detalhe. Evolução temporal → representação temporal. Cards, grids, tabelas, gráficos e menus são meios, não objetivos.

**4.11 Controles devem ter o menor escopo correto.** Não duplicar controles globais localmente. Não criar toolbar quando a ação pertence naturalmente à coluna. Não criar filtros redundantes com o contexto. Não adicionar controle apenas porque é fácil tecnicamente. Mais controles ≠ melhor produto.

**4.12 Ambiente é parte do sistema.** O comportamento observado resulta de CODE + BUILD + CONFIG + RUNTIME + DATA + PROFILE + CACHE + NETWORK + PROCESS. Antes de alterar código ou dados por um comportamento inesperado: `CONFIRM_ACTUAL_RUNTIME=YES`. Pergunta obrigatória quando houver ambiguidade: "Estou executando o artefato, profile e fonte de dados que penso estar executando?"

**4.13 Diagnóstico precede mutação.** Não editar com base apenas na primeira hipótese plausível. Quando a causa não estiver evidente: HIPÓTESES → TESTE DISCRIMINANTE → CAUSA → MUDANÇA. Observação deve preceder intervenção quando consegue distinguir causas.

**4.14 Dados de teste devem ser isolados e reprodutíveis.** Fixtures devem controlar fontes materiais de variabilidade: IDs, relógio, aleatoriedade, timezone, locale, ordem, estado inicial. `TEST_DATA != REAL_DATA`. "Determinístico" é propriedade a provar.

**4.15 Testes são sensores de falsificação.** Teste verde significa apenas "este sensor não detectou falha". Um teste forte deve rejeitar uma implementação perigosamente plausível. Pergunta: "Qual bug real este teste impediria de passar?" Proteja propriedade externa e invariante; não congele acidentalmente detalhe de implementação.

**4.16 Verificação != validação.** VERIFICAÇÃO: construímos corretamente o especificado? VALIDAÇÃO: construímos o produto correto? `CI_GREEN != PRODUCT_PASS`. O tipo de mudança determina o tipo de evidência: UI → render real; interação → fluxo real; persistência → armazenamento real quando em escopo; acessibilidade → semântica + teclado + AT quando disponível; responsive → múltiplos pontos e transições.

**4.17 Responsividade é contínua.** `LAYOUT = f(viewport, zoom, content, locale, state)`. Um breakpoint não é um produto separado. Validar extremos, transições, breakpoints, regiões historicamente frágeis, conteúdo extremo, zoom. Corrigir 800px quebrando 375px continua sendo regressão.

**4.18 Acessibilidade começa na semântica.** Não selecionar padrão ARIA pela aparência. Primeiro: "O que este componente significa e faz?" Depois: "Qual padrão de interação representa corretamente isso?" Não manter duas representações acessíveis concorrentes para uma única decisão do usuário.

**4.19 Regressão recorrente é falha sistêmica.** `INCIDENT → ROOT_CAUSE → PRODUCT_FIX → MISSING_PROTECTION → SYSTEM_FIX`. Depois da primeira recorrência da mesma classe de problema, não basta corrigir o código — descobrir o que faltou: invariante, teste, boundary, baseline, observabilidade, contrato, fixture, processo.

**4.20 Recovery é parte da engenharia.** ROLLBACK e RESTORE são estratégias legítimas. Quando sucessivos patches reduzem a confiança: não adicionar automaticamente outro patch. Reavaliar baseline → contrato → causa → sensores → arquitetura. Remendo indefinido não é estratégia.

**4.21 Commits devem preservar causalidade.** Um commit deve representar uma unidade causal compreensível. Evitar misturar sem necessidade UI + dados + CI + acessibilidade + responsive + feature. `ATOMICIDADE = CAUSALIDADE`, não simplesmente poucas linhas.

**4.22 Simplicidade é segurança.** Toda nova camada, estado, abstração, controle e dependência aumenta a superfície de interação. Entre soluções igualmente completas, prefira menor número de estados, acoplamento, dependências, blast radius, carga cognitiva, custo de prova. `SIMPLEST_COMPLETE_SOLUTION_WINS`.

**4.23 Eficiência não compra incerteza.** Tokens, tempo e computação devem ser economizados removendo desperdício: repetição, contexto redundante, relatórios intermediários, agentes sem ganho, reexecução desnecessária, cerimônia. Não economizar em: diagnóstico, evidência material, proteção de dados, teste discriminante, validação proporcional ao risco. `REDUCE_SCOPE_BEFORE_QUALITY`.

**4.24 Autonomia é proporcional à reversibilidade.** Agente decide autonomamente questões técnicas, locais, reversíveis, cobertas pelo contrato. Human gate é reservado para mudança material de comportamento do produto, semântica de dados, negócio, arquitetura pública, irreversibilidade, custo externo, segurança, decisões humanas conflitantes.

**4.25 Ônus da prova recai sobre quem muda.** Comportamento já existente e comprovado é presumido válido. Uma mudança deve provar que preservou tudo que não foi explicitamente autorizada a mudar — não é o código antigo que precisa se rejustificar, é a mudança que precisa demonstrar que não o degradou.

**4.26 Preservar função e preservar representação são problemas diferentes.** A representação visual pode mudar. O que não pode desaparecer silenciosamente: informação, ação, estado, significado, comportamento, acessibilidade, dado. Ao consolidar ou redesenhar: a representação pode mudar, a capacidade deve permanecer, salvo decisão explícita em contrário.

**4.27 Uma nova funcionalidade deve caber no produto; o produto não deve ser deformado para caber na funcionalidade.** Se uma nova função exige destruir uma superfície que já funciona, redesenhe a funcionalidade, não a superfície. A importância arquitetural de uma superfície estabelecida supera a conveniência local de uma feature nova.

**4.28 Não misture recuperação com evolução.** Quando uma superfície regrediu: recupere primeiro, melhore depois. Nunca recuperar + redesenhar + adicionar funcionalidade simultaneamente — isso destrói a linha de base e impede atribuir causa a efeito. Sequência: `KNOWN_GOOD → RESTORE → PROVE → IMPROVE → PROVE`. Ao perder confiança no estado atual, use o último estado conhecido bom mais reaplicação seletiva de melhorias posteriores — não restaure o repositório inteiro quando o dano é localizado, e não mantenha código recente só porque já foi escrito.

**4.29 Proteja a verdade do produto, não o código antigo.** Compatibilidade com código anterior é secundária; preservar o comportamento correto do produto é primário. Não manter uma API interna errada, um markup inadequado, um teste mal concebido ou uma abstração ruim apenas porque já existem — mas qualquer substituição deve provar equivalência ou superioridade em comportamento externo observável.

**4.30 Estados de evidência são três, não dois.** `PASS` (evidência suficiente), `FAIL` (evidência de defeito), `NOT_PROVEN` (validação necessária não foi executada). Nunca converter "não encontrei o problema" em "provado correto". Aplica-se especialmente a: leitor de tela, runtime nativo, dispositivo real, dados reais, estados raros.

**4.31 O produto real é a autoridade funcional.** Um protótipo pode ser autoridade visual. Uma especificação pode ser autoridade de intenção. Um teste pode ser autoridade de uma única propriedade. Nenhum isoladamente substitui o comportamento real e comprovado. Hierarquia em caso de conflito, subindo em direção à autoridade: artefato/execução real → evidência → decisão canônica → especificação → estado registrado → plano → chat.

**4.32 Encerramento exige reconciliação, não declaração.** Uma unidade de trabalho não termina porque código foi escrito, um commit existe, a suíte passou, ou um revisor disse PASS. Termina quando resultado real ↔ requisitos ↔ baseline ↔ testes ↔ render/UAT ↔ estado registrado convergem. Contradição entre quaisquer dois desses significa `NOT_DONE`.

**4.33 Superfícies com histórico de regressão e aprovação visual são protegidas** (ADR-0001, 2026-09-16). Uma superfície que já passou por regressão, recuperação e aprovação visual explícita é `KNOWN_GOOD` — o mesmo estatuto de §4.4/A8, aplicado especificamente a design/UX, não só a corretude funcional. Sobre uma superfície protegida o agente PODE, autonomamente: corrigir bugs; conectar dados/funcionalidade nova; melhorar acessibilidade; adicionar/fortalecer testes; fazer ajuste visual mínimo estritamente necessário à função. O agente NÃO PODE, autonomamente: redesenhar; mudar composição ou hierarquia visual; reorganizar estruturalmente; substituir padrão já aprovado; "modernizar"/"simplificar"/reinterpretar o design; converter necessidade funcional em oportunidade de redesign. `FUNCTIONAL_CHANGE_NEED != REDESIGN_AUTHORIZATION`. Quanto maior o histórico de regressão de uma superfície, menor a liberdade de reinterpretá-la — autonomia cresce com reversibilidade e evidência (§4.24); liberdade de redesign diminui com o custo já pago para chegar ao estado aprovado. Autoridade: produto real = autoridade funcional; design aprovado/restaurado = autoridade visual (§4.31); testes são sensores, não autorização para redesenhar (§4.15). Se uma feature exigir mudança visual/estrutural material numa superfície protegida: parar essa parte, preservar o resto, apresentar necessidade + alternativas, HUMAN GATE (§4.24) — decisão pertence aos arquitetos do produto (usuário + parceiro de arquitetura), não ao agente. A lista de superfícies protegidas e o detalhe concreto preservado em cada uma (geometria, breakpoints, padrões específicos) vivem em `DESIGN.md` e no ADR — este princípio não os duplica, apenas os autoriza.

## 4. Princípios comportamentais para agentes de IA

Aplicar quando materialmente relevantes. Não transformar esta seção em ritual obrigatório para tarefas triviais.

**5.1 Verdade > conclusão.** O objetivo não é fechar a tarefa. É deixar o produto correto. `NOT_DONE` é superior a `FALSE_PASS`.

**5.2 Sunk cost = 0.** Código recém-escrito não ganha autoridade porque consumiu tempo ou tokens. Se restaurar e refazer for mais seguro que continuar defendendo a solução: `RESTORE_AND_REBUILD`.

**5.3 Não edite para descobrir quando pode observar.** Quando houver mais de uma causa plausível, diagnostique antes de modificar. Não transformar o produto em instrumento de investigação sem necessidade.

**5.4 Procure refutar o próprio trabalho.** Após implementar, pergunte: "Qual implementação errada ainda passaria pelos meus testes?" e "Onde esta mudança poderia ter produzido dano fora do foco atual?" Autocrítica procura falsificação, não justificativa.

**5.5 Agent claim != fact.** Executor, reviewer, commit message, STATE e resumo podem estar errados. Afirmação de agente é evidência secundária até reconciliada com artefato ou evidência observável.

**5.6 Não herde confiança.** Um segundo agente não deve considerar a conclusão do primeiro verdadeira simplesmente porque está bem escrita. Reconstruir a confiança necessária à decisão a partir das evidências relevantes.

**5.7 Não promova caso particular a regra.** Antes de transformar padrão local em global: prove equivalência semântica e operacional.

**5.8 Helpfulness != authorization.** Não "aproveitar" uma tarefa para melhorar áreas adjacentes. Modificar fora do escopo somente quando necessário ao objetivo, ou quando há defeito inequívoco, local, reversível e de risco trivial. Caso contrário: registrar, não alterar.

**5.9 Consistência interna != correção.** Código + teste + documentação podem concordar e ainda estarem todos errados. Correspondência com o produto real prevalece.

**5.10 Green != good.** Nunca inferir qualidade total de uma suíte verde. A evidência necessária deriva da propriedade em julgamento.

**5.11 Incerteza crescente → escopo decrescente.** Ao descobrir dependências inesperadas, causalidade confusa ou estados não compreendidos: reduza a mudança. Não compense falta de entendimento com mais improvisação.

**5.12 Patch recorrente → parar e remodelar.** Se duas correções sucessivas na mesma região gerarem nova regressão: parar o ciclo de patches. Reavaliar o modelo mental antes da próxima alteração.

**5.13 O revisor deve ser epistemicamente independente.** Reviewer de mudança material deve receber objetivo, artefato, invariantes, baseline e hipótese adversária — e não depender da narrativa causal do executor. Seu trabalho é tentar descobrir onde o executor pode estar errado, não confirmar seu checklist.

**5.14 Evidência autogerada tem limitação.** Quanto mais diretamente o mesmo agente controla implementação, teste, acceptance criterion, documentação e interpretação do resultado, menos esse conjunto deve valer sozinho em mudança de alto risco. Para risco material, exigir ao menos uma evidência que não dependa da mesma premissa da implementação: baseline anterior, comportamento observado, contrato preexistente, padrão normativo externo, teste de propriedade independente, reviewer adversarial, artefato real. Evitar sistemas autocertificantes.

## 5. Invariantes executáveis

Não criar invariantes para tudo. Criar/enforçar invariantes somente quando a propriedade for `IMPORTANT + STABLE + OBJECTIVE + CHEAP_ENOUGH_TO_PROTECT`.

Base mínima do projeto:

- **I1.** `OUT_OF_SCOPE_BEHAVIOR_CHANGE = 0`
- **I2.** `REAL_USER_DATA_MUTATED_BY_TEST = 0`
- **I3.** `KNOWN_FIXED_REGRESSION_REINTRODUCED = 0`
- **I4.** `REQUIRED_UNVERIFIED_PROPERTY_REPORTED_AS_PASS = 0`
- **I5.** `SHARED_PRIMITIVE_CHANGE_WITHOUT_IMPACT_ANALYSIS = 0`
- **I6.** `UI_CHANGE_WITH_VISUAL_IMPACT_WITHOUT_REAL_RENDER = 0`
- **I7.** `TEST_WEAKENED_TO_MAKE_IMPLEMENTATION_PASS = 0`
- **I8.** `PRODUCTION_AND_TEST_DATA_SILENTLY_MIXED = 0`
- **I9.** `LOCAL_DECISION_PROMOTED_TO_GLOBAL_STANDARD_WITHOUT_PROOF = 0`
- **I10.** `MATERIAL_TRADEOFF_MADE_WITHOUT_PRODUCT_AUTHORITY = 0`
- **I11.** `KNOWN_GOOD_PROTECTED_SURFACE_REDESIGNED_WITHOUT_HUMAN_GATE = 0` (§4.33, ADR-0001)

Esses invariantes são floor, não checklist cego. Adicionar novos somente quando um incidente ou decisão arquitetural justificar proteção permanente.

## 6. Revisão independente

Não criar reviewers automaticamente para toda tarefa. Usar independência quando o risco justificar, especialmente: shared primitive, arquitetura, persistência/migração, segurança, dados, ampla superfície, componente com histórico de regressões, falha capaz de escapar aos sensores do executor.

Reviewer deve ter: `ONE_NARROW_QUESTION + REAL_EVIDENCE + ADVERSARIAL_HYPOTHESIS`. Se o risco for baixo e os sensores forem suficientemente discriminantes, um único executor é preferível.

## 7. Applicability

These principles apply to every current and future change on this project — not scoped to whichever task was running when V2 was adopted, and not limited to the specific in-flight work (Estatísticas, Data Grid, Acompanhar) that motivated V1's original adoption.

## 8. Reconciliation against V1 (no principle lost)

`NON_REGRESSION_PRINCIPLES_V1.md` is superseded by this document, not deleted — its full text remains in Git history and in the file itself (now marked `SUPERSEDED_BY=SAFE_SOFTWARE_EVOLUTION_PRINCIPLES_V2.md`). Every one of its 23 numbered principles maps onto this document:

| V1 # | Carried forward as |
|---|---|
| 1 | §4.4, A8 |
| 2 | §4.25 |
| 3 | A4, §4.3 |
| 4 | A1 |
| 5 | §4.5, §4.22 |
| 6 | §4.6, A2, I5 |
| 7 | §4.15 |
| 8 | §4.19, I3 |
| 9 | §4.6, A2 |
| 10 | §4.17 |
| 11 | §4.16, I6 |
| 12 | §4.26 |
| 13 | §4.27 |
| 14 | §4.28 |
| 15 | §4.28, A8 |
| 16 | §4.21 |
| 17 | §4.29 |
| 18 | A6, §4.30, I4 |
| 19 | §6 |
| 20 | §4.19 |
| 21 | §4.31, A5 |
| 22 | §4.32 |
| 23 | §1 (Princípio fundamental) |

V1's "Applicability" clause (naming the Estatísticas/Data Grid/Acompanhar work in flight at adoption time) is not restated here because it was task-scoped, not doctrinal; that historical context remains readable in the superseded V1 file and in `.specs/STATE.md`.

## Changing this standard

Edited only as a deliberate, explicit governance change, the same way `02_SMARTLEARN_QUALITY_STANDARD_V1.md` is — never incidentally while a normal task is in flight, and never merely to make a task pass. Bump `SAFE_EVOLUTION_STANDARD_VERSION` above and record the justification in the commit message (and as an ADR under `.specs/adr/` if the change is non-trivial). Confirm no previously important requirement was accidentally weakened in the process.
