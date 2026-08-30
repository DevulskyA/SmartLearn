# Agent Guard — Error & Correction Recovery Skill

> Rodar **uma vez por incidente**, não uma vez por erro individual.
> Agrupamento por invariante ferido ou causa raiz — nunca por sintoma.

---

## Quando ativar

- Erro detectado durante implementação.
- Usuário corrige, desfaz ou rejeita uma mudança.
- Regressão identificada em teste, typecheck ou build.
- Comportamento inesperado descrito pelo usuário após uma edição.

**Não ativar** para: dúvidas, perguntas sobre arquitetura, exploração de código, planejamento.

---

## Protocolo (executar nesta ordem)

### 1. Isolar o incidente

Descrever o incidente em **uma frase**: o que aconteceu, não o que foi feito.

Exemplo correto: "componente filho recriou estado de FEN duplicando o SSOT"
Exemplo errado: "esqueci de passar a prop X"

### 2. Mapear para invariante ou princípio

**Primeiro:** verificar L1–L14 em `.ai/INVARIANTS.md`.
Mais de um invariante pode ser ferido; listar todos.

**Se nenhum couber:** verificar princípios de `.agents/skills/karpathy-guidelines SKILL.md`:
- `assumptions` — estado que deveria subir ficou no componente filho
- `simplicity` — solução mais complexa que o necessário
- `surgical_changes` — edição tocou fora do escopo declarado
- `verification` — falta de typecheck / teste antes de entregar

### 3. Corrigir com a menor mudança segura

- Fazer apenas o que desfaz o erro.
- Não aproveitar para refatorar ou "melhorar".
- Se a correção exige tocar arquivo congelado (L11) → `⛔ HALT: AUTH:EXPAND necessário`.

### 4. Avaliar se existe learned rule útil

Criar learned rule **somente se** o incidente revelar uma proteção operacional reutilizável que:
- não é literalmente o sintoma ("nunca esquecer de X")
- não está já coberta por L1–L14 ou karpathy
- pode ser expressa como verificação concreta

Limite: **máximo 3 learned rules por incidente**.
Preferir **refinar** regra existente em `learned-rules.md` a criar duplicata.

---

## Formato de resposta obrigatório

```
[AGENT_GUARD]
Incident: <uma frase descrevendo o incidente>
Violated: <L# + nome curto | princípio karpathy>
Correction: <menor mudança segura, em uma frase>
Rule action: none | reused <id> | refined <id> | created <id>
```

Se criar ou refinar regra, adicionar bloco:

```
[LEARNED_RULE]
Protects: <L# ou princípio>
Rule: <regra operacional curta e principiológica>
Check: <como verificar antes de entregar>
Path: .agents/skills/agent-guard/learned-rules.md
```

---

## O que NÃO fazer

- Não criar regra literal a partir do sintoma ("não esquecer de passar onFoo").
- Não criar regra vaga ("ter cuidado com state").
- Não duplicar L1–L14 com outra formulação.
- Não criar mais de 3 regras por incidente.
- Não rodar o guard para cada erro individual de um mesmo evento.
- Não usar o guard para planejar feature ou resolver ambiguidade de spec.
