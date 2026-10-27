# Auditoria V2 — Checkpoints 0 e 1 (2026-10-26)

Branch/worktree: `claude/audit-v2-5cf864f` em `.claude/worktrees/audit-v2-5cf864f`, criada de `5cf864f501c3ffcc3fe6684065dc2bedd446c4ce`.

## Marco 0 — candidato
- Candidato único: `claude/smartlearn-figure-width` @ `5cf864f`. Contém a V1 (`eb9337c`) + 116 commits (R-3/R-4/R-5, figuras, i18n fatias 1–10).
- Fora do candidato (não combinado): 3 commits Rust de memória de janela + `PRODUCT.md` (`ecc2f32`, branch `v1-window-memory-product`); `stats-aaa-6405e1` @ `38278f5` (isolada).
- Remoto atrás do local: `figure-width` remoto `ca863ae` (11 commits locais sem push); V1 remota `ed15172` (local `ecc2f32`).
- Prova anterior vigente: E2E completo 358/0/2 em `1967909`; jornada nativa 23/23 (dados descartáveis). Vale só até as mudanças de i18n depois de `cc5e47d`.

## Marco 1 — jornada em banco descartável, `5cf864f`
Comando: `npm run test:e2e -- <6 specs>` → exit 0, **19/19** (1.1 min).
student-journey 1 · content-quality-flow 1 · product-value 2 (inclui reload) · draft-acceptance 8 · study-resume 5 · restore-backup 2.

Cobre: PDF → rascunho auditado → aceite humano → Resumo → estudo/feedback → prova → Estatísticas → próxima ação; evidência única; sobrevive a reload; interrupção de rede sem perda; restauração de backup.

## Pendente (sem prova)
- Reinício real do processo desktop (WebView2/Tauri): só a jornada nativa de 18/10–26/10, em SHAs anteriores.
- Comportamento real do modelo (geração paga não executada, por regra).
- Validação médica humana.
- Ambiente: worktree nova exige `npm ci` na raiz **e** em `server/` (sem o segundo, o servidor E2E não sobe).
