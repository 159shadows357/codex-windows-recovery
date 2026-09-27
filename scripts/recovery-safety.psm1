Set-StrictMode -Version Latest

function Test-RecoveryPackage {
    param([Parameter(Mandatory)]$Package)
    if ($Package.Name -ne 'OpenAI.Codex' -or [string]$Package.Version -ne '26.924.2738.0' -or [string]$Package.Status -ne 'Ok' -or -not $Package.InstallLocation -or -not $Package.PackageFamilyName) {
        throw 'Refused: requires installed OpenAI.Codex 26.924.2738.0 with Status=Ok.'
    }
}

function Get-RecoveryMainProcess {
    param([Parameter(Mandatory)]$Package, [AllowEmptyCollection()][array]$Processes)
    Test-RecoveryPackage $Package
    $expectedPath = Join-Path $Package.InstallLocation 'app\ChatGPT.exe'
    if ($Processes | Where-Object {
        $_.Name -eq 'ChatGPT.exe' -and $_.ExecutablePath -ne $expectedPath -and
        $_.CommandLine -notmatch '(?:^|\s)"?--type(?:=|\s)'
    }) { throw 'Refused: another ChatGPT main process is running. Quit it manually before recovery.' }
    $main = @($Processes | Where-Object {
        $_.Name -eq 'ChatGPT.exe' -and $_.ExecutablePath -eq $expectedPath -and
        $_.CommandLine -and $_.CommandLine -notmatch '(?:^|\s)"?--type(?:=|\s)'
    })
    if ($main.Count -gt 1) { throw 'Refused: more than one installed main app process.' }
    return $main
}

function Test-RecoveryEndpoint {
    param(
        [Parameter(Mandatory)]$Package,
        [AllowEmptyCollection()][array]$Processes,
        [AllowEmptyCollection()][array]$Listeners,
        [ValidateRange(1024,65535)][int]$Port,
        [int]$ExpectedProcessId = 0
    )
    $main = @(Get-RecoveryMainProcess -Package $Package -Processes $Processes)
    if ($main.Count -ne 1) { throw 'Refused: cannot identify the installed main app process.' }
    $app = $main[0]
    if ($ExpectedProcessId -and $app.ProcessId -ne $ExpectedProcessId) { throw 'Refused: app process changed.' }
    if ($app.CommandLine -match '(?:^|\s)"?--(?:user-data-dir|profile-directory|incognito)(?:=|\s|"|$)' -or
        $app.CommandLine -notmatch ('(?:^|\s)"?--remote-debugging-port=' + $Port + '"?(?:\s|$)')) {
        throw 'Refused: running app does not use the supported diagnostic launch/default profile. Quit Codex manually, then run the launcher again.'
    }
    if ($Listeners.Count -eq 0) { throw 'Refused: no diagnostic listener. Quit Codex manually, then run the launcher again.' }
    foreach ($listener in $Listeners) {
        if ($listener.LocalPort -ne $Port -or $listener.LocalAddress -notin @('127.0.0.1','::1') -or $listener.OwningProcess -ne $app.ProcessId) {
            throw 'Refused: diagnostic listener is not loopback-only and owned by the installed main app.'
        }
    }
    if (-not ($Listeners | Where-Object LocalAddress -eq '127.0.0.1')) { throw 'Refused: required IPv4 loopback listener is absent.' }
    return [pscustomobject]@{ ProcessId = [int]$app.ProcessId; Version = [string]$Package.Version; Port = $Port }
}

function Test-RecoveryAppshotProcess {
    param($Process, [int]$MainProcessId, [string]$RuntimeRoot, [string]$InstalledHash, [string]$RuntimeHash)
    $suffix = '\bin\node_modules\@oai\sky\bin\windows\swift\x64\codex-computer-use-swift.exe'
    $expectedPattern = '^' + [regex]::Escape($RuntimeRoot.TrimEnd('\')) + '\\[a-fA-F0-9]{16}' + [regex]::Escape($suffix) + '$'
    if ($Process.Name -ne 'codex-computer-use-swift.exe' -or $Process.ParentProcessId -ne $MainProcessId -or
        $Process.CommandLine -notmatch ('(?:^|\s)"?--parent-pid(?:=|\s)' + $MainProcessId + '"?(?:\s|$)') -or
        $Process.ExecutablePath -notmatch $expectedPattern -or $InstalledHash -notmatch '^[A-Fa-f0-9]{64}$' -or $RuntimeHash -ne $InstalledHash) {
        throw 'Refused: Swift helper identity or package binary match is invalid.'
    }
}

Export-ModuleMember -Function Test-RecoveryPackage, Get-RecoveryMainProcess, Test-RecoveryEndpoint, Test-RecoveryAppshotProcess
