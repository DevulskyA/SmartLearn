[CmdletBinding()]
param(
    [string]$Destination = (Join-Path $env:USERPROFILE 'OneDrive\AI-Environment-Backups')
)

$ErrorActionPreference = 'Stop'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = Join-Path $Destination $stamp
New-Item -ItemType Directory -Path $backup -Force | Out-Null

function Copy-Folder([string]$Source, [string]$RelativeDestination) {
    if (-not (Test-Path -LiteralPath $Source)) { return }
    $target = Join-Path $backup $RelativeDestination
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    Copy-Item -Path (Join-Path $Source '*') -Destination $target -Recurse -Force -ErrorAction SilentlyContinue
}

function Write-SafeText([string]$Source, [string]$RelativeDestination) {
    if (-not (Test-Path -LiteralPath $Source)) { return }
    $target = Join-Path $backup $RelativeDestination
    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
    $text = Get-Content -LiteralPath $Source -Raw
    $text = $text -replace '(?im)^([^#\r\n]*(?:token|secret|password|passwd|api[_-]?key|auth)[^=\r\n]*=).*$', '$1<REDACTED>'
    Set-Content -LiteralPath $target -Value $text -Encoding UTF8
}

# Conteúdo restaurável: skills locais e compartilhadas.
Copy-Folder "$env:USERPROFILE\.codex\skills" 'skills\codex'
Copy-Folder "$env:USERPROFILE\.claude\skills" 'skills\claude'
Copy-Folder "$env:USERPROFILE\.agents\skills" 'skills\shared'
Copy-Folder 'C:\Projetos\SmartLearn\.agents\skills' 'skills\smartlearn'

# Plugin local/customizado; caches e marketplaces remotos ficam fora.
Copy-Folder "$env:USERPROFILE\.claude\local-plugins" 'plugins\claude-local'

# Regras e configuração não-secreta, com campos sensíveis mascarados.
Write-SafeText "$env:USERPROFILE\.gemini\GEMINI.md" 'config\GEMINI.md'
Write-SafeText "$env:USERPROFILE\.claude\CLAUDE.md" 'config\CLAUDE.md'
Write-SafeText "$env:USERPROFILE\.claude\AGENTS.md" 'config\CLAUDE-AGENTS.md'
Write-SafeText "$env:USERPROFILE\.claude\settings.json" 'config\claude-settings.json'
Write-SafeText "$env:USERPROFILE\.codex\config.toml" 'config\codex-config.toml'
Write-SafeText "$env:USERPROFILE\.codex\hooks.json" 'config\codex-hooks.json'

# Inventários oficiais dos plugins, sem credenciais/sessões.
claude plugin list | Set-Content (Join-Path $backup 'claude-plugins.txt') -Encoding UTF8
codex plugin list --json | Set-Content (Join-Path $backup 'codex-plugins.json') -Encoding UTF8
codex plugin marketplace list | Set-Content (Join-Path $backup 'codex-marketplaces.txt') -Encoding UTF8

# Catálogo de todas as skills detectadas, com hash para auditoria.
$roots = @(
    "$env:USERPROFILE\.codex\skills",
    "$env:USERPROFILE\.claude\skills",
    "$env:USERPROFILE\.agents\skills",
    'C:\Projetos\SmartLearn\.agents\skills',
    "$env:USERPROFILE\.codex\plugins",
    "$env:USERPROFILE\.claude\plugins"
)
$skills = foreach ($root in $roots) {
    if (Test-Path -LiteralPath $root) {
        Get-ChildItem -LiteralPath $root -Recurse -File -Filter 'SKILL.md' -ErrorAction SilentlyContinue | ForEach-Object {
            $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
            [pscustomobject]@{ Path = $_.FullName; SHA256 = $hash; Bytes = $_.Length }
        }
    }
}
$skills | Sort-Object Path -Unique | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $backup 'skills-inventory.json') -Encoding UTF8

$manifest = [ordered]@{
    CreatedAt = (Get-Date).ToString('o')
    Computer = $env:COMPUTERNAME
    User = $env:USERNAME
    BackupType = 'skills-and-plugin-reinstall-manifest'
    SecretFilesExcluded = @('auth.json', '.credentials.json', '.claude.json', 'sessions', 'history', 'databases')
    Sources = @(
        "$env:USERPROFILE\.codex\skills",
        "$env:USERPROFILE\.claude\skills",
        "$env:USERPROFILE\.agents\skills",
        'C:\Projetos\SmartLearn\.agents\skills'
    )
    SkillCount = @($skills | Sort-Object Path -Unique).Count
    RestoreNotes = 'Reinstalar Codex/Claude, copiar skills locais, executar os catálogos de plugins e refazer login. Não restaurar credenciais.'
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $backup 'MANIFEST.json') -Encoding UTF8

Copy-Item -LiteralPath $PSCommandPath -Destination (Join-Path $backup 'backup-ai-environment.ps1') -Force
@'
# Restauração do ambiente Codex + Claude

1. Instale Node.js, Git, Codex CLI e Claude Code.
2. Refaça login nos dois programas.
3. Copie as pastas de `skills\` deste backup para os destinos:
   - `codex` -> `$env:USERPROFILE\.codex\skills`
   - `claude` -> `$env:USERPROFILE\.claude\skills`
   - `shared` -> `$env:USERPROFILE\.agents\skills`
   - `smartlearn` -> `C:\Projetos\SmartLearn\.agents\skills`
4. Use `claude-plugins.txt` e `codex-plugins.json` como catálogo de plugins.
   Plugins remotos devem ser reinstalados pelos próprios marketplaces; não copie credenciais.
5. Recupere as regras em `config\` somente depois de revisar os campos mascarados.

Este backup preserva skills, versões/status de plugins e regras. Não preserva autenticação,
sessões, histórico ou bancos locais por segurança.
'@ | Set-Content (Join-Path $backup 'RESTORE.md') -Encoding UTF8

Write-Output "BACKUP=$backup"
Write-Output "SKILLS=$($manifest.SkillCount)"
