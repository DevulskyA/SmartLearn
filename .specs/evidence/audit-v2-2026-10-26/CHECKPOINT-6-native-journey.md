# Jornada nativa Windows e regressão final (2026-10-27)

Candidato: `a7346b4` (branch de auditoria, publicada). Integrado localmente em `claude/smartlearn-v1-complete` como `c15ed9c` (merge; sem push, sem tocar `main`). Estado anterior da V1 preservado: `ecc2f32` (também no cofre `SmartLearn-MEDSUM-vault`).

## Integração
Os dois lados traziam o mesmo recurso de estado da janela (`95433d8` == `d5215a6`), por isso 4 conflitos de duplicata. Resolvido: `lib.rs`/`window_state.rs` da V1 (acrescentam `first_run_size`, `c985a9d`); `desktop-study-journey.mjs`/`window-rect.ps1` da auditoria (un-maximize, resumo científico, modo sem internet). Árvore resultante = candidato + só esses 2 arquivos Rust.

## Provas (trava `SMARTLEARN_WRONG_WORKTREE` intacta; build DEV na branch correta)
| Prova | Resultado |
|---|---|
| `npm run build`, `package:standalone`, `cargo build` | OK |
| Jornada nativa no WebView2 (`desktop-study-journey.mjs`), título `SmartLearn DEV - v0.1.0 - c15ed9c` | 23/23 PASS, exit 0; banco/fontes/perfil descartáveis; dados humanos intocados |
| Raiz `npm test` | 853/853 |
| Servidor `npm test` | 1181/1181 |
| `cargo test` | 44/44 |
| E2E completo (em `8f120b3`, mesma árvore JS; depois só texto de 1 mensagem e testes) | 358 passou, 2 ignorados |
| `test/package-inspection.test.js` em `c15ed9c` | 17/17 |
| Lint | limpo |

## Falhas materiais achadas e corrigidas (`a7346b4`)
A suíte raiz completa não rodava desde antes das fatias de i18n; 3 falhas:
1. Teste dos rótulos de achado não conhecia os 5 códigos novos (`UNIT_MISMATCH`, `QUALIFIER_*`, `NEGATION_*`): atualizado.
2. Baseline de prosa do servidor 574 → 576 (2 mensagens `REPAIR_NEGATION_*` da auditoria).
3. **Defeito do candidato:** a mensagem `CODEX_CONSENT_MISSING` nomeava `SMARTLEARN_AI_CONSENT=true` para o usuário e a inspeção do pacote a barrou (`DEV_VAR_NAMED`). Reescrita sem o nome da variável (servidor e catálogo pt-BR); inspeção reforçada intacta.

## Limites (NÃO VERIFICADO)
Console do WebView: 401 de sondagem antes do login, `ERR_FAILED` induzido pelo passo de conexão perdida, 409 esperado (`ASSET_IN_USE`). Sessão humana de estudo (T-F4-01), IA real, revisão médica, `cargo audit` (T-F8-05), instalador/atualização/backup e E2E completo no `c15ed9c` exato não executados. Nada publicado de `v1-complete`.
