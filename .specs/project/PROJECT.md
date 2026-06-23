# PROJECT.md — SmartLearn

## Visão

Transformar uma planilha de controle de estudos e revisões periódicas em uma única aplicação
multiplataforma, simples e rápida — usável em desktop, iPhone/iOS e Android, sem conta,
sem servidor e sem fricção.

## Problema

Alunos que estudam para concursos, vestibulares ou certificações precisam revisar o conteúdo
em intervalos específicos para fixar o aprendizado. A planilha funcionava, mas:

- É difícil de usar no celular.
- Exige manipulação manual de datas e fórmulas.
- Não é acessível fora do computador onde está salva.
- Não gera alertas ou organiza o que fazer hoje.

## Solução

Uma aplicação Tauri 2 com interface web que:

1. Substitui a planilha sem aumentar a complexidade.
2. Funciona no celular tão bem quanto no desktop.
3. Organiza automaticamente o que o aluno deve revisar hoje.
4. Gera revisões automaticamente ao registrar um estudo.
5. Salva tudo localmente, sem precisar de internet ou conta.
6. Permite backup e restauração via arquivo JSON.

## Usuário

Aluno individual que:
- Estuda regularmente para provas, concursos ou certificações.
- Já usava (ou poderia usar) uma planilha de revisões periódicas.
- Acessa pelo celular na maior parte do tempo.
- Está frequentemente cansado ao abrir o app.
- Não quer aprender uma ferramenta complexa.

## Princípio central

> O aluno deve gastar energia estudando, não gerenciando o sistema.

## Versionamento

O projeto usa Git desde o início. TASK-000 inicializa o repositório local e cria o primeiro
commit apenas com specs aprovadas e estrutura inicial. Cada task posterior usa commit próprio
e deve deixar o repositório funcional. Codex é responsável por GitHub, branches remotas e pull
requests; Claude não cria repositório GitHub nem faz push remoto sem instrução explícita.

## Stack do MVP

| Camada         | Tecnologia                              |
|---------------|----------------------------------------|
| Estrutura     | HTML5                                  |
| Estilo        | CSS3 (sem framework)                   |
| Lógica        | JavaScript puro (ES6+)                 |
| Build web     | Vite (empacotador mínimo)              |
| Banco local   | SQLite nativo via `@tauri-apps/plugin-sql` |
| Empacotamento | Tauri 2                                |
| Primeiro alvo | Desktop                                |
| Alvos móveis  | Android posterior; iOS preparado na mesma base |
| Backend       | Nenhum                                 |

## Estrutura do projeto

```
SmartLearn/
├── .git/
├── .gitignore
├── .specs/
├── package.json
├── vite.config.js
├── index.html
├── src/
│   ├── app.js
│   ├── db.js
│   ├── stats.js
│   └── styles.css
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       └── main.rs
└── README.md
```

## Escopo do MVP

**Dentro do MVP:**
- Cadastro de disciplinas
- Cadastro de estudo (modelo RP)
- Geração automática de revisões
- Tela Hoje/Detalhes com cards e tabela responsiva
- Marcar revisão como feita
- Registrar questões, acertos e comentário
- Estatísticas básicas com gráfico de evolução
- Exportar/importar backup JSON
- Aplicação desktop empacotada com Tauri 2 e SQLite nativo
- Mesma base preparada para Android e iOS

**Fora do MVP (sem data):**
- Conta de usuário / login
- Sincronização em nuvem
- IA ou sugestões inteligentes
- Gamificação
- Banco de questões
- Build real iOS (requer ambiente Apple/Mac)
- Compartilhamento entre usuários

## Referências

- [INVARIANTS.md](INVARIANTS.md) — Regras que nunca podem ser violadas
- [ROADMAP.md](ROADMAP.md) — Fases e milestones
- [STATE.md](STATE.md) — Decisões, bloqueadores e pendências
