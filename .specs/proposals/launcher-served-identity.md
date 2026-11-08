# Abertura correta do Desktop: o que o launcher já protege, a lacuna e o candidato (2026-11-08)

Status: PROPOSTA para aprovação. O launcher humano (`scripts/launch-desktop-dev.ps1`), os atalhos e a política de branch (`expectedBranch`, `scripts/require-work-branch.mjs`) NÃO foram alterados.

## 1. O que a proteção atual faz
`launch-desktop-dev.ps1` calcula a identidade das fontes (`scripts/build-identity.mjs`: `inputsHash` de `src/`, `shared/`, `server/`, `index.html`, `package.json`, independente de commit e de canal) e compara com `src-tauri/resources/dist-runtime/build-info.json`. Se diferem, recusa abrir ("Nada foi aberto"). Reconstrói o frontend e o pacote quando estão velhos.

## 2. A lacuna (provada)
Essa pasta é só a área de preparação. O exe serve a cópia que fica AO LADO dele (`<pasta do exe>/dist-runtime`), feita quando o exe foi compilado. As duas podem divergir: com `-NoBuild`, depois de uma compilação que falhou em silêncio, ou quando se abre um exe que o launcher não gerou. O atalho "SmartLearn Oficial" nem passa pelo launcher: abre o `.exe` direto.

`node scripts/desktop-identity.mjs <exe> --expected b23dbf19...` (conteúdo do HEAD de 07/11) nesta máquina:

| Executável | Serve | Veredito |
|---|---|---|
| `C:\Projetos\SmartLearn\src-tauri\target\release\smartlearn.exe` (atalho Oficial) | `19c3c98f4b82`, construído em `6cbedac+local`, 06/11 06:30 | RECUSA |
| `C:\Projetos\SmartLearn\src-tauri\target\debug\smartlearn.exe` | `19c3c98f4b82`, `7bbe113+local`, canal RELEASE | RECUSA |
| `C:\Users\Ariel\smartlearn-open-20261105\...\debug\smartlearn.exe` (último launch humano, `last-launch.json`) | `9a0421b94d16`, `ed15172` (16/10) | RECUSA |
| `C:\Projetos\SmartLearn-journey-target\debug\smartlearn.exe` | `b23dbf19a9b9`, `fc54183+local` | ACEITA (é a que a jornada e o N7 testam) |

Um caso real do dia: `cargo build` terminou com código 0 numa worktree onde o frontend não pôde ser gerado (a trava de branch recusou `npm run build`, como deve). O exe saiu sem `build-info.json`. A verificação nova o recusa; a antiga, que olha a área de preparação, não tem como saber.

Também: `/health/build` NÃO prova o conteúdo servido. O backend devolve as variáveis `SMARTLEARN_BUILD_*` que o próprio launcher (ou o teste) definiu. A jornada nativa já compensava lendo o `build-info.json` ao lado do exe (passo 2); o N7 não fazia isso e agora faz.

## 3. Candidato (pronto, testado, não aplicado ao launcher)
- `scripts/desktop-identity.mjs`: lê `<pasta do exe>/dist-runtime/build-info.json` e compara o `inputsHash` com o esperado. Falha fechada: arquivo ausente, JSON ilegível, `inputsHash` vazio ou esperado vazio são recusas, nunca aprovação. CLI: `node scripts/desktop-identity.mjs <exe> [--expected <hash>]`, código 0 ou 1, uma linha JSON com os dois hashes e o motivo.
- `test/desktop-served-identity.test.js`: 4 testes (aceita o conteúdo certo; recusa o velho nomeando os dois hashes e o commit; fail closed nos 4 casos de arquivo ruim e esperado vazio; lê só o arquivo ao lado do exe).
- `scripts/desktop-nav-n7.mjs` agora recusa (código 2) um exe que não serve o conteúdo atual, antes de abri-lo. Prova com dados descartáveis: recusou o exe sem `build-info.json` e o release de 06/11; abriu e passou 6/6 com o exe que serve o conteúdo esperado, banco humano intocado.

## 4. Mudança proposta ao launcher (aplicar só com aprovação)
Depois da verificação da área de preparação e antes de abrir, em `launch-desktop-dev.ps1`:

```powershell
$served = (node scripts/desktop-identity.mjs $devExe --expected $identity.inputsHash 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { Fail "O executavel nao serve o conteudo atual. $served Nada foi aberto." }
```

Atalhos (decisão do dono):
1. "SmartLearn Oficial": apontar para o launcher em vez do `.exe` direto, ou aceitar que ele pode abrir um exe velho. Hoje é release de 06/11.
2. "SmartLearn DEV": o destino (`...\.claude\worktrees\smartlearn-v1-complete\scripts\launch-desktop-dev.ps1`) é uma pasta vazia; reapontar para a worktree em uso.

## 5. O que continua dependendo do dono
- Qual branch o launcher e o guardrail devem exigir (hoje `claude/smartlearn-v1-complete`, e o trabalho está em `codex/restore-pdf-parity`). A mudança acima funciona com qualquer das duas respostas; ela troca "qual nome de branch" por "qual conteúdo", mas só se o dono aprovar remover a trava por nome.
- Banco humano: nada foi aberto. Migrações 035 a 040 continuam condicionadas a backup e autorização.
