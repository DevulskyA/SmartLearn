# UI Skill Suite

Conjunto enxuto de skills derivadas de `baseline-ui`, `frontend-design`, `react-ui-patterns`, `fixing-accessibility` e `ui-visual-validator`.

## Por que foram separadas

Uma única skill ficava longa demais e misturava três modos incompatíveis:

1. **criação/implementação**
2. **correção cirúrgica de acessibilidade**
3. **validação visual final baseada em evidência**

Separar melhora:
- ativação correta
- previsibilidade
- menor ambiguidade
- menor custo de contexto
- menor risco de a mesma skill “criar e aprovar” o próprio trabalho

## Skills

### 1. `ui-product-builder`
Use para criar ou evoluir interface. Combina:
- direção estética com disciplina (`frontend-design`)
- baseline rigorosa de UI (`baseline-ui`)
- estados assíncronos e empty/error/loading (`react-ui-patterns`)
- acessibilidade mínima obrigatória já no build

### 2. `ui-a11y-remediator`
Use para auditoria e correção cirúrgica de acessibilidade. Combina:
- prioridade por severidade
- correções pequenas e verificáveis
- preferência por HTML nativo antes de ARIA extra

### 3. `ui-visual-gatekeeper`
Use para validar resultado visual final com screenshots, builds e evidência observável. Combina:
- ceticismo operacional
- verificação de estados, responsividade e tema
- contraste, foco, feedback, empty/error/loading
- proibição de aprovar sem prova visual

## Fluxo recomendado

1. criar com `ui-product-builder`
2. endurecer com `ui-a11y-remediator` se houver interação complexa
3. aprovar com `ui-visual-gatekeeper`
