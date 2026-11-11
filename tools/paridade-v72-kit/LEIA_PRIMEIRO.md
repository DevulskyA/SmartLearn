# SmartLearn — Mecanismo de Paridade V7.2 (com código de origem)

**Finalidade:** reduzir o trabalho cognitivo do agente: partir do código **já aprovado**, comparar a aplicação por instrumentação e corrigir somente o delta. A worktree do agente e o banco real **não foram alterados** por este pacote.

## Primeiro teste: Configurações

No terminal **da worktree SmartLearn**, com `@playwright/test` já instalado e preview local ativo em `http://127.0.0.1:5188`:

```powershell
node "C:\CAMINHO\SmartLearn-V7.2-Paridade-Automatica\tools\paridade-v72.mjs" --app http://127.0.0.1:5188 --screens settings --widths 897,1440 --state "C:\CAMINHO\AUTH\storageState.json"
```

**O parâmetro `--state` é opcional somente quando o preview é acessível sem autenticação.** Na sua sessão ele pode ser obrigatório: reutilize o mecanismo de login dos E2Es existentes para produzir `storageState.json` em área temporária, sem expor senhas/tokens. Nunca peça ao usuário para tirar capturas manualmente. O runner deve operar no navegador automatizado do agente, sem mouse físico.

O comando imprime o caminho do **`report.html`**, com imagens lado a lado, sobreposição regulável, contagens e diferenças de títulos/posições. Resultados ficam numa pasta temporária do Windows, fora do Git. Não envie capturas de dados reais para serviços externos.

Depois de corrigir Configurações, rode:

```powershell
node "C:\CAMINHO\SmartLearn-V7.2-Paridade-Automatica\tools\paridade-v72.mjs" --app http://127.0.0.1:5188 --screens today,materials,plan,stats,settings,account --widths 897,1440 --state "C:\CAMINHO\AUTH\storageState.json"
```

Para `register`, `study-now` e `exam`, o arquivo contém as **referências**, mas a abertura no aplicativo real depende do fluxo legítimo com dados; o runner marca esses casos como bloqueados até que os E2Es naveguem para eles. **Não marque esses casos como aprovados por terem capturas de referência.**

## O que já está pronto neste pacote

- `reference/V7.2.html`: referência completa e executável, fonte de verdade da interface aprovada.
- `reference/css-v7.2-exato.css`: dois blocos de CSS extraídos sem reescrita da referência V7.2.
- `reference/<tela>-897.png`, `<tela>-1440.png` e manifestos `.json`: **18 estados** reais (9 telas × 2 larguras), obtidos por Playwright. Banner específico da demonstração foi removido durante a captura para comparação com aplicativo nativo.
- `portar/V6-experience.mjs`, `V6-model.mjs`, `V6-copy.mjs`, `V6-stats-v5-model.mjs`: **código de origem original**, reutilizável após inspecionar interfaces e módulos já existentes. Não são substitutos automáticos do backend atual.
- `portar/settings-v7.2-dom.html`, `settings-v7.2-renderizador-referencia.js.txt`: estrutura e geração dos cartões, para copiar a composição em vez de inventar outra. O renderer depende do estado demonstrativo; conecte-o aos objetos `THEME_OPTIONS` e aos eventos **reais**.
- `evidencias/resultado-agente-*`: capturas fornecidas pelo usuário, para confrontar a referência na mesma largura.
- `tools/paridade-v72.mjs`: execução automatizada **somente leitura**; nenhuma alteração em base/conta/repo. Requer `@playwright/test` do SmartLearn.

## Critério crítico de Configurações

Na V7.2: **24 opções de temas**, organizadas em **1 Automático, 9 Claros, 14 Escuros**, com **3 colunas a 897px e 4 colunas a 1440px**. Miniaturas possuem área lateral colorida e duas linhas horizontais. A tela nativa pode conter **mais opções reais de configuração** que a prévia; essas opções são patrimônio funcional e devem ser preservadas.

## Limites da prova

**Verificado aqui:** referência V7.2 capturada nas 18 combinações, com zero erros JS de página; compilação sintática do runner; auto-teste do runner na tela Configurações, confrontando a referência consigo mesma, com zero divergências estruturais.

**Ainda depende da worktree do agente:** execução contra `localhost:5188` autenticado, confronto visual final e validação da aplicação Windows WebView2. A comparação de números/IDs é um detector de omissões; divergências de estilo exigem inspeção do relatório visual e teste dos controles reais.
