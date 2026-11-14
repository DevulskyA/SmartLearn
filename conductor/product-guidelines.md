# Product Guidelines — SmartLearn (pointer)

Autoridade real: `.specs/STATE.md` (seção "Decisões registradas", DEC-001..DEC-016)
e `.specs/project/INVARIANTS.md`.

Invariantes que mais afetam o cockpit (não duplicar o texto completo aqui):

- **PLATFORMS = WEB + ANDROID + WINDOWS** (fixo). WebView é runtime do
  Windows/Tauri, não uma 4ª plataforma.
- **JAVA_INVARIANT**: JDK/Gradle só como toolchain Android; sem lógica de
  produto em Java/Kotlin manual sem HUMAN_GATE.
- **DEC-013-V2**: fonte é texto livre (`source_text`); tabela `sources` não
  existe.
- **INV-26**: todo gate de closure futuro inclui gate por plataforma ou
  SPEC_DEVIATION aprovado.
- **DONE não existe. Existe PROVEN** — uma task só fica verde após gate TLC
  com evidência (ver `workflow.md` regra 5).

## Filosofia e direção (ordem do dono, 2026-11-14)

Texto completo e CANÔNICO: `.specs/governance/SMARTLEARN_FILOSOFIA_PARA_IA.md` (v1.3; registrado em `.specs/STATE.md`, `PRODUCT_PHILOSOPHY_PATH`; consulta sob demanda, só a seção pertinente). Abaixo, o resumo operacional.

Direção, não prova: a Constituição do Produto (§0.1) e o padrão de qualidade vencem em caso de conflito; o estado real vem do Git e dos testes.

**Propósito.** O SmartLearn existe para ajudar o aluno a aprender Medicina com eficácia e o mínimo possível de trabalho administrativo. O aluno gasta energia estudando; o sistema organiza o material, acompanha o estudo e transforma o que observa em uma próxima ação útil.

**Público e expansão.** O início é focado em Medicina. No futuro poderá atender concursos e outros cursos superiores, mas cada área exige capacidades próprias (por exemplo, Física pode precisar compreender e gerar fórmulas). Essa expansão NÃO é escopo imediato do V1.

**Ciclo principal.** O aluno fornece seu material; o SmartLearn o organiza em unidades de aprendizagem, prepara resumos e questões, apoia o estudo e a prática, registra evidências reais, agenda revisões, identifica dificuldades e recomenda o que fazer em seguida.

**Aprendizagem acima da administração.** Automatizar organização, agenda, datas, registros, histórico, estatísticas, pendências e seleção da próxima ação sempre que isso reduzir tarefas burocráticas. A interface deixa claro o que fazer agora, inclusive em períodos curtos ao longo do dia.

**Acesso móvel.** Android faz parte do mínimo necessário: consultar resumos, saber o que estudar e fazer revisões pelo celular, sem depender de um computador. Escopo enxuto, avaliado pelo uso real.

**Conteúdo fiel e útil.** Resumos e questões são centrais. Fidelidade médica e à fonte vale mais que fluência. Tempo e custo de geração importam, mas não comprometem a qualidade. Conteúdo gerado por IA permanece rascunho até o aluno aceitar.

**Evidência honesta.** Fazer uma revisão não prova aprendizagem. Distinguir o agendado do realmente feito, preservar o histórico e usar evidências observadas para identificar dificuldades e recomendar ações.

**Experiência.** Clareza, continuidade, hierarquia visual, baixa fricção, acessibilidade e próxima ação evidente fazem parte da funcionalidade. Estatísticas ajudam a decidir o que estudar; não são decoração.

**PDFs.** O aluno fornece e mantém seus arquivos sob sua responsabilidade. O SmartLearn os lê para gerar resumos e não reivindica a propriedade. Política de produto definida pelo dono: os PDFs não ficam armazenados no servidor do SmartLearn.
DECISÃO ABERTA (verificada no código em 2026-11-14): hoje o servidor grava o PDF (`server/src/services/source-storage.js`, `SMARTLEARN_SOURCES_DIR`) e o serve em `GET /sources/:id/file`; abrir material, figuras e reextração dependem dele. A política e o código divergem até o dono decidir entre manter o armazenamento (ajustando o texto) ou mudar a arquitetura.

**Princípios de execução.** Preservar decisões e comportamentos aprovados; conferir código e evidências antes de presumir que algo falta; não duplicar funcionalidades nem criar segunda fonte da verdade. `.specs/` guarda requisitos e evidências, o Git mostra o estado real, o Conductor acompanha o trabalho. Decisões de produto abertas são sinalizadas, nunca assumidas.
