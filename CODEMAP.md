# CODEMAP — onde está cada coisa (primeira parada para agentes)

Mapa de NAVEGAÇÃO, não de estado. Estado e tarefas: `.specs/STATE.md` e `npm run context:resume`. Regras de trabalho: `CLAUDE.md`.
Todo caminho citado aqui é verificado por `test/codemap.test.js`: se renomear ou apagar um arquivo, o teste diz qual linha do mapa atualizar.
Muitos módulos abrem com um comentário de cabeçalho dizendo o que são e o que NÃO fazem (`server/src/ai/`, `server/src/domain/`, `src/api-client.js`), mas não todos (`src/app.js`, `src/analytics.js` e vários serviços não têm). Leia o topo antes de editar e não conte com ele.

## Camadas

```
src/  (navegador / Tauri)  ──HTTP /v1──▶  server/src/  (Node, SQLite)  ──▶  server/migrations/*.sql
         │                                       │
         └── shared/  (funções puras usadas pelos dois lados)
```

- **Autoridade dos dados:** o servidor. O cliente escolhe entre o armazenamento local antigo (`src/db.js`) e o servidor (`src/remote-store.js`) por configuração explícita, nunca por fallback automático (comentário "T21" no meio de `src/app.js`, perto da linha 62).
- **Dados humanos:** nunca abrir `C:/Users/Ariel/SmartLearn-DevData`; testes usam bancos descartáveis (`server/src/db-safety.js` recusa o resto).

## Cliente (`src/`)

| Arquivo | Papel |
|---|---|
| `src/app.js` | Ponto de entrada da interface (arquivo grande: use busca por função, não leitura inteira) |
| `src/api-client.js` | Cliente HTTP fino do `/v1`; usado por `remote-store.js`, `offline-store.js`, `app.js` e as telas `*-ui.js` |
| `src/remote-store.js` | Mesmo formato `DB` de `src/db.js`, mas contra o servidor |
| `src/db.js` | Armazenamento local legado (DDL canônico compartilhado com o Rust) |
| `src/offline-store.js` | Cache offline versionado da agenda |
| `src/analytics.js` | Contrato de tendência: só histórico observável conta |
| `src/lesson-view-model.js` + `src/lesson-editor-ui.js` | Editor de lição: o primeiro decide O QUE mostrar (puro), o segundo desenha |
| `src/materials-ui.js`, `src/draft-review-ui.js`, `src/generation-jobs-ui.js`, `src/auth-ui.js` | Telas de materiais, revisão de rascunho, jobs de geração, autenticação |
| `src/i18n/` | Textos da interface por idioma |

## Compartilhado (`shared/`) — puro, sem I/O

`shared/review-schedule.js` (agenda fixa de 16 revisões), `shared/locales.js` (sourceLanguage ≠ uiLocale ≠ generationLocale), `shared/import-normalization.js`, `shared/logical-import.js`, `shared/text-validation.js`.

## Servidor (`server/src/`)

| Área | Onde | Regra de ouro |
|---|---|---|
| Entrada e contrato HTTP | `main.js`, `app.js`, `http-contract.js`, `draft-error-messages.js` | todo `/v1` exige ator de sessão real (deny por padrão); `draft-error-messages.js` = frases de erro do rascunho como código + parâmetros (`error.msg`), texto antigo em `message` |
| Rotas | `routes/*.js` | tradução HTTP e validação de entrada; regra de negócio e SQL ficam em `services/`, com exceção de 2 `UPDATE` direto em `routes/auth.js` |
| Serviços | `services/*.js` | regras de negócio e SQL; `generated-drafts.js` e `accept-draft.js` são o coração do aceite |
| Domínio puro | `domain/learning-event.js`, `evidence-profile.js`, `priorities.js` | sem banco, sem relógio (a data entra por parâmetro), sem veredito de domínio |
| IA | `ai/` | `draft-prompt.js` (prompt), `*-provider.js` (transporte; mesmo contrato), `draft-schema.js` (validação), `draft-audit.js` e `risk-checks.js` (sensores determinísticos), `audit-messages.js` (frases dos achados: código + parâmetros + texto de reserva; o cliente traduz por `lesson.audit.<CÓDIGO>`), `claim-evidence.js` (frase → trecho) |
| PDF | `pdf/` | extração, colunas, títulos e outline; melhor esforço, nunca derruba a extração |
| Corpus de questões | `corpus/` | `resolve-need.js` decide REUSE/DERIVE/GENERATE; ainda não ligado ao fluxo de geração |
| Autenticação | `auth/` | sessões, CSRF, senhas, limite de taxa |
| Banco | `db.js`, `migrations.js`, `../migrations/*.sql` | migração nova = arquivo numerado novo + entrada em `migrations/manifest.json` (checksum SHA-256 do SQL; não editar as existentes); `AUDIT_RULES_VERSION` exige novo bump + hash ao mudar `draft-audit.js`, `language-detect.js` ou `risk-checks.js` |

## Testes: onde colocar e como rodar

| Alvo | Pasta | Comando |
|---|---|---|
| Unitários do cliente, `shared/` e scripts | `test/*.test.js` | `npm test` |
| Servidor | `server/test/*.test.js` | `npm --prefix server test` |
| Ponta a ponta | `e2e/*.spec.js` | `npm run test:e2e` (≈ 8 min; rodar em segundo plano) |
| Descoberta de testes | todos | `npm run test:inventory` falha se um teste estiver fora dessas pastas |
| Lint | tudo | `npm run lint` (zero avisos) |
| Estado do projeto | `.specs` | `npm run context:check` |

## Prompt Lab (`scripts/prompt-lab/`)

`run-generation.mjs` (1 rodada = até 3 chamadas reais; **exige autorização nova a cada uso**), `coverage.mjs` (cobertura e metodologia v2), `metrics.mjs` (sensores determinísticos). Mapas de conceitos em `.specs/features/prompt-lab/source-maps/`; rubrica em `.specs/features/prompt-lab/rubric.md`.

## Armadilhas que já custaram caro

- Não editar código com regex/script de substituição: usar `Edit`/`Write` e conferir a linha gravada.
- Arquivos misturam CRLF/LF; heredoc do bash mutila barras invertidas e crases.
- Commits só com arquivos explícitos; nunca `git add .`, `.impeccable/` nem `.specs/benchmarks/`.
- IA = rascunho até aceite humano; ledger de evidências é imutável; sem evidência ≠ 0%.
