# SmartLearn Input Integrity v2 — Spec

## Objective
Salvar cadastros e conteúdo médico legítimo de modo previsível, validar todas as fronteiras relevantes e preservar integralmente os dados existentes.

**Classificação:** Complex/high-risk. **Estado:** plano proposto para adoção explícita ao executar o comando; verificações locais ainda pendentes.

## Requirements

| ID | Requirement | Source | Priority |
| --- | --- | --- | --- |
| SIV-001 | Executar apenas em armazenamento e processos de teste isolados. | Usuário: dados reais foram apagados | P0 |
| SIV-002 | Preservar bytes de armazenamento quando a leitura falhar. | A-07 remoto; proteção do usuário | P0 |
| SIV-003 | Aceitar os nomes, títulos e símbolos médicos legítimos do corpus. | Título literal do usuário; Unicode | P1 |
| SIV-004 | Aplicar normalização e validação por família de campo, compartilhadas pelos consumidores. | Pedido de auditoria de validação | P1 |
| SIV-005 | Resolver disciplina existente ou nova ao Salvar aula com operação composta consistente. | Decisão recente de UX | P1 |
| SIV-006 | Expor sucesso/erro e entidades salvas imediatamente sem perder rascunhos. | Bug observado pelo usuário | P1 |
| SIV-007 | Validar tipos, números, datas, enums e relações antes da mutação. | A-05/A-06 e invariantes existentes | P1 |
| SIV-008 | Importar apenas formatos conhecidos sem descarte silencioso ou escrita parcial. | Contrato de backup aprovado | P0 |
| SIV-009 | Renderizar texto como dados e usar parâmetros SQL. | OWASP; integridade | P1 |
| SIV-010 | Testar código de produção e matar mutações comportamentais relevantes. | TLC; auditorias anteriores | P1 |
| SIV-011 | Manter identidade estável por ID e política de duplicidade equivalente entre adapters. | Bug de disciplina e paridade aprovada | P1 |
| SIV-012 | Concluir por evidência do candidato ou pausar honestamente no prazo. | Janela curta; sem falso PASS | P1 |

## Acceptance Criteria

| ID | Given | When | Then | Spec-defined outcome |
| --- | --- | --- | --- | --- |
| AC-001 | Ambiente de execução | Antes de qualquer teste | Resolver storage de todos os acessos | Caminhos SQLite dos dois acessos nativos, perfil Web e contexto mobile apontam a sandbox; destino de produção bloqueado. |
| AC-002 | Tentativa de teste usando caminho protegido | Guard de isolamento | Abortar antes de abrir | Nenhuma operação de escrita no caminho protegido; erro explícito de isolamento. |
| AC-003 | JSON local malformado em sandbox | Inicializar BrowserStore | Sinalizar leitura inválida | Valor bruto original inalterado; zero inicialização vazia, seed ou gravação automática. |
| AC-004 | Disciplina Semiologia Médica e título literal do usuário | Validar/salvar | Aceitar conteúdo | Ausculta Cardíaca — Bulhas e Sopros permanece intacto; pontuação médica do corpus aceita. |
| AC-005 | Nome com bordas e espaços horizontais repetidos | Normalizar disciplina | Canonicalizar sem colar palavras | “  Semiologia  Médica  ” resulta em “Semiologia Médica”; título conserva espaços internos. |
| AC-006 | Nome/título vazio, somente invisíveis ou pontuação | Validar entrada nova | Rejeitar com campo | Erro de campo; nenhuma escrita e rascunho preservado. |
| AC-007 | Nome em NFC e em NFD equivalente | Comparar disciplinas | Usar mesma chave | Uma disciplina ativa resolvida, mantendo acentos; sem NFKC no conteúdo médico. |
| AC-008 | Disciplina ativa já cadastrada com caixa/bordas diferentes | Salvar aula com nome digitado | Reutilizar a existente | Mesmo subjectId; contagem de disciplinas não aumenta; aula criada uma vez. |
| AC-009 | Disciplina equivalente arquivada ou chaves legadas ambíguas | Resolver nome | Pedir seleção/reativação explícita | Nenhuma reativação, fusão, exclusão ou escolha silenciosa. |
| AC-010 | Disciplina inexistente e aula válida | Clicar somente Salvar aula | Salvar composição inteira | Uma disciplina, uma unidade ligada e revisões canônicas; nenhum clique prévio em Adicionar. |
| AC-011 | Aula com título/data inválido e disciplina pendente | Clicar Salvar aula | Falhar antes de gravação | Zero nova disciplina, unidade ou revisão. |
| AC-012 | Falha injetada após criar disciplina na operação composta | Persistir aula | Reverter composição | Nenhum registro parcial da operação; dados preexistentes idênticos. |
| AC-013 | Duas ativações rápidas do mesmo rascunho | Salvar duas vezes | Uma submissão em andamento | Exatamente uma aula e um conjunto de revisões; botão volta ao estado correto após sucesso/erro. |
| AC-014 | Cadastro bem-sucedido | Atualizar UI | Mostrar resultado correto | Disciplina aparece selecionada e aula aparece imediatamente; filtro conflitante tratado explicitamente. |
| AC-015 | Nome digitado em modo Nova disciplina | Cancelar modo ou mudar para existente | Atualizar estado explícito | Nome oculto antigo não cria nem substitui disciplina; texto de título/resumo permanece. |
| AC-016 | Falha de quota/SQL ou erro de validação | Salvar | Exibir erro recuperável | Rascunho, seleção e conteúdo intactos; não emitir mensagem de sucesso. |
| AC-017 | Nova disciplina com nome equivalente existente | Usar ação Criar disciplina separada | Informar existente | Nenhuma duplicata; ação primária Salvar aula continua disponível. |
| AC-018 | Datas no corpus | Validar pelo caminho público | Verificar calendário exato | Aceitar 2024-02-29; rejeitar 2026-02-30, 2026-13-01 e sufixo após YYYY-MM-DD. |
| AC-019 | Contagens de evidência e IDs | Validar tipos | Aceitar inteiros no domínio | q>0, 0<=c<=q; fração/NaN/Infinity/boolean não passam; IDs inteiros positivos e relações existentes. |
| AC-020 | Review sem resposta ainda registrada | Validar revisão | Preservar ausência | q/c ausentes continuam ausentes; não fabricar acerto zero nem score. |
| AC-021 | Exercício/evidência/settings novos | Validar enums e estrutura | Exigir contrato real | provenance/context válidos e explícitos; boolean e configuração validados sem coerção silenciosa. |
| AC-022 | Backup inválido com uma linha problemática | Importar em sandbox populada | Rejeitar integralmente | Estado anterior semanticamente idêntico; nenhum skip de linha/array inválido. |
| AC-023 | Backups legítimos v1/v2/v3 do produto | Migrar/importar/exportar | Preservar contrato existente | IDs, relações, textos e histórico preservados; incompatibilidade não apaga nada. |
| AC-024 | Evidence q=10,c=7 e cache score incorreto | Importar/salvar | Derivar score | Score de 70%; nenhum consumidor usa cache conflitante como autoridade. |
| AC-025 | Resumo/pergunta com HTML-like e SQL-like strings | Salvar e mostrar | Tratar como dados | Nenhum script/evento executado, nenhuma consulta alterada; literal preservado no texto livre. |
| AC-026 | Texto livre com parágrafos/símbolos | Salvar e reabrir | Preservar conteúdo | Quebras, espaços internos, Na⁺/K⁺, O₂ e β permanecem; NUL rejeitado com erro. |
| AC-027 | Mesmo caso por UI, DB API e import | Executar contratos aplicáveis | Mesma validade | Invariante não pode ser contornada omitindo UI; formatos legados só convertem pela etapa explícita. |
| AC-028 | Casos executados em BrowserStore e SQLite | Comparar resultados | Paridade semântica | Mesmo sucesso/erro, vínculo, score e rollback; schema do teste vem da produção. |
| AC-029 | Fluxo completo em navegador novo isolado | Salvar, editar, revisar, recarregar | Comprovar jornada | Registros e edição preservados pela UI; relato inclui cenário exato, runtime e revisão do código. |
| AC-030 | Proteções alteradas em scratch | Rodar testes relevantes | Detectar mutações semânticas | Travessão indevidamente rejeitado, validador ignorado, dia impossível aceito, campo c trocado, refresh omitido e rollback quebrado são mortos por seus sensores. |
| AC-031 | Candidato final e último diff | Verifier separado | Verificar sem implementar | Verdict ancorado ao SHA/testes; fallback identificado se não houver contexto independente. |
| AC-032 | Fim da janela ou bloqueio material | Encerrar missão | Estado honesto e retomável | CHECKPOINT_PARCIAL quando faltarem critérios; READY_LOCAL_AUDIT somente com critérios locais obrigatórios comprovados; runtime por plataforma separado. |

## Field policy — decisões de implementação desta missão

| Família | Política proposta a aplicar |
| --- | --- |
| Disciplina | String, NFC, trim das bordas e colapso de espaços horizontais; ao menos letra ou número Unicode; rejeitar controle de linha/NUL e nome somente invisível. Chave de comparação NFC + espaços normalizados + caixa PT-BR, mantendo acentos. |
| Título | String de uma linha, trim de bordas e NFC; preservar espaços internos, travessão e símbolos médicos. Não usar a mesma allowlist estreita de disciplina. Título de aula não é chave única global. |
| Fonte | Texto livre; obrigatoriedade conforme contrato existente. Preservar pontuação/DOI/edição/páginas. Não criar entidade sources novamente. |
| Resumo, resposta, pista e comentário | Texto livre com parágrafos. Preservar conteúdo; validar tipo e controles perigosos; renderizar como texto. Não aplicar normalização de nome, filtro “somente letras” ou avaliação por IA do conteúdo. |
| Número de questões/acertos, posições, IDs | Inteiros seguros nos intervalos do campo. Converter decimal digitado na UI uma única vez, rejeitando expoente/hex/fração quando se espera contagem. JSON v3 exige tipos canônicos; v1/v2 têm conversão explícita conhecida. |
| Datas de estudo, vencimento e evidência | Calendário YYYY-MM-DD completo e existente. São datas locais sem hora; não extrair dia UTC de timestamp arbitrariamente. Timestamps técnicos continuam com seu contrato separado. |
| Provenance/context/boolean/cor | Enums e tipos documentados. Não classificar silenciosamente conteúdo desconhecido como MANUAL nem string “false” como true. |
| Limites | Preservar limites já aprovados por campo e testá-los nas fronteiras. Para texto livre sem limite existente, registrar precisão pendente antes de criar novo teto. Nunca truncar dados para passar. |

Texto significativo é critério de estrutura, não julgamento acadêmico: “asdf” com letras não pode ser declarado conteúdo falso por um regex. O sistema protege tipos, segurança e fluxo; revisão médica do conteúdo é outra função.

Unicode: NFC preserva distinções de compatibilidade; não usar NFKC global em fórmulas/subscritos. Não apagar indiscriminadamente todos os caracteres de formato: emojis com ZWJ e algumas escritas dependem deles. Para nomes de uma linha, rejeitar caracteres específicos problemáticos com mensagem inteligível, em vez de reescrever silenciosamente. A matriz inicial cobre vazio/invisível e controles; casos não definidos ganham decisão explícita, não regra improvisada.

## Edge Cases

Rascunho com disciplina existente e nome novo simultâneos deve seguir modo explícito da UI. Equivalente arquivada não é reativada automaticamente. Falha após COMMIT com re-render quebrado não significa falha de persistência: informar o estado confirmado e permitir recarregar, sem reenviar a criação. Duplicação em histórico prévio não será fundida/apagada. Migração antiga só deve rodar nas fixtures isoladas. Falhas de leitura e quota nunca autorizam reset.

## Non-goals

Sem FSRS, Learning Engine, sync, PWA substituta, novos bancos, redesign de navegação, classificação médica por IA ou limpeza retroativa da base real. Sem alterar stack, permissões globais, plugins ou toolchain para “acelerar”. Sem publicação, instalação no perfil principal ou UAT destrutivo.

## Open Questions

- Quantos minutos restam até o reset absoluto? O usuário informou janela relativa; o executor usa limite confirmado ou o teto conservador local, sem fingir acesso à cota.
- Limites ausentes para textos livres, política de conflito legado de nomes e alvos de storage isolados: resolver por contrato/documentação real; qualquer alteração material exige decisão humana. Não bloqueiam casos já definidos e independentes.
- O commit local 1b65836 precisa ser inspecionado no Claude Code, pois não estava disponível no GitHub nesta preparação.
