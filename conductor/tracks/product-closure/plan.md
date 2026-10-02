# TRACK: PRODUCT-CLOSURE — Fechar o V1 com funcionalidade real verificável

> Ledger MACRO de marcos (GOV-2 opção A). Origem: base estável (integração + decomposição de Materiais) e meta de 2026-10-01: voltar ao produto.
> Escolha dos slices guiada pelo valor ao aluno e por prova em uso real, não por infraestrutura. T46 (catálogo i18n) foi DEFERIDA: o produto é
> só pt-BR e mover strings para catálogo não muda nada observável. NO_PUSH / NO_MERGE(main) / NO_DEPLOY.

```
Track:    product-closure                      Status: DONE
MARCO ATUAL: FECHADO — A11Y-1 e JOURNEY-1 concluídos
Iniciado: 2026-10-01
Legenda:  [✓] concluída  [>] ativa (EXATAMENTE UMA)  [ ] pendente  [!] bloqueada  [-] adiada
ATIVA AGORA: nenhuma (track fechado; o que resta depende de humano, ver abaixo)
```

## Tarefas

- [✓] **A11Y-1 Auditoria axe das telas principais e correção das violações sérias** — OWNER: GUI
      SPRINT_GOAL: provar com axe-core (não só inspeção) que Hoje, Plano, Materiais, Disciplinas, Estatísticas, Conta e Configurações não têm violação crítica/séria de acessibilidade em 375/1280, e corrigir as que existirem.
      BEFORE: a11y só coberta por specs pontuais (teclado, aria, mobile-nav); nunca rodou axe; T48 do plano mestre aberto.
      AFTER: `e2e/accessibility.spec.js` roda axe em cada tela com dados reais; violações críticas/sérias = 0 (ou cada exceção justificada por escrito); correções mínimas sem mudar design nem fluxo.
      SCOPE: auditoria + correções de marcação/ARIA/contraste pontuais; sem redesign (Estatísticas é superfície protegida: só correção funcional de a11y, sem mudar geometria).
      PROOF: axe por tela, antes/depois; e2e completo.
      DONE_WHEN: relatório axe verde nas telas auditadas e e2e completo verde.
      EVIDENCE (8dc5e65): axe (WCAG2 A/AA) achou violações SÉRIAS REAIS de color-contrast no tema padrão paper (--color-muted 4,48:1 no fundo e 4,24:1 em superfícies rebaixadas; mínimo 4,5:1). Corrigido: --color-muted L 0,55 -> 0,52 (>=4,8:1 em todas as superfícies) em src/theme.js, src/styles.css e DESIGN.md. Novo e2e/accessibility.spec.js (devDependency @axe-core/playwright): 8 telas COM dados semeados (Hoje com linha aberta e resposta revelada, Estatísticas com evidência) nos 4 temas a 1280px e paper a 375px = 0 críticas/sérias; falhava antes da correção. e2e completo 186/186; unit 407/407; lint 22 avisos (=). NOT_PROVEN: só detecta ~1/3 dos problemas de a11y (o resto segue em specs de teclado/foco); violações moderate/minor: nenhuma encontrada (A11Y_REPORT_ALL=1, paper a 1280px, regras WCAG A/AA).
- [✓] **JOURNEY-1 Jornada completa do aluno com recomeço de sessão e dados importados (T49)** — OWNER: GUI
      DEPENDENCIES: A11Y-1. Fonte -> rascunho -> aceite -> estudo -> evidência -> revisão -> progresso, com segundo navegador, reinício e backup importado.
      EVIDENCE (8dc5e65, sem código novo): cada requisito de T49 já tem e2e verde: laço completo PDF->rascunho->estudo->prova->estatísticas (student-journey.spec.js), segundo navegador/mesma conta, outra conta isolada, reinício do servidor e falha de rede (server-authority.spec.js), aluno com dados importados (migration.spec.js), retomada/falha no meio do estudo (study-resume.spec.js), primeiro uso sem PDF (first-run.spec.js). Rodada completa 186/186. NOT_PROVEN: a mesma jornada no Windows nativo (acesso de computer-use negado).

## O que resta e depende de humano (não é trabalho local autônomo)
- VERDICT-1 e IMPORT-1: decisão de produto. REALMODEL-1: chave de API de modelo real e custo. T51: domínio/TLS/assinatura/deploy. Push do PR #6 e merge em main: autorização. Smoke Windows: acesso de computer-use ao app. T46 (catálogo i18n) deferida por não ter efeito observável; T47 (explicar estados) pede decisão de copy/UX.

## Flake de e2e: causa encontrada (2026-10-01)
- atomic-save.spec.js "response lost...": asserção de mensagem TRANSITÓRIA (`Aula salva...` é apagada pelo handler após renderPlan). Diagnóstico: 10/10 execuções terminam com mensagem vazia E 1 unidade com 16 revisões (a aula sempre é salva). Corrigido no teste com MutationObserver (mesma força, sem corrida); 32/32 com --repeat-each=8. Não era defeito do produto.
- content-quality-flow.spec.js: continua sensível a carga (extração de PDF >10 s sob CPU saturada; reproduz no baseline). Causa da falha original sem carga não reproduzida em 4 rodadas limpas da mesma sequência de specs.
