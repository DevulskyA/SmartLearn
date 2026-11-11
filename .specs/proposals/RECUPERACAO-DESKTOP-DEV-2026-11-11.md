# Recuperacao do Desktop DEV a partir de `design/redesign-geral-20261110` (proposta, NADA aplicado)

Estado: provado em copia; as duas mudancas abaixo dependem de autorizacao explicita do dono. O banco DEV persistente nao foi migrado.

## O que impede hoje (provado)
1. `scripts/work-target-guard.mjs` recusa a branch (`WRONG_BRANCH`), e `launch-desktop-dev.ps1` chama `npm run build` (guarda `prebuild`).
2. O backend recusa a migracao 042 (`REFUSING to migrate ... 42 ... not authorized`): o launcher autoriza so `'39,40,41'`.

## Mudanca 1 - liberar a branch (uma linha)
`scripts/work-branches.json`:
```diff
-  "allowed": ["claude/smartlearn-v1-complete", "candidate/*", "codex/restore-pdf-parity"]
+  "allowed": ["claude/smartlearn-v1-complete", "candidate/*", "codex/restore-pdf-parity", "design/redesign-geral-20261110"]
```
Alternativa sem mexer na guarda: rodar o DEV de uma worktree em branch ja permitida (mostra o codigo dela, nao o redesign).

## Mudanca 2 - autorizar a migracao 042
`scripts/launch-desktop-dev.ps1`:
```diff
-$env:SMARTLEARN_AUTHORIZE_MIGRATIONS = '39,40,41'
+$env:SMARTLEARN_AUTHORIZE_MIGRATIONS = '39,40,41,42'
```
O launcher ja tira o snapshot verificado (`scripts/dev-snapshot.mjs`) ANTES de o backend migrar.

## Prova da migracao 042 em copia (2026-11-11)
- Snapshot novo e verificado do DEV: `C:\Users\Ariel\SmartLearn-DevData\snapshots\2026-11-11` (schema v41, sha256 `a39cc384b24b...`, VALID em `node scripts/dev-snapshot.mjs --list`).
- Copia desse snapshot em pasta temporaria + `runMigrations`: versao 41 -> 42; unica tabela com contagem alterada: `schema_migrations`; coluna `learning_units.lesson_date TEXT` nula, sem default, 0 linhas preenchidas; `integrity_check` ok; `foreign_key_check` vazio. A copia foi apagada.
- A 042 e aditiva (`ALTER TABLE ... ADD COLUMN`, sem backfill): nenhuma linha existente e tocada.

## Conta
Em 2026-11-11, a pedido do dono, a conta unica de cada banco (Homologacao e DEV) passou a `o e-mail do dono`, com backup verificado antes (`SmartLearn-Backups\homologacao-antes-credencial-202611110557`, `dev-antes-credencial-202611110557`). Restaurar = copiar o `.db` do backup de volta com o app fechado.

## Como aplicar (so apos autorizacao)
1. Aplicar as duas edicoes acima e commitar.
2. Abrir "SmartLearn DEV". O launcher tira o snapshot do dia, compila, empacota e o backend aplica a 042.
3. Reverter: restaurar o snapshot `2026-11-11` (ou `pre-migrate-*`) sobre `smartlearn-dev.db` com o app fechado.
