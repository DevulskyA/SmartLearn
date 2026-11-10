# Pacote de handoff para o agente de design — SmartLearn, 2026-11-09

Para quem lê: você está fora da máquina do dono e lê tudo pelo GitHub.
Repositório: https://github.com/DevulskyA/SmartLearn
Branch: `handoff/design-2026-11-09` (pasta `.specs/handoff-design-2026-11-09/`). Não é a `main`; nada foi mesclado nem lançado.

## Ordem de leitura
1. `01-LEIA-PRIMEIRO-fluxo-e-estado.md` — como o app funciona de ponta a ponta, o que mudou, o que foi provado e o que NÃO foi, pendências de design que são suas e os limites do dono.
2. `02-CODEMAP.md` — onde está cada coisa no código (cliente, servidor, testes).
3. `patches/design-changes-ccfa81e-to-28a990e.patch` — todas as mudanças de interface (index.html, src/, e2e/) dos commits de design, em um único diff para revisar sem clonar.
4. `03-folha-de-decisoes-producao.md` — decisões que só o dono toma (banco real, push/merge/release, gasto com IA). Não as tome por ele.

## Arquivos de interface mais importantes (ver no branch)
- `index.html`, `src/styles.css` (blocos de Revisão e Materiais no final), `src/materials-ui.js`, `src/i18n/locales/pt-BR/screens.js`.

## Regras que valem para você
- Preservar dados humanos, credenciais, instalações e histórico Git. Sem push, merge, release, banco real ou chamada paga sem autorização específica do dono.
- A tela Estatísticas é superfície protegida (ADR-0001): mudança exige decisão do dono.
- Textos novos: entram em `src/i18n/locales/pt-BR/` e o texto de reserva em `index.html` deve ser igual (teste `test/i18n-html.test.js`).
- O dono pediu que a tipografia/escala do app seja tratada por você; o hook `flat-type-hierarchy` em `index.html` ficou aberto para você.
