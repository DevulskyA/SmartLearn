# Verifica (sem atualizar, sem IA) se existe versão nova do ECC. Só lê e avisa.
# Rodado pela tarefa agendada "ECC-update-check" (diária, sem janela).
# Registro e estado ficam ao lado deste arquivo, em *.log (ignorados pelo Git).
$ErrorActionPreference = 'Stop'
$log = Join-Path $PSScriptRoot 'ecc-update-check.log'
function Log($m) { "$(Get-Date -Format 's') $m" | Add-Content -Path $log -Encoding UTF8 }
try {
    Set-Location (Split-Path $PSScriptRoot -Parent)
    $txt = (claude plugin list 2>&1 | Out-String)
    if ($txt -notmatch '(?s)ecc@ecc\s+Version:\s*(\S+)') { Log 'ecc@ecc nao encontrado'; exit 2 }
    $installed = $Matches[1]
    $latest = (npm view ecc-universal version 2>&1 | Out-String).Trim()
    if ($latest -notmatch '^\d+\.\d+\.\d+$') { Log "npm retornou algo inesperado: $latest"; exit 3 }
    if ([version]$latest -gt [version]$installed) {
        Log "ATUALIZACAO DISPONIVEL: instalado $installed, novo $latest"
        # Avisa uma vez por versão nova; nos outros dias só registra no log.
        $seen = Join-Path $PSScriptRoot 'ecc-update-notified.log'
        if ((Test-Path $seen) -and ((Get-Content $seen -Raw).Trim() -eq $latest)) { exit 0 }
        Set-Content -Path $seen -Value $latest
        $msg = "ECC $installed -> $latest disponível. Nada foi atualizado."
        [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
        $x = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent('ToastText02')
        $n = $x.GetElementsByTagName('text')
        [void]$n.Item(0).AppendChild($x.CreateTextNode('ECC: atualização disponível'))
        [void]$n.Item(1).AppendChild($x.CreateTextNode($msg))
        [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Claude Code').Show([Windows.UI.Notifications.ToastNotification]::new($x))
    } else {
        Log "em dia: $installed (npm $latest)"
    }
} catch { Log "erro: $($_.Exception.Message)"; exit 1 }
