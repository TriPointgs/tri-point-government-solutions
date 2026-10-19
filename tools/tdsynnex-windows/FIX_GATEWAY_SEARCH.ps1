# Run in Windows PowerShell 5.1. Revision 2 uses an explicit replacement backup path.
[CmdletBinding()]
param([string]$Root = 'C:\TriPointPrivateCatalog')
$ErrorActionPreference = 'Stop'
$Source = Join-Path $Root 'catalog_gateway.py'
$Launcher = Join-Path $Root 'START_GATEWAY.ps1'
$TokenFile = Join-Path $Root '.catalog-token.txt'
$Backup = $null
$Stage = $null
$Changed = $false
$ReplaceAttempted = $false
$BackupVerified = $false
$PreserveStage = $false

function Test-GatewayReplacement {
    # Exercise the Windows replacement API with disposable files on the same volume.
    $probeDirectory = Join-Path $Root ('.gateway-replace-check-' + [guid]::NewGuid().ToString('N'))
    [IO.Directory]::CreateDirectory($probeDirectory) | Out-Null
    try {
        $probeSource = Join-Path $probeDirectory 'original.txt'
        $probeCandidate = Join-Path $probeDirectory 'candidate.txt'
        $probeBackup = Join-Path $probeDirectory 'backup.txt'
        [IO.File]::WriteAllText($probeSource, 'before')
        [IO.File]::WriteAllText($probeCandidate, 'after')
        [IO.File]::Replace($probeCandidate, $probeSource, $probeBackup)
        if ([IO.File]::ReadAllText($probeSource) -cne 'after' -or
            [IO.File]::ReadAllText($probeBackup) -cne 'before' -or
            (Test-Path -LiteralPath $probeCandidate)) {
            throw 'Temporary replacement check failed. Gateway source was not changed.'
        }
        Write-Host 'Windows file replacement preflight: PASS'
    } finally {
        if (Test-Path -LiteralPath $probeDirectory) {
            Remove-Item -LiteralPath $probeDirectory -Recurse -Force
        }
    }
}

function Get-GatewayListener {
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -eq 8766 })
    if ($listeners.Count -eq 0) { return $null }
    if (@($listeners | Where-Object { $_.LocalAddress -ne '127.0.0.1' }).Count) {
        throw 'Port 8766 has a non-loopback listener. No process was stopped.'
    }
    $owners = @($listeners.OwningProcess | Sort-Object -Unique)
    if ($owners.Count -ne 1) { throw 'Port 8766 has ambiguous owners. No process was stopped.' }
    $process = Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $owners[0])
    if (-not $process -or -not $process.ExecutablePath -or -not $process.CommandLine) {
        throw 'Cannot verify the port owner. Run from an account allowed to inspect that process.'
    }
    if ([IO.Path]::GetFileName($process.ExecutablePath) -notmatch '^python(w)?(\d+(\.\d+)?)?\.exe$') {
        throw 'Port 8766 is not owned by a verified Python gateway. No process was stopped.'
    }
    # Accept only an interpreter, optional simple Python flags, then this full script path.
    $argv = @([regex]::Matches($process.CommandLine, '"[^"]*"|\S+') | ForEach-Object { $_.Value.Trim('"') })
    $index = 1
    while ($index -lt $argv.Count -and $argv[$index] -match '^-[uBEsSI]+$') { $index++ }
    if ($index -ge $argv.Count -or -not [IO.Path]::IsPathRooted($argv[$index]) -or
        [IO.Path]::GetFullPath($argv[$index]) -ine [IO.Path]::GetFullPath($Source)) {
        throw 'Port owner does not execute the exact full catalog_gateway.py path. No process was stopped.'
    }
    return $process
}

function Read-GatewayJson([string]$Path, [int]$TimeoutSeconds = 30) {
    # Errors are deliberately replaced with a fixed message: no headers or raw responses in output.
    try {
        return Invoke-RestMethod -Uri ('http://127.0.0.1:8766' + $Path) -Method Get `
            -Headers @{ Authorization = ('Bearer ' + $script:Token) } -TimeoutSec $TimeoutSeconds -MaximumRedirection 0
    } catch { throw 'Authenticated gateway request failed; check the existing launcher window.' }
}

function Assert-Search($Result, [bool]$ExpectedExact, [string]$Label) {
    if ($null -eq $Result -or $null -eq $Result.items -or
        $Result.exact -isnot [bool] -or $Result.exact -ne $ExpectedExact -or
        $Result.filterVersion -ne 2) {
        throw ("{0}: expected filterVersion 2 and Boolean exact={1}; verification pending." -f $Label, $ExpectedExact)
    }
    $count = @($Result.items).Count
    Write-Host ("{0}: items={1}; exact type=Boolean; exact={2}; filterVersion={3}" -f $Label, $count, $Result.exact, $Result.filterVersion)
    if ($count -eq 0) { throw ("{0}: zero items returned; verification pending (not a successful repair verification)." -f $Label) }
}

try {
    Write-Host 'Catalog search repair - revision 2 (Windows backup-path correction)'
    Write-Host '[1/5] Checking local files, source shape, and port owner...'
    foreach ($file in @($Source, $Launcher, $TokenFile)) {
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw ("Required file missing: {0}" -f $file) }
    }
    $Token = [IO.File]::ReadAllText($TokenFile).Trim()
    if ($Token.Length -lt 32 -or $Token -match '[\r\n]') { throw 'Token file does not contain a valid single token.' }
    $initial = Get-GatewayListener
    $bytes = [IO.File]::ReadAllBytes($Source)
    $utf8 = New-Object System.Text.UTF8Encoding($false, $true)
    try { $text = $utf8.GetString($bytes) } catch { throw 'Source is not valid UTF-8; no changes made.' }
    $anchor = '(?m)^        exact = args\.get\("exact", \["0"\]\)\[0\]\r?$'
    $call = '(?m)^            result = search_db\(query, maker, int\(page\), category, exact\)\r?$'
    $version = '(?m)^ENGINE_VERSION = 2\r?$'
    # Match the validation block in full; category definitions elsewhere stay byte-for-byte intact.
    $block = '        if \(len\(query\) > 100 or len\(maker\) > 80 or category not in CATEGORIES\r?\n' +
        '            or exact not in \("0", "1"\) or \(exact == "1" and not query\)\r?\n' +
        '            or not re\.fullmatch\(r"\\d\{1,4\}", page\) or int\(page\) > 1000\r?\n' +
        '            or any\(ord\(char\) < 32 or ord\(char\) == 127 for char in query \+ maker\)\):\r?\n' +
        '            return self\.respond\(400, \{"error": "Invalid catalog search"\}\)(?<nl>\r?\n)' +
        '(?<fixed>        exact = exact == "1"\r?\n)?        if not query and not maker:'
    $validationMatches = [regex]::Matches($text, $block)
    if ([regex]::Matches($text, $anchor).Count -ne 1 -or
        [regex]::Matches($text, $call).Count -ne 1 -or
        [regex]::Matches($text, $version).Count -ne 1 -or $validationMatches.Count -ne 1) {
        throw 'Source differs from the expected gateway v2 handler. No changes made; inspect the validation block manually.'
    }
    $validationMatch = $validationMatches[0]
    $alreadyFixed = $validationMatch.Groups['fixed'].Success
    $conversionCount = [regex]::Matches($text, '(?m)^\s*exact = exact == ["'']1["'']\s*\r?$').Count
    if ($conversionCount -ne [int]$alreadyFixed) { throw 'Unexpected or duplicate exact conversion; no changes made.' }
    if ($alreadyFixed) {
        $newBytes = $bytes
        Write-Host 'The exact-search conversion is already present; source will remain unchanged.'
    } else {
        $offset = $validationMatch.Groups['nl'].Index + $validationMatch.Groups['nl'].Length
        $updated = $text.Insert($offset, ('        exact = exact == "1"' + $validationMatch.Groups['nl'].Value))
        $newBytes = $utf8.GetBytes($updated)
    }

    Write-Host '[2/5] Compiling candidate without importing the gateway or opening the database...'
    $pythonArgs = @()
    if ($initial) {
        $python = $initial.ExecutablePath
        if ([IO.Path]::GetFileName($python) -ieq 'pythonw.exe') {
            $python = Join-Path ([IO.Path]::GetDirectoryName($python)) 'python.exe'
            if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
                throw 'The console Python executable beside pythonw.exe is missing; no changes made.'
            }
        }
    } else {
        $command = Get-Command python.exe, python3.exe, py.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $command) { throw 'Python not found. Start the existing gateway launcher, then rerun this repair.' }
        $python = $command.Source
        if ([IO.Path]::GetFileName($python) -ieq 'py.exe') { $pythonArgs = @('-3') }
    }
    $Stage = Join-Path $Root ('.gateway-repair-' + [guid]::NewGuid().ToString('N') + '.py')
    [IO.File]::WriteAllBytes($Stage, $newBytes)
    & $python @pythonArgs -c 'import pathlib,sys; compile(pathlib.Path(sys.argv[1]).read_bytes(), sys.argv[1], ''exec'')' $Stage 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Python syntax check failed. Original source and running process were left unchanged.' }
    Test-GatewayReplacement
    # Detect concurrent edits before backing up or replacing anything.
    $current = [IO.File]::ReadAllBytes($Source)
    if ([Convert]::ToBase64String($current) -cne [Convert]::ToBase64String($bytes)) {
        throw 'Source changed during preparation. No changes made; rerun after editing finishes.'
    }
    if (-not $alreadyFixed) {
        $Backup = $Source + '.bak-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + [guid]::NewGuid().ToString('N')
        # PowerShell must pass a real string path, not $null, as the backup argument.
        $ReplaceAttempted = $true
        [IO.File]::Replace($Stage, $Source, $Backup)
        $Changed = $true
        $Stage = $null
        $BackupVerified = [Convert]::ToBase64String([IO.File]::ReadAllBytes($Backup)) -ceq [Convert]::ToBase64String($bytes)
        if (-not $BackupVerified) { throw 'The backup does not match the original source; restart was not attempted.' }
        if ([Convert]::ToBase64String([IO.File]::ReadAllBytes($Source)) -cne [Convert]::ToBase64String($newBytes)) {
            throw 'Installed source does not match the checked candidate; restart was not attempted.'
        }
        Write-Host ("One-line repair saved. Backup: {0}" -f $Backup)
        Write-Host 'Installed source and original backup bytes: VERIFIED'
    }

    Write-Host '[3/5] Restarting only the verified gateway through its existing launcher...'
    $now = Get-GatewayListener
    if ($initial) {
        if (-not $now -or $now.ProcessId -ne $initial.ProcessId -or $now.CreationDate -ne $initial.CreationDate -or
            $now.ExecutablePath -ine $initial.ExecutablePath) { throw 'Gateway ownership changed; no process was stopped. Rerun the repair.' }
        # Recheck PID identity immediately before Stop-Process to guard against PID reuse.
        $again = Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $now.ProcessId)
        if (-not $again -or $again.CreationDate -ne $now.CreationDate -or $again.CommandLine -cne $now.CommandLine) {
            throw 'Gateway process identity changed; no process was stopped.'
        }
        $gatewayProcess = Get-Process -Id $now.ProcessId -ErrorAction Stop
        Stop-Process -InputObject $gatewayProcess -Force -ErrorAction Stop
        if (-not $gatewayProcess.WaitForExit(5000)) {
            throw 'Gateway did not exit within five seconds; launcher was not started.'
        }
    } elseif ($now) { throw 'A gateway appeared during preparation; no process was stopped. Rerun the repair.' }
    Start-Process powershell.exe -ArgumentList ('-NoExit -NoProfile -ExecutionPolicy Bypass -File "' + $Launcher + '"') | Out-Null
    $deadline = [DateTime]::UtcNow.AddSeconds(25)
    $ready = $false
    do {
        try {
            $health = Read-GatewayJson '/health' 2
            if ($health.status -eq 'ready' -and $health.filterVersion -eq 2) { $ready = $true; break }
        } catch { }
        Start-Sleep -Seconds 1
    } while ([DateTime]::UtcNow -lt $deadline)
    if (-not $ready) { throw 'Gateway did not become healthy within the startup window. Check its launcher window.' }
    $restarted = Get-GatewayListener
    if (-not $restarted) { throw 'Healthy response received but gateway listener could not be verified.' }

    Write-Host '[4/5] Verifying authenticated keyword and exact-part searches...'
    $queryPath = '/search?q=ThinkPad&maker=LENOVO&category=laptops&page=0'
    $normal = Read-GatewayJson $queryPath
    Assert-Search $normal $false 'Default keyword search'
    $explicit = Read-GatewayJson ($queryPath + '&exact=0')
    Assert-Search $explicit $false 'Explicit exact=0'
    foreach ($item in @($normal.items | Select-Object -First 3)) {
        Write-Host ("  {0} | {1} | {2}" -f $item.manufacturer, $item.mfgPart, $item.description)
    }
    $part = [string]$normal.items[0].mfgPart
    if ([string]::IsNullOrWhiteSpace($part)) { throw 'First keyword result has no manufacturer part; verification pending.' }
    $exactResult = Read-GatewayJson ('/search?q=' + [Uri]::EscapeDataString($part) + '&maker=LENOVO&category=laptops&page=0&exact=1')
    Assert-Search $exactResult $true 'Exact manufacturer-part search'
    if (@($exactResult.items | Where-Object { $_.mfgPart -ceq $part }).Count -eq 0) {
        throw 'Exact search did not return the selected manufacturer part; verification pending.'
    }
    Write-Host '[5/5] SUCCESS: Boolean exact handling and nonempty keyword/exact searches verified.'
    if ($Backup) { Write-Host ("Rollback backup retained: {0}" -f $Backup) }
} catch {
    Write-Host ('REPAIR NOT VERIFIED: ' + $_.Exception.Message) -ForegroundColor Red
    if ($ReplaceAttempted) {
        # A Windows replacement error can occur after the original moved to its backup.
        # Verify the recovery file and preserve any surviving candidate before cleanup.
        $PreserveStage = $Stage -and (Test-Path -LiteralPath $Stage -PathType Leaf)
        $BackupVerified = $false
        try {
            if (Test-Path -LiteralPath $Backup -PathType Leaf) {
                $BackupVerified = [Convert]::ToBase64String([IO.File]::ReadAllBytes($Backup)) -ceq [Convert]::ToBase64String($bytes)
            }
        } catch { }
        if ($BackupVerified) {
            Write-Host ("Verified original backup: {0}" -f $Backup)
            Write-Host 'To roll back: stop only the gateway using its launcher window, then run:'
            Write-Host ("Copy-Item -LiteralPath '{0}' -Destination '{1}' -Force" -f $Backup.Replace("'", "''"), $Source.Replace("'", "''"))
            Write-Host 'Then start START_GATEWAY.ps1 again.'
        } else {
            Write-Host ("Backup was not verified. Retain this path for inspection: {0}" -f $Backup)
        }
        if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
            Write-Host 'Gateway source is missing; restore a verified original before starting the launcher.'
        }
        if ($PreserveStage) { Write-Host ("Candidate retained for recovery: {0}" -f $Stage) }
    }
    exit 1
} finally {
    if ($Stage -and -not $PreserveStage -and (Test-Path -LiteralPath $Stage)) {
        Remove-Item -LiteralPath $Stage -Force
    }
    $Token = $null
}
