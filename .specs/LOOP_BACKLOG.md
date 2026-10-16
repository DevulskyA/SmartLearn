# LOOP_BACKLOG — fila do /loop (derivada; o Git e os testes vencem este arquivo)

Regras do ciclo: executar o PRIMEIRO item DESBLOQUEADO de PENDENTE; provar; commitar só arquivos explícitos; mover o item para FEITO com a prova (comando e resultado). Item que espera evento externo (CI, autorização) vai para AGUARDANDO e NÃO conta como trabalho: sem item desbloqueado, rodar as 3 varreduras já, sem encerrar o turno; o turno só termina quando as varreduras do ciclo acabaram. Nunca encerrar por "só resta esperar". Fila sem item desbloqueado: rodar as 3 varreduras (S1 testes+lint, S2 revisão dos commits novos, S3 interface), enfileirar o que acharem e atualizar `SWEEP_EMPTY_STREAK`. Parar só com `SWEEP_EMPTY_STREAK=2`.
Push: cada push cancela a rodada de CI em andamento (≈17 min); ENQUANTO o CI roda, commitar local e só empurrar quando a rodada terminar ou quando houver algo que o CI precise validar. Commit só de documentação não precisa de push imediato.
Proibido no loop: chamada real a modelo, merge, deploy, release, force-push, banco DEV humano. Subagente que só roda teste usa model haiku.

SWEEP_EMPTY_STREAK=0

## PENDENTE
4. [Endurecer] Se `e2e/offline.spec.js:365` falhar de novo no CI: repetir o clique em "Conta" até `#account-login-form` aparecer (`e2e/support/session.js`).

## AGUARDANDO (evento externo; checar a cada ciclo, não bloqueia nada)
- [CI] Rodada do PR #6 no commit mais recente (`gh run list`); quando terminar: verde → empurrar commits locais; vermelho → caracterizar (regressão, teste stale, flake, ambiente) e corrigir.

## BLOQUEADO (decisão ou autorização humana; não executar)
- Revisão médica dos níveis do mapa (`tierDisputed`) e da amostra do resumo.
- Página 314: ordenar por y dentro da coluna muda o texto de outras páginas; antes, extrair o livro antes/depois e listar as páginas que mudam (ver `validation.md`).
- F2 (entidade conhecimento/subtema), F3–F5, F7–F10, `resolveNeed` na geração de questões: dependem das decisões do usuário (subtema, causa do erro, infográfico, mnemônicos, texto do HTML).
- Novo canário sob a rubrica v2 e qualquer chamada real a modelo: exigem nova autorização.
- Auto-fix do PR #6 (`set_monitor`): só com pedido do usuário.

## FEITO
- [S2] Varredura de exports sem uso (2026-10-16): 55 exports de `src/`, `server/src/`, `shared/` sem referência em OUTRO arquivo (constantes e helpers só internos, inofensivos) e 69 usados só por testes. Código morto confirmado: nenhum. Uma 1ª checagem de "morto" saiu falsa (escape do shell quebrou a contagem; `computeDataRevision`, `greedyChunks` etc. são usados no próprio arquivo) e foi descartada; não apagar nada com base nela. Armadilha repetida: heredoc/`node -e` mutilam barras invertidas; script temporário vai pela ferramenta Write.
- [S2] `.specs/STATE.md` defasado (NEXT_MILESTONE ainda pedia o canário já executado): atualizado; `SESSION_MEMENTO.md` de 2026-06-27 (raiz, enganoso para agentes) arquivado em `.specs/archive/`. Prova: `context:check` PASS, `test/codemap.test.js` 3/3.
- [UI] Gráfico de evolução na interface real (dev-uat, navegador embutido, 2026-10-16): renderiza (7 linhas, 1 ponto, meses jul–out, legenda por disciplina); filtro Fisiologia → 1 linha; período "Tudo" → 11 meses; console sem erro de aplicação (só 502 de `/health/build`, esperado sem backend no modo local). Servidor de desenvolvimento encerrado.
- [S1] No HEAD `43d05e3`: servidor 1051/1051, unitários 652/652, lint limpo, `context:check` PASS.
- F1 metodologia v2 (`23db6ee`), CODEMAP e README (`0e800e4`), extração `monthlyAccuracySeries` (`9d9a815`), robustez de risk-checks (`0899c5d`), correções das auditorias (`ff97563`), E2E completo local 238/1 flake (`43d05e3`).
- `npm audit --omit=dev`: 0 vulnerabilidades (raiz e servidor), 2026-10-16.
