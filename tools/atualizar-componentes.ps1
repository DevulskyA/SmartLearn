[CmdletBinding()]
param(
    [switch]$InventoryOnly,
    [switch]$SelfTest,
    [switch]$Console,
    [string[]]$SearchRoot
)

$ErrorActionPreference = 'Stop'

function Get-ExistingRoots {
    $defaults = @(
        (Join-Path $env:USERPROFILE '.agents\skills'),
        (Join-Path $env:USERPROFILE '.codex\skills'),
        (Join-Path $env:USERPROFILE '.claude\plugins\marketplaces'),
        (Join-Path $env:USERPROFILE '.codex\vendor_imports\skills')
    )

    $roots = if ($SearchRoot) { $SearchRoot } else { $defaults }
    @($roots | ForEach-Object {
        if (Test-Path -LiteralPath $_ -PathType Container) {
            (Resolve-Path -LiteralPath $_).Path
        }
    } | Sort-Object -Unique)
}

function Find-GitRoot([string]$Path) {
    try {
        $root = (& git -C $Path rev-parse --show-toplevel 2>$null)
        if ($LASTEXITCODE -eq 0 -and $root) {
            return (($root.Trim() -replace '/', '\'))
        }
    } catch { }
    return $null
}

function Test-ProtectedRepository([string]$Path, [string[]]$ProtectedRoots) {
    if ([string]::IsNullOrWhiteSpace($Path)) { return $false }
    $normalized = ($Path -replace '/', '\').TrimEnd('\')
    foreach ($protected in $ProtectedRoots) {
        if ($normalized -ieq ($protected -replace '/', '\').TrimEnd('\')) { return $true }
    }
    if ($normalized -match '(?i)(^|\\)SmartLearn(\\|$)') { return $true }
    $remote = (& git -C $Path remote get-url origin 2>$null)
    if ($LASTEXITCODE -eq 0 -and $remote -match '(?i)(github\.com[/:])DevulskyA([/:])') { return $true }
    return $false
}

function Find-ContainingRepository([string]$Path, [string[]]$RepositoryRoots) {
    if ([string]::IsNullOrWhiteSpace($Path)) { return $null }
    $normalizedPath = ($Path -replace '/', '\').TrimEnd('\')
    foreach ($repository in @($RepositoryRoots | Sort-Object { $_.Length } -Descending)) {
        $normalizedRepository = ($repository -replace '/', '\').TrimEnd('\')
        if ($normalizedPath -ieq $normalizedRepository -or $normalizedPath.StartsWith("$normalizedRepository\", [System.StringComparison]::OrdinalIgnoreCase)) {
            return $repository
        }
    }
    return $null
}

function Get-Inventory([string[]]$Roots, [string[]]$ProtectedRoots) {
    $repos = @{}
    $skills = @{}

    foreach ($root in $Roots) {
        $dirs = @()
        try {
            $dirs = @(Get-ChildItem -LiteralPath $root -Directory -Recurse -Depth 3 -Force -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -notin @('node_modules', '.git', 'dist', 'target', 'cache') })
        } catch { Write-Warning "Não foi possível ler ${root}: $($_.Exception.Message)" }

        $paths = @($root) + @($dirs | ForEach-Object FullName)
        $repositoryRoots = @{}
        $gitRoot = Find-GitRoot $root
        if ($gitRoot) { $repositoryRoots[$gitRoot] = $gitRoot }
        foreach ($dir in $paths) {
            if (Test-Path -LiteralPath (Join-Path $dir '.git')) {
                $resolvedDir = ((Resolve-Path -LiteralPath $dir).Path -replace '/', '\')
                $repositoryRoots[$resolvedDir] = $resolvedDir
            }
        }

        # Descoberta de identidade/ownership uma vez por repositório. Antes,
        # cada SKILL.md repetia rev-parse e remote get-url, o que tornava a
        # abertura do inventário proporcional ao número de skills.
        $repositoryInfo = @{}
        foreach ($repository in @($repositoryRoots.Values | Sort-Object -Unique)) {
            $isProtected = Test-ProtectedRepository $repository $ProtectedRoots
            $repositoryInfo[$repository] = $isProtected
            if (-not $isProtected) { $repos[$repository] = $repository }
        }

        foreach ($dir in $paths) {
            $skillFile = Join-Path $dir 'SKILL.md'
            if (Test-Path -LiteralPath $skillFile -PathType Leaf) {
                $skillPath = (Resolve-Path -LiteralPath $dir).Path
                $skillRepo = Find-ContainingRepository $skillPath @($repositoryRoots.Values)
                $skills[$skillPath] = [pscustomobject]@{
                    Name = Split-Path $skillPath -Leaf
                    Path = $skillPath
                    Repo = if ($skillRepo -and $repositoryInfo[$skillRepo]) { $null } else { $skillRepo }
                }
            }
        }
    }

    [pscustomobject]@{
        Repositories = @($repos.Values | Sort-Object)
        Skills = @($skills.Values | Sort-Object Name, Path)
    }
}

function Show-Inventory($Inventory) {
    Write-Host "`nRepositórios externos atualizáveis: $($Inventory.Repositories.Count)" -ForegroundColor Cyan
    foreach ($repo in $Inventory.Repositories) { Write-Host "  - $repo" }

    $unmatchedSkills = @($Inventory.Skills | Where-Object { -not $_.Repo })
    Write-Host "`nSkills sem contrapartida de atualização: $($unmatchedSkills.Count)" -ForegroundColor Yellow
    foreach ($skill in $unmatchedSkills) {
        Write-Host "  - $($skill.Name) [$($skill.Path)]"
    }
}

function Select-Items($Items, [string]$Title) {
    if (-not $Items) { Write-Host "Nenhum item encontrado para $Title." -ForegroundColor Yellow; return @() }
    Write-Host "`n$Title" -ForegroundColor Cyan
    for ($i = 0; $i -lt $Items.Count; $i++) {
        $label = if ($Items[$i].Path) { $Items[$i].Path } else { $Items[$i] }
        Write-Host ("[{0}] {1}" -f ($i + 1), $label)
    }
    $answer = (Read-Host 'Digite A para todos, números separados por vírgula, ou 0 para cancelar').Trim()
    if ($answer -eq '0' -or [string]::IsNullOrWhiteSpace($answer)) { return @() }
    if ($answer -match '^(?i)a$') { return @($Items) }

    $selected = @()
    foreach ($token in $answer -split ',') {
        $index = 0
        if ([int]::TryParse($token.Trim(), [ref]$index) -and $index -ge 1 -and $index -le $Items.Count) {
            $selected += $Items[$index - 1]
        } else { Write-Warning "Seleção inválida: $token" }
    }
    @($selected | Select-Object -Unique)
}

function Update-Repository([string]$Path) {
    $status = (& git -C $Path status --porcelain 2>&1)
    if ($LASTEXITCODE -ne 0) { return "ERRO: status Git falhou" }
    if ($status) { return 'IGNORADO: working tree contém alterações locais' }
    $branch = (& git -C $Path symbolic-ref --short -q HEAD 2>$null)
    if (-not $branch) { return 'IGNORADO: repositório está em detached HEAD' }

    $pullOutput = @(& git -C $Path pull --ff-only 2>&1 | ForEach-Object { [string]$_ })
    $pullExit = $LASTEXITCODE
    if ($pullExit -eq 0) { return "OK: $branch atualizado" }
    $detail = (($pullOutput | Select-Object -Last 3) -join ' | ')
    return "ERRO: pull --ff-only falhou; $detail"
}

function Update-SelectedRepositories($Items) {
    foreach ($item in @($Items)) { "[$item] $(Update-Repository $item)" }
}

function Update-SelectedSkills($Items) {
    $withRepo = @($Items | Where-Object Repo | Group-Object Repo | ForEach-Object { $_.Group[0] })
    if ($withRepo) {
        Update-SelectedRepositories @($withRepo.Repo | Sort-Object -Unique)
    }
}

function Invoke-SelfTest {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'git não está disponível no PATH.' }
    $sample = @([pscustomobject]@{ Path = 'sample' }, [pscustomobject]@{ Path = 'other' })
    if ((@($sample | Sort-Object Path -Unique)).Count -ne 2) { throw 'Falha no self-test de seleção.' }
    $currentRepo = Find-GitRoot (Join-Path $PSScriptRoot '..')
    if (-not (Test-ProtectedRepository $currentRepo @($currentRepo))) { throw 'O workspace do SmartLearn não está protegido.' }
    if (-not (Test-ProtectedRepository 'C:\Projetos\SmartLearn' @())) { throw 'O projeto SmartLearn fora deste worktree não está protegido.' }
    if (-not (Test-ProtectedRepository 'C:\Projetos\SmartLearn\.claude\worktrees\qualquer' @())) { throw 'Os worktrees do SmartLearn não estão protegidos.' }
    Write-Host 'SELF-TEST OK'
}

function Show-Gui($Inventory, [string[]]$Roots, [string[]]$ProtectedRoots) {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    [System.Windows.Forms.Application]::EnableVisualStyles()

    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'Atualizador de componentes'
    $form.StartPosition = 'CenterScreen'
    $form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::Font
    $form.Size = New-Object System.Drawing.Size(1000, 760)
    $form.MinimumSize = New-Object System.Drawing.Size(900, 720)

    $title = New-Object System.Windows.Forms.Label
    $title.Text = 'Atualizador de componentes'
    $title.Font = New-Object System.Drawing.Font('Segoe UI', 18, [System.Drawing.FontStyle]::Bold)
    $title.Location = New-Object System.Drawing.Point(24, 18)
    $title.AutoSize = $true
    $form.Controls.Add($title)

    $subtitle = New-Object System.Windows.Forms.Label
    $subtitle.Text = 'Somente componentes externos são atualizados. O SmartLearn e seus worktrees ficam protegidos.'
    $subtitle.Location = New-Object System.Drawing.Point(26, 55)
    $subtitle.AutoSize = $true
    $form.Controls.Add($subtitle)

    $tabs = New-Object System.Windows.Forms.TabControl
    $tabs.Location = New-Object System.Drawing.Point(24, 86)
    $tabs.Size = New-Object System.Drawing.Size(936, 390)
    $tabs.Anchor = [System.Windows.Forms.AnchorStyles]::Top -bor [System.Windows.Forms.AnchorStyles]::Left -bor [System.Windows.Forms.AnchorStyles]::Right
    $form.Controls.Add($tabs)

    $repoPage = New-Object System.Windows.Forms.TabPage
    $repoPage.Text = 'Repositórios Git'
    $tabs.TabPages.Add($repoPage)
    $repoList = New-Object System.Windows.Forms.CheckedListBox
    $repoList.Dock = 'Fill'
    $repoList.CheckOnClick = $true
    $repoPage.Controls.Add($repoList)

    $skillPage = New-Object System.Windows.Forms.TabPage
    $skillPage.Text = 'Skills atualizáveis'
    $tabs.TabPages.Add($skillPage)
    $skillList = New-Object System.Windows.Forms.CheckedListBox
    $skillList.Dock = 'Fill'
    $skillList.CheckOnClick = $true
    $skillPage.Controls.Add($skillList)

    $pending = New-Object System.Windows.Forms.TextBox
    $pending.Multiline = $true
    $pending.ReadOnly = $true
    $pending.ScrollBars = 'Vertical'
    $pending.Location = New-Object System.Drawing.Point(24, 490)
    $pending.Size = New-Object System.Drawing.Size(936, 75)
    $pending.Anchor = [System.Windows.Forms.AnchorStyles]::Top -bor [System.Windows.Forms.AnchorStyles]::Left -bor [System.Windows.Forms.AnchorStyles]::Right
    $pending.AccessibleName = 'Skills sem contrapartida de atualização'
    $pending.Text = 'Skills sem contrapartida de atualização serão listadas aqui.'
    $form.Controls.Add($pending)

    $result = New-Object System.Windows.Forms.TextBox
    $result.Multiline = $true
    $result.ReadOnly = $true
    $result.ScrollBars = 'Vertical'
    $result.Location = New-Object System.Drawing.Point(24, 575)
    $result.Size = New-Object System.Drawing.Size(936, 55)
    $result.Anchor = [System.Windows.Forms.AnchorStyles]::Top -bor [System.Windows.Forms.AnchorStyles]::Left -bor [System.Windows.Forms.AnchorStyles]::Right
    $result.AccessibleName = 'Resultado da operação'
    $form.Controls.Add($result)

    $updateRepos = New-Object System.Windows.Forms.Button
    $updateRepos.Text = 'Atualizar repositórios selecionados'
    $updateRepos.Location = New-Object System.Drawing.Point(24, 640)
    $updateRepos.Size = New-Object System.Drawing.Size(220, 30)
    $updateRepos.Anchor = [System.Windows.Forms.AnchorStyles]::Bottom -bor [System.Windows.Forms.AnchorStyles]::Left
    $form.Controls.Add($updateRepos)

    $updateSkills = New-Object System.Windows.Forms.Button
    $updateSkills.Text = 'Atualizar skills selecionadas'
    $updateSkills.Location = New-Object System.Drawing.Point(252, 640)
    $updateSkills.Size = New-Object System.Drawing.Size(205, 30)
    $updateSkills.Anchor = [System.Windows.Forms.AnchorStyles]::Bottom -bor [System.Windows.Forms.AnchorStyles]::Left
    $form.Controls.Add($updateSkills)

    $updateAll = New-Object System.Windows.Forms.Button
    $updateAll.Text = 'Atualizar todos os externos'
    $updateAll.Location = New-Object System.Drawing.Point(465, 640)
    $updateAll.Size = New-Object System.Drawing.Size(205, 30)
    $updateAll.Anchor = [System.Windows.Forms.AnchorStyles]::Bottom -bor [System.Windows.Forms.AnchorStyles]::Left
    $form.Controls.Add($updateAll)

    $refresh = New-Object System.Windows.Forms.Button
    $refresh.Text = 'Atualizar inventário'
    $refresh.Location = New-Object System.Drawing.Point(678, 640)
    $refresh.Size = New-Object System.Drawing.Size(160, 30)
    $refresh.Anchor = [System.Windows.Forms.AnchorStyles]::Bottom -bor [System.Windows.Forms.AnchorStyles]::Left
    $form.Controls.Add($refresh)

    $viewState = [pscustomobject]@{
        Inventory = $Inventory
        RepoItems = @()
        SkillItems = @()
    }
    $refreshView = {
        $repoList.Items.Clear(); $skillList.Items.Clear()
        $viewState.RepoItems = @($viewState.Inventory.Repositories)
        $viewState.SkillItems = @($viewState.Inventory.Skills | Where-Object Repo)
        foreach ($repo in $viewState.RepoItems) { [void]$repoList.Items.Add($repo) }
        foreach ($skill in $viewState.SkillItems) { [void]$skillList.Items.Add("$($skill.Name)  [$($skill.Repo)]") }
        $orphans = @($viewState.Inventory.Skills | Where-Object { -not $_.Repo })
        $pending.Text = "Skills sem contrapartida de atualização: $($orphans.Count)`r`n" + (($orphans | ForEach-Object { "- $($_.Name)  [$($_.Path)]" }) -join "`r`n")
        $result.Text = "Inventário atualizado: $($viewState.RepoItems.Count) repositórios; $($viewState.SkillItems.Count) skills atualizáveis."
    }.GetNewClosure()
    & $refreshView

    $updateRepos.Add_Click(({
        $selected = @($repoList.CheckedItems | ForEach-Object { [string]$_ })
        if (-not $selected) { $result.Text = 'Selecione pelo menos um repositório.'; return }
        $messages = foreach ($item in $selected) { "[$item] $(Update-Repository $item)" }
        $result.Text = $messages -join "`r`n"
    }).GetNewClosure())
    $updateSkills.Add_Click(({
        $selected = @($skillList.CheckedIndices | ForEach-Object { $viewState.SkillItems[$_] })
        if (-not $selected) { $result.Text = 'Selecione pelo menos uma skill atualizável.'; return }
        $result.Text = (Update-SelectedSkills $selected) -join "`r`n"
    }).GetNewClosure())
    $updateAll.Add_Click(({
        $confirmation = [System.Windows.Forms.MessageBox]::Show("Atualizar $($viewState.RepoItems.Count) repositórios? Repositórios com alterações locais serão ignorados.", 'Confirmar atualização em lote', 'YesNo', 'Warning')
        if ($confirmation -ne 'Yes') { return }
        $messages = foreach ($repo in $viewState.RepoItems) { "[$repo] $(Update-Repository $repo)" }
        $result.Text = $messages -join "`r`n"
    }).GetNewClosure())
    $refresh.Add_Click(({
        $viewState.Inventory = Get-Inventory $Roots $ProtectedRoots
        & $refreshView
    }).GetNewClosure())

    [void]$form.ShowDialog()
}

$roots = Get-ExistingRoots
$protectedRoots = @((Find-GitRoot (Join-Path $PSScriptRoot '..')))
if ($SelfTest) { Invoke-SelfTest; exit 0 }
$inventory = Get-Inventory $roots $protectedRoots
if ($InventoryOnly) { Show-Inventory $inventory; exit 0 }

if (-not $Console) {
    try { Show-Gui $inventory $roots $protectedRoots; exit 0 }
    catch { Write-Warning "Interface gráfica indisponível: $($_.Exception.Message). Usando o modo console." }
}

$running = $true
do {
    Write-Host "`n=== Atualizador de componentes ===" -ForegroundColor Green
    Write-Host '[1] Atualizar repositórios externos'
    Write-Host '[2] Atualizar skills (uma a uma ou todas)'
    Write-Host '[3] Atualizar tudo que for atualizável'
    Write-Host '[4] Mostrar inventário'
    Write-Host '[0] Sair'
    $choice = (Read-Host 'Escolha').Trim()
    switch ($choice) {
        '1' { Update-SelectedRepositories (Select-Items $inventory.Repositories 'Repositórios') | ForEach-Object { Write-Host $_ } }
        '2' { Update-SelectedSkills (Select-Items @($inventory.Skills | Where-Object Repo) 'Skills atualizáveis') | ForEach-Object { Write-Host $_ } }
        '3' {
            $confirm = (Read-Host "Atualizar $($inventory.Repositories.Count) repositórios externos? Digite SIM para confirmar").Trim()
            if ($confirm -ceq 'SIM') { Update-SelectedRepositories $inventory.Repositories | ForEach-Object { Write-Host $_ } }
            else { Write-Host 'Atualização em lote cancelada.' }
        }
        '4' { Show-Inventory $inventory }
        '0' { $running = $false }
        default { Write-Warning 'Opção inválida.' }
    }
} while ($running)

