# Relatório: por que o teste de interface ficou lento (2026-11-01)

## Resumo
O app não estava lento. O teste estava lento porque eu mudei **quem opera a interface**: no fluxo aprovado em 2026-10-17 o Haiku só executava um script pronto (`desktop-study-journey.mjs`, 20 passos, ~1,5 min, uma chamada). Nesta rodada eu fiz o Haiku operar a interface **clique a clique**, e cada passo passou a custar uma chamada de modelo. Em cima disso, o meu driver tinha defeitos que multiplicavam o atraso.

## Medições
| O quê | Medida |
|---|---|
| Comando do driver (clique, preencher, snap) | 4 a 370 ms (cerca de 250 ms dos 300 eram uma pausa fixa minha) |
| Passo do Haiku, uma chamada de modelo por comando | ~3 s e ~10 mil tokens por chamada |
| 8 passos um a um com o Haiku | 34 s (log do driver: intervalos de 2,8 a 3,4 s entre comandos) |
| Os mesmos 8 passos num único lote | 1,4 s |
| Lote da rodada 1 (7 jornadas) | ~25 min, com minutos de silêncio entre comandos |
| J07 hoje (62 linhas, entradas de borda) | 8 s |
| J00 hoje (conta, entrar, 2 disciplinas) | 2,8 s |

Compilador, build e app: nenhum arquivo de build mudou desde 2026-10-25 (`package.json`, `Cargo.toml`, `tauri.conf.json`, `vite.config.js`); o app responde a um clique em ~0,3 s. A hipótese "mudamos o compilador" foi testada e **descartada**. A sessão "Acelerar 360 testes E2E" trata da bateria Playwright, outro assunto.

## Causas (em ordem de peso)
1. **Operação passo a passo por modelo** (causa raiz). Cada clique virava uma chamada de modelo de ~3 s e ~10 mil tokens, repetida a cada passo, com saídas longas de `snap` inflando o contexto. Contraria o fluxo documentado em `.specs/WORKFLOW_TESTE_WINDOWS_ISOLADO.md` (Haiku executa script; "poupar tokens").
2. **Número de controle velho com timeout de 6 s.** Depois que a tela mudava, o `[n]` do último `snap` não existia mais; o comando esperava 6 s para falhar e o agente repetia. Isso gerou os minutos de silêncio.
3. **Pausa fixa de 250 ms** depois de cada clique ou tecla.
4. **Alvos errados que esperavam até o limite**: clique por texto que acertava o título (não o botão), elemento escondido (formulário de login sob o de cadastro), `expect` que aceitava texto escondido.
5. **Ninguém olhou o andamento.** Esperei passivamente a notificação, sem orçamento de tempo nem verificação de progresso, e só vi quando você avisou.
6. **Roteiros dependentes de estado:** painéis que abrem e fecham com o mesmo botão, e dados reiniciados pelo driver, faziam linhas falharem esperando 1,2 a 3 s.

## Falsos erros causados pelo instrumento (registrados como I-01 a I-07)
Na rodada 1 o instrumento gerou "erros do produto" que não eram: "Criar conta sem feedback" (clicou no título), "Esc não cancela", "Enter não salvou" (parte era o roteiro). Por isso a rodada 1 foi descartada (`descartado-rodada1/`) e a regra "achado possivelmente causado pelo instrumento só vale após segunda observação" foi criada.

## O que foi corrigido (driver `scripts/zz-ui-driver.mjs`)
- `batch <arquivo>`: N comandos numa chamada; só a última linha descreve a tela (sem pausa de 250 ms).
- Tempo máximo por ação 1,2 s; número velho falha em ~0,2 s com a causa; números são invalidados depois de qualquer ação que mude a tela.
- Alvos: botões, links e abas têm prioridade sobre títulos; só elementos visíveis; `label:` para campos; `expect`, `gone` e `ensure` no lugar de esperas fixas.
- Log por comando em `%TEMP%\sl-ui-driver.log`.

## Travas para não voltar a acontecer (auto-teste `scripts/zz-ui-driver-selftest.mjs`, 17 de 17)
1. A 17ª chamada solta em 60 s é recusada (sem bypass); o lote continua liberado.
2. Número velho de controle falha em ~0,2 s (click, fill, upload, select) e não clica no controle errado.
3. Linha de lote acima de 700 ms é listada; acima de 1,5 s o lote é rejeitado (saída 4).
4. **Todo teste tem tempo medido:** `batch <arquivo> --record` grava tempo e número de passos; desvio de tempo (mais lento ou mais rápido) ou de passos é `PERF DEVIATION` (saída 5); sem medição é `NO BASELINE`.
5. Regras escritas: `~/.claude/AGENTS.md` ("Instrument integrity and run watchdog", "Every test has a measured runtime", "Register every error found"), `.specs/WORKFLOW_TESTE_WINDOWS_ISOLADO.md` e memória do projeto.

## Defeitos reais do produto achados no processo
- A-07 (P1): no cartão de disciplina, Enter não salvava a renomeação e Esc não cancelava. Corrigido em `src/app.js`, com teste E2E (falha sem a correção) e conferido no app nativo.
- A-01 (P2): título longo sem espaços passava da borda do cartão. Corrigido em `src/styles.css` e conferido no app nativo (`prints/A01-titulo-longo-corrigido.png`).
- A-05: validação do formulário de aula fora de ordem **não é defeito** (ordem documentada no código).
- Abertos: 66,7% (Estatísticas) contra 67% (Plano); botão de apagar base local só mostra "não suportado"; avisos antigos permanecem ao trocar de tela; Criar conta e Entrar levam ~840 ms (servidor).

## Limites desta investigação
- Medi o custo por chamada do Haiku com um benchmark de 8 comandos (34 s); não medi a variação entre sessões.
- J04, J09 e J16 não foram concluídas (dados atuais, sem entrada de provas, janela não redimensionável por este método).
- A mudança de monitor da janela ainda não foi compilada e testada.
