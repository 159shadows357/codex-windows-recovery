[CmdletBinding()]
param(
    [ValidateSet('Inspect','WaitExit')][string]$Mode = 'Inspect',
    [Parameter(Mandatory)][ValidateRange(1,2147483647)][int]$MainProcessId,
    [ValidateRange(1024,65535)][int]$Port = 9337,
    [int]$HelperProcessId = 0,
    [string]$HelperCreatedAt
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'recovery-safety.psm1') -Force
try {
    $packages = @(Get-AppxPackage -Name OpenAI.Codex)
    if ($packages.Count -ne 1) { throw 'Refused: expected one installed package.' }
    $package = $packages[0]
    $processes = @(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'")
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
    Test-RecoveryEndpoint -Package $package -Processes $processes -Listeners $listeners -Port $Port -ExpectedProcessId $MainProcessId | Out-Null
    if ($Mode -eq 'WaitExit') {
        if ($HelperProcessId -le 0 -or -not $HelperCreatedAt) { throw 'Missing original helper identity.' }
        $handle = Get-Process -Id $HelperProcessId -ErrorAction SilentlyContinue
        if (-not $handle -or $handle.StartTime.ToUniversalTime().ToString('O') -ne $HelperCreatedAt) {
            '{"exited":true}'
            exit 0
        }
        $helpers = @(Get-CimInstance Win32_Process -Filter "ProcessId=$HelperProcessId")
    } else {
        $helpers = @(Get-CimInstance Win32_Process -Filter "Name='codex-computer-use-swift.exe' AND ParentProcessId=$MainProcessId")
    }
    if ($helpers.Count -ne 1) { throw 'Refused: expected exactly one Appshot helper.' }
    $helper = $helpers[0]
    $suffix = 'bin\node_modules\@oai\sky\bin\windows\swift\x64\codex-computer-use-swift.exe'
    $installed = Join-Path $package.InstallLocation ('app\resources\cua_node\' + $suffix)
    $installedHash = (Get-FileHash -LiteralPath $installed -Algorithm SHA256).Hash
    $runtimeHash = (Get-FileHash -LiteralPath $helper.ExecutablePath -Algorithm SHA256).Hash
    Test-RecoveryAppshotProcess -Process $helper -MainProcessId $MainProcessId -RuntimeRoot (Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\runtimes\cua_node') -InstalledHash $installedHash -RuntimeHash $runtimeHash
    if ($Mode -eq 'WaitExit') {
        if (-not $handle.WaitForExit(8000)) { throw 'Original Appshot helper did not exit within eight seconds.' }
        '{"exited":true}'
    } else {
        $handle = Get-Process -Id $helper.ProcessId
        [pscustomobject]@{ ProcessId = [int]$helper.ProcessId; CreatedAt = $handle.StartTime.ToUniversalTime().ToString('O') } | ConvertTo-Json -Compress
    }
    exit 0
} catch {
    [Console]::Error.WriteLine((Get-RecoverySafeErrorMessage $_.Exception.Message))
    exit 1
}
