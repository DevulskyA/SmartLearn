# Plano de comparação: como saber, depois, se o aluno aprende melhor

```
STATUS=PROPOSTO (pré-registro; o usuário aceita ou ajusta ANTES de qualquer coleta)
NÃO AFIRMA NADA sobre eficácia. Define como se poderia afirmar, e o que falta.
PREMISSA=um único aluno (o usuário). Evidência possível = comparação DENTRO do aluno, N de unidades. Nada generaliza para outros alunos.
```

## 1. Pergunta e fronteira da alegação

Pergunta: estudando unidades com o ciclo completo do SmartLearn (aula revisada, revisões espaçadas, reteste dos erros), o aluno RETÉM MAIS por unidade, no mesmo prazo, do que estudando as unidades pelo seu método habitual?

Distinguir três perguntas diferentes (a V1 só responde a primeira, e só descritivamente):

| Pergunta | Responde com | Status hoje |
|---|---|---|
| P1 "o meu estudo está evoluindo?" | tendência descritiva de acertos autojulgados (`src/analytics.js`, mínimo 10 questões por período) | disponível; NÃO é eficácia |
| P2 "o ciclo SmartLearn retém mais que o meu método habitual?" | comparação controlada entre unidades (seção 4) | impossível hoje: sem dado real, sem base, sem item reservado |
| P3 "o produto funciona para alunos em geral?" | estudo com vários alunos | fora da V1 |

## 2. O que a telemetria atual já permite medir

| Medida | Fonte | Validade | Situação |
|---|---|---|---|
| ME-1 acerto agrupado por período | `learning_evidence` | autojulgamento depois do gabarito; afetada por TG-01 e TG-02 | DISPONÍVEL após corrigir TG-01/02 |
| ME-2 curva por etapa (R1..R16): acerto por `offset_days` | evidência REVIEW + `review_tasks` | idem; primeira rodada de cada exercício na etapa | PARCIAL |
| ME-3 acerto na 1ª tentativa de cada exercício, ao longo do tempo | `exercise_attempts` + `learning_events` (contexto REVIEW) | idem; precisa de TG-03 para separar reteste | PARCIAL |
| ME-4 recuperação por reteste: erros que viram acerto no reteste | tentativas com contexto RETEST | contaminada (gabarito acabou de ser visto): descritiva, NUNCA evidência (INV-17) | só com TG-03 |
| ME-5 retenção tardia dos erros: erro na etapa k e acerto na etapa k+1 (≥ 7 dias depois) | tentativas por exercício entre revisões | melhor que ME-4; ainda autojulgada | PARCIAL (derivável) |
| ME-6 recordação independente: resposta digitada antes do gabarito, assistência `NONE` | Modo Prova (`exam_items.student_answer`, `outcome`) | a melhor disponível; o autojulgamento persiste (calibrar, seção 6) | DISPONÍVEL, só em provas |
| ME-7 adesão: revisão concluída no vencimento (0, 1, 3 dias), atraso acumulado | `due_date` × `completed_at` | `completed_at` se perde ao reabrir (TG-02) | DISPONÍVEL |
| ME-8 esforço: minutos por item retido | NÃO existe | TG-05 | AUSENTE; usar registro manual de minutos por unidade até haver captura |
| ME-9 calibração: confiança × acerto | NÃO existe (cliente não envia) | TG-06 | AUSENTE |

## 3. Desfecho primário (pré-especificado)

Acerto em itens NÃO praticados, com resposta digitada ANTES do gabarito, num atraso fixo após o último estudo da unidade.

- Instrumento: Modo Prova sobre itens reservados (nunca mostrados em prática) OU avaliação externa (prova da escola, banco de questões) registrada por item.
- Atraso: D1 = 14 dias (± 2) após o último estudo da unidade; secundário D2 = 45 dias (± 5). Os valores são ESCOLHA, não vêm de fonte lida.
- Unidade de análise: a UNIDADE (média dos itens dela), não o item; itens da mesma unidade não são independentes.
- Itens reservados: o produto NÃO tem marca de "item reservado" (decisão D-T4). Sem isso, o desfecho cai para a avaliação externa ou fica contaminado pelo efeito de teste dos próprios exercícios praticados.

Desfechos secundários: ME-5 (retenção tardia dos erros); ME-7 (adesão); acerto por minuto de estudo (quando houver tempo).

## 4. Delineamentos, do mais fraco ao mais forte

| Nível | Delineamento | O que dá | Limite |
|---|---|---|---|
| T0 | Descritivo dentro do SmartLearn (ME-1..ME-3) | "está subindo/estável/caindo" | sem base: efeito de prática, dificuldade das unidades e época da prova se misturam; NUNCA "aprendi mais" |
| T1 | Controle histórico: resultados externos por disciplina de um período anterior sem o produto contra o período com o produto | indício fraco | confunde época, dificuldade, maturidade; só orienta |
| T2 | Aleatório DENTRO do aluno, por unidade: sorteio registrado ANTES de estudar decide se a unidade segue o ciclo SmartLearn (A) ou o método habitual (B); estratificar por disciplina e tipo de conteúdo; mesmo desfecho primário nos dois braços | única forma de sustentar causa | custo alto, exige itens reservados, o aluno tem de manter o método B de verdade, contaminação entre unidades vizinhas |
| T3 | Vários alunos | generalização | fora da V1 |

Recomendação: T0 sempre (custo zero, rotulado como descritivo); T2 quando o usuário aceitar D-T4. T1 só como contexto.

## 5. Tamanho mínimo

Cálculo (duas proporções, α = 0,05 bilateral, poder 0,80, base 60%, 8 itens por unidade; o ICC NÃO foi medido, 0,10 e 0,20 são HIPÓTESES de projeto):

| Ganho a detectar | Itens por braço (independentes) | Itens por braço com agrupamento | Unidades por braço |
|---|---|---|---|
| +10 pontos | 356 | 606 a 855 | 76 a 107 |
| +15 pontos | 152 | 259 a 365 | 33 a 46 |
| +20 pontos | 82 | 140 a 197 | 18 a 25 |

Leitura: um aluno só atinge, na prática, ganhos grandes (+20 pontos, 18 a 25 unidades por braço, ≈ 36 a 50 unidades no total). Para ganhos menores o número excede um semestre.

Regra de relato por tamanho:
- Menos de 18 unidades por braço: relatar a diferença com intervalo de confiança de 95%, rotulada "exploratória, sem alegação de significância".
- 18 ou mais: teste de permutação sobre médias por unidade (poucos dados, sem suposição de normalidade); alegação só se o intervalo excluir zero E o efeito for ≥ ao pré-definido.
- Sem espiar: nenhuma decisão de parar ou de afirmar antes de atingir o tamanho pré-definido.

## 6. Regras de exclusão, parada e calibração

Exclusão (aplicadas antes de ver o resultado):
1. Linhas sintéticas (TG-10): excluir tudo anterior ao início do uso real (`created_at`) ou de outra conta/banco.
2. Unidades cujo rascunho aceito tinha achado HIGH não resolvido ou erro de conteúdo apontado em revisão: marcar e analisar com e sem elas (nível b contamina o nível c).
3. Tentativas de prova (contexto EXAM) e de reteste fora das medidas de duração e de ME-1/ME-3.
4. Linhas afetadas por TG-01/TG-02 antes da correção: recomputar o dia a partir de `created_at` + fuso salvo e deduplicar, sem alterar o histórico gravado.
5. Unidades sem exercício adequado: sem crédito de domínio (INV-17); entram só em adesão.

Parada: dados prontos quando todas as unidades sorteadas passaram do atraso D1. Interrupção só por motivo externo ao resultado (doença, troca de curso), registrada.

Calibração do autojulgamento: em uma amostra de itens de prova (≥ 30), um segundo julgador cego ao autojulgamento (humano; ou modelo, se autorizado) corrige a resposta digitada; relatar a concordância. Se divergir muito, o desfecho primário usa o segundo julgador.

## 7. Confundidores

| Confundidor | Efeito | Tratamento |
|---|---|---|
| Autojulgamento depois do gabarito | infla acerto | desfecho digitado + calibração; ME-1 só descritivo |
| Efeito de teste nos itens praticados | acerto sobe por repetição | itens reservados / avaliação externa |
| Dificuldade e conhecimento prévio da unidade | diferenças entre braços | sorteio estratificado por disciplina; covariáveis `question_type`, `provenance` |
| Estudo fora do app (livros, colegas, aulas) | atribui ao produto o que não é | registro manual de horas externas; só T2 neutraliza |
| Época de provas, cansaço | tendência temporal | sorteio dentro do mesmo período |
| Qualidade do conteúdo gerado | erro médico reduz aprendizado | exclusão 2; ligação com nível (b) |
| Dados sintéticos misturados | resultado falso | exclusão 1, decisão D-T1 |
| Datas e contagens com defeito | medida errada | TG-01, TG-02 corrigidos antes |
| Plataformas diferentes | telemetria só com servidor | reportar por plataforma (INV-26) |
| Muitas comparações | achado ao acaso | um desfecho primário; os demais exploratórios |

## 8. Alegações permitidas

| Resultado | Texto permitido |
|---|---|
| só T0 | "o desempenho autojulgado subiu / ficou estável / caiu entre os períodos X e Y (N questões)" |
| T2 abaixo do tamanho mínimo | "diferença de d pontos (IC 95% a..b) entre unidades A e B, exploratória" |
| T2 no tamanho mínimo, IC exclui zero | "neste aluno, unidades estudadas com o ciclo SmartLearn tiveram acerto tardio maior em d pontos (IC 95% a..b), N unidades" |
| qualquer um | NUNCA: "o produto melhora o aprendizado" em geral, "dominou o conteúdo", "retém mais" sem escopo |

## 9. O que depende de dado real do usuário

- `T-F4-01` (primeira sessão real de estudo): SÓ o usuário faz; ninguém simula.
- D-T1: manter ou recriar o banco de teste (hoje é sintético).
- Resultados externos por unidade/disciplina, e período anterior para T1.
- D-T4: aceitar sortear unidades e manter o método B; itens reservados ou avaliação externa por item.
- Minutos de estudo por unidade (registro manual até haver captura, TG-05).
- Revisor médico para o nível (b) (HG-06), pois erro de conteúdo invalida a comparação.
