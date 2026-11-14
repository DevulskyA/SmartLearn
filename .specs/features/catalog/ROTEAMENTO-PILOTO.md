# Piloto mínimo de roteamento de modelo/esforço (2026-11-13)

Autorização do dono: testar SÓ o mecanismo de seleção de modelo, esforço e escalonamento, durante trabalho real já autorizado
(fluxo Resumo Mestre primeiro → perguntas depois → aprovação do aluno → aula). Nada do QuotaOrchestrator foi instalado;
CLAUDE.md, configurações globais, hooks e agentes existentes ficaram intactos. Sucesso = mais funcionalidades corretas, em menos tempo,
com menor consumo total, usando modelo forte só quando a dificuldade justifica.

## Política candidata (versão mínima em teste)
Triagem em uma linha antes de delegar: tarefa | dificuldade | risco | caminho | modelo+esforço | aceite.
Execução direta é o padrão; delegar só quando contexto, paralelismo ou especialização pagam a coordenação.

| Trabalho | Quem |
|---|---|
| Pequeno/local, ou que depende de árvore suja de outra frente | direto (principal) |
| Teste de interface definido, coleta de logs, matriz longa (>= 3 comandos ou ~2 min) | Haiku 5.5 médio (`test-runner`) |
| Programação convencional | Sonnet 5.5 médio/alto |
| Vários contratos, concorrência, persistência, dificuldade conceitual | Sonnet 5.5 xhigh (escolha direta, sem falha artificial) |
| Decisão estrutural difícil / risco técnico alto | Opus 5.5 alto/xhigh, consulta pontual, volta ao degrau barato |

Escalar só com evidência de insuficiência de raciocínio; problema de ambiente pede diagnóstico, não modelo maior. Ao escalar, passar
diagnóstico, arquivos, testes e hipóteses já eliminadas. Mesmo erro duas vezes: parar ou reclassificar com fato novo.

## Disponibilidade confirmada
Claude Code 2.1.325; a ferramenta de agentes aceita `haiku`, `sonnet`, `opus`, `fable` e esforço low…max. Sessão principal: Sonnet 5.5.
Modelo efetivamente usado pelo subagente: NÃO observável nesta sessão (o relatório do agente não traz `resolvedModel`); só o modelo solicitado.

## Observações (exploratórias, sem benchmark controlado)
- T1, suíte de 16 testes (3 arquivos): direto 6,7 s de relógio; Haiku via `test-runner` 19,4 s e 29.450 tokens de subagente, mesmo resultado
  (16/16). Para suíte de segundos, direto vence; Haiku só se paga em execução longa. Uma amostra de cada: sem conclusão econômica.
- Trabalho real (botão "Gerar perguntas"): tudo direto, porque o editor tem 320 linhas de outra frente não commitadas (uma worktree
  isolada não as veria) e o contexto já estava carregado. Dificuldade classificada como convencional (UI fina sobre rota já provada);
  nenhuma consulta Opus necessária.
- Resultado funcional: commit `e1b2fdbe` (botão nas abas Questões e Revisão, teste de ponta a ponta resumo → perguntas → aceite, 3 execuções
  verdes de ~50 s; mutação desligando a ligação faz o teste falhar). Uma lacuna de UX achada na revisão visual (aba Questões dizia
  "não tem mais questões") corrigida no mesmo trabalho. Intervenções humanas: 0 além das autorizações iniciais.
- Sem execução comparável anterior ⇒ NÃO se afirma economia.
- Validação longa real (suíte completa do servidor, 1349 testes, 196 s): rodada em SEGUNDO PLANO pelo agente principal, sem subagente. Um comando em
  segundo plano não gasta tokens de modelo enquanto espera; Haiku só custaria o contexto de partida e o relato. Para o piloto, isto vale
  mais que uma delegação ao Haiku: a economia vem de NÃO delegar o que o shell já faz sozinho. Não foi uma delegação Haiku (continua pendente).
- Trabalho com vários contratos (migração + serviço + runner + rota + tela): feito direto, com os testes escritos primeiro; a dificuldade
  (concorrência de jobs, orçamento nunca cobrado duas vezes, preservação do que o aluno escreveu) foi tratada pelo próprio agente principal; nenhum
  Sonnet xhigh dedicado, porque o contexto carregado (código de job/orçamento/aceite) já estava na sessão. Sem comparação com execução anterior: nenhuma economia afirmada.

## Decisão pendente
Manter, ajustar ou descartar a política só depois de mais trabalho real com pelo menos uma delegação de cada tipo (teste longo em Haiku;
tarefa multi-contrato em Sonnet xhigh). Se aprovada, esta tabela vira a única regra (substituir, não duplicar, o trecho equivalente
da política de delegação) e este arquivo é arquivado.
