$ErrorActionPreference = 'Stop'
$module = Join-Path $PSScriptRoot '..\scripts\recovery-safety.psm1'
if (-not (Test-Path -LiteralPath $module)) { throw 'Safety module is not implemented yet' }
Import-Module $module -Force

function Assert-Refused([scriptblock]$Action, [string]$Name) {
    try { & $Action | Out-Null } catch { Write-Host "PASS: $Name"; return }
    throw "FAIL: $Name was accepted"
}

$package = [pscustomobject]@{ Name = 'OpenAI.Codex'; Version = '26.924.2738.0'; Status = 'Ok'; InstallLocation = 'C:\Program Files\WindowsApps\OpenAI.Codex_26.924.2738.0_x64__test'; PackageFamilyName = 'OpenAI.Codex_test' }
$expectedPath = Join-Path $package.InstallLocation 'app\ChatGPT.exe'
$app = [pscustomobject]@{ ProcessId = 1234; Name = 'ChatGPT.exe'; ExecutablePath = $expectedPath; CommandLine = ('"' + $expectedPath + '" --remote-debugging-port=9337 --remote-debugging-address=127.0.0.1') }
$listener = [pscustomobject]@{ LocalAddress = '127.0.0.1'; LocalPort = 9337; OwningProcess = 1234 }
$result = Test-RecoveryEndpoint -Package $package -Processes @($app) -Listeners @($listener) -Port 9337
if ($result.ProcessId -ne 1234) { throw 'FAIL: valid owner was rejected' }
Write-Host 'PASS: correct installed main process owns loopback endpoint'

foreach ($field in @('Version', 'Status', 'Name')) {
    $bad = $package.PSObject.Copy(); $bad.$field = 'wrong'
    Assert-Refused { Test-RecoveryEndpoint -Package $bad -Processes @($app) -Listeners @($listener) -Port 9337 } "wrong package $field"
}
foreach ($change in @(
    @{ LocalAddress = '0.0.0.0' }, @{ LocalAddress = '::' },
    @{ OwningProcess = 2222 }, @{ LocalPort = 9222 }
)) {
    $bad = $listener.PSObject.Copy(); foreach ($key in $change.Keys) { $bad.$key = $change[$key] }
    Assert-Refused { Test-RecoveryEndpoint -Package $package -Processes @($app) -Listeners @($bad) -Port 9337 } 'unsafe listener refused'
}
foreach ($commandLine in @(
    'ChatGPT.exe --type=renderer --remote-debugging-port=9337',
    'ChatGPT.exe --remote-debugging-port=9337 --user-data-dir=C:\temp',
    'ChatGPT.exe --remote-debugging-port=9337 "--user-data-dir=C:\temp"',
    'ChatGPT.exe --remote-debugging-port=9337 "--profile-directory=Test"',
    'ChatGPT.exe --remote-debugging-port=9337 "--incognito"',
    'ChatGPT.exe', ''
)) {
    $bad = $app.PSObject.Copy(); $bad.CommandLine = $commandLine
    Assert-Refused { Test-RecoveryEndpoint -Package $package -Processes @($bad) -Listeners @($listener) -Port 9337 } 'wrong process or profile refused'
}
$bad = $app.PSObject.Copy(); $bad.ExecutablePath = 'C:\temp\ChatGPT.exe'
Assert-Refused { Test-RecoveryEndpoint -Package $package -Processes @($bad) -Listeners @($listener) -Port 9337 } 'wrong executable refused'
Assert-Refused { Test-RecoveryEndpoint -Package $package -Processes @($app, $app) -Listeners @($listener) -Port 9337 } 'ambiguous main process refused'
Assert-Refused { Test-RecoveryEndpoint -Package $package -Processes @($app) -Listeners @() -Port 9337 } 'missing listener refused'
Assert-Refused { Test-RecoveryEndpoint -Package $package -Processes @($app) -Listeners @($listener) -Port 9337 -ExpectedProcessId 9999 } 'stale expected process refused'
$oldApp = $app.PSObject.Copy(); $oldApp.ExecutablePath = 'C:\Program Files\WindowsApps\OldBuild\app\ChatGPT.exe'
Assert-Refused { Get-RecoveryMainProcess -Package $package -Processes @($oldApp) } 'old main process blocks a new launch'

$runtimeRoot = 'C:\Users\fixture\AppData\Local\OpenAI\Codex\runtimes\cua_node'
$swift = [pscustomobject]@{ Name = 'codex-computer-use-swift.exe'; ProcessId = 4321; ParentProcessId = 1234; CommandLine = 'codex-computer-use-swift.exe --parent-pid 1234'; ExecutablePath = ($runtimeRoot + '\b63ee7ee40c23b77\bin\node_modules\@oai\sky\bin\windows\swift\x64\codex-computer-use-swift.exe') }
$digest = 'A' * 64
Test-RecoveryAppshotProcess -Process $swift -MainProcessId 1234 -RuntimeRoot $runtimeRoot -InstalledHash $digest -RuntimeHash $digest | Out-Null
Write-Host 'PASS: copied Swift helper requires parent, runtime path and matching package hash'
foreach ($change in @(
    @{ ParentProcessId = 5555 }, @{ CommandLine = 'codex-computer-use-swift.exe --parent-pid 5555' },
    @{ ExecutablePath = 'C:\temp\codex-computer-use-swift.exe' }, @{ Name = 'other.exe' }
)) {
    $bad = $swift.PSObject.Copy(); foreach ($key in $change.Keys) { $bad.$key = $change[$key] }
    Assert-Refused { Test-RecoveryAppshotProcess -Process $bad -MainProcessId 1234 -RuntimeRoot $runtimeRoot -InstalledHash $digest -RuntimeHash $digest } 'foreign Swift helper refused'
}
Assert-Refused { Test-RecoveryAppshotProcess -Process $swift -MainProcessId 1234 -RuntimeRoot $runtimeRoot -InstalledHash $digest -RuntimeHash ('B' * 64) } 'mismatched helper binary refused'
