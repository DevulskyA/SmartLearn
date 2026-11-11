# Handoff: paridade visual V7.2 "Editorial Vivo" (2026-11-11)

Para o agente que vai auditar e concluir. Leia este arquivo inteiro antes de editar. Nenhuma credencial está aqui de propósito; peça ao dono.

## 1. Onde está o código

| Item | Valor |
|---|---|
| Repositório | https://github.com/DevulskyA/SmartLearn |
| Branch de trabalho | `design/redesign-geral-20261110` |
| Pasta local (tree principal) | `C:\Projetos\SmartLearn` |
| No GitHub (origin) | até `af98eb1` (Estatísticas: card de análise e rankings) |
| **Só local, não enviado** | `d89014b`, `84335a0`, `013eb53`, `028798a`, `0075a5b`, `6c13bc7` e os commits deste handoff |
| Regra do projeto | sem push, merge, deploy ou rebase sem ordem do dono |

Para receber o trabalho: o dono precisa autorizar o `git push origin design/redesign-geral-20261110`, ou entregar a pasta local. Sem isso, o GitHub não tem a Estatísticas completa nem a correção do F5.

**Fora do Git (não existe no GitHub):** `design-gabarito/` (imagens do gabarito provisório, 1440 e 897 px de cada tela, mais `seus-prints/` com os prints do dono), `TRASH/`, bancos de dados. Peça a pasta `design-gabarito/` ao dono ou use o kit versionado abaixo.

## 2. Referência (fonte da verdade do desenho)

- Kit versionado: `tools/paridade-v72-kit/` (`INSTRUCAO_PARA_CLAUDE.md`, `reference/V7.2.html`, `css-v7.2-exato.css`, `tools/paridade-v72.mjs`).
- Pedido do dono, repetido várias vezes: cada página do app tem de ficar **idêntica** ao V7.2 (ordem, proporção, posição, tamanho, cores, fontes). Única exceção aceita: as cores por disciplina, que vêm dos dados. Não inventar desenho. Preservar PDF, IA, SQLite, editor, Materiais, exercícios, revisões, histórico, filtros, ordenações, os 24 temas, login e dados.
- O dono nota diferenças que não quer listar: a auditoria tem de achá-las sozinha, comparando imagem com imagem e lendo o código.

## 3. Estado por tela (medido em 2026-11-11, dados reais em cópia, 1440 e 897 px)

Verificador do kit (só estrutura, não mede cor nem fonte): Hoje 15 divergências, Plano 2, Materiais 3, Estatísticas 1, Configurações 4, Conta 4.

| Tela | Estado | Diferenças vistas nas imagens |
|---|---|---|
| Estatísticas | **Feita** (commits `dba8573`…`d89014b`; 86 e2e passaram) | tabela de análise, distribuição, janela de detalhe e histórico seguem o V7.2; ver `.specs/evidence/stats-v72-2026-11-11/RESULTADOS.md` |
| Hoje | **Longe do V7.2** | ver 3.1 |
| Plano | Próxima | ver 3.2 |
| Materiais, Configurações, Conta | **Não comparadas imagem a imagem nesta rodada** | só as contagens do verificador; comparar `aud/*-ref.png` com `*-app.png` |
| Cadastro, Estudo, Prova | Não iniciadas | exigem fluxo (Playwright/E2E) |

### 3.1 Hoje (V7.2 × app, 1440 px)

- Eyebrow: V7.2 "SEU ESTUDO, EM CONTINUIDADE"; app "SEU PLANO".
- V7.2 tem uma linha de resumo ("3 vencidas · 3 para hoje · 0 concluídas"); o app tem três cartões Ontem / Hoje / Amanhã (recurso do app que o V7.2 não tem; **decisão do dono**: remover ou manter).
- Banner "Próxima revisão": V7.2 tem o título da aula e um botão "Começar revisão →"; o app tem texto longo de aviso e dois botões ("Começar agora", "Revisar uma por vez").
- V7.2 tem duas colunas, "Vencidas" e "Para hoje", com cartões individuais (chip da disciplina, selo "Revisão pendente"/"Hoje", título, fonte e páginas, "Estudado em", botões "Revisar agora →" e "Ver aula"). O app tem uma lista única "Vencidas" agrupada por disciplina e por aula, com acordeão.
- V7.2 tem a seção "Próximas revisões" em três colunas, com data em selo. O app não tem essa seção na primeira dobra.
- Rodapé do menu lateral: V7.2 "Interface integrada / Referência / Ambiente de demonstração"; o app mostra a versão e o commit.

### 3.2 Plano (V7.2 × app, 1440 px) — o app já está próximo

- Eyebrow: "CONTEÚDOS E HISTÓRICO" × "CONTEÚDO". Botão "Disciplinas" × "Gerenciar disciplinas".
- V7.2 tem, ao lado da busca, o contador "1–20 de 200" e as setas ← →; o app não tem.
- V7.2 tem a faixa de cabeçalho da lista ("SUAS AULAS" e "ABRA UMA LINHA PARA ESTUDAR OU EDITAR"); o app não tem.
- V7.2 tem rodapé de paginação (Anterior / Próxima, "Página 1 de 10") e a nota "Ler resumos em conjunto →"; o app lista tudo sem paginação.
- Seta da linha: V7.2 "↓", app "›". Linha de detalhe do app é mais longa (exercícios, resumo, revisões, próxima revisão).

Parte das diferenças em Hoje e Plano é de **dados** (o V7.2 usa conteúdo de demonstração; o app usa os dados do dono). Não "corrigir" título, data ou contagem.

## 4. Como rodar e medir

```bash
# preview com cópia descartável do banco real da Homologação (nunca altera o original; falha se o banco não existir)
node scripts/design-preview.mjs --require-real --port 5192      # app em 5192, API em 14003
# preview com dados sintéticos (conta de teste em scripts/seed-dev.mjs)
node scripts/design-preview.mjs --seed --port 5190              # app em 5190, API em 14001

# verificador do kit (estrutura); --state é um storageState do Playwright logado
node tools/paridade-v72-kit/tools/paridade-v72.mjs --app http://127.0.0.1:5192 --screens today,plan,materials,stats,settings,account --widths 897,1440 --state <state.json> --out <pasta>

# diferença de estilo calculado (cor, fonte, tamanho)
node scripts/style-diff-v72.mjs --screen today --app http://127.0.0.1:5192 --widths 1440 --out hoje.json

# E2E (saída mínima); suíte completa uma vez no fim do lote
node scripts/e2e.mjs <specs> --timeout=200000
```

Para gerar o `state.json` sem digitar no formulário: `POST <API>/v1/auth/login` pelo `ctx.request` do Playwright com `origin` do preview, depois `ctx.storageState`.

## 5. Dados e contas (sem segredos)

- Bancos: Homologação `C:\Users\Ariel\SmartLearn-Homologacao-Data\smartlearn-homologacao.db`; DEV `C:\Users\Ariel\SmartLearn-DevData\smartlearn-dev.db`. Backups feitos antes de mudar a credencial em `C:\Users\Ariel\SmartLearn-Backups\*-antes-credencial-202611110557`.
- Cores das disciplinas: em **todos** os bancos lidos, as seis disciplinas estão `DISC-BLUE`. O código já pinta cada chip com a cor da disciplina; em cópia recolorida (rosa, roxo, turquesa, índigo, âmbar, azul) Plano e Hoje mostram as cores. O dono diz que ontem estava colorido: **não encontrei prova disso nos bancos e backups lidos**. Se ainda for preciso, checar `SmartLearn-Backups\*` e `SmartLearn-DevData\snapshots\*` (leitura apenas). Recolorir os bancos reais exige autorização do dono.
- Padrão de nova disciplina: `DISC-BLUE` (`src/db.js`, `server/src/services/subjects.js`); `test/remote-store.test.js:220` exige esse padrão. Mudar exige decidir com o dono.
- Desktop DEV: não abre desta branch até o dono autorizar a edição de `scripts/work-branches.json` e `'39,40,41,42'` em `scripts/launch-desktop-dev.ps1`; proposta em `.specs/proposals/RECUPERACAO-DESKTOP-DEV-2026-11-11.md`.

## 6. Cuidados do ambiente

- Windows. Arquivos `src/app.js`, `index.html`, `src/experience.css`, `src/i18n/locales/pt-BR/screens.js`, `scripts/seed-dev.mjs` usam CRLF/BOM: editar preservando (Python em bytes ou a ferramenta Edit). `python`, não `python3`.
- Commits só com arquivos explícitos. Nunca `git add .`.
- `RATCHET` de texto em português: teste falha 584 × 582 desde `af98eb1`, por causa de `LESSON_DATE_*` em `server/src/api-error-messages.js`; não é desta frente; não afrouxar o teste.
- CSS carregado por `<link>` em `index.html` (correção do F5 sem estilo, `6c13bc7`).

## 7. Próximos passos sugeridos (em ordem)

1. Decidir com o dono: Ontem/Hoje/Amanhã e o agrupamento por disciplina em Hoje ficam ou saem.
2. Hoje: reescrever a composição para o V7.2 mantendo as funções (revisar, adiar vencidas, ver aula).
3. Plano: faixa de cabeçalho, contador, paginação e rodapé do V7.2.
4. Comparar imagem a imagem Materiais, Configurações, Conta; depois Cadastro, Estudo, Prova.
5. Fechar: lint, E2E completo, verificador final, jornada no WebView2 (login → PDF → resumo → questão → evidência → Estatísticas).
