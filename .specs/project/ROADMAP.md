# ROADMAP.md — SmartLearn

## Fase 1 — MVP Local (atual)

**Meta:** Substituir a planilha. Funcionar offline. Sem login. Sem servidor.

**Status:** Correção arquitetural documentada. TASK-000 aguarda execução após revisão humana.

### Milestones

| # | Milestone | Descrição | Status |
|---|-----------|-----------|--------|
| M0 | Base versionada | Git local, `.gitignore`, Vite, Tauri 2 e estrutura inicial sem código funcional | Pendente |
| M1 | Fundação | Estrutura visual HTML/CSS/JS e navegação entre telas no desktop Tauri | Pendente |
| M2 | Cadastro | Disciplinas + estudos + geração automática de revisões | Pendente |
| M3 | Tela Hoje | Detalhes/Hoje com cards mobile e tabela desktop | Pendente |
| M4 | Exercícios | Registrar questões, acertos, percentual automático | Pendente |
| M5 | Estatísticas | Totais, médias, gráfico de evolução das notas | Pendente |
| M6 | Backup | Exportar e importar JSON | Pendente |
| M7 | Mobile | Validar Android e manter iOS preparado na mesma base Tauri 2 | Pendente |
| M8 | Polimento | Acessibilidade, responsividade, testes manuais finais | Pendente |

### Entregável da Fase 1

Aplicação Tauri 2 funcionando primeiro no desktop, com todos os itens do escopo funcional
do MVP implementados e testados. A mesma base deve estar preparada para Android e iOS;
o build real de iOS permanece posterior por exigir ambiente Apple/Mac.

---

## Fase 2 — Sincronização (não iniciada)

**Meta:** Permitir que o aluno acesse os dados em mais de um dispositivo.

Possíveis abordagens (a decidir na época):
- Sincronização via arquivo (manual, já resolvida pelo backup JSON do MVP)
- Serviço de sincronização a definir após o MVP
- CRDTs locais com sync eventual

**Pré-requisito:** MVP estável com usuários reais testando.

---

## Fase 3 — Conta e Multi-dispositivo (não iniciada)

**Meta:** Login, perfil, histórico persistente em nuvem.

**Pré-requisito:** Fase 2 validada.

---

## Fase 4 — Funcionalidades Avançadas (não iniciada)

Candidatos (a priorizar com base em feedback real):
- Redistribuição inteligente de revisões atrasadas
- Caderno de erros
- Banco de questões integrado
- Relatórios avançados de desempenho
- Notificações push
- Evoluções específicas de plataforma, se validadas

**Pré-requisito:** Base sólida de usuários na Fase 3.

---

## Notas

- Nenhuma fase posterior deve ser iniciada antes de a fase anterior estar estável.
- Decisões de arquitetura de fases futuras não devem influenciar o MVP.
- O MVP deve ser simples o suficiente para ser mantido por uma pessoa.
- O repositório local deve ser inicializado em TASK-000; cada task posterior terá commit próprio.
- Codex cuida de GitHub, branches remotas e pull requests.
