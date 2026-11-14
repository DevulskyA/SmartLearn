# UI Fast Pilot — Resultado

## Ambiente
SO: Windows nativo
Projeto: SmartLearn
Aplicação: Vite + interface SmartLearn
Interface: navegador Chromium/Chrome isolado
Gerenciador: npm

## Ferramentas
Playwright Test: reutilizado, 1.63.0, execução headless explícita
Playwright CLI: reutilizado, funcional
Skill: `.agents/skills/playwright-cli/SKILL.md`
Planner: `.codex/agents/playwright_test_planner.toml`
Generator: `.codex/agents/playwright_test_generator.toml`
Healer: `.codex/agents/playwright_test_healer.toml`
Chromium: disponível; execução do piloto passou
MCP ativo: não medido

## Planejamento
Arquivo: `specs/ui-fast-pilot.plan.md`
Funcionalidade: primeiro acesso e abertura do formulário de nova aula
Cenários: cadastro, autenticação, estado vazio de Hoje, ação Criar uma aula; smoke E2E com PDF, edição, fórmula, tabela, imagem, persistência, aceite e navegação
Seed/fixture: banco SQLite temporário criado pelo teste

## Execução
Arquivo de teste: `e2e/ui-fast-pilot.spec.js`
Comando: `npm run test:ui:fast`
Encontrados: 1 no piloto; 10 no smoke E2E
Executados: 1 por rodada no piloto; duas rodadas obrigatórias pelo terminal e uma rodada final após explicitar headless
Aprovados: 1 em cada rodada do piloto; 10 no smoke
Reprovados: 0
Ignorados: 0
Código de saída: 0 em ambas

## Qualidade
Verificações principais: estado vazio visível; “Criar uma aula”; `#screen-plan`; `#plan-new-unit-form`
Persistência: não aplicável; banco descartável
Teste negativo: expectativa de texto alterada temporariamente; falhou com código 1 e recebeu o texto real incorreto
Prova adversarial: falha apontou a asserção crítica e gerou trace; teste foi restaurado e passou novamente
Falhas legítimas: inspeção CLI registrou 502 em `/health/build` sem servidor de API; não afetou o teste oficial, que inicia a API descartável

## Desempenho
Tempo de aquecimento: não medido isoladamente
Execução 1: 39,82 s (comando obrigatório, terminal/headless)
Execução 2: 34,28 s (comando obrigatório, terminal/headless)
Execução final: 29,58 s (após `headless: true` explícito)
Smoke E2E: 41 s (10 testes)
Mediana: 38,26 s nas duas primeiras execuções do piloto
Workers: 1
Baseline equivalente: não medido
Ganho percentual: não medido
Tokens medidos, se disponíveis: não medido

## Evidências
Logs: saída do Playwright Test, smoke E2E e `.playwright-cli/console-*.log`
Screenshots: não gerados
Traces: não gerados; não houve falha no piloto
Arquivos criados: plano, teste, resultado, agentes oficiais e Skill oficial
Arquivos alterados: `package.json` e `.gitignore` pela inicialização oficial

## Reutilização
Comando final: `npm run test:ui:fast`
Configuração preservada: `playwright.config.js` não foi alterado

## Pendências
Limitações: o guardrail `scripts/require-work-branch.mjs` bloqueia `npm run dev` neste checkout; a inspeção visual anterior usou `npx vite` direto. A execução aceita agora usa somente Playwright Test pelo terminal, com `headless: true`. O smoke não tem baseline registrado (`NO BASELINE`).
Bloqueios comprovados: nenhum para os testes; não houve acesso a dados reais nem tráfego externo.
