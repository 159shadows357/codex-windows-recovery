[CmdletBinding()]
param(
    [ValidateSet('StartOrRecover','RecoverOnly','CheckEndpoint')][string]$Mode = 'StartOrRecover',
    [ValidateRange(1024,65535)][int]$Port = 9337,
    [ValidateRange(10,240)][int]$TimeoutSeconds = 180,
    [int]$ExpectedProcessId = 0
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'recovery-safety.psm1') -Force

try {
    $started = [Diagnostics.Stopwatch]::StartNew()
    $newLaunch = $false
    if ($env:CODEX_ELECTRON_USER_DATA_PATH) { throw 'Refused: a profile override is present in this shell. Use a shell without that override.' }
    $packages = @(Get-AppxPackage -Name OpenAI.Codex)
    if ($packages.Count -ne 1) { throw 'Refused: expected one installed OpenAI.Codex package.' }
    $package = $packages[0]
    Test-RecoveryPackage $package
    $processes = @(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'")
    $main = @(Get-RecoveryMainProcess -Package $package -Processes $processes)
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)

    if ($Mode -eq 'CheckEndpoint') {
        Test-RecoveryEndpoint -Package $package -Processes $processes -Listeners $listeners -Port $Port -ExpectedProcessId $ExpectedProcessId | ConvertTo-Json -Compress
        exit 0
    }

    $node = Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1
    $nodeVersion = & $node.Source --version
    if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v24\.') { throw 'Refused: Node.js 24 must already be installed; no software is installed by this launcher.' }

    if ($main.Count -eq 0) {
        if ($Mode -eq 'RecoverOnly') { throw 'Refused: Codex is not running. Use StartOrRecover to launch it.' }
        if ($listeners.Count) { throw 'Refused: diagnostic port is already occupied.' }
        if ($processes | Where-Object ExecutablePath -eq (Join-Path $package.InstallLocation 'app\ChatGPT.exe')) { throw 'Refused: app child processes remain. Quit Codex manually before starting.' }
        $manifest = Get-AppxPackageManifest -Package $package.PackageFullName
        if (-not ($manifest.Package.Applications.Application | Where-Object Id -eq 'App')) { throw 'Refused: expected packaged App entry is absent.' }
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[ComImport, Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
class ApplicationActivationManager {}
[ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IApplicationActivationManager {
  [PreserveSig] int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string appId, [MarshalAs(UnmanagedType.LPWStr)] string arguments, uint options, out uint processId);
  [PreserveSig] int ActivateForFile(IntPtr itemArray, string verb, out uint processId);
  [PreserveSig] int ActivateForProtocol(IntPtr itemArray, out uint processId);
}
public static class RecoveryPackagedActivation {
  public static uint Launch(string appId, string args) {
    uint processId;
    var manager = (IApplicationActivationManager)new ApplicationActivationManager();
    Marshal.ThrowExceptionForHR(manager.ActivateApplication(appId, args, 0, out processId));
    return processId;
  }
}
'@
        $ExpectedProcessId = [int][RecoveryPackagedActivation]::Launch(($package.PackageFamilyName + '!App'), "--remote-debugging-port=$Port --remote-debugging-address=127.0.0.1")
        $newLaunch = $true
        do {
            Start-Sleep -Milliseconds 250
            $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
        } while ($listeners.Count -eq 0 -and $started.Elapsed.TotalSeconds -lt [Math]::Min(15, $TimeoutSeconds))
        $processes = @(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'")
    }

    $endpoint = Test-RecoveryEndpoint -Package $package -Processes $processes -Listeners $listeners -Port $Port -ExpectedProcessId $ExpectedProcessId
    $remaining = [int](($TimeoutSeconds - $started.Elapsed.TotalSeconds) * 1000)
    if ($remaining -lt 1000) { throw 'Recovery timeout before connection.' }
    $helperArguments = @((Join-Path $PSScriptRoot 'recover-renderer.mjs'), '--port', $Port, '--pid', $endpoint.ProcessId, '--timeout-ms', $remaining)
    if ($newLaunch) { $helperArguments += '--startup' }
    & $node.Source @helperArguments
    $result = $LASTEXITCODE
    Write-Host 'Diagnostic client closed. The loopback listener remains until you Quit Codex. This is a build-specific workaround; the normal shortcut remains unchanged.'
    exit $result
} catch {
    [Console]::Error.WriteLine((Get-RecoverySafeErrorMessage $_.Exception.Message))
    exit 1
}
