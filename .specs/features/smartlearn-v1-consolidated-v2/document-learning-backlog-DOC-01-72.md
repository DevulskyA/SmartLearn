# DOC-01..DOC-72 — Document Learning Core backlog (recorded, NOT yet reconciled)

STATUS: RECORDED_ONLY. Not reconciled against spec.md/design.md/heritage.md/tasks.md/acceptance.md. Not executed. Execution authorized to happen later, on explicit instruction ("A execução vai ser depois").

## Why this file exists

The user (product owner) identified a priority gap in the T01-T54 plan: SmartLearn today mostly delivers the *study-control* mechanism (scheduling, tracking, accounts, server authority), while the mechanism that turns raw material into learning — document upload → summary → questions → active study — is scheduled too late in the plan. The concern: the system can keep evolving technically while still not feeling like the product it's meant to be.

The proposed correction is **not** to discard T01-T54, but to:
1. Audit T01-T54 against the full document-learning flow to find real gaps (not assumed ones).
2. Reprioritize so the first genuinely useful "document → learning" vertical slice lands early, without breaking server-authority, migration, or evidence invariants already built.
3. Finish the T23 work already in progress first (see STATE.md checkpoint) — this backlog does not preempt it.

The `DOC-xx` IDs below are **work packages**, not new authoritative tasks. Before any of this is acted on, each `DOC-xx` must be mapped to an existing T-task (`COVERED_BY=Txx`) or flagged as a real gap. Do not replan the whole project or fan this out into dozens of new tasks just because this list is more granular than tasks.md.

## Target vertical slice (first real milestone, once T23/T24 close)

> Upload de PDF → processamento server-side → extração com páginas/provenance → criação/proposta de unidades → geração de resumo médico DRAFT e source-grounded → revisão/edição → aceitação explícita → "Estudar agora".

Suggested minimal path through the backlog to reach it: `DOC-01/02 → DOC-03-10 → DOC-13/16/18 → DOC-20-26 → DOC-27/29 → DOC-35`. Questions/exercises, evidence, scheduler integration, and analytics come after this slice is proven, not before.

## User-facing experience this milestone must produce

A student should be able to: open **Materiais** → drag a PDF (e.g. Fisiologia) → pick/create the "Fisiologia" subject → see the document processed → get suggested learning units → open a unit → see a faithful medical summary → tap a claim and land on its source page → edit if desired → accept → click "Estudar agora". No SQL, IDs, scheduler internals, or technical configuration should surface to them. If this flow doesn't exist yet, the core product isn't delivered yet, regardless of backend quality.

## Backlog (DOC-01..DOC-72)

| ID | Tarefa | Dif. | Dependência | DONE observável |
| --- | --- | ---: | --- | --- |
| DOC-01 | Auditar T01-T54 contra o fluxo completo de documentos | M | atual | Matriz mostra o que já existe, o que está planejado e GAPs reais |
| DOC-02 | Repriorizar dependências para entregar cedo o vertical slice de documentos | L | DOC-01 | Ordem nova não quebra server authority, migration ou evidence |
| DOC-03 | Criar área principal Materiais | M | Web base | Navegação clara no desktop/mobile; não escondida em Configurações |
| DOC-04 | Modelar sources/documents | L | server/domain | Documento pertence ao usuário e possui identidade estável |
| DOC-05 | Modelar provenance de documentos | L | DOC-04 | Arquivo → páginas → trechos/unidades → artefatos gerados é rastreável |
| DOC-06 | Implementar armazenamento server-side do arquivo | L | DOC-04 | PDF não depende de localStorage; metadata no DB e arquivo em storage controlado |
| DOC-07 | Implementar checksum e deduplicação | M | DOC-06 | Mesmo PDF não cria duplicação silenciosa |
| DOC-08 | Criar API tipada de upload | L | auth + DOC-06 | Upload autenticado, idempotente, ownership validado |
| DOC-09 | Criar UI drag/drop + seletor de arquivo | M | DOC-08 | Usuário envia PDF com uma ação simples |
| DOC-10 | Exibir progresso e estados do processamento | M | DOC-09 | enviando → extraindo → pronto/erro, sem tela congelada |
| DOC-11 | Criar biblioteca de materiais | M | DOC-09 | Lista documento, disciplina, data, páginas e estado |
| DOC-12 | Busca/filtro por disciplina/documento/status | S | DOC-11 | Biblioteca continua utilizável com muitos arquivos |
| DOC-13 | Extrair texto de PDF textual | L | DOC-06 | Texto e número da página preservados corretamente |
| DOC-14 | Detectar PDF escaneado ou extração insuficiente | M | DOC-13 | Sistema não finge ter extraído conteúdo inexistente |
| DOC-15 | Definir fallback de OCR | L | DOC-14 | OCR pode ser acionado de modo explícito; falha não corrompe documento |
| DOC-16 | Preservar mapeamento texto ↔ página | XL | DOC-13 | Todo conteúdo derivado pode voltar à página-fonte |
| DOC-17 | Detectar estrutura do documento | L | DOC-13 | Títulos/seções ajudam a segmentar o conteúdo |
| DOC-18 | Dividir em unidades de aprendizagem | XL | DOC-17 | Estrutura semântica primeiro; ~10 páginas apenas como heurística |
| DOC-19 | Permitir revisar/ajustar unidades propostas | M | DOC-18 | IA não decide irreversivelmente a organização do aluno |
| DOC-20 | Vincular documento/unidade a uma disciplina | M | subjects | Disciplina existente ou criada inline, sem ritual administrativo |
| DOC-21 | Criar abstraction de provider de IA | L | server | Produto não fica acoplado a um único modelo/provider |
| DOC-22 | Implementar provider determinístico de testes | M | DOC-21 | Pipeline inteiro testável sem API paga |
| DOC-23 | Definir contrato do resumo médico | XL | DOC-16/21 | Resumo fiel, didático, estruturado e source-grounded |
| DOC-24 | Gerar resumo por unidade | XL | DOC-18/23 | Cada unidade produz resumo em estado DRAFT |
| DOC-25 | Preservar provenance das afirmações do resumo | XL | DOC-24 | Usuário pode verificar de onde veio conteúdo relevante |
| DOC-26 | Impedir publicação automática de conteúdo gerado | M | DOC-24 | IA gera DRAFT; somente ação do usuário promove para aceito |
| DOC-27 | Criar workspace documento + resumo | L | DOC-24 | Fonte e material de estudo podem ser consultados sem navegação confusa |
| DOC-28 | Permitir editar resumo | M | DOC-27 | Alteração do usuário fica preservada |
| DOC-29 | Implementar aceitar/rejeitar/regenerar | M | DOC-27 | Cada ação possui estado claro e não destrói versão aceita |
| DOC-30 | Gerar perguntas a partir da unidade | XL | DOC-24 | Questões cobrem conceitos relevantes, não apenas detalhes superficiais |
| DOC-31 | Gerar respostas e explicações source-grounded | XL | DOC-30 | Resposta correta e explicação possuem suporte na fonte |
| DOC-32 | Gerar exercícios de recuperação ativa | L | DOC-30 | Não limitar produto a múltipla escolha |
| DOC-33 | Suportar cards somente como instrumento pedagógico | M | DOC-30 | Cards podem existir sem transformar SmartLearn em app de flashcards |
| DOC-34 | Aceitar/editar/rejeitar questões geradas | M | DOC-30 | Questão gerada não vira conteúdo definitivo automaticamente |
| DOC-35 | Criar botão/ação Estudar agora | M | DOC-24/30 | Usuário sai do documento diretamente para aprendizagem ativa |
| DOC-36 | Criar sessão de estudo da unidade | L | DOC-35 | Resumo → retrieval → questões/exercícios numa experiência única |
| DOC-37 | Capturar automaticamente resultados internos | XL | learning_evidence | Perguntas, acertos, erros, assistência e timestamps vêm das interações reais |
| DOC-38 | Manter prática externa agregada simples | M | evidence | questions_count + correct_count, sem burocracia adicional |
| DOC-39 | Permitir revisão sem questões | M | review_tasks | Concluir revisão não inventa score/evidência inexistente |
| DOC-40 | Integrar unidade aceita ao scheduler fixo de 16 revisões | L | learning_units | Uma criação válida gera agenda automaticamente |
| DOC-41 | Garantir transação atômica material→unidade→agenda | XL | DOC-40 | Falha deixa zero estado parcial |
| DOC-42 | Integrar com Hoje | L | DOC-40 | Unidades derivadas de documentos aparecem na decisão diária |
| DOC-43 | Integrar com Plano | M | DOC-40 | Plano mostra unidade, fonte, progresso, evidência e próxima revisão |
| DOC-44 | Criar revisão rápida do resumo | M | DOC-42 | Aluno consegue recuperar rapidamente conteúdo antes da prática |
| DOC-45 | Detectar áreas fracas a partir de evidência real | XL | DOC-37 | Fraqueza vem de resultados, não de exposição/leitura |
| DOC-46 | Priorizar próximas ações | L | DOC-45 | Sistema recomenda o que estudar/revisar com explicação verificável |
| DOC-47 | Analytics por disciplina | L | evidence | Accuracy ponderada + volume; ausência de evidência ≠ 0% |
| DOC-48 | Analytics por unidade/conteúdo | L | evidence | Identifica fraca, melhorando, piorando ou evidência insuficiente |
| DOC-49 | Acompanhamento longitudinal derivado | L | DOC-47/48 | Sem checkboxes manuais para fatos já conhecidos |
| DOC-50 | Cachear extração e gerações por conteúdo/versionamento | L | DOC-07 | Reabrir PDF não consome IA novamente sem necessidade |
| DOC-51 | Tornar processamento retomável | XL | pipeline | Falha no passo 4 não obriga refazer 1-3 |
| DOC-52 | Retry idempotente | L | DOC-51 | Retry não duplica unidades/resumos/questões |
| DOC-53 | Cancelamento seguro de processamento | M | DOC-51 | Cancelar não produz estado parcial incoerente |
| DOC-54 | Controlar custo/tokens de geração | L | AI | Chunking, cache e geração seletiva evitam gasto repetido |
| DOC-55 | Validar tipo/tamanho/nome do upload | M | DOC-08 | Arquivos inválidos falham antes do processamento |
| DOC-56 | Segurança contra path traversal/arquivo malicioso | L | DOC-06 | Nome do usuário nunca controla diretamente caminhos do servidor |
| DOC-57 | Isolamento entre usuários | XL | auth | Usuário A não vê arquivo, resumo ou geração de B |
| DOC-58 | Sanitização segura de conteúdo renderizado | L | UI | PDF/texto/IA não introduzem script/HTML executável |
| DOC-59 | Criar fixtures médicas conhecidas | L | tests | Pipeline possui material cujo conteúdo correto é conhecido |
| DOC-60 | Testar fidelidade do resumo | XL | DOC-59 | Afirmações unsupported são detectadas; fonte não é substituída por "conhecimento geral" |
| DOC-61 | Testar fidelidade das questões/respostas | XL | DOC-59 | Resposta/explanation não contradizem a fonte |
| DOC-62 | Testar falhas em cada estágio | XL | pipeline | Upload/extraction/AI/DB failures preservam dados anteriores |
| DOC-63 | Provar server authority com dois browsers | L | Web cutover | Mesmo usuário vê mesmo documento/material em clientes distintos |
| DOC-64 | Implementar offline somente leitura | L | PWA | Último conteúdo sincronizado acessível; nenhuma escrita autoritativa offline |
| DOC-65 | Integrar Windows thin shell | L | Web estável | Mesma biblioteca/documento/estado do Web |
| DOC-66 | Integrar Android thin shell | XL | Web estável | Mesmo produto e mesma autoridade, sem app paralelo |
| DOC-67 | Backup/export dos artefatos relevantes | L | server | Histórico, unidades, summaries aceitos e evidence são recuperáveis |
| DOC-68 | UX responsiva e acessível | L | UI completa | Mobile, teclado, foco, 200% zoom e estados de erro funcionam |
| DOC-69 | Jornada E2E completa do aluno | XL | tudo anterior | Upload → resumo → aceitar → estudar → evidence → revisão → analytics |
| DOC-70 | Jornada de erro E2E | XL | tudo anterior | Falha em upload/IA/save não destrói draft nem cria estado parcial |
| DOC-71 | Mutation/discrimination em contratos críticos | XL | gates | Testes realmente morrem quando provenance/auth/atomicidade são quebrados |
| DOC-72 | Verifier independente final | XL | DOC-69-71 | Re-deriva requisitos e tenta refutar o PASS; não corrige o que julga |

## Instruction to send to agents (verbatim, for when execution starts)

```text
PRODUCT CORRECTION — SMARTLEARN DOCUMENT LEARNING CORE

Não trate SmartLearn como apenas um sistema de controle de estudos.
O produto deve transformar material médico bruto em aprendizagem ativa:

documento
→ unidades de aprendizagem
→ resumo source-grounded
→ perguntas/exercícios
→ estudo ativo
→ learning_evidence
→ revisões
→ analytics/weak areas
→ próxima ação.

Use a lista DOC-01..DOC-72 fornecida pelo ChatGPT como backlog funcional.
Ela NÃO substitui automaticamente T01-T54.

Antes de editar:
1. reconcilie cada DOC item com spec/design/heritage/tasks/acceptance atuais;
2. mapeie o que já está coberto;
3. marque duplicatas como COVERED_BY=Txx;
4. marque gaps reais;
5. derive a menor alteração de ordem que entregue cedo o primeiro vertical slice;
6. preserve dependências técnicas indispensáveis e trabalho T23 já iniciado.

Não replaneje o projeto inteiro e não crie dezenas de novas tasks apenas
porque a lista é mais detalhada.

PRIMEIRO PRODUCT MILESTONE OBRIGATÓRIO:

Um usuário autenticado consegue:
upload de PDF
→ processamento server-side
→ extração com páginas/provenance
→ criação/proposta de unidades
→ geração de resumo médico DRAFT e source-grounded
→ revisão/edição
→ aceitação explícita
→ Estudar agora.

Esse milestone deve funcionar end-to-end no produto real antes de adicionar
refinamentos não necessários à experiência.

Depois completar:
questões/exercícios
→ evidence
→ scheduler
→ Hoje/Plano
→ analytics/tracking
→ plataformas
→ closure adversarial.

Invariantes:
- servidor central = autoridade;
- PDF é entrada, não o produto;
- ~10 páginas é heurística, não regra rígida;
- IA gera DRAFT até aceitação;
- preserve source/page provenance;
- nunca invente informação médica ausente da fonte;
- review_tasks != learning_evidence;
- fixed 16-review scheduler permanece;
- no evidence != 0%;
- falha não deixa estado parcial;
- retry é idempotente;
- sem offline authoritative writes;
- House Simulator permanece separado;
- não enfraqueça testes;
- cada formal DONE exige evidência executável;
- mudanças críticas recebem discrimination/mutation;
- commits locais atômicos;
- sem push/merge/deploy sem autorização.

Para cada task:
inspect → sensor → smallest sufficient change → acceptance-derived tests
→ narrow gate → proportional regression → evidence → local commit.

Prioridade de produto:
entregar aprendizagem por documento cedo, sem sacrificar integridade da
arquitetura.
```

## Explicit non-actions taken now

- No reconciliation against T01-T54 performed yet (DOC-01 itself, not done).
- No reprioritization applied to tasks.md.
- No new tasks created.
- T23 (in progress per STATE.md) was NOT touched or interrupted for this.
- Execution of this backlog is explicitly deferred to a later, separate instruction ("A execução vai ser depois").
