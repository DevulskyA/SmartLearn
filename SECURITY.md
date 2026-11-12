# Política de segurança

## Reportar uma vulnerabilidade

Não abra issue pública. Use "Report a vulnerability" na aba Security do repositório
(https://github.com/DevulskyA/SmartLearn/security/advisories/new) ou contate o dono do repositório em privado.

Inclua: o que acontece, passos para reproduzir, versão/commit e impacto. Segredos e dados pessoais não devem aparecer no relato.

## Escopo

Aplicativo (Web, Android, Windows), servidor (`server/`) e a base SQLite local.

## Controles existentes

- CI executa `npm audit` na raiz e em `server/` (`.github/workflows/ci.yml`, job `security`).
- Atualizações de dependências automatizadas via Dependabot (`.github/dependabot.yml`).
- Segredos nunca versionados; arquivos `.env` ignorados no `.gitignore`.
