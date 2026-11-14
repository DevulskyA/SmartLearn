# Diretrizes de código SmartLearn

Estas diretrizes orientam mudanças escritas por pessoas ou assistentes de IA. Clean Code significa reduzir o esforço para entender, modificar e verificar o sistema, sem sacrificar comportamento ou acrescentar cerimônia.

## Autoridade

Este arquivo é um índice prático, não substitui as regras completas. Em caso de dúvida, consulte, nesta ordem:

1. A autoridade reside em [`../../CLAUDE.md`](../../CLAUDE.md), no padrão de qualidade [`../../.specs/governance/02_SMARTLEARN_QUALITY_STANDARD_V1.md`](../../.specs/governance/02_SMARTLEARN_QUALITY_STANDARD_V1.md) e nos princípios de evolução [`../../.specs/governance/SAFE_SOFTWARE_EVOLUTION_PRINCIPLES_V2.md`](../../.specs/governance/SAFE_SOFTWARE_EVOLUTION_PRINCIPLES_V2.md).
2. Para Clean Code e internacionalização, siga o pedido aprovado em [`../../.specs/features/i18n-clean-code/BRIEF.md`](../../.specs/features/i18n-clean-code/BRIEF.md) e o estado atual descrito em [`../../.specs/features/i18n-clean-code/PLAN.md`](../../.specs/features/i18n-clean-code/PLAN.md).
3. Para linguagem e formatação, consulte os guias desta pasta, respeitando os padrões reais do repositório, `eslint.config.js` e os contratos existentes.

## Regras para código assistido por IA

- Trate código gerado como rascunho: confira contratos, chamadores, dados, erros e testes antes de aceitá-lo.
- Faça a menor mudança completa que resolva o resultado pedido. Preserve arquitetura, comportamento, segurança, compatibilidade e decisões aprovadas.
- Prefira fluxo explícito, nomes semânticos, responsabilidades coesas e tratamento de erros visível.
- Crie abstrações somente quando houver responsabilidade independente, repetição prejudicial ou necessidade real de isolamento. Não acrescente camadas, classes, dependências ou padrões por hábito.
- Acompanhe padrões locais; não faça reformatar ou refatorar arquivos inteiros sem necessidade.
- Comente o motivo de decisões não óbvias, invariantes e restrições. Use JSDoc ou documentação equivalente quando esclarecer contratos públicos ou lógica complexa; evite comentários óbvios ou redundantes.
- Proteja comportamento com testes que observem resultados, estados, permissões, efeitos e falhas. Escolha validação proporcional ao risco; nunca afrouxe testes para obter aprovação.
- Mantenha textos exibidos ao usuário nos catálogos de `src/i18n/`, usando as convenções existentes.
- Não converta JavaScript para TypeScript nem mude contratos ou arquitetura sem necessidade demonstrada e autorização.

## Interface em celular e Windows

O produto deve funcionar em celular e Windows, além da experiência web suportada. Preserve as plataformas aprovadas em [`../product-guidelines.md`](../product-guidelines.md): web, Android e Windows. No Windows, a entrega é um aplicativo local Rust/Tauri: o WebView renderiza a interface HTML, e a fronteira nativa permite trabalhar com arquivos do usuário na própria máquina. A autoridade dos dados do produto continua conforme as decisões arquiteturais aprovadas.

- Use o layout responsivo e os componentes existentes; verifique larguras pequenas e a janela desktop do Windows quando a interface for afetada.
- Ao tocar em fluxos de arquivos, valide também a fronteira nativa de acesso local; um teste da interface HTML, sozinho, não prova esse acesso.
- Garanta que ações, texto e controles continuem acessíveis por toque, teclado e tecnologias assistivas conforme o contexto.
- Não introduza pressupostos exclusivos de hover, ponteiro, teclado, tamanho de janela ou capacidade de uma plataforma.
- Mudanças visuais ou estruturais em superfícies aprovadas seguem as proteções e portões humanos definidos nas regras canônicas.

## Guias disponíveis

- [`general.md`](general.md) — princípios gerais de legibilidade, consistência, simplicidade e manutenção.
- [`javascript.md`](javascript.md) — resumo-base de estilo JavaScript; use em conjunto com os padrões atuais do projeto.
- [`html-css.md`](html-css.md) — resumo-base para HTML e CSS; preserve os padrões existentes e os requisitos de acessibilidade/responsividade.

Os guias de linguagem são referências, não uma licença para impor regras mecânicas contra os padrões estabelecidos ou as regras canônicas do SmartLearn.