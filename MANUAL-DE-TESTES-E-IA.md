# Manual simples de testes e ferramentas de análise

Este manual explica, com palavras simples, como escolher e usar as ferramentas de teste e análise encontradas no SmartLearn.

## 1. A ideia principal

Imagine que o programa é uma casa:

- **Testes** verificam se portas, luzes e torneiras funcionam.
- **Lint e análise estática** procuram problemas no projeto sem ligar o programa.
- **Playwright** usa um navegador automático como se fosse uma pessoa.
- **Testes com IA** pedem a um modelo que produza ou revise conteúdo; podem usar recursos pagos e precisam de revisão humana.
- **Skills** são instruções para orientar o agente. Uma skill não é, por si só, um programa de teste.

Uma ferramenta pode avisar sobre um problema sem estar certa. Leia o detalhe, confirme o contexto e só então mude o código. “Nenhum problema encontrado” também não prova que tudo funciona: cada ferramenta olha para uma parte diferente.

## 2. Antes de começar

1. Abra o PowerShell na pasta do projeto: `C:\Projetos\SmartLearn`.
2. Confira que está na pasta certa:

   ```powershell
   (Resolve-Path .).Path
   ```

   O resultado deve ser `C:\Projetos\SmartLearn`.

3. Veja o estado do Git antes de trabalhar:

   ```powershell
   git status --short
   ```

   Isso ajuda a distinguir suas mudanças das alterações que os testes possam criar. Não apague nem sobrescreva arquivos de outra pessoa.
4. Use primeiro o teste menor relacionado à mudança. Depois, se necessário, avance para verificações maiores.
5. Não rode comandos de build, teste, migração ou limpeza sem conferir as regras atuais do projeto. O SmartLearn tem limites especiais para worktrees e builds.

Os comandos abaixo são os atalhos definidos no projeto. Para confirmar se continuam válidos depois de mudanças no `package.json`, consulte os scripts atuais.

## 3. Testes automáticos do código

### 3.1 Testes do Node.js

Esses testes executam funções e serviços sem abrir a interface. São como testar cada peça separadamente.

```powershell
npm test
```

Para testar o servidor:

```powershell
npm --prefix server test
```

Para rodar um único arquivo de teste, use o caminho dele:

```powershell
node --test test/NOME-DO-ARQUIVO.test.js
```

No servidor, entre primeiro em `server` e rode `node --test test/NOME-DO-ARQUIVO.test.js`.

**Quando usar:** depois de alterar uma regra, função, serviço ou comportamento que já tenha teste.

**Como entender:** cada teste aprovado mostra que aquele cenário passou. Não significa que todos os cenários possíveis passaram.

### 3.2 Playwright: testar pelo navegador

Playwright abre um navegador controlado por código, clica, preenche campos e confere resultados. É como um robô seguindo os passos de uma pessoa.

Comece por uma suíte pequena:

```powershell
npm run test:e2e:smoke
```

Suítes específicas disponíveis:

```powershell
npm run test:e2e:materials
npm run test:e2e:summary
```

O conjunto completo é:

```powershell
npm run test:e2e
```

**Regra importante:** use os comandos do projeto. Eles passam pelo `scripts/e2e.mjs`, que prepara recursos e portas de teste. Não inicie vários servidores ou suítes ao mesmo tempo sem verificar as instruções.

O piloto rápido da interface é:

```powershell
npm run test:ui:fast
```

Ele cobre um piloto específico, não substitui toda a suíte E2E.

### 3.3 Testes de acessibilidade com axe

O projeto usa `axe-core` com Playwright e tem testes em `e2e/accessibility.spec.js`. Essa ferramenta procura alguns problemas comuns, como controles sem nome acessível e certos contrastes insuficientes.

Ela não substitui testar navegação só com teclado, foco visível, ordem de leitura ou a experiência de pessoas que usam leitores de tela. Esses pontos também precisam de testes próprios e revisão humana.

### 3.4 Inventário de testes

```powershell
npm run test:inventory
```

Esse comando verifica o inventário/categorização dos testes. Ele não executa os fluxos do produto e não comprova que a aplicação funciona.

### 3.5 Teste de mutação

```powershell
npm run test:mutation -- --list
npm run test:mutation
```

O primeiro comando lista as mutações disponíveis. O segundo faz uma cópia temporária isolada, introduz pequenas falhas de propósito e confere se os testes existentes percebem essas falhas.

Analogia: é como desligar uma lâmpada de propósito para verificar se o alarme percebeu. Se a mutação “sobrevive”, pode faltar um teste para aquele comportamento. O teste usa uma área temporária; confira sempre as instruções atuais antes de executá-lo.

## 4. Análise do código sem executar o produto

### 4.1 ESLint

```powershell
npm run lint
```

Procura padrões suspeitos, erros de estilo e algumas classes de bug. É como um revisor que lê o código, mas não usa o aplicativo.

### 4.2 Oxlint

```powershell
npm run lint:oxlint
```

É outro analisador estático, geralmente rápido. Ele tem regras e cobertura diferentes do ESLint; um não substitui automaticamente o outro.

Se um deles apontar algo, abra o arquivo e entenda o motivo antes de corrigir. Uma regra pode não conhecer uma convenção específica do projeto.

### 4.3 Fallow

Fallow procura possíveis arquivos ou exportações sem uso, imports que não resolve, dependências e duplicação. Ele não sabe sempre que o código é carregado por nome, script, configuração ou caminho dinâmico.

Primeiro confira a instalação e a configuração. No projeto, o atalho é `npm run audit:fallow`. Para verificar a saúde da ferramenta e sua configuração:

```powershell
npm run audit:fallow -- doctor --format json --quiet
```

Para procurar código possivelmente sem uso:

```powershell
npm run audit:fallow -- dead-code --format json --quiet --explain
```

Para procurar trechos parecidos:

```powershell
npm run audit:fallow -- dupes --format json --quiet
```

Para ver áreas de maior complexidade:

```powershell
npm run audit:fallow -- health --hotspots --targets --format json --quiet
```

Para a análise ampla:

```powershell
npm run audit:fallow -- --format json --quiet --explain
```

**Como ler o resultado:** nas execuções observadas neste projeto, código de saída `1` podia significar que a análise terminou e encontrou itens que acionaram regras. Isso não é o mesmo que falha ao iniciar. Código `2` indicava erro de execução/configuração. Confirme sempre o JSON, especialmente campos `error`, `gate_outcomes` e `workspace_diagnostics`; a versão e as regras podem mudar.

**Como investigar um “não usado”:**

1. Abra o detalhe e use a opção `--trace` quando disponível para entender por que Fallow acha que o item está isolado.
2. Procure referências por texto, configuração, scripts e carregamento dinâmico.
3. Confira se o arquivo é uma entrada externa, uma página, um worker, um script manual ou código esperado por ferramenta.
4. Leia `.fallowrc.json` e confira o escopo incluído e excluído. O projeto exclui algumas áreas como `TRASH` e pastas de configuração/agentes. Uma exclusão só tira itens daquela medição; não apaga nada e não prova que o item excluído está correto.
5. Só depois decida. Não apague código apenas porque apareceu como candidato. Siga a regra do repositório para preservar código removido.

O relatório inicial de novembro de 2026 encontrou bastante ruído. A configuração foi ajustada e resultados posteriores mudaram. Os números daquele relatório são históricos, não devem ser tratados como contagem atual.

## 5. Build: verificar se o projeto consegue ser montado

```powershell
npm run build
```

Verifica a compilação do frontend pelo Vite. Um build aprovado não prova que os botões ou fluxos funcionam.

Há também comandos de build Tauri/Rust:

```powershell
npm run build:exe
npm run build:installer
```

Eles podem demorar e gerar artefatos. Só rode conforme as regras e o objetivo de trabalho vigentes. Build não é teste funcional.

## 6. Testes com inteligência artificial

### 6.1 IA ajudando a escrever ou revisar testes

Uma skill pode orientar a IA a planejar casos, criar testes, investigar defeitos ou revisar uma tela. O resultado ainda precisa ser conferido e executado pelos testes adequados. A IA pode sugerir um teste incompleto ou entender errado o requisito.

Skills encontradas no ambiente/projeto:

| Skill | Para que serve, em palavras simples |
| --- | --- |
| `test-generation` | Planejar cenários e escrever testes. |
| `playwright-cli` | Orientar automação de páginas no navegador. |
| `ui-fast-playwright` | Rodar ou ajustar testes rápidos de interface. |
| `agent-browser` | Explorar páginas com um navegador controlado por agente. Explorar não é o mesmo que ter um teste repetível. |
| `ui-a11y-remediator` | Investigar e corrigir problemas de acessibilidade. |
| `ui-visual-gatekeeper` | Avaliar evidências visuais, como capturas e renderizações. |
| `atelier-ui` | Guiar trabalho de interface, design e acessibilidade. |
| `bug-investigation`, `root-cause-debugging`, `complex-incident-debugging` | Ajudar a encontrar a causa de um problema antes de mudar código. |
| `fallow` | Orientar a análise do código com Fallow e a leitura cuidadosa dos achados. |

No Codex, quando a skill está disponível, ela pode ser chamada pelo nome, por exemplo `$fallow`. Em Claude, a forma de invocação depende da instalação local das skills. A presença no catálogo do Codex não prova que ela também esteja instalada no Claude.

### 6.2 IA gerando conteúdo no Prompt Lab

O projeto tem um fluxo de laboratório para avaliar geração de conteúdo. O script é `scripts/prompt-lab/run-generation.mjs`.

O modo `FAKE` produz resultados simulados e previsíveis. Serve para conferir se o encanamento do laboratório funciona; não mede a qualidade de um modelo de IA.

O modo `CODEX` faz uma chamada real ao modelo. Isso pode consumir cota ou gerar custo. Requer autorização explícita e atual da pessoa responsável para cada uso real. O fluxo deve usar apenas o banco de laboratório em `SmartLearn-PromptLab`, nunca o banco de dados humano, de desenvolvimento ou do aplicativo.

Exemplo de formato do comando registrado no script (substitua os valores entre sinais pelos dados válidos do laboratório):

```powershell
node scripts/prompt-lab/run-generation.mjs --db <caminho-do-banco-do-laboratorio> --source Costanzo --section "Glomerular Filtration" --runs 1 --provider FAKE --out <pasta-de-saida>
```

Para um modelo real, o provedor é `CODEX`; não execute essa modalidade sem autorização explícita. O script limita execuções por padrão. Não use `--allow-more` sem necessidade e autorização.

O relatório pode incluir métricas determinísticas (`metrics.mjs`), cobertura de conceitos (`coverage.mjs`) e uma rubrica humana em `.specs/features/prompt-lab/rubric.md`. Essas medidas ajudam a comparar respostas; não provam que conteúdo médico está correto. Uma pessoa deve conferir fidelidade à fonte, precisão, referências/páginas, duplicações, idioma e reparos necessários. O resultado de IA é rascunho até ser aceito por uma pessoa.

## 7. Uma ordem prática para investigar um defeito

Use esta sequência como um mapa simples:

1. **Descreva o que deveria acontecer** e o que aconteceu de verdade.
2. **Encontre o teste mais próximo** e rode só ele.
3. Se o problema aparece na interface, rode a **suíte Playwright específica**.
4. Rode **ESLint/Oxlint** se a mudança envolver código que eles analisam.
5. Use **Fallow** para levantar pistas sobre dependências ou código sem uso; confirme cada achado.
6. Use **mutação** quando quiser saber se os testes detectariam certos erros.
7. Use **IA real** apenas quando o objetivo for avaliar uma geração real e o uso estiver autorizado. Separe isso de simulações `FAKE`.
8. Registre o comando, resultado, duração observada, limites e arquivos alterados. Diga claramente o que não foi verificado.

## 8. O que cada resultado quer dizer

- **Teste passou:** os cenários executados passaram.
- **Teste falhou:** existe uma diferença entre o esperado e o observado; investigue antes de concluir que o produto está quebrado.
- **Lint encontrou aviso:** há um padrão que merece revisão, mas pode ser convenção válida.
- **Fallow diz “não usado”:** é um candidato para investigar, não autorização para apagar.
- **Build passou:** o programa foi montado por aquela etapa; não garante uso correto.
- **IA deu uma resposta boa:** é evidência para avaliar, não prova independente de verdade.
- **Teste `FAKE` passou:** o fluxo simulado funcionou, não a qualidade do modelo real.

## 9. Histórico e cuidado com números

Em novembro de 2026, o projeto já passou por análises de Fallow e Oxlint e por execuções de testes. As contagens de Fallow mudaram quando o escopo foi configurado para tratar pastas ocultas, arquivos de apoio e entradas dinâmicas. Um relatório antigo serve para entender a investigação, mas não descreve necessariamente o estado de hoje.

Também há registros históricos de Playwright e medições de duração. O tempo depende da máquina, da suíte, da quantidade de workers e do estado do projeto. Meça na execução atual antes de prometer um prazo.

## 10. Resumo de bolso

Esta lista junta **todas as ferramentas e métodos citados neste manual**. Escolha a linha que combina com sua pergunta.

| Ferramenta ou método | Comando ou como abrir | Para que serve |
| --- | --- | --- |
| Testes Node.js do projeto | `npm test` | Testar funções e comportamentos da parte principal. |
| Um teste Node.js específico | `node --test test/NOME.test.js` | Repetir só o teste relacionado à mudança. |
| Testes do servidor | `npm --prefix server test` | Testar os serviços e regras do servidor. |
| Um teste do servidor | Entre em `server` e rode `node --test test/NOME.test.js` | Investigar um caso específico do servidor. |
| Playwright E2E rápido | `npm run test:e2e:smoke` | Verificar os fluxos básicos pela interface. |
| Playwright para Materiais | `npm run test:e2e:materials` | Testar os fluxos da área Materiais. |
| Playwright para Resumo | `npm run test:e2e:summary` | Testar os fluxos da área Resumo. |
| Playwright E2E completo | `npm run test:e2e` | Rodar todos os fluxos E2E configurados. |
| Piloto Playwright de UI | `npm run test:ui:fast` | Rodar o piloto rápido de interface; não cobre tudo. |
| axe-core com Playwright | Testes de acessibilidade em `e2e/accessibility.spec.js`; execute a suíte Playwright apropriada | Procurar automaticamente alguns problemas de acessibilidade. |
| Inventário dos testes | `npm run test:inventory` | Conferir organização e descoberta dos testes; não executa os fluxos do produto. |
| Teste de mutação, lista | `npm run test:mutation -- --list` | Ver quais falhas artificiais podem ser experimentadas. |
| Teste de mutação, execução | `npm run test:mutation` | Verificar se testes detectam pequenas falhas introduzidas em cópia temporária. |
| ESLint | `npm run lint` | Procurar erros e padrões suspeitos no código. |
| Oxlint | `npm run lint:oxlint` | Fazer outra análise estática, com regras próprias. |
| Fallow, diagnóstico | `npm run audit:fallow -- doctor --format json --quiet` | Conferir ambiente e configuração do Fallow. |
| Fallow, possíveis itens sem uso | `npm run audit:fallow -- dead-code --format json --quiet --explain` | Encontrar candidatos que precisam de investigação. |
| Fallow, duplicações | `npm run audit:fallow -- dupes --format json --quiet` | Procurar trechos parecidos no código. |
| Fallow, áreas complexas | `npm run audit:fallow -- health --hotspots --targets --format json --quiet` | Destacar áreas que podem exigir mais cuidado. |
| Fallow, análise ampla | `npm run audit:fallow -- --format json --quiet --explain` | Fazer uma análise geral configurada para o projeto. |
| Build do frontend | `npm run build` | Conferir se o frontend compila. |
| Build do executável Tauri | `npm run build:exe` | Compilar o executável Tauri/Rust sem empacotar o instalador. |
| Build do instalador | `npm run build:installer` | Criar o instalador do aplicativo. |
| Prompt Lab em simulação | `node scripts/prompt-lab/run-generation.mjs ... --provider FAKE ...` | Exercitar o fluxo com dados simulados, sem avaliar a qualidade de um modelo real. |
| Prompt Lab com modelo real | Mesmo script com `--provider CODEX`; requer autorização explícita atual e banco isolado do laboratório | Avaliar uma geração real de IA; pode consumir cota ou gerar custo. |
| Métricas do Prompt Lab | `scripts/prompt-lab/metrics.mjs` | Calcular sinais numéricos para comparar resultados. |
| Cobertura de conceitos | `scripts/prompt-lab/coverage.mjs` | Comparar conceitos esperados e gerados. |
| Rubrica humana | `.specs/features/prompt-lab/rubric.md` | Guiar a revisão humana da qualidade do conteúdo. |
| Skills de teste e revisão | No Codex, invoque a skill disponível pelo nome, por exemplo `$test-generation` ou `$fallow`; em Claude, use a forma da instalação local | Orientar o agente. Skills são instruções, não executores automáticos de testes. |
| Navegação exploratória por agente | Skill `agent-browser` ou `playwright-cli`, se instalada no host | Explorar a página; transforme achados importantes em testes repetíveis. |
| Revisão visual e acessibilidade | `atelier-ui`, `ui-visual-gatekeeper` e `ui-a11y-remediator`, se instaladas | Guiar revisão da tela, legibilidade e acessibilidade. A conferência humana continua necessária. |
| Investigação da causa de bug | `bug-investigation`, `root-cause-debugging` ou `complex-incident-debugging`, se instaladas | Investigar sintomas antes de escolher uma correção. |

`NOME.test.js` é um exemplo: troque pelo nome real de um arquivo de teste. Para Fallow, use `--trace` ao investigar um candidato específico quando a opção estiver disponível. Para executar skills, elas precisam estar instaladas no agente que você está usando; o catálogo de um host não garante que estejam no outro.

**Regra de ouro:** uma ferramenta aponta pistas; evidência, contexto e revisão humana decidem o que fazer.
