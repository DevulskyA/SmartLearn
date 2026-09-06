# SmartLearn Input Integrity v2 — Design

## Context Loaded
- Spec: `spec.md` deste pacote.
- Base remota inspecionada: `74e3ee77a21e012672d3f3caec0dafbbeb831d71`.
- Base local reportada: `1b65836`; inspecionar diff e evidências no início. Nunca resetar para essa referência.
- Decisões recentes: fonte livre; Resumo Mestre permanente; Option C; WEB/ANDROID/WINDOWS; toolchain Java apenas; proteção absoluta da base real.
- Lições: teste não pode validar cópia; usuário não precisa clicar Adicionar antes de Salvar aula; contexto longo não substitui evidência.

## Architecture

**Mudança localizada:** manter a fachada DB, o motor transacional Rust, os adapters e a UI existente. Reusar `naming-validation.js`, evitando criar outro framework de validação.

UI (parse dos controles) → função pura por família → serviço de cadastro composto → adapter/transação existente → resultado persistido → atualização explícita de UI.

Importação: reconhecer versão/shape conhecido → converter uma vez → validar TODO o candidato em memória → persistir atomicamente → atualizar UI. O material importado é dado, nunca instrução para agente, shell ou modelo.

Sugestões de módulos, não obrigação de renomear arquivos existentes:
- `src/naming-validation.js`: manter wrapper compatível e implementar regras corretas de nome/título.
- `src/input-validation.js`: criar somente se houver pelo menos dois consumidores reais para número/data/enum. Pode permanecer no módulo de validação atual.
- `src/lesson-save.js`: serviço puro/dependências injetáveis apenas se necessário para testar o fluxo composto; não reescrever `app.js` inteiro.
- `src/db.js`: fachada/validação e adapter; manter `schema-statements.json`, `migration-main-to-vnext.json` e transações Rust como autoridades existentes.

## Interfaces and Contracts

| Component | Contract | Inputs | Outputs | Errors |
| --- | --- | --- | --- | --- |
| Normalizador de disciplina | NFC + trim + espaços horizontais; chave PT-BR sem remover acentos | String não confiável | Nome exibível e chave de comparação | EMPTY, INVALID_TYPE, CONTROL, LIMIT |
| Validador de título | Nome de aula de uma linha, símbolos médicos preservados | String não confiável | Título normalizado | Mesmo contrato de erro por campo |
| Parse de contagem/data | Separar UI string do tipo canônico | Campo + contexto | Inteiro seguro/data civil exata | REQUIRED, TYPE, RANGE, DATE |
| Resolver disciplina | Modo `existing`/`new` explícito e ID estável | Escolha + nome | ID existente ou plano de criação | ARCHIVED, AMBIGUOUS, REQUIRED |
| Salvar aula | Tudo-ou-nada para efeitos pertencentes a Salvar aula | Rascunho validado, escolha e revisões | IDs reais e resultado confirmado | Validação/armazenamento recuperável |
| Importar | Validação total antes de mutação | Backup conhecido | Estado íntegro | Erro antes de escrita ou rollback integral |
| Render | Texto livre como dados e chaves por ID | Resultado canônico | UI consistente | Erro de render separado de erro de save |

As assinaturas concretas devem preservar compatibilidade dos callers existentes. Testes importam a implementação usada pela aplicação; dependências fake somente para falhas pontuais ou relógio, não para substituir o objeto sendo provado.

## State and Data

### Proteção antes de qualquer execução

- Não usar a conta, WebView instalado, perfil Chrome, Android do usuário ou `%APPDATA%` real como ambiente de teste.
- Não fazer cópia bruta de SQLite ativo como “backup garantido”; WAL pode conter dados fora do arquivo principal. Esta missão não precisa tocar a base principal. Se for necessária recuperação real, abrir tarefa humana específica.
- SQLite temporário: arquivo sob diretório de sessão de teste; `foreign_keys` verificado; tanto plugin SQL quanto comando Rust customizado devem resolver para o mesmo destino isolado.
- Web: browser context novo com storage próprio, não apenas outra porta no perfil do usuário. Só seed/dados sintéticos nesse contexto.
- Android/Windows: runtime apenas quando houver isolamento verificável. Se ele não existir, executar testes puros/SQLite temporário e registrar runtime pendente. Worktree Git separado sozinho NÃO isola AppData.
- Guard da ferramenta/fixture recusa paths protegidos, symlink/junction que escape da sandbox e destinos ambíguos. Não ampliar permissões globais para contornar esse guard.
- `readState`: “não existe banco ainda” e “falha ao ler banco existente” são estados diferentes. No segundo, manter bytes e interromper gravações/seed. Uma falha de quota após save não autoriza fallback vazio.

### Cadastro composto

1. Capturar um snapshot do rascunho e do modo explícito de disciplina.
2. Normalizar e validar todos os campos antes de qualquer criação. Preparar revisões usando o scheduler canônico, sem duplicar offsets.
3. Resolver nome na lista ativa por chave canônica. Mesmo nome existente → reutilizar ID. Arquivado/ambíguo → mensagem e zero mutação; não fundir registros antigos.
4. Bloquear reentrada da mesma submissão enquanto pendente. Usar ID da operação se o adapter já oferece idempotência; no mínimo estado in-flight testado para dupla ativação da UI.
5. Criar disciplina nova, aula e revisões na MESMA transação SQLite/mesma gravação atômica de BrowserStore. Reusar o mecanismo real `execute_sqlite_transaction`/`createWithReviews`, ampliando o caso de disciplina nova sem perder rollback. IDs devem vir dos resultados/encadeamento protegido da transação; nunca de busca MAX fora dela.
6. Em erro, rollback dos efeitos da operação; NÃO apagar disciplina preexistente como compensação. Um nome já criado pela ação separada Criar disciplina não é “órfão” a remover.
7. Sucesso confirmado: atualizar catálogo, selecionar ID persistido, renderizar a aula e tratar filtros que a esconderiam. Rascunho limpo só depois do sucesso. Falha de render depois de COMMIT não deve reenviar INSERT.

Deduplicação Unicode: o `NOCASE` nativo do SQLite não equivale a comparação Unicode PT-BR. Aplicar a mesma chave nos dois adapters e serializar a resolução/criação conforme o modelo de concorrência atual. Não prometer unicidade multicliente com mero precheck. Caso a garantia necessária exija migração estrutural de uma chave única persistida e análise de colisões, registrar a tarefa específica; não alterar/fundir dados reais nesta janela. Continuar os casos independentes. Não implementar sincronização multi-dispositivo agora.

### Validação de campos

- Uma allowlist ASCII genérica não serve para título/fonte/resumo. Remover o raciocínio “o teste está errado porque o regex rejeita”.
- Preservar travessão, grego, sinais, subscritos e sobrescritos. NFC para equivalência canônica de nomes; NFKC global é inadequado para preservar forma médica.
- Nome em branco → erro; texto com NUL → erro. Emojis/formatadores válidos em texto livre preservados. Não remover todos os `Cf` sem considerar escritas e ZWJ.
- UI de contagem pode converter decimal digitado após checagem lexical; store e JSON v3 recebem tipo canônico. Testar `null`, boolean, objeto, array, fração, expoente/hex na UI e NaN/Infinity por chamada direta. `JSON.parse` não produz NaN, mas chamadas JS diretas podem.
- Data civil: regex ancorado completo + validação de mês/dia/bissexto por roundtrip com componentes. Sem `Date.parse` permissivo nem comparação de timezone no resultado.
- Duplicatas por ID e relações cruzadas verificadas em todo o candidato de importação. Contexto REVIEW exige task da mesma unidade; demais contextos sem task. `provenance` ausente não vira MANUAL por conveniência.
- Campos de histórico ausentes continuam ausentes. A auditoria deve respeitar estados legados documentados sem fabricar respostas.
- Texto persistido não é reescrito por simples leitura/init. Nenhuma “limpeza” automática de títulos antigos com novo regex.

## Test Strategy

Três camadas de prova: função pura real, operação pública com adapter real isolado e jornada por interface. Um teste de regex não substitui o clique Salvar; Rust com SQL parecido não substitui o contrato realmente chamado. Fuzzing determinístico pequeno com seed e casos de propriedade (idempotência de normalização, roundtrip, erro sem mutação) complementa, não substitui, exemplos literais do usuário.

Mutação de sintaxe JSON é só sensor de carregamento. As mutações relevantes alteram comportamento com sintaxe válida: rejeitar travessão; ignorar validador no consumidor; `correctCount` lido de `questionsCount`; relaxar data; omitir refresh; quebrar rollback; falha de leitura virar emptyState. Injetar somente em cópia descartável dos arquivos de código, nunca na base ou worktree de trabalho do usuário.

## Tech Decisions

| Decision | Reason | Trade-off | Scope | Record in STATE? |
| --- | --- | --- | --- | --- |
| Reusar arquitetura e fachada | Menor risco e menos releitura | Adaptador atual permanece | Missão | Sim, ponte para design |
| Um integrador escreve arquivos compartilhados | Evitar corrida em app.js/db.js | Menos paralelismo de escrita | Execução | Handoff |
| Até dois leitores independentes, se úteis | Auditar UX/textos e dados/import sem conflito | Contextos pequenos com entrega curta | Auditoria inicial | Não |
| Verifier final separado | Contestar o candidato e evidências | Tempo reservado no final | Closure | Referência ao relatório |
| Limites novos sem contrato ficam propostos | Evitar regressão de conteúdo válido | Alguns limites ficam para decisão posterior | Validação | Só se material |

## Risks

| Risk | Mitigation | Owner |
| --- | --- | --- |
| Apagar dados reais em teste | Isolamento comprovado antes de abrir stores; proibição operacional de reset real | Integrador |
| Regex estreito virar novo falso PASS | Corpus do usuário congelado e teste importando produção | Implementador + Verifier |
| Disciplina órfã em falha | Transação composta + falha injetada | Implementador |
| Nova chave Unicode conflitar com legado | Não fundir dados; detectar ambiguidade, preservar histórico | Integrador |
| Prazo terminar no meio | Reserva de 23 min, tarefa curta, checkpoints por commit | Integrador |
| Build antigo representar candidato novo | Evidência vinculada a SHA/artefato e reteste de fluxos afetados | Verifier |
