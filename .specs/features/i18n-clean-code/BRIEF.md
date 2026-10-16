# BRIEF — pedido do usuário (2026-10-16), texto original preservado
Autoridade de DIREÇÃO para a frente "Clean Code moderno + internacionalização". Não resumir nem reinterpretar: quando em dúvida, vale este texto. O estado vive em `PLAN.md`.

## Instruções permanentes dadas no mesmo dia (fora do texto principal)
- Código preparado para internacionalização (mensagem: "Código preparado para internacionalização").
- Agente chamado só para rodar testes: usar sempre HAIKU 5.5 (`model: "haiku"`). Tarefas simples em paralelo também com Haiku; colocar outros agentes para fazer em paralelo.
- Não parar enquanto houver trabalho executável: usar fila (`.specs/LOOP_BACKLOG.md`), varreduras e agentes; parar só quando duas varreduras completas seguidas voltarem vazias (testes e lint, revisão dos commits novos, interface, qualidade de código e i18n). Esperar o CI não é "nada a fazer".
- Sem `push`, `merge`, `deploy`, `release`, `rebase` ou `force-push` sem autorização explícita; commits locais pequenos e coerentes.
- Estilo: respostas concisas em português do Brasil ("caveman lite").
- Preferir `/goal` com estado final verificável (só o usuário digita): ver `PLAN.md`.

## Texto do pedido (verbatim)

SMARTLEARN — CLEAN CODE MODERNO + INTERNACIONALIZAÇÃO
OBJETIVO
Modernizar a qualidade interna do código e consolidar a internacionalização do SmartLearn, preservando integralmente o comportamento existente, a segurança, os dados e as decisões arquiteturais.
Aplicar engenharia de software moderna, adequada ao JavaScript/Node.js e à arquitetura real do projeto em 2026.
Não quero uma aplicação dogmática de livros antigos de Clean Code. Quero código simples, explícito, coeso, legível, testável, fácil de modificar e econômico em abstrações.
Qualidade não significa mais classes, interfaces, camadas, arquivos ou padrões de projeto. Significa menos complexidade para compreender, modificar e manter o software corretamente.

1. PRINCÍPIOS OBRIGATÓRIOS
* Simplicidade: preferir a solução mais direta que preserve os contratos existentes.
* Alta coesão: manter próximos os elementos que mudam pelo mesmo motivo.
* Baixo acoplamento: preservar fronteiras claras entre interface, domínio, persistência e serviços.
* Abstração justificada: extrair código quando houver responsabilidade independente, repetição prejudicial ou necessidade concreta de isolamento.
* Duplicação consciente: não criar abstrações artificiais apenas para eliminar duas linhas semelhantes.
* Clareza sem cerimônia: nomes expressivos, fluxo de controle compreensível, estados explícitos e tratamento correto de erros.
* Mudanças pequenas: evitar grandes reescritas, reorganizações cosméticas e refatorações que aumentem o risco sem ganho proporcional.
Não introduzir padrões arquiteturais, classes, dependências, frameworks ou camadas simplesmente porque são considerados boas práticas.
Não converter JavaScript para TypeScript nem alterar a arquitetura existente sem necessidade demonstrada e autorização.

2. INTERNACIONALIZAÇÃO — NENHUM TEXTO DE INTERFACE ESPALHADO PELO CÓDIGO
Todo texto exibido ao usuário deve utilizar o sistema centralizado de internacionalização já existente no SmartLearn.
Isso inclui: títulos, rótulos, botões e menus; instruções e textos auxiliares; mensagens de sucesso, aviso e erro; validações de formulários; notificações; estados vazios e de carregamento; textos de acessibilidade; mensagens de confirmação.
Requisitos:
1. Reutilizar `src/i18n/` e as convenções existentes.
2. Preservar exatamente os idiomas já suportados e suas configurações.
3. Manter independentes `uiLocale`, `sourceLanguage` e `generationLocale`.
4. Utilizar chaves semânticas estáveis, interpolação segura e tratamento adequado de pluralização e formatação regional.
5. Não concatenar fragmentos traduzidos para formar frases cuja ordem depende do idioma.
6. Não espalhar fallbacks ou traduções diretamente pelos componentes.
7. Garantir que os textos estejam completos e coerentes nos idiomas suportados.
8. Preservar as mensagens existentes em português, salvo correção expressamente necessária.
Distinção importante: a proibição se refere a textos destinados ao usuário e valores de domínio que precisam de centralização. Strings técnicas, identificadores, rotas, expressões regulares e consultas SQL não devem ser traduzidos indiscriminadamente. Constantes técnicas devem ser extraídas quando isso realmente aumentar clareza ou consistência.

3. CÓDIGO COMENTADO — PADRÃO MODERNO
Quero código profissionalmente documentado, não código poluído por comentários óbvios.
Aplicar: nomes que expliquem claramente o que o código faz; comentários que expliquem por que uma decisão não é óbvia; JSDoc ou documentação equivalente nos contratos públicos e nas funções complexas, quando acrescentar informação útil; explicações para invariantes, restrições de segurança, decisões de domínio e comportamentos surpreendentes; registro de limitações reais e pressupostos relevantes.
Evitar comentários que apenas repetem a próxima linha, documentação redundante, descrições genéricas e comentários desatualizáveis.
Princípio: o código deve ser compreensível por sua estrutura; os comentários devem preservar conhecimentos que não são evidentes pela leitura do código.

4. SEGURANÇA E REVERSIBILIDADE
A refatoração deve ser estritamente preservadora de comportamento.
Não alterar intencionalmente: regras de negócio; APIs e contratos públicos; persistência e estrutura do banco; autenticação, autorização e sessões; cálculo de revisões; proveniência e validação médica; geração de conteúdo; fluxos de navegação; comportamento da interface; dados existentes.
Nenhum teste pode acessar ou modificar o banco humano.
Antes de modificar qualquer componente:
1. Reconciliar Git, HEAD, worktree e alterações não commitadas.
2. Consultar `CLAUDE.md`, `CODEMAP.md` e as regras canônicas relevantes.
3. Identificar os comportamentos e contratos que precisam permanecer válidos.
4. Caracterizar o comportamento atual com testes existentes ou provas direcionadas.
5. Definir como a alteração poderá ser revertida isoladamente.
Executar mudanças em fatias pequenas, coesas e independentemente reversíveis.
Não misturar limpeza cosmética, correção funcional e internacionalização na mesma alteração quando isso prejudicar a verificação ou a reversão.
Não sobrescrever trabalho existente nem executar operações destrutivas.
Commits locais devem ser pequenos e coerentes, seguindo as regras do repositório. Não realizar push, merge, deploy, release, rebase ou force-push sem autorização.
A meta é zero efeitos colaterais não intencionais. Não afirmar risco zero por presunção: demonstrar preservação de comportamento por evidências proporcionais ao risco.

5. EXECUÇÃO
Começar por uma inspeção objetiva das áreas que mais precisam de melhoria. Priorizar:
1. Textos de interface ainda hardcoded.
2. Duplicações que realmente dificultam manutenção.
3. Funções ou módulos com responsabilidades excessivamente misturadas.
4. Dependências desnecessárias entre componentes.
5. Tratamento inconsistente de erros.
6. Código obscuro que possa ser simplificado sem alterar comportamento.
7. Ausência de comentários ou documentação em decisões não triviais.
Não transformar essa inspeção em uma auditoria interminável.
Escolher a primeira área com benefício concreto e risco controlável. Implementar a melhoria, testar e verificar antes de avançar.
Preferir refatorações incrementais dentro das estruturas existentes a reescritas abrangentes.
Não criar um grande plano de dezenas de tarefas nem introduzir uma segunda governança.

6. VALIDAÇÃO
Usar os testes e comandos canônicos do repositório.
Para cada fatia: confirmar que o comportamento anterior continua correto; verificar os textos e a seleção dos idiomas afetados; executar testes unitários e de integração relevantes; verificar lint e erros de execução; executar E2E e inspeção visual quando a interface for afetada; verificar acessibilidade quando componentes visíveis forem alterados; conferir o diff para detectar modificações desnecessárias; comprovar que a reversão isolada é possível sem perder outras alterações.
Não executar a suíte completa automaticamente após cada alteração pequena. Ampliar a validação conforme o risco e realizar a regressão abrangente pertinente ao fechamento.
Não modificar testes para ocultar regressões nem atualizar snapshots indiscriminadamente.
Código mais bonito com comportamento menos confiável é uma regressão, não uma melhoria.

7. CRITÉRIO DE CONCLUSÃO
Uma fatia só está concluída quando: 1. o código ficou objetivamente mais claro ou mais fácil de manter; 2. os textos destinados ao usuário na superfície modificada utilizam a internacionalização corretamente; 3. comentários e contratos relevantes ficaram compreensíveis; 4. não houve alteração funcional não autorizada; 5. os testes pertinentes passaram no estado final; 6. a alteração é pequena, rastreável e reversível; 7. nenhuma nova complexidade injustificada foi introduzida.
Se uma refatoração não trouxer benefício demonstrável, descartá-la.
Se houver dúvida relevante sobre preservação de comportamento, interromper aquela mudança e obter evidência antes de prosseguir.

ENTREGA
Executar a primeira fatia real, não apenas planejar. Ao concluir, informar sucintamente:
ANTES → DEPOIS: o que melhorou.
ARQUIVOS: quais foram alterados.
INTERNACIONALIZAÇÃO: textos centralizados e idiomas verificados.
VALIDAÇÃO: comandos, resultados e eventuais limitações.
REVERSÃO: como desfazer exclusivamente aquela alteração.
PRÓXIMA FATIA: maior oportunidade restante, caso exista.
Princípio final: Clean Code moderno é reduzir o custo de entender e modificar o software, preservando seu funcionamento. Não é aumentar a quantidade de abstrações, comentários ou arquivos.
