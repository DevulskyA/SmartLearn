# SmartLearn — Unificação da experiência (30/10/2026)

## Escopo implementado
- Tela Plano: pesquisa por título, fonte ou disciplina, insensível a maiúsculas e acentos; contador contextual; aviso sem resultados; limpeza de filtros; acesso discreto a gerenciamento de disciplinas.
- Navegação: no celular, quatro destinos mais usados permanecem imediatamente disponíveis (Hoje, Materiais quando autorizado, Plano, Estatísticas); outras áreas ficam em Mais, com Escape, foco e indicação de tela ativa.
- Componentes: espaçamento e altura comum nos filtros Plano/Acompanhamento; botões e entradas do cadastro alinhados a tokens; remanejamento de identidades de disciplinas fora da área protegida; contraste preservado em disciplinas arquivadas.
- Temas e feedback: navegação por setas/Home/End no grupo de temas; diálogos usam tokens existentes; status de Acompanhamento respeitam os temas.
- Estatísticas: composição aprovada por ADR-0001 preservada. Não foi alterado seu layout de matriz, gráficos ou alternador de contexto.

## Verificações disponíveis
- `npm ci`, `npm run lint`, `npm test`, `npm run build` no projeto.
- `npx playwright test e2e/mobile-nav.spec.js e2e/ui-unification.spec.js` (navegador Chromium e Vite disponíveis).
- Suíte de não regressão de Estatísticas: `npx playwright test e2e/stats-responsive-regression.spec.js e2e/stats-discipline-drilldown.spec.js`.
- Inspeção visual em 360, 390, 768, 1280 e 1440 CSS px; temas papel, sépia, noturno e alto contraste.

## Invariantes preservadas
- IDs de controles e telas; objetos de domínio e persistência; inscrição de disciplinas no formulário; edição de aulas; rotas `#subjects` e `#register`; navegação por teclado; distinção select versus menu de contexto.
- O projeto permanece isolado na branch de design até aprovação e integração humanas.

## Observação
O novo fluxo de navegação substitui deliberadamente o antigo teste que exigia oito destinos de 44–48 px no rodapé. Nenhuma funcionalidade foi removida: os destinos secundários foram realocados no menu Mais.
