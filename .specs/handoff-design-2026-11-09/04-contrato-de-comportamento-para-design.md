# Contrato de comportamento para o redesign (leia antes de mexer em qualquer tela)

Escrito em 2026-11-10 para os agentes de design, na branch `design/redesign-geral-20261110`. Complementa `01-LEIA-PRIMEIRO`. O redesign pode mudar aparência, composição, tipografia e materiais. Ele NÃO pode mudar os comportamentos abaixo: eles têm código por trás, e o código lê o HTML. Se o novo desenho exigir mudar um deles, pare, escreva a proposta (o que muda, por quê, teste que prova) e peça ao orquestrador; não improvise.

## Regra geral: três classes de mudança

| Classe | Exemplo | Pode fazer sozinho? |
|---|---|---|
| A. Só CSS/tokens/markup sem id nem classe usada por JS | cores, espaçamento, tipografia, grade | Sim |
| B. Markup que o JS ou um teste lê (ids, `data-*`, classes listadas abaixo) | mover o formulário de páginas, trocar a lista de resultados | Só mantendo os mesmos ids/atributos e rodando os testes citados |
| C. Comportamento novo (paginação de verdade, novo estado, novo controle) | rolar a lista de trechos por página, novo filtro | Não: vira proposta com teste antes |

Antes de dar um bloco por pronto: `grep -rn "<id ou classe>" src e2e test` para ver quem o usa.

## 1. Materiais: escolher o que estudar (o ponto mais difícil)

Código: `src/materials-ui.js` (handlers no fim do arquivo), `index.html` (bloco `.sources-topic`, ~linha 650), servidor `server/src/services/content-proposals.js` (`approveScope`).

Há três caminhos para o mesmo resultado (um escopo aprovado que gera rascunho): **por páginas**, **por título da seção** (busca) e **Índice do documento** (trechos propostos). O redesign pode reordenar e reestilizar, mas todos os três devem continuar existindo e alcançáveis por teclado.

Intervalo de páginas (`#sources-range-form`):
- Campos `#sources-range-start` e `#sources-range-end`, `type=number`, `min=1`, `required`. O envio é o `submit` do formulário (Enter funciona); não troque por botão com clique solto.
- Validação no JS: inteiros, `início >= 1` e `fim >= início`. Falha mostra `screens.materials.range.invalid` no elemento `#sources-message` (`role="status" aria-live="polite"`, classe `is-error` no erro). Mantenha esse elemento, visível e anunciado, também no 390 px.
- Durante o envio o botão `[type=submit]` fica `disabled`; o design precisa de estado desabilitado legível.
- As páginas são as da **numeração do PDF**, não a impressa no livro. O texto de apoio ("com as páginas que você vê") existe por isso: não o remova sem outro aviso equivalente.
- O servidor só envia à IA o texto do escopo aprovado. Nenhum controle novo pode sugerir que o documento inteiro é enviado.

Busca por título (`#sources-topic-form`, resultados em `#sources-topic-results`): cada resultado tem botão que usa `data-query`; mostra intervalo e contagem de caracteres. O formulário tem `role="search"` e `aria-describedby="sources-topic-hint"`. ATENÇÃO: `e2e/materials-a11y.spec.js` só confere o `aria-describedby` dos botões das proposições; esses dois atributos do formulário de busca NÃO têm teste. Mantenha-os por conta própria.

Trechos propostos (lista `sourcesProposalsList`): acoplamento frágil, importante. Em `onIndexClick` o botão "Gerar" lê `pageStart/pageEnd` **extraindo os números do texto de `.source-proposal-range`**. Logo:
- não coloque outros números dentro de `.source-proposal-range` (ex.: "Seção 3 · páginas 10 a 12");
- não traduza nem formate o intervalo com separador de milhar;
- o título editável é `.source-proposal-title-input`; botões usam `data-action` (`generate-draft`, `open-draft`, `open-summary`, `show-generation`) e `aria-describedby` apontando para o id do intervalo.
Mudar isso é classe C (primeiro tornar o dado explícito em `data-page-start`/`data-page-end`, com teste).

Se alguém quiser "paginação" da lista de trechos ou de resultados: é classe C. Hoje as listas de proposições e de resultados não paginam: tudo aparece. A única truncagem existente é a lista de páginas sem texto extraível, cortada em 8 números com "e mais N" (`PAGES_SHOWN` em `src/source-proposals-ui.js`). Proponha, não implemente só no CSS.

Prova existente: `e2e/source-proposals.spec.js` (inclui o teste "page range"), `e2e/materials-a11y.spec.js`, `e2e/materials-single-eyebrow.spec.js`.

## 2. Hoje: faixa ontem / hoje / amanhã

Código: `renderTodayDayStrip` em `src/app.js`, contêiner `#today-day-strip`.
- O número de colunas é definido **inline pelo JS** (`gridTemplateColumns = repeat(n, ...)`): são 2 ou 3 peças. O desenho precisa funcionar com 2 e com 3.
- "Ontem" só aparece quando o dado foi lido; se falhar, a peça é omitida, **nunca mostrada como 0** (0 diria "você não estudou"). Não crie estado vazio que imprima 0 para ontem.
- A peça "Hoje" soma vencidas + pendentes e troca a nota por "N atrasadas" quando há atraso; classe `is-today` marca o destaque.
- A faixa fica oculta quando não há unidades de aprendizagem e não existe no modo offline (a linha de texto `todayLoadSummary` cobre o offline). Não dependa da faixa para informação que o offline também precisa.
- A frase antiga "amanhã" e o resumo de carga são ocultados de propósito para não repetir a faixa.

## 3. Estatísticas (superfície protegida, ADR-0001)

Qualquer mudança aqui exige decisão do dono; nesta frente só estilo já aprovado (V-01) e a escala de títulos já feita. Regras de conteúdo que o design não pode contrariar:
- Sem evidência observável não existe "0%" nem "domínio": mostrar vazio explicado.
- Duração de questão nunca aparece como medida de conhecimento.
- Evolução: a faixa `.evo-gap` (SVG) marca o período sem dados depois da última questão, e o rótulo só é desenhado se a faixa tiver mais de 60 px de largura. Reestilize a faixa, não a remova.
- Cobertura de teste: `e2e/stats-*.spec.js`, `e2e/stats-responsive-regression.spec.js`, `e2e/visual-v01-candidate.spec.js` (390/360 px).

## 4. Estudar agora / Revisão

- A barra de progresso é controlada por uma variável CSS: o JS faz `studyNowProgress.style.setProperty("--p", (índice+1)/total)`. Hoje o CSS usa `calc(var(--p, 0) * 100%)` (`src/styles.css`, ~linha 6271). Desenhe a barra com `var(--p)` (0 a 1); não troque por largura inline.
- Fluxo fixo: Resumo Mestre → recuperação ativa → pergunta → pista opcional → revelar resposta → julgamento do aluno → feedback → próxima → resultado. Cada resposta grava evidência imutável. Não junte etapas para "simplificar" (por exemplo revelar a resposta antes do julgamento) sem decisão de produto.
- O par "Acertei/Errei" é um problema de produto aberto (avaliação com IA paga): não redesenhe o significado, só a forma.
- Teclado: `e2e/keyboard-study-materials.spec.js`, `e2e/keyboard-today.spec.js` devem continuar passando.

## 5. Aceitar a aula

Uma decisão cria vários efeitos (unidade vinculada à disciplina, conteúdo, exercícios e 16 revisões fixas em 1, 7, 15, 30, 60, 90 … 390 dias; `shared/review-schedule.js`). O formulário não pode esconder a disciplina nem a confirmação de que a agenda será criada. Layout livre, campos obrigatórios iguais.

## 6. Texto, idioma e temas

- Só pt-BR. Texto novo entra em `src/i18n/locales/pt-BR/*` **e** o texto de reserva em `index.html` fica idêntico (`test/i18n-html.test.js`). O único seletor de idioma é o do conteúdo gerado, e deve continuar rotulado como "só conteúdo".
- `THEME_OPTIONS` (`src/theme.js`) tem 24 opções, 23 delas com variáveis próprias; a memória do projeto registra axe 28/28 nesses temas (commit `8611b86`, não reexecutado nesta sessão). Use os tokens existentes (`--color-muted`, `--color-surface-sunken` etc.); cor fixa no CSS quebra algum tema. Meta: WCAG 2.2 AA em todos.
- Viewports de verificação: 1280, 390 e 360 px, tema claro e escuro.
- O botão de tema precisa de rótulo acessível (pendência aberta).

## 7. Provas obrigatórias por entrega

Rápidas, a cada mudança: `node --test test/i18n-*.test.js` e o E2E do que foi tocado (`node scripts/e2e.mjs --changed`). Fim do lote: E2E completo, uma vez. A aparência renderizada de Materiais (bloco de intervalo) ainda NÃO foi vista por ninguém: a primeira entrega deve incluir captura em 1280 e 390, claro e escuro. Não declare como verificado o que não foi renderizado.

## 8. Limites (valem para todos)

Sem push, merge, release, banco real, atalhos protegidos ou chamada paga a IA sem autorização do dono. O app DEV usa dados reais do dono: teste em instância descartável. A branch `design/*` ainda não está em `scripts/work-branches.json`; o launcher recusa nela até o dono decidir.
