$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot '..\scripts\recovery-safety.psm1') -Force

function Assert-Equal([string]$Actual, [string]$Expected, [string]$Name) {
    if ($Actual -ne $Expected) { throw "FAIL: $Name" }
    Write-Host "PASS: $Name"
}

Assert-Equal (Get-RecoverySafeErrorMessage 'Refused: expected one installed package.') 'Refused: expected one installed package.' 'safe refusal reason is preserved'
Assert-Equal (Get-RecoverySafeErrorMessage 'Cannot read "C:\Users\private.fixture\AppData\Local\helper.exe".') 'Cannot read "%USERPROFILE%\AppData\Local\helper.exe".' 'Windows username is removed'
Assert-Equal (Get-RecoverySafeErrorMessage 'Denied: d:/users/Private Fixture/cache/file; contact fixture@example.test.') 'Denied: %USERPROFILE%/cache/file; contact [redacted email].' 'spaces, case, forward slashes and email are redacted'
Assert-Equal (Get-RecoverySafeErrorMessage 'Cannot read C:\Users\fixture because access was denied.') 'Cannot read %USERPROFILE% because access was denied.' 'reason after an unquoted profile root is preserved'
Assert-Equal (Get-RecoverySafeErrorMessage 'Cannot read "C:\Users\Private Fixture".') 'Cannot read "%USERPROFILE%".' 'quoted profile root with spaces is redacted'
Assert-Equal (Get-RecoverySafeErrorMessage '') '' 'empty error stays empty'

if ($env:USERPROFILE) {
    Assert-Equal (Get-RecoverySafeErrorMessage ('Cannot read "' + $env:USERPROFILE + '\private-file".')) 'Cannot read "%USERPROFILE%\private-file".' 'current profile root is removed'
    Assert-Equal (Get-RecoverySafeErrorMessage ('Cannot read "' + $env:USERPROFILE + '.other\cache".')) 'Cannot read "%USERPROFILE%\cache".' 'another username sharing the current profile prefix is removed'
}

$repoRoot = Split-Path -Parent $PSScriptRoot
foreach ($scriptName in @('recover-codex.ps1', 'appshot-helper.ps1')) {
    $scriptPath = Join-Path $repoRoot ('scripts\' + $scriptName)
    $parseTokens = $null
    $parseErrors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$parseTokens, [ref]$parseErrors)
    if ($parseErrors.Count) { throw "FAIL: $scriptName parse errors" }
    $catchBlocks = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.CatchClauseAst] }, $false))
    if ($catchBlocks.Count -ne 1) { throw "FAIL: $scriptName expected one top-level catch" }
    # Execute the actual catch body in a child process, without starting Codex or querying live processes.
    $body = $catchBlocks[0].Body.Extent.Text
    $modulePath = Join-Path $repoRoot 'scripts\recovery-safety.psm1'
    $moduleLiteral = $modulePath.Replace("'", "''")
    $command = "`$ErrorActionPreference = 'Stop'; Import-Module '$moduleLiteral' -Force; try { throw 'Cannot read C:\Users\private.fixture\cache\helper.exe; contact fixture@example.test.' } catch $body"
    $startInfo = [Diagnostics.ProcessStartInfo]::new((Get-Process -Id $PID).Path)
    $startInfo.ArgumentList.Add('-NoLogo')
    $startInfo.ArgumentList.Add('-NoProfile')
    $startInfo.ArgumentList.Add('-Command')
    $startInfo.ArgumentList.Add($command)
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $child = [Diagnostics.Process]::Start($startInfo)
    try {
        $stdout = $child.StandardOutput.ReadToEnd()
        $stderr = $child.StandardError.ReadToEnd()
        $child.WaitForExit()
        if ($child.ExitCode -ne 1 -or $stdout.Length -ne 0) { throw "FAIL: $scriptName error exit or stdout" }
        Assert-Equal $stderr.Trim() 'Cannot read %USERPROFILE%\cache\helper.exe; contact [redacted email].' "$scriptName emits only sanitized stderr"
    } finally { $child.Dispose() }
}
