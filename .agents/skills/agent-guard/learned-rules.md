# Learned Rules — Agent Guard

> Regras operacionais geradas por incidentes reais.
> Cada entrada protege um invariante ou princípio já existente — não substitui L1–L14.
> Formato: `protects · rule · check`. Máximo 3 regras por incidente de origem.

---

## LR-001 — Checkpoint de fase exige plan.md atualizado

**Protects:** princípio karpathy `verification`

**Origem:** Fases 1, 7 e 8 da track `lucas-inspired-tutor-mode` foram commitadas com
checkboxes `[ ]` mesmo após conclusão, exigindo correções retrospectivas.

**Rule:** O checkpoint de uma fase (commit de encerramento) só é válido quando todos os
itens `[ ]` da seção correspondente em plan.md estão marcados `[x]`. Atualizar o
plan.md é parte integrante da fase — não é pós-processamento opcional.

**Check:** Antes do `git commit` de fim de fase, executar:
`grep -n "\[ \]" conductor/tracks/<id>/plan.md`
Se houver resultado dentro da seção da fase atual → não commitar ainda.

---

## LR-002 — I-DERIVE: completude de dependências em computações reativas

**Protects:** princípio karpathy `verification` (goal-driven execution)

**Origem:** Pipeline de análise (live → postGame) com fases onde dado de fase posterior chega depois do handler da fase anterior já ter disparado — resultado nunca é produzido, sem erro lançado.

**Rule:** Em qualquer sistema que computa `f(A, B) → C` de forma reativa (`useEffect`, pub-sub, queue processor, event handler), se `B` é injetado depois que o handler de `A` já disparou, `C` nunca é produzido silenciosamente. Satisfazer com uma das duas formas: (1) eager initialization — garantir `B` disponível antes de enfileirar jobs que dependem dele; (2) retroactive backfill — ao inserir `B`, checar se `A` já está cacheado e computar `C` imediatamente, write-once guarded.

**Check:** Ao tocar pipeline de análise, queue processor ou `useEffect` com look-ahead: a computação depende de dois valores que chegam em momentos diferentes? O handler que combina os dois pode disparar antes do segundo existir? Há caminho de backfill, e ele é write-once guarded? Sinal de alerta: progresso trava em `(N-1)/N` sem erro.
