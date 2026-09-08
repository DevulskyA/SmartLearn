# SmartLearn Quality Standard — Canonical, Inherited

```
QUALITY_STANDARD_ID=SMARTLEARN_QUALITY_V1
QUALITY_STANDARD_VERSION=1.0.0
QUALITY_STANDARD_STATUS=CANONICAL
ADOPTED=2026-09-07
```

## Status and inheritance

```
PROJECT GOVERNANCE (00_PROJECT_GOVERNANCE_STANDARD.md)
  → QUALITY STANDARD (this file)
    → PHASE CONTRACT (.specs/features/smartlearn-v1-consolidated-v2/*.md)
      → TASK ACCEPTANCE CRITERIA (tasks.md / acceptance.md)
        → IMPLEMENTATION
```

This standard is **inherited by every current and future task** of `smartlearn-v1-consolidated-v2` (and any successor plan for SmartLearn V1). It is not scoped to whichever task happened to be running when it was adopted.

A task-local spec, an ADR, or an acceptance criterion may **add** precision or an additional requirement on top of this standard. None of them may **silently reduce** it. If a genuine conflict is found between an approved functional contract and this standard, preserve the approved functional contract, and flag the incompatibility explicitly (as a DEBT item or a note in the relevant task's validation.md row) rather than silently changing behavior to satisfy this document.

This document is edited only as a deliberate, explicit governance change (see "Changing this standard" at the end) — never incidentally while a normal task is in flight, and never merely to make a task pass.

## Task closure rule

```
TASK AC PROVEN
+ REGRESSION GATES GREEN
+ QUALITY STANDARD's materially applicable dimensions satisfied
= TASK DONE
```

Apply only the dimensions materially relevant to the change — this is not a mandatory checklist run in full on every diff — but no materially relevant dimension may be skipped. Representative examples:

- a database change → architecture + integrity + migration + security + tests;
- a UX change → behavior + UX + accessibility + tests;
- a learning-behavior change → behavior + evidence + pedagogy + UX + tests;
- an AI/PDF change → provenance + fidelity + security + versioning + tests.

## The standard itself

*(Verbatim, as given by the user on 2026-09-07 and previously applied this session to T39/T40. Reproduced in full — not summarized, not weakened.)*

---

Execute o goal atual do SmartLearn com padrão de engenharia, produto e experiência equivalente ao trabalho das melhores equipes de software do mundo — **top 0,1% como piso, jamais como teto**. O benchmark é o **produto real em funcionamento**: arquitetura, código, comportamento, experiência do usuário, confiabilidade, segurança, desempenho, acessibilidade, testabilidade, manutenção e coerência integral devem atingir acabamento AAA.

### Produto final desejado

O SmartLearn deve terminar como um **sistema médico de aprendizagem excepcionalmente eficaz, simples de usar, tecnicamente rigoroso e confiável**, capaz de transformar material bruto em aprendizagem ativa com o mínimo possível de trabalho administrativo para o estudante.

A experiência final deve fazer este fluxo parecer natural:

material médico
→ organização inteligente
→ conteúdo de estudo confiável
→ recuperação ativa e exercícios
→ evidência real de aprendizagem
→ revisões
→ identificação de fraquezas
→ próxima ação útil

O usuário informa apenas o que realmente precisa informar; todo dado confiavelmente derivável é calculado ou organizado pelo sistema.

Cada interação deve ter propósito pedagógico ou operacional claro. O produto deve transmitir imediatamente **clareza, velocidade, confiança e domínio**, inclusive para alguém que nunca viu sua arquitetura interna.

#### Excelência funcional

Cada fluxo deve funcionar integralmente de ponta a ponta, inclusive em estados adversos e de recuperação.

O comportamento deve ser:

- previsível;
- consistente;
- idempotente onde necessário;
- historicamente reconstruível;
- seguro sob concorrência, retries, reloads e falhas parciais;
- correto em estados vazios, limites e transições;
- coerente entre cliente, servidor, banco e histórico persistido.

Uma funcionalidade está concluída quando seu comportamento real está provado, e não apenas quando seu happy path funciona.

#### Excelência pedagógica

Toda complexidade deve justificar-se por melhora concreta em aprendizagem, redução de atrito ou aumento material de confiabilidade.

Preserve como princípios:

- aprendizagem ativa acima de administração do sistema;
- evidência observada acima de inferências frágeis;
- fonte, geração, aceitação e evidência historicamente distinguíveis;
- fidelidade médica acima de fluência;
- próxima ação clara acima de dashboards ornamentais;
- automação confiável acima de preenchimento manual;
- explicações e feedback que ajudem o estudante a compreender, discriminar e recordar.

A arquitetura interna pode ser sofisticada; a experiência do estudante deve permanecer simples.

#### Excelência arquitetural

Construa a **menor arquitetura capaz de satisfazer integralmente os invariantes reais**.

Prefira:

- uma fonte de verdade clara;
- invariantes reforçadas estruturalmente;
- modelos de domínio explícitos;
- fronteiras transacionais coerentes;
- estados derivados reconstruíveis;
- contratos pequenos e precisos;
- composição simples;
- compatibilidade deliberada;
- evolução incremental;
- baixa entropia arquitetural.

Toda abstração adicional deve comprar uma propriedade concreta e testável.

Antes de introduzir estrutura nova, procure primeiro a solução mais simples já compatível com o desenho existente.

#### Integridade histórica e de dados

Qualquer informação que tenha participado efetivamente do aprendizado precisa continuar auditável no futuro.

Quando aplicável, deve ser possível reconstruir:

evidência
→ tentativa/sessão
→ conteúdo apresentado
→ revisão exata
→ proveniência
→ versão da fonte

Alterações futuras devem preservar o significado histórico do passado.

Ausência, desconhecido, zero, falha, conteúdo parcial e conteúdo rejeitado são estados semanticamente distintos e devem permanecer distinguíveis.

#### IA e conteúdo médico

Conteúdo gerado deve possuir proveniência, estado e ciclo de vida explícitos.

O sistema deve preservar:

- identidade da fonte;
- versão relevante;
- distinção entre fonte e inferência;
- revisão exata aceita;
- publicação controlada;
- possibilidade de auditoria posterior.

A IA produz propostas de alta qualidade; a arquitetura mantém autoridade, rastreabilidade e segurança fora do modelo.

#### Segurança

Projete cada fronteira assumindo entradas hostis, estados concorrentes e identificadores válidos pertencentes ao usuário errado.

Ownership deve ser transitivo e verificável em todas as relações relevantes.

Prefira garantias estruturais do banco e do domínio quando elas puderem tornar estados inválidos impossíveis, em vez de depender exclusivamente de disciplina de chamada.

#### UX

O produto final deve possuir qualidade visual e interacional de software profissional de primeira linha:

- hierarquia visual imediata;
- baixa carga cognitiva;
- mobile-first;
- resposta rápida;
- estados de loading, vazio, erro, offline e sucesso cuidadosamente resolvidos;
- feedback proporcional;
- acessibilidade real;
- navegação previsível;
- terminologia consistente;
- nenhuma exposição desnecessária da complexidade interna.

Cada tela deve responder claramente à decisão que trouxe o usuário até ela.

#### Engenharia

O código final deve ser fácil para outro engenheiro excelente compreender, verificar e evoluir.

Exija:

- responsabilidades claras;
- nomes semanticamente precisos;
- invariantes próximas de onde são garantidas;
- ausência de duplicação conceitual;
- tratamento explícito de falhas materiais;
- migrações seguras;
- dados preservados;
- testes com alto poder discriminante;
- observabilidade suficiente para diagnosticar falhas reais;
- comentários apenas onde acrescentem conhecimento que o código não expressa adequadamente.

### Método de execução

Antes de alterar qualquer coisa, reconcilie o estado real do repositório, goal, tarefa dependency-ready, especificações vigentes, implementação e testes. **Git, código executável e evidência observável prevalecem sobre narrativas divergentes.**

Para cada unidade de trabalho:

objetivo
→ invariantes
→ risco real
→ código existente
→ menor solução completa
→ implementação
→ teste discriminante
→ regressão
→ inspeção adversarial do produto real
→ persistência da evidência
→ commit atômico

Procure a hipótese adversária mais forte antes de aceitar uma conclusão importante.

Um teste deve demonstrar a propriedade que protege. Sempre que materialmente útil, conceba uma implementação perigosamente plausível e confirme que o sensor existente a rejeitaria.

Corrija a causa estrutural antes de adicionar compensações downstream.

Preserve tudo que já está comprovadamente correto. Qualquer mudança que melhore uma dimensão deve manter ou elevar as demais.

### Padrão de excelência

Avalie o resultado como fariam especialistas de elite independentes em:

- arquitetura e sistemas distribuídos;
- engenharia de software;
- banco de dados e integridade;
- segurança;
- qualidade e testes;
- performance;
- UX e acessibilidade;
- IA aplicada;
- aprendizagem médica;
- produto.

Cada especialidade deve julgar o **artefato real**, seu comportamento e suas consequências, e não a intenção da implementação.

Quando houver alternativas materialmente diferentes, compare-as pelo menos por:

correção
× simplicidade
× poder de invariância
× impacto no usuário
× risco de regressão
× custo futuro
× capacidade de teste

Escolha a solução dominante no conjunto, e não a mais sofisticada.

Use agentes ou processos independentes de crítica quando trouxerem ganho material de qualidade. Faça-os trabalhar sobre perguntas estreitas, evidências concretas e critérios objetivos. Reintegre os achados numa única solução coerente.

Após implementar, execute uma inspeção adversarial final:

1. identifique a maior deficiência remanescente do produto real;
2. procure evidência que refute sua própria conclusão;
3. corrija a deficiência quando houver ganho material sem regressão;
4. repita enquanto existir melhoria genuinamente alcançável.

Se o escopo competir com a excelência, reduza o escopo antes de reduzir o padrão.

### Critério de conclusão

Considere uma tarefa concluída somente quando:

- o comportamento requerido existe de ponta a ponta;
- os invariantes relevantes estão protegidos;
- casos adversariais materiais possuem resposta correta;
- testes discriminantes passam;
- regressões relevantes passam;
- código e arquitetura permanecem coerentes;
- UX correspondente possui acabamento de produção;
- dados e histórico permanecem íntegros;
- documentação operacional reflete a realidade;
- o estado pode ser retomado deterministicamente por outra sessão;
- não permanece deficiência material conhecida dentro do escopo concluído.

O objetivo final não é produzir muito código nem completar caixas de uma especificação. É entregar um **SmartLearn extraordinariamente bom de usar, difícil de corromper, fácil de compreender e evoluir, pedagogicamente útil e tecnicamente confiável**, em que cada camada contribua para o estudante aprender melhor com o menor atrito possível.

Trate esse padrão como requisito de aceite, não como aspiração.

---

## Changing this standard

This is a deliberate governance action, never an incidental edit inside a normal task:

1. Treat it as an explicit governance change, not a task-local edit.
2. The previous version stays recoverable from Git history (never force-rewritten).
3. Bump `QUALITY_STANDARD_VERSION` above.
4. Record the justification (in the commit message and, if the change is non-trivial, as an ADR under `.specs/adr/`).
5. Confirm no previously important requirement was accidentally weakened in the process.

Never edit this file just to make a task pass its gate.
