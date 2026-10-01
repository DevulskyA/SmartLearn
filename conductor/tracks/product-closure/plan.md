# TRACK: PRODUCT-CLOSURE — Fechar o V1 com funcionalidade real verificável

> Ledger MACRO de marcos (GOV-2 opção A). Origem: base estável (integração + decomposição de Materiais) e meta de 2026-10-01: voltar ao produto.
> Escolha dos slices guiada pelo valor ao aluno e por prova em uso real, não por infraestrutura. T46 (catálogo i18n) foi DEFERIDA: o produto é
> só pt-BR e mover strings para catálogo não muda nada observável. NO_PUSH / NO_MERGE(main) / NO_DEPLOY.

```
Track:    product-closure                      Status: IN_PROGRESS
MARCO ATUAL: A11Y-1 — auditoria de acessibilidade real (axe) nas telas principais
Iniciado: 2026-10-01
Legenda:  [✓] concluída  [>] ativa (EXATAMENTE UMA)  [ ] pendente  [!] bloqueada  [-] adiada
ATIVA AGORA: A11Y-1
```

## Tarefas

- [>] **A11Y-1 Auditoria axe das telas principais e correção das violações sérias** — OWNER: GUI
      SPRINT_GOAL: provar com axe-core (não só inspeção) que Hoje, Plano, Materiais, Disciplinas, Estatísticas, Conta e Configurações não têm violação crítica/séria de acessibilidade em 375/1280, e corrigir as que existirem.
      BEFORE: a11y só coberta por specs pontuais (teclado, aria, mobile-nav); nunca rodou axe; T48 do plano mestre aberto.
      AFTER: `e2e/accessibility.spec.js` roda axe em cada tela com dados reais; violações críticas/sérias = 0 (ou cada exceção justificada por escrito); correções mínimas sem mudar design nem fluxo.
      SCOPE: auditoria + correções de marcação/ARIA/contraste pontuais; sem redesign (Estatísticas é superfície protegida: só correção funcional de a11y, sem mudar geometria).
      PROOF: axe por tela, antes/depois; e2e completo.
      DONE_WHEN: relatório axe verde nas telas auditadas e e2e completo verde.
- [ ] **JOURNEY-1 Jornada completa do aluno com recomeço de sessão e dados importados (T49)** — OWNER: GUI
      DEPENDENCIES: A11Y-1. Fonte -> rascunho -> aceite -> estudo -> evidência -> revisão -> progresso, com segundo navegador, reinício e backup importado.
