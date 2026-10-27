# SmartLearn — missão de conclusão autônoma e verificável

Data: 2026-10-27. Destino: Claude Code executando no repositório DevulskyA/SmartLearn.
Este é um RUNBOOK DE EXECUÇÃO, não uma nova Constituição nem uma segunda fonte de estado. Código, Git, testes e decisões humanas vigentes prevalecem. A pessoa ficará ausente: não enviar perguntas repetidas; resolver internamente todos os problemas técnicos reversíveis e preservar checkpoints reais.

## 0. Objetivo e critérios de encerramento

Levar o SmartLearn Desktop Windows ao máximo nível de conclusão técnica e de produto que as permissões efetivas permitem, recuperando estado, integrando o que for seguro numa branch própria, corrigindo defeitos, executando testes no runtime real e preparando toda a validação médica/humana e o release.

Distinguir obrigatoriamente:
- ENGINEERING_LOCAL_PROVEN: implementação e gates técnicos comprovados no SHA final.
- ENGINEERING_LOCAL_PROVEN_WITH_HUMAN_GATES: engenharia comprovada, aprovação médica/UAT ou release ainda pendentes.
- V1_VALIDATED: além da engenharia, VALID-8 (HG-06), REALMODEL_CONTENT_QUALITY_PROVEN e T-F4-01 humanos efetivamente cumpridos; consultar spec.md seção 10.
- RELEASE_READY: pacote na build correta, integração e instalação/rollback comprovados; release público e merge em main só por autorização específica.
- FUTURE_ROADMAP: Companion Web/PWA como produto derivado e Android leve de consulta; não são pré-requisitos da primeira V1 e só entram após contrato aprovado.

Não declarar o projeto concluído por terminar a auditoria, um teste, uma branch ou uma sessão. Se restarem somente gates humanos legítimos, o resultado correto é WITH_HUMAN_GATES com um único pacote de decisões, jamais uma falsa aprovação.

## 1. Reconciliação inicial obrigatória

Antes de qualquer comando mutável: git worktree list, git status, git branch -vv, git log --all, git remote e merge-base. Encontrar trabalho local não publicado e o SHA do candidato mais recente. Não confiar em handoff, chat, relatório ou esta lista acima do repositório real.

Snapshot remoto inicial observado em 2026-10-27: origin/claude/audit-v2-5cf864f e claude/chatgpt-guard-ci-explicit em 29f6c1f3a66912705e98471431f2179ecbbfcc2a; origin/claude/smartlearn-v1-complete em ed15172787125e75cae8b4a6b994b41f1e25f6e0; origin/claude/smartlearn-figure-width em ca863ae34eecf98eb28f88eda8d421dfac9c6d2b; branch v1-window-memory-product em ecc2f324261dd95bcd8b2f68bdd1f91a8fc7db12. Relatórios citam V1 local ecc2f32 e stats-aaa local 38278f5; localizar os objetos antes de supor que estão acessíveis. Nunca fazer push nas branches deles.

O ledger oficial em .specs/features/hardening-roadmap-v1/tasks.md possuía 73 tarefas: 51 DONE, 18 HUMAN_GATE, 3 PENDING e 1 SPLIT. Há também PROGRAM.md seção 2c, frente A e B, e LOOP_BACKLOG.md. Recontar antes de afirmar estado.

Ler os trechos necessários: CLAUDE.md, CODEMAP.md, .specs/STATE.md, .specs/EXECUTION.md, .specs/features/hardening-roadmap-v1/{PROGRAM.md,spec.md,tasks.md,validation.md,uat-visual.md}, .specs/governance/00_PROJECT_GOVERNANCE_STANDARD.md, .specs/ARTIFACTS.md e evidências da Auditoria V2. Consultar demais documentos só se mudarem o julgamento. Hierarquia: runtime/código/testes/Git > validação observada > decisão humana registrada > especificação > STATE > plano > chat. Marcar CONFLITO quando essas camadas divergirem.

## 2. Autoridade para trabalhar sem o dono presente

Esta missão, uma vez enviada pela pessoa ao Claude, autoriza: investigar, pesquisar fontes oficiais, decidir detalhes reversíveis, corrigir código na própria worktree, executar testes e benchmarks com dados artificiais, criar worktree e branch PRÓPRIAS, fazer commits e push normal SOMENTE da própria branch, preparar PR draft sem merge e acionar subagentes com privilégios mínimos. Autoriza executar janelas de teste do SmartLearn Windows APENAS com executável, banco, material, perfil WebView2 e processos em diretórios descartáveis/isolados, com identidade do SHA verificada; não tocar a instalação em uso.

Não autoriza: desativar guardas/hooks, CI falso, bypass de permissões, força/rebase/reset de branches alheias, escrita/apagamento de dados humanos ou backups, migrar banco real, remover instalador antigo, expor segredos/documentos protegidos, despesas de API/Prompt Lab/modelo externo ainda não autorizadas, merge em main ou linha de release, publicação/distribuição pública, redefinir requisitos aprovados nem implementar decisões de produto reservadas ao dono. Uma recusa do classificador não é uma pergunta ao usuário: respeitar e avançar em outras frentes.

Arquivos médicos originais são fonte de verdade; nunca enviá-los a repositório, PR, log público ou provedor sem autorização. Usar cópia somente leitura de arquivos externos registrados em .specs/ARTIFACTS.md quando disponíveis. Testes mutáveis nunca tocam o banco DEV humano (inclusive WAL/SHM).

## 3. Autonomia que funciona durante a ausência

Não usar /goal infinito nem Stop hook como motor principal. A continuidade é por SHA, checkpoints, estado canônico, sessão de fundo e, quando cabível, agenda nativa do Claude.

Antes de depender de execução desacompanhada, verificar versão, autenticação, permissões e supervisor. Preferir sessão oficial claude --bg / claude agents, quando o Claude Code local realmente suportar. Verificar ID e status real em claude agents; uma frase de confirmação não basta. O processo local depende de Windows ligado. Se for necessário continuar dias, configurar no mecanismo oficial uma retomada persistente idempotente que verifica se outra execução já está ativa e não duplica tarefas. Registrar como parámetro verificável a forma de cancelar. Não criar cron recursivo nem loops sem progresso. Remote/cloud só para trabalho independente de Windows; nunca promover CI Linux a prova da janela Tauri nativa.

Permissões: usar Auto somente se disponível e autorizado pelas configurações efetivas, ou regras allow estritas para as ações da missão. Nunca usar --dangerously-skip-permissions, --permission-mode bypassPermissions, permitir Bash irrestrito ou mascarar comandos para vencer o classificador. Se o modo necessário não existir, continuar o trabalho legalmente permitido, registrar uma única pendência de setup e preservar progresso.

Orquestrador Sonnet médio; elevar esforço para diagnóstico/arquitetura/médico complexos. Reutilizar investigador-leitura, implementador-isolado, verificador-independente e test-runner quando disponíveis e carregados; não reinstalar agentes sem motivo. Testes rápidos diretos; testes longos por processo gerenciado, Haiku somente se economizar custo ou liberar tarefa paralela. Paralelizar apenas trabalhos independentes em worktrees distintas, com base SHA, arquivos próprios e verificador separado. Agent Teams experimentais são opcionais e não justificam custo adicional por si.

Um único integrador possui branch de conclusão, ledger e aceitação. Escolher nome de branch novo, sem sobrescrever outro executor, a partir do candidato auditado comprovado. Todo worker recebe outcome, aceitação, base SHA, permissão, ownership e limite de turnos. Worker não decide sozinho merge/release.

Se a sessão terminar, há checkpoint recuperável e próximo passo específico. Em falha de conexão, quota ou reinício, usar retomada nativa se realmente configurada; caso contrário registrar não iniciada. Não prometer execução futura que o runtime não suporta. Não permitir repetição de mensagens “sem mudança”. Duas tentativas da mesma causa sem novidade -> reabrir hipótese.

## 4. Programa completo, por dependência e resultado

### M0 — Inventário, candidato e segurança de colaboração
Reconstruir a árvore de commits, SHAs, branches locais/remotas e worktrees ativas; localizar figure-width, V1 local, stats-aaa e qualquer trabalho não publicado. Não descartar nada. Reconciliar o ledger e o roadmap em uma única fonte canônica existente. Criar worktree/branch de conclusão própria. Prova: status limpo/identificado, SHA completo, mapa de ancestry e diferenças documentadas, nenhum arquivo humano mutado.

### M1 — Desbloquear build de candidato sem reduzir proteção
scripts/require-work-branch.mjs exige somente claude/smartlearn-v1-complete e bloqueia a auditoria. Isso é limitação de arquitetura de validação, NÃO obrigação de integrar na linha de release. Criar via específica e restrita para compilar em worktree isolada, exigindo identidade do repo, branch/ref auditada, HEAD e destino do bundle/target verificados. Manter scripts/launch-desktop-dev.ps1 protegido para o uso humano. O parser de CI corrigido em 29f6c1f deve continuar bloqueando CI=false, 0 e off. Testes negativos: branch indevida, raiz errada, SHA errado, CI falso, banco e processo humano. Não usar CI=1 local nem chamar vite/cargo escondendo desvio de proteção. Demonstrar o mesmo ou maior nível de segurança antes de declarar gate verde.

### M2 — Jornada Windows nativa em dados descartáveis
Construir frontend, pacote standalone e cargo no SHA real, em target separado; executar scripts/desktop-study-journey.mjs com SmartLearn Tauri/WebView2 real e provedor falso. Provar identidade da build + hash, PDF/extrator, rascunho, fonte, Resumo Mestre, questões/rejeição/edição, aceite, estudo, feedback, revisões, Hoje e Estatísticas; fechar, reabrir, retomar sessão e não perder dados. Verificar Job Object/órfãos, arquivo de banco temporário, WebView2 em pasta temporária, sem rede de IA, sem impacto no Desktop humano. Corrigir P0/P1 encontrados e repetir só sensores invalidados. Se não for Windows, marcar NATIVE_NOT_PROVEN e continuar as partes independentes.

### M3 — Integridade e proteção do produto
Confrontar migração SQLite, integridade e restore, snapshots, WAL/SHM, idempotência, isolamento por usuário, autenticação, locking de segundo escritor, segurança de arquivos/PDFs, controle de geração e créditos, ausência de segredos, offline e pacote Tauri. Audit de dependências JS e Rust; se cargo audit não estiver instalado, verificar fonte oficial e instalar somente quando a política de ferramentas permitir. Não tocar backups humanos, release instalado ou banco DEV. Testar pacote de entrega em ambiente descartável.

### M4 — Qualidade médica e governança de geração
Concluir, nos limites da automação, fidelidade médica à fonte, negações e contraindicações, doses/unidades/quantidades, antônimos, qualificadores, omissões essenciais, afirmações sem origem, paginação e rastreabilidade, procedência humana versus IA, preservação do original após reparo e bloqueio de aceite por HIGH não resolvido. Medir falso positivo de NEGATION_LOST/ADDED com amostras médicas reais já permitidas e sem gerar dados pagos. Validar que sinal lexical isolado não faz reparo automático clínico inadequado. Criar/rodar teste determinístico de identidade/hash do prompt montado sem editar o texto do prompt. Separar INDETERMINADO de comprovado. Preparar corpus, rubrica, protocolo VALID-4/5, avaliação humana e relatório VALID-8 para autorização posterior. Não executar canário pago nem declarar validação médica humana sem sua realização.

### M5 — Aprendizagem, interface e UX
Validar recuperação/revisão por unidade, 16 intervalos e datas, acerto independente/assistido, resultado corrigido, amostra insuficiente em Estatísticas, ausência de falsa inferência de domínio, lista Hoje, tela Plano, notificações, editor de resumo, imagens, tabelas, fórmulas, dimensões/rolagem, fontes e acessibilidade, idioma pt-BR e limites do catálogo es/en. Exercício aceito deve ter proveniência correta e feedback contextual. Refazer caminhos críticos somente se afetados por mudanças. Executar testes com navegador/CDP, sem confundir com percepção humana. Gerar roteiro UAT de 15 itens, imagens e instruções simples para o primeiro estudo real; essa apreciação humana permanece pendente.

### M6 — Reconciliar e integrar trabalho paralelo na própria branch
Inspecionar diferenças e commits de figure-width, window-memory-product, stats-aaa e candidato V1 local; não presumir existência de branches remotas citadas apenas em relatórios. Calcular merge-base e identificar conflitos nos arquivos Rust, desktop-study-journey, src/app.js e Estatísticas. Para cada conjunto, escolher incluir, substituir ou adiar com prova causal. Mesclar ou cherry-pick LOCALMENTE apenas na worktree própria, preservando os autores e histórico; jamais sobrescrever ou fazer force. Reprovar automaticamente qualquer resolução que perca comportamento valioso. Testar regressões específicas após cada integração. Publicar só a branch própria, preparar PR draft sem automerge.

### M7 — Regressão final e prova do SHA de entrega
Após integrar e consertar, rodar gates finais no mesmo SHA: servidor, unitários, lint, inventário de testes, cargo test, e2e dirigido ou completo quando justificado, auditorias de segurança e jornada nativa de restart. Executar a suíte completa UMA vez no SHA final, não a cada fatia. Marcar explicitamente skips, flakes, falsos verdes, testes stale e limitações de carga; PDF de 150 páginas e rascunho de 50 questões não provam carga multiusuário. Não editar após gate final sem reexecutar a cobertura afetada. Registrar comando, exit, contagens, SHA e evidência.

### M8 — Tratar todas as tarefas abertas sem misturar gates
O ledger tinha 21 itens não concluídos. Verificar estado atual de cada ID antes de agir:
- T-F0-05 (higiene de worktrees) e T-F1-05 (bancos legados): apenas preparações seguras até autorização de limpeza/dados.
- T-F4-01 (UAT humano), T-F4-02 (hierarquia de revisão, dependente de atrito real), T-F4-06 (regenerar uma questão, dependente de conteúdo).
- T-F5-01/02/03/04/05/06/07 (Prompt Lab e VALID-4,5,8): automação prévia e rubricas; custos e decisões humanas separados.
- T-F7-01/02/03 (revisões atrasadas, onboarding e FSRS: exigir contrato de produto e dados reais suficientes).
- T-F8-04 (retirada do release antigo: não fazer sozinho) e T-F8-05 (cargo audit).
- T-F9-01 (ensaio de integração) e T-F9-03 (publicação/release).
- T-F10-06 (idiomas/consumo: HG-13) e T-F11-01 (camada mnemônica: só após contrato aprovado).
Adicionalmente, R-1 WYSIWYG e R-2 posicionamento de janela constam como “para depois” no LOOP_BACKLOG: respeitar a ordem, não executá-los apenas porque existem. Nunca criar tarefas formais por cada sensor, relatório ou microedição. Consultar PROGRAM.md por precedência.

### M9 — Evolução pós-V1 aprovada
Preparar (sem impor mudança de produto) frente A de planejamento diário HG-14: disponibilidade, tempo estimado como estimativa, plano/déficit, não esconder revisões; e frente B HG-09: dívida artificial/uma obrigação por unidade, simulação e migração em cópia. Implementar incrementos apenas quando os critérios e a autorização da frente estiverem aprovados. FSRS só com dados suficientes; mnemônicos/infográficos e resumo do aluno após contratos. Web = aplicação derivada separada, Android = cliente de consulta. Isso é ROADMAP e não bloqueia V1; não declarar projeto integral encerrado se essas frentes ainda forem escopo aprovado.

### M10 — Entrega final e critérios objetivos
Construir pacote candidato, changelog, documentação de instalação, backup, restauração, rollback e lista de riscos. Inspecionar instalador e rodar teste de atualização em cópia; nunca substituir instalação humana por conta própria. Preparar PRs draft e matriz de evidência: funcionalidade, requisito, teste, SHA, resultado, pendência. Não dar merge em main/deploy/release sem autorização específica. Separar ENGINEERING_LOCAL_PROVEN, V1_VALIDATED e RELEASE_READY. Se faltar validação real da medicina/UAT, só WITH_HUMAN_GATES.

## 5. Estratégia para decisões que exigem humano

A ausência do dono NÃO converte decisões reservadas em autorização. Decisões técnicas reversíveis (implementação, diagnóstico, desenho de testes, arquitetura local segura) são suas: pesquisar documentação primária, decidir, implementar e provar sem perguntar. Para bloqueio real, registrar uma linha com EVIDÊNCIA, IMPACTO, RECOMENDAÇÃO e CONDIÇÃO DE DESBLOQUEIO; continuar tarefas independentes. Agrupar todas as aprovações que sobrevivam em UMA TABELA, apresentada uma única vez ao final, sem perguntas intermediárias. As permissões da ferramenta valem mesmo que o prompt diga “autônomo”.

O uso humano do SmartLearn, a aprovação clínica VALID-8, custo de geração real, decisões HG-09/14 e lançamento em main são gates genuínos; são impossíveis de declarar cumpridos com teste sintético. Preparar o máximo de material, capturas e caminhos de decisão antes de pedir qualquer participação.

## 6. Checkpoints, antiperda e antirrunaway

Após cada resultado coerente: gravar em fontes canônicas existentes estado e teste com SHA completo, comando, exit code, contagem, duração quando medida, escopo provado e residual; commit da própria branch, verificação de remoto, push normal se permitido. Não marcar PASS a partir de logs velhos nem de uma resposta do próprio agente. O único próximo passo deve indicar um outcome objetivo. Se execução está bloqueada, não criar trabalho fictício; encerrar a sessão normalmente com checkpoint e retomada agendada apenas quando suportada. Não repetir “sem mudança” nem tentar contornar Stop hook. Não ativar um /goal sem condição de encerramento para forçar trabalho.

FIM DE EXECUÇÃO de uma sessão = checkpoint durável, ausência de trabalho imediato possível, limite de plataforma/conta ou transição de supervisor com retomada comprovada. FIM DE PROJETO = requisitos e evidências correspondentes comprovados, aprovações humanas necessárias realizadas e entrega aceita.

Relatório final de cada ciclo: STATUS (um dos estados oficiais) | SHA_FINAL | RESULTADOS_COM_PROVA (até 5) | RISCOS | HUMAN_GATES (somente ainda exigíveis) | PRÓXIMO_OUTCOME | BACKGROUND_SESSION_ID/STATUS (real ou NÃO INICIADO). Sem frases repetidas nem pedidos de microdecisão.