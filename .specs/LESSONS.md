# Grounded Lessons

> Derived from `.specs/lessons.json`; regenerate with the bundled tool.
> generation: `6638dddbfa5653bb054fdb55b0c27a628430ff41de19e5f0a442f9d268ec80c6`

## Confirmed

_none_

## Eligible

_none_

## Candidate

### L-49047fee801b
- rule: Falha de aplicação da regra existente: a complexidade deve ser classificada antes da delegação; auditoria de regras e proteção de processo exige Luna Alto. Nesta sessão, a auditoria foi inicialmente enviada a Luna Leve e o Codex executou verificações diretamente antes de corrigir o fluxo. Impacto: análise e verificações ocorreram no executor inadequado, quebrando o modelo de orquestração. Causa: não houve gate verificável que confirmasse o nível selecionado e impedisse execução direta. Correção: reclassificar a tarefa como complexa, encaminhá-la a Luna Alto e manter o Codex em coordenação, revisão e integração. Proteção futura: confirmar e registrar o nível escolhido antes da delegação e bloquear a execução direta quando houver agente requerido; fazer cumprir a regra existente, sem duplicá-la.
- scope: agent-orchestration
- events: 1
- updated: 2026-11-06T06:56:30Z

## Rejected

_none_

## Quarantined

_none_
