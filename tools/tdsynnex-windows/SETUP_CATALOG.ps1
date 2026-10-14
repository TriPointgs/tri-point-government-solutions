# Tri-Point private TD SYNNEX catalog setup; no database uploaded.
$ErrorActionPreference = 'Stop'
$root = 'C:\TriPointPrivateCatalog'
$filesBase = 'https://raw.githubusercontent.com/TriPointgs/tri-point-government-solutions/0989c499df14143a49f60eddd38216e7866cfe69/tools/tdsynnex-windows'
Write-Host "[1/5] Preparing private catalog folder..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $root | Out-Null
foreach ($file in @('catalog_gateway.py','catalog_import.py')) {
    Invoke-WebRequest -Uri "$filesBase/$file" -OutFile (Join-Path $root $file) -UseBasicParsing -ErrorAction Stop
}
$py = Get-Command py.exe -ErrorAction SilentlyContinue
$python = Get-Command python.exe -ErrorAction SilentlyContinue
if (-not $py -and -not $python) {
    Write-Host 'Python 3 not found. Install Python from python.org, then run this script again.' -ForegroundColor Yellow
    exit 1
}
$exe = if ($py) { $py.Source } else { $python.Source }
# Do not splat Python arguments: some Windows Python launchers start an interactive REPL instead.
if ($py) {
    & $exe -3 -c 'import sys; print(sys.version.split()[0])'
} else {
    & $exe -c 'import sys; print(sys.version.split()[0])'
}
if ($LASTEXITCODE -ne 0) { throw 'Working Python 3 required.' }

Write-Host "[2/5] Locating the existing catalog..." -ForegroundColor Cyan
$db = Join-Path $root 'catalog.sqlite'
$bases = @((Join-Path $env:USERPROFILE 'Downloads'),(Join-Path $env:USERPROFILE 'Desktop'),$env:USERPROFILE,'C:\Users\Me') | Select-Object -Unique
if (-not (Test-Path -LiteralPath $db)) {
    $existing = $null
    foreach ($folder in $bases) {
        foreach ($possible in @((Join-Path $folder 'catalog.sqlite'),(Join-Path $folder 'TriPoint_TD_SYNNEX_Private_Catalog_2026-10-14\catalog.sqlite'))) {
            if (Test-Path -LiteralPath $possible) { $existing=$possible; break }
        }
        if ($existing) { break }
    }
    if ($existing) { Copy-Item -LiteralPath $existing -Destination $db }
}
if (-not (Test-Path -LiteralPath $db)) {
    $archive = $null
    foreach ($folder in $bases) {
        $candidate = Join-Path $folder '822539.zip'
        if (Test-Path -LiteralPath $candidate) { $archive=$candidate; break }
    }
    if (-not $archive) {
        Write-Host 'Missing 822539.zip. Copy the original FileZilla download to C:\TriPointPrivateCatalog, then rerun setup.' -ForegroundColor Yellow
        exit 1
    }
    Copy-Item -LiteralPath $archive -Destination (Join-Path $root '822539.zip')
    Write-Host '[3/5] Building the search database. This can take several minutes...' -ForegroundColor Cyan
    if ($py) { & $exe -3 (Join-Path $root 'catalog_import.py') }
    else { & $exe (Join-Path $root 'catalog_import.py') }
    if ($LASTEXITCODE -ne 0) { throw 'Database import failed. See preceding output.' }
} else {
    Write-Host "[3/5] Existing catalog.sqlite found." -ForegroundColor Green
}
if ((Get-Item -LiteralPath $db).Length -lt 100000000) { throw 'catalog.sqlite appears incomplete.' }

Write-Host "[4/5] Setting up the private token..." -ForegroundColor Cyan
$tokenPath = Join-Path $root '.catalog-token.txt'
if (-not (Test-Path -LiteralPath $tokenPath)) {
    $bytes = New-Object byte[] 48
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $token = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
    [IO.File]::WriteAllText($tokenPath,$token,[Text.Encoding]::ASCII)
    $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = New-Object System.Security.AccessControl.FileSecurity
    $acl.SetOwner($me)
    $acl.SetAccessRuleProtection($true,$false)
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($me,'FullControl','Allow')))
    Set-Acl -LiteralPath $tokenPath -AclObject $acl
}
$launcherContent = @'
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:TP_CATALOG_SQLITE_PATH = Join-Path $root 'catalog.sqlite'
$env:TP_CATALOG_BACKEND_TOKEN = [IO.File]::ReadAllText((Join-Path $root '.catalog-token.txt')).Trim()
$env:TP_CATALOG_BACKEND_PORT = '8766'
Set-Location $root
if (Get-Command py.exe -ErrorAction SilentlyContinue) {
    & py -3 (Join-Path $root 'catalog_gateway.py')
} else {
    & python (Join-Path $root 'catalog_gateway.py')
}
'@
$launcherContent | Set-Content -LiteralPath (Join-Path $root 'START_GATEWAY.ps1') -Encoding UTF8
Write-Host "[5/5] Starting and testing the local gateway..." -ForegroundColor Cyan
$port = Get-NetTCPConnection -LocalPort 8766 -State Listen -ErrorAction SilentlyContinue
if (-not $port) {
    $launcher = Join-Path $root 'START_GATEWAY.ps1'
    Start-Process powershell.exe -ArgumentList ('-NoExit -NoProfile -ExecutionPolicy Bypass -File "' + $launcher + '"')
    Start-Sleep -Seconds 5
}
$token = [IO.File]::ReadAllText($tokenPath).Trim()
$headers = @{ Authorization = 'Bearer ' + $token }
$health = Invoke-RestMethod -Uri 'http://127.0.0.1:8766/health' -Headers $headers -TimeoutSec 8
if ($health.status -ne 'ready') { throw 'Local gateway health check failed.' }
$search = Invoke-RestMethod -Uri 'http://127.0.0.1:8766/search?q=ThinkPad&page=0' -Headers $headers -TimeoutSec 20
Write-Host ("SUCCESS: Local gateway working. Search returned {0} records." -f $search.items.Count) -ForegroundColor Green
Write-Host 'The database remains on your computer. Leave the gateway PowerShell window open.' -ForegroundColor Green
Write-Host 'Next: configure the secure HTTPS tunnel. Do not share the private token.'
