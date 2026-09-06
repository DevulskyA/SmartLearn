# PROJECT.md — SmartLearn

## Visão

Transformar o SmartLearn em um sistema local-first de aprendizagem médica adaptativa que converte material-fonte em estudo, recuperação independente, análise de erro, revisão espaçada, transferência e domínio verificável, mantendo a superfície simples para o aluno.

## Problema

A versão legada organiza revisões periódicas e registra desempenho, mas ainda trata aprendizagem principalmente como calendário + percentual agregado. Esse modelo não distingue desempenho assistido de domínio independente, não representa competências explicitamente, não mede transferência e não usa o erro como evidência diagnóstica estruturada.

## Objetivo do produto

Maximizar aprendizagem durável, independente e transferível por unidade de esforço do aluno.

A pergunta operacional do motor é:

> Qual experiência de aprendizagem deve vir agora para melhorar uma competência específica, dadas as evidências disponíveis e a incerteza sobre o estado do aluno?

## Estratégia de evolução

O sistema atual permanece funcional enquanto o novo motor entra por camadas:

1. núcleo de evidência puro e testável;
2. competências e eventos de aprendizagem persistidos;
3. instrumentação das revisões atuais como evidência;
4. hipóteses de erro e estado de domínio;
5. transferência e integração clínica;
6. política adaptativa de intervenção;
7. scheduling adaptativo validado contra o baseline fixo;
8. modelos aprendidos apenas quando dados e avaliações justificarem sua complexidade.

## Princípio central

> O aluno deve gastar energia aprendendo; a complexidade deve ficar dentro do sistema.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Interface | HTML5 + CSS3 + JavaScript ES modules |
| Build | Vite |
| App | Tauri 2 |
| Persistência | SQLite nativo via `@tauri-apps/plugin-sql` |
| Domínio pedagógico | módulos JavaScript puros, independentes de UI/SQL sempre que possível |
| Primeiro alvo | Desktop |
| Móvel | Android na mesma base; iOS compatível para build Apple posterior |
| Backend | nenhum no baseline local-first |

## Fronteiras arquiteturais

- SQL permanece restrito a `src/db.js`.
- Regras pedagógicas determinísticas devem ser isoladas de persistência e apresentação quando isso aumentar testabilidade.
- UI não deve reproduzir a complexidade interna do learner model.
- Geradores de IA futuros não podem ser usados como validadores de sua própria correção.
- Conteúdo médico gerado deve manter provenance quando a geração source-grounded entrar no produto.

## Estado da migração

A feature `evidence-learning-core-v1` inicia a transição sem alterar o comportamento existente do scheduler, banco ou UI. Ela cria o contrato mínimo para representar:

- tipo de evidência;
- nível de assistência;
- confiança opcional;
- hipóteses concorrentes de erro;
- evidência de recuperação retardada;
- transferência;
- gate conservador de mastery.

## Fora do primeiro milestone

- migração SQLite de eventos;
- geração automática de perguntas;
- LLM tutor;
- substituição do scheduler fixo;
- deep knowledge tracing;
- sincronização em nuvem;
- conta de usuário;
- gamificação.

Esses itens podem entrar apenas em milestones posteriores e devem provar ganho material sobre o baseline quando aumentarem complexidade.

## Autoridade pedagógica

Toda alteração de aprendizagem deve consultar, nesta ordem:

1. `docs/research/SMARTLEARN_PEDAGOGICAL_CONTRACT_V1.md`;
2. spec da feature atual;
3. comportamento e testes atuais do repositório;
4. evidência científica adicional validada para a decisão específica.

## Referências

- [INVARIANTS.md](INVARIANTS.md)
- [ROADMAP.md](ROADMAP.md)
- [STATE.md](STATE.md)
- [`../../docs/research/SMARTLEARN_PEDAGOGICAL_CONTRACT_V1.md`](../../docs/research/SMARTLEARN_PEDAGOGICAL_CONTRACT_V1.md)
- [`../features/evidence-learning-core-v1/spec.md`](../features/evidence-learning-core-v1/spec.md)
