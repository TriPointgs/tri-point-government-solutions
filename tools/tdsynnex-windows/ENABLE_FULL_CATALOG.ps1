param([string]$Root = "C:\TriPointPrivateCatalog")
$ErrorActionPreference = "Stop"
$Source = Join-Path $Root "catalog_gateway.py"
$Launcher = Join-Path $Root "START_GATEWAY.ps1"
$Helper = Join-Path $Root "catalog_inventory.py"
$TokenFile = Join-Path $Root ".catalog-token.txt"
$Stamp = (Get-Date -Format "yyyyMMdd-HHmmss-fff") + "-" + [Guid]::NewGuid().ToString("N")
$SourceStage = Join-Path $Root ("catalog_gateway.browse-stage-" + $Stamp + ".py")
$HelperStage = Join-Path $Root ("catalog_inventory.stage-" + $Stamp + ".py")
$Patcher = Join-Path $Root ("prepare_catalog_browse-" + $Stamp + ".py")
$SourceBackup = $Source + ".bak-full-browse-" + $Stamp
$HelperBackup = $Helper + ".bak-" + $Stamp
$SourceInstalled = $false
$HelperInstalled = $false
$HelperExisted = Test-Path -LiteralPath $Helper
$GatewayStopped = $false
function VerifiedListener {
    $Listener = Get-NetTCPConnection -LocalPort 8766 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (!$Listener) { return $null }
    $Info = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $Listener.OwningProcess)
    if (!$Info -or $Info.Name -notmatch '^python(?:w)?\.exe$' -or $Info.CommandLine -notlike ('*' + $Source + '*')) {
        throw "Port 8766 has an unexpected owner. No unrelated process will be stopped."
    }
    return $Info
}
function StartGateway {
    Start-Process powershell.exe -ArgumentList ('-NoExit -NoProfile -ExecutionPolicy Bypass -File "' + $Launcher + '"') | Out-Null
}
function WaitForCatalog {
    for ($Try = 0; $Try -lt 20; $Try++) {
        Start-Sleep -Seconds 1
        try {
            $Owner = VerifiedListener
            if ($Owner) {
                $Value = Invoke-RestMethod -Uri "http://127.0.0.1:8766/catalog-info" -Headers $Headers -TimeoutSec 10
                if ($Value.capability -eq "full-catalog-v1") { return $Value }
            }
        } catch { if ($Try -eq 19) { throw } }
    }
    throw "The updated gateway did not become ready."
}
try {
    Write-Host "[1/5] Checking the existing private catalog gateway..." -ForegroundColor Cyan
    foreach ($Path in @($Source, $Launcher, $TokenFile)) { if (!(Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Required local file missing: $Path" } }
    $Running = VerifiedListener
    $Python = if ($Running -and $Running.ExecutablePath) { $Running.ExecutablePath } else { (Get-Command python.exe -ErrorAction Stop).Source }
    if (!$Python -or !(Test-Path -LiteralPath $Python -PathType Leaf)) { throw "Could not identify the local Python executable." }
    $BeforeHash = (Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash
    $Token = [IO.File]::ReadAllText($TokenFile).Trim()
    if ($Token.Length -lt 32) { throw "The existing catalog token is not usable." }
    $Headers = @{ Authorization = "Bearer $Token" }
    Write-Host "[2/5] Compiling an additive update without importing or rewriting the database..." -ForegroundColor Cyan
    [IO.File]::WriteAllBytes($HelperStage, [Convert]::FromBase64String("IiIiUmVhZC1vbmx5LCBpZGVudGl0eS1vbmx5IGZ1bGwgY2F0YWxvZyBicm93c2luZzsgbmV2ZXIgc3VibWl0cyBzdXBwbGllciByZXF1ZXN0cy4KSW5zdGFsbGVkIGFsb25nc2lkZSBjYXRhbG9nX2dhdGV3YXkucHkuIEV4aXN0aW5nIHRva2VuL2F1dGhlbnRpY2F0aW9uIHN0YXlzIGluIGl0cyBoYW5kbGVyLgoiIiIKaW1wb3J0IGJhc2U2NApmcm9tIGNvbnRleHRsaWIgaW1wb3J0IGNsb3NpbmcKZnJvbSBkYXRldGltZSBpbXBvcnQgZGF0ZXRpbWUsIHRpbWV6b25lCmZyb20gZnVuY3Rvb2xzIGltcG9ydCBscnVfY2FjaGUKaW1wb3J0IGhhc2hsaWIKaW1wb3J0IGpzb24KZnJvbSBwYXRobGliIGltcG9ydCBQYXRoCmltcG9ydCByZQppbXBvcnQgc3FsaXRlMwoKUEFHRV9TSVpFID0gNTAKQ0FQQUJJTElUWSA9ICJmdWxsLWNhdGFsb2ctdjEiCkNBVEVHT1JJRVMgPSAoImFsbCIsICJsYXB0b3BzIiwgImRlc2t0b3BzIiwgIm1vbml0b3JzIiwgIm5ldHdvcmtpbmciLCAic29mdHdhcmUiLCAiYWNjZXNzb3JpZXMiKQoKCmNsYXNzIENhdGFsb2dSZXF1ZXN0RXJyb3IoRXhjZXB0aW9uKToKICAgIGRlZiBfX2luaXRfXyhzZWxmLCBzdGF0dXMsIG1lc3NhZ2UpOgogICAgICAgIHNlbGYuc3RhdHVzID0gc3RhdHVzCiAgICAgICAgc3VwZXIoKS5fX2luaXRfXyhtZXNzYWdlKQoKCmRlZiBjb25uZWN0aW9uKHBhdGgpOgogICAgY29uID0gc3FsaXRlMy5jb25uZWN0KFBhdGgocGF0aCkucmVzb2x2ZSgpLmFzX3VyaSgpICsgIj9tb2RlPXJvIiwgdXJpPVRydWUsIHRpbWVvdXQ9NykKICAgIGNvbi5leGVjdXRlKCJQUkFHTUEgcXVlcnlfb25seT1PTiIpCiAgICBjb24uZXhlY3V0ZSgiUFJBR01BIGJ1c3lfdGltZW91dD03MDAwIikKICAgIGNvbi5leGVjdXRlKCJQUkFHTUEgdHJ1c3RlZF9zY2hlbWE9T0ZGIikKICAgIHJldHVybiBjb24KCgpAbHJ1X2NhY2hlKG1heHNpemU9NCkKZGVmIF9yZWNvcmRfY291bnQocGF0aCwgc2lnbmF0dXJlKToKICAgIHdpdGggY2xvc2luZyhjb25uZWN0aW9uKHBhdGgpKSBhcyBjb246CiAgICAgICAgcmV0dXJuIGludChjb24uZXhlY3V0ZSgiU0VMRUNUIENPVU5UKCopIEZST00gcHJvZHVjdHMiKS5mZXRjaG9uZSgpWzBdKQoKCmRlZiBjYXRhbG9nX2luZm8oZGF0YWJhc2UpOgogICAgcGF0aCA9IFBhdGgoZGF0YWJhc2UpLnJlc29sdmUoKQogICAgc3RhdCA9IHBhdGguc3RhdCgpCiAgICBkZWYgc2lnbmF0dXJlKCk6CiAgICAgICAgbWFpbiA9IHBhdGguc3RhdCgpCiAgICAgICAgd2l0aCBwYXRoLm9wZW4oInJiIikgYXMgc291cmNlOgogICAgICAgICAgICBoZWFkZXIgPSBoYXNobGliLnNoYTI1Nihzb3VyY2UucmVhZCgxMDApKS5oZXhkaWdlc3QoKQogICAgICAgIG1haW5fc2lnbmF0dXJlID0gKG1haW4uc3RfZGV2LCBtYWluLnN0X2lubywgbWFpbi5zdF9zaXplLCBtYWluLnN0X210aW1lX25zLCBtYWluLnN0X2N0aW1lX25zLCBoZWFkZXIpCiAgICAgICAgdHJ5OgogICAgICAgICAgICB3YWwgPSBQYXRoKHN0cihwYXRoKSArICctd2FsJykuc3RhdCgpCiAgICAgICAgICAgIHJldHVybiBtYWluX3NpZ25hdHVyZSArICh3YWwuc3RfaW5vLCB3YWwuc3Rfc2l6ZSwgd2FsLnN0X210aW1lX25zLCB3YWwuc3RfY3RpbWVfbnMpCiAgICAgICAgZXhjZXB0IEZpbGVOb3RGb3VuZEVycm9yOgogICAgICAgICAgICByZXR1cm4gbWFpbl9zaWduYXR1cmUgKyAoMCwgMCwgMCwgMCkKICAgIHN0YW1wID0gc2lnbmF0dXJlKCkKICAgIHRvdGFsID0gX3JlY29yZF9jb3VudChzdHIocGF0aCksIHN0YW1wKQogICAgaWYgc3RhbXAgIT0gc2lnbmF0dXJlKCk6CiAgICAgICAgcmFpc2UgQ2F0YWxvZ1JlcXVlc3RFcnJvcig0MDksICdDYXRhbG9nIGNoYW5nZWQgZHVyaW5nIHRoaXMgcmVhZC4gU3RhcnQgYWdhaW4uJykKICAgICMgVGhpcyBpZGVudGlmaWVzIHRoZSBsb2NhbCBpbmRleCBnZW5lcmF0aW9uLCBub3QgdGhlIGxpdmUgc3VwcGxpZXIncyBpbnZlbnRvcnkuCiAgICBmaW5nZXJwcmludCA9IGhhc2hsaWIuc2hhMjU2KGYie3N0YW1wfTp7dG90YWx9Ii5lbmNvZGUoKSkuaGV4ZGlnZXN0KClbOjI0XQogICAgcmV0dXJuIHsiY2FwYWJpbGl0eSI6IENBUEFCSUxJVFksICJ0b3RhbFJlY29yZHMiOiB0b3RhbCwgInNuYXBzaG90S2V5IjogZmluZ2VycHJpbnQsCiAgICAgICAgICAgICJpbmRleE1vZGlmaWVkQXQiOiBkYXRldGltZS5mcm9tdGltZXN0YW1wKHN0YXQuc3RfbXRpbWUsIHRpbWV6b25lLnV0YykuaXNvZm9ybWF0KCksCiAgICAgICAgICAgICJwYWdlU2l6ZSI6IFBBR0VfU0laRSwgInNvdXJjZSI6ICJleGlzdGluZy1wcml2YXRlLWRpc3RyaWJ1dG9yLWluZGV4IiwKICAgICAgICAgICAgInByaWNlVmVyaWZpZWQiOiBGYWxzZSwgInN0b2NrVmVyaWZpZWQiOiBGYWxzZSwgImNsb3VkQ29weSI6IEZhbHNlfQoKCmRlZiBxdWVyeV9maWVsZHMoYXJncyk6CiAgICBpZiBub3QgaXNpbnN0YW5jZShhcmdzLCBkaWN0KSBvciBzZXQoYXJncykgLSB7InEiLCAibWFrZXIiLCAiY2F0ZWdvcnkiLCAiY3Vyc29yIn06CiAgICAgICAgcmFpc2UgQ2F0YWxvZ1JlcXVlc3RFcnJvcig0MDAsICJVbnN1cHBvcnRlZCBmdWxsLWNhdGFsb2cgZmllbGRzIikKICAgIGlmIGFueShub3QgaXNpbnN0YW5jZSh2LCBsaXN0KSBvciBsZW4odikgIT0gMSBvciBub3QgaXNpbnN0YW5jZSh2WzBdLCBzdHIpIGZvciB2IGluIGFyZ3MudmFsdWVzKCkpOgogICAgICAgIHJhaXNlIENhdGFsb2dSZXF1ZXN0RXJyb3IoNDAwLCAiSW52YWxpZCBvciBkdXBsaWNhdGUgY2F0YWxvZyBmaWVsZHMiKQogICAgcmF3X3RleHQgPSBhcmdzLmdldCgicSIsIFsiIl0pWzBdICsgYXJncy5nZXQoIm1ha2VyIiwgWyIiXSlbMF0KICAgIGlmIGFueShvcmQoYykgPCAzMiBvciBvcmQoYykgPT0gMTI3IGZvciBjIGluIHJhd190ZXh0KToKICAgICAgICByYWlzZSBDYXRhbG9nUmVxdWVzdEVycm9yKDQwMCwgIkludmFsaWQgZnVsbC1jYXRhbG9nIHF1ZXJ5IikKICAgIHF1ZXJ5ID0gYXJncy5nZXQoInEiLCBbIiJdKVswXS5zdHJpcCgpCiAgICBtYWtlciA9IGFyZ3MuZ2V0KCJtYWtlciIsIFsiIl0pWzBdLnN0cmlwKCkKICAgIGNhdGVnb3J5ID0gYXJncy5nZXQoImNhdGVnb3J5IiwgWyJhbGwiXSlbMF0uc3RyaXAoKS5sb3dlcigpCiAgICBjdXJzb3IgPSBhcmdzLmdldCgiY3Vyc29yIiwgWyIiXSlbMF0KICAgIGlmIGxlbihxdWVyeSkgPiAxMDAgb3IgbGVuKG1ha2VyKSA+IDgwIG9yIGNhdGVnb3J5IG5vdCBpbiBDQVRFR09SSUVTIG9yIGxlbihjdXJzb3IpID4gNDAwIG9yIGFueShvcmQoYykgPCAzMiBvciBvcmQoYykgPT0gMTI3IGZvciBjIGluIHF1ZXJ5ICsgbWFrZXIpOgogICAgICAgIHJhaXNlIENhdGFsb2dSZXF1ZXN0RXJyb3IoNDAwLCAiSW52YWxpZCBmdWxsLWNhdGFsb2cgcXVlcnkiKQogICAgcmV0dXJuIHF1ZXJ5LCBtYWtlciwgY2F0ZWdvcnksIGN1cnNvcgoKCmRlZiBjdXJzb3JfYWZ0ZXIodG9rZW4sIHNuYXBzaG90LCBiaW5kaW5nKToKICAgIGlmIG5vdCB0b2tlbjoKICAgICAgICByZXR1cm4gMAogICAgaWYgbm90IHJlLmZ1bGxtYXRjaChyIltBLVphLXowLTlfLV17MSw0MDB9IiwgdG9rZW4pOgogICAgICAgIHJhaXNlIENhdGFsb2dSZXF1ZXN0RXJyb3IoNDAwLCAiSW52YWxpZCBjYXRhbG9nIGN1cnNvciIpCiAgICB0cnk6CiAgICAgICAgZGF0YSA9IGpzb24ubG9hZHMoYmFzZTY0LmI2NGRlY29kZSh0b2tlbiArICI9IiAqICgtbGVuKHRva2VuKSAlIDQpLCBhbHRjaGFycz1iIi1fIiwgdmFsaWRhdGU9VHJ1ZSkpCiAgICAgICAgaWYgbm90IGlzaW5zdGFuY2UoZGF0YSwgZGljdCkgb3Igc2V0KGRhdGEpICE9IHsidiIsICJhIiwgInMiLCAiZiJ9IG9yIGRhdGFbInYiXSAhPSAxIG9yIGlzaW5zdGFuY2UoZGF0YVsiYSJdLCBib29sKSBvciBub3QgaXNpbnN0YW5jZShkYXRhWyJhIl0sIGludCkgb3Igbm90IDAgPCBkYXRhWyJhIl0gPCAyKio2MzoKICAgICAgICAgICAgcmFpc2UgVmFsdWVFcnJvcigpCiAgICBleGNlcHQgKFZhbHVlRXJyb3IsIFR5cGVFcnJvciwgVW5pY29kZURlY29kZUVycm9yKToKICAgICAgICByYWlzZSBDYXRhbG9nUmVxdWVzdEVycm9yKDQwMCwgIkludmFsaWQgY2F0YWxvZyBjdXJzb3IiKQogICAgaWYgZGF0YVsicyJdICE9IHNuYXBzaG90IG9yIGRhdGFbImYiXSAhPSBiaW5kaW5nOgogICAgICAgIHJhaXNlIENhdGFsb2dSZXF1ZXN0RXJyb3IoNDA5LCAiQ2F0YWxvZyBvciBmaWx0ZXJzIGNoYW5nZWQuIFN0YXJ0IGJyb3dzaW5nIGZyb20gdGhlIGZpcnN0IHBhZ2UuIikKICAgIHJldHVybiBkYXRhWyJhIl0KCgpkZWYgYnJvd3NlX2NhdGFsb2coZGF0YWJhc2UsIGFyZ3MsIGNhdGVnb3J5X3doZXJlKToKICAgIHF1ZXJ5LCBtYWtlciwgY2F0ZWdvcnksIHRva2VuID0gcXVlcnlfZmllbGRzKGFyZ3MpCiAgICBpbmZvID0gY2F0YWxvZ19pbmZvKGRhdGFiYXNlKQogICAgYmluZGluZyA9IGhhc2hsaWIuc2hhMjU2KGpzb24uZHVtcHMoW3F1ZXJ5LCBtYWtlciwgY2F0ZWdvcnldLCBlbnN1cmVfYXNjaWk9VHJ1ZSwgc2VwYXJhdG9ycz0oIiwiLCAiOiIpKS5lbmNvZGUoKSkuaGV4ZGlnZXN0KClbOjIwXQogICAgYWZ0ZXIgPSBjdXJzb3JfYWZ0ZXIodG9rZW4sIGluZm9bInNuYXBzaG90S2V5Il0sIGJpbmRpbmcpCiAgICBzcWwgPSAiU0VMRUNUIHAuaWQscC5tZmdfcGFydCxwLnN1cHBsaWVyX3NrdSxwLmRpc3RyaWJ1dG9yX2lkLHAuZGVzY3JpcHRpb24scC5tYW51ZmFjdHVyZXIscC5wcm9kdWN0X2ZhbWlseSBGUk9NIHByb2R1Y3RzIHAiCiAgICB3aGVyZSwgdmFsdWVzID0gWyJwLmlkID4gPyJdLCBbYWZ0ZXJdCiAgICBpZiBxdWVyeToKICAgICAgICB3b3JkcyA9IHJlLmZpbmRhbGwociJbQS1aYS16MC05XSsiLCBxdWVyeSlbOjddCiAgICAgICAgaWYgbm90IHdvcmRzOgogICAgICAgICAgICByZXR1cm4geyoqaW5mbywgIml0ZW1zIjogW10sICJoYXNNb3JlIjogRmFsc2UsICJuZXh0Q3Vyc29yIjogTm9uZSwgImNhdGVnb3J5IjogY2F0ZWdvcnksICJjYXRlZ29yeUFwcHJveGltYXRlIjogY2F0ZWdvcnkgIT0gImFsbCJ9CiAgICAgICAgc3FsICs9ICIgSk9JTiBwcm9kdWN0X3NlYXJjaCBPTiBwcm9kdWN0X3NlYXJjaC5yb3dpZD1wLmlkIgogICAgICAgIHdoZXJlLmFwcGVuZCgicHJvZHVjdF9zZWFyY2ggTUFUQ0ggPyIpCiAgICAgICAgdmFsdWVzLmFwcGVuZCgiICIuam9pbignIicgKyB3ICsgJyIqJyBmb3IgdyBpbiB3b3JkcykpCiAgICBpZiBtYWtlcjoKICAgICAgICB3aGVyZS5hcHBlbmQoInAubWFudWZhY3R1cmVyIExJS0UgPyBFU0NBUEUgJ1xcJyIpCiAgICAgICAgdmFsdWVzLmFwcGVuZCgiJSIgKyBtYWtlci5yZXBsYWNlKCJcXCIsICJcXFxcIikucmVwbGFjZSgiJSIsICJcXCUiKS5yZXBsYWNlKCJfIiwgIlxcXyIpICsgIiUiKQogICAgZXh0cmEsIGV4dHJhX3ZhbHVlcyA9IGNhdGVnb3J5X3doZXJlKGNhdGVnb3J5KQogICAgc3FsICs9ICIgV0hFUkUgIiArICIgQU5EICIuam9pbih3aGVyZSkgKyBleHRyYSArICIgT1JERVIgQlkgcC5pZCBMSU1JVCA/IgogICAgdmFsdWVzICs9IGV4dHJhX3ZhbHVlcyArIFtQQUdFX1NJWkUgKyAxXQogICAgd2l0aCBjbG9zaW5nKGNvbm5lY3Rpb24oZGF0YWJhc2UpKSBhcyBjb246CiAgICAgICAgcm93cyA9IGNvbi5leGVjdXRlKHNxbCwgdmFsdWVzKS5mZXRjaGFsbCgpCiAgICBpZiBjYXRhbG9nX2luZm8oZGF0YWJhc2UpWyJzbmFwc2hvdEtleSJdICE9IGluZm9bInNuYXBzaG90S2V5Il06CiAgICAgICAgcmFpc2UgQ2F0YWxvZ1JlcXVlc3RFcnJvcig0MDksICJDYXRhbG9nIGNoYW5nZWQgZHVyaW5nIHRoaXMgcmVhZC4gU3RhcnQgYWdhaW4uIikKICAgIG5leHRfY3Vyc29yID0gTm9uZQogICAgaWYgbGVuKHJvd3MpID4gUEFHRV9TSVpFOgogICAgICAgIHBheWxvYWQgPSB7InYiOiAxLCAiYSI6IGludChyb3dzW1BBR0VfU0laRSAtIDFdWzBdKSwgInMiOiBpbmZvWyJzbmFwc2hvdEtleSJdLCAiZiI6IGJpbmRpbmd9CiAgICAgICAgbmV4dF9jdXJzb3IgPSBiYXNlNjQudXJsc2FmZV9iNjRlbmNvZGUoanNvbi5kdW1wcyhwYXlsb2FkLCBzZXBhcmF0b3JzPSgiLCIsICI6IikpLmVuY29kZSgpKS5kZWNvZGUoKS5yc3RyaXAoIj0iKQogICAgbmFtZXMgPSAoIm1mZ1BhcnQiLCAic3VwcGxpZXJTa3UiLCAiZGlzdHJpYnV0b3JJZCIsICJkZXNjcmlwdGlvbiIsICJtYW51ZmFjdHVyZXIiLCAicHJvZHVjdEZhbWlseSIpCiAgICByZXR1cm4geyoqaW5mbywgIml0ZW1zIjogW2RpY3QoemlwKG5hbWVzLCByWzE6XSkpIGZvciByIGluIHJvd3NbOlBBR0VfU0laRV1dLCAiaGFzTW9yZSI6IG5leHRfY3Vyc29yIGlzIG5vdCBOb25lLAogICAgICAgICAgICAibmV4dEN1cnNvciI6IG5leHRfY3Vyc29yLCAiY2F0ZWdvcnkiOiBjYXRlZ29yeSwgImNhdGVnb3J5QXBwcm94aW1hdGUiOiBjYXRlZ29yeSAhPSAiYWxsIn0KCgpkZWYgaGFuZGxlX2NhdGFsb2dfcmVhZChyb3V0ZSwgYXJncywgZGF0YWJhc2UsIGNhdGVnb3J5X3doZXJlKToKICAgIGlmIHJvdXRlIG5vdCBpbiAoIi9icm93c2UiLCAiL2NhdGFsb2ctaW5mbyIpOgogICAgICAgIHJldHVybiBOb25lCiAgICB0cnk6CiAgICAgICAgaWYgcm91dGUgPT0gIi9jYXRhbG9nLWluZm8iOgogICAgICAgICAgICBpZiBhcmdzOgogICAgICAgICAgICAgICAgcmFpc2UgQ2F0YWxvZ1JlcXVlc3RFcnJvcig0MDAsICJDYXRhbG9nIGluZm8gdGFrZXMgbm8gcXVlcnkgZmllbGRzIikKICAgICAgICAgICAgcmV0dXJuIDIwMCwgY2F0YWxvZ19pbmZvKGRhdGFiYXNlKQogICAgICAgIHJldHVybiAyMDAsIGJyb3dzZV9jYXRhbG9nKGRhdGFiYXNlLCBhcmdzLCBjYXRlZ29yeV93aGVyZSkKICAgIGV4Y2VwdCBDYXRhbG9nUmVxdWVzdEVycm9yIGFzIGV4YzoKICAgICAgICByZXR1cm4gZXhjLnN0YXR1cywgeyJlcnJvciI6IHN0cihleGMpfQogICAgZXhjZXB0IChzcWxpdGUzLkVycm9yLCBPU0Vycm9yLCBWYWx1ZUVycm9yLCBUeXBlRXJyb3IsIE92ZXJmbG93RXJyb3IpOgogICAgICAgIHJldHVybiA1MDMsIHsiZXJyb3IiOiAiVGhlIGZ1bGwgY2F0YWxvZyBpbmRleCBpcyB0ZW1wb3JhcmlseSB1bmF2YWlsYWJsZSJ9Cg=="))
    [IO.File]::WriteAllBytes($Patcher, [Convert]::FromBase64String("IiIiUHJlcGFyZSBhIGd1YXJkZWQgYWRkaXRpdmUgZ2F0ZXdheSBwYXRjaC4gRG9lcyBub3QgaW1wb3J0IHRoZSBnYXRld2F5IG9yIG9wZW4gaXRzIGRhdGFiYXNlLiIiIgppbXBvcnQgYXN0CmltcG9ydCBpbwpmcm9tIHBhdGhsaWIgaW1wb3J0IFBhdGgKaW1wb3J0IHN5cwppbXBvcnQgdG9rZW5pemUKCkJMT0NLID0gJycnICAgICAgICBmcm9tIGNhdGFsb2dfaW52ZW50b3J5IGltcG9ydCBoYW5kbGVfY2F0YWxvZ19yZWFkCiAgICAgICAgaW52ZW50b3J5ID0gaGFuZGxlX2NhdGFsb2dfcmVhZChyb3V0ZS5wYXRoLCBwYXJzZV9xcyhyb3V0ZS5xdWVyeSwga2VlcF9ibGFua192YWx1ZXM9VHJ1ZSksIERCLCBjYXRlZ29yeV93aGVyZSkKICAgICAgICBpZiBpbnZlbnRvcnkgaXMgbm90IE5vbmU6CiAgICAgICAgICAgIHJldHVybiBzZWxmLnJlc3BvbmQoKmludmVudG9yeSkKJycnCgoKZGVmIHBhdGNoX3NvdXJjZShkYXRhKToKICAgIGVuY29kaW5nLCBfID0gdG9rZW5pemUuZGV0ZWN0X2VuY29kaW5nKGlvLkJ5dGVzSU8oZGF0YSkucmVhZGxpbmUpCiAgICB0ZXh0ID0gZGF0YS5kZWNvZGUoZW5jb2RpbmcpCiAgICB0cmVlID0gYXN0LnBhcnNlKHRleHQpCiAgICBoYW5kbGVycyA9IFtuIGZvciBjIGluIHRyZWUuYm9keSBpZiBpc2luc3RhbmNlKGMsIGFzdC5DbGFzc0RlZikgYW5kIGMubmFtZSA9PSAnSGFuZGxlcicKICAgICAgICAgICAgICAgIGZvciBuIGluIGMuYm9keSBpZiBpc2luc3RhbmNlKG4sIGFzdC5GdW5jdGlvbkRlZikgYW5kIG4ubmFtZSA9PSAnZG9fR0VUJ10KICAgIGlmIGxlbihoYW5kbGVycykgIT0gMToKICAgICAgICByYWlzZSBWYWx1ZUVycm9yKCdFeHBlY3RlZCBvbmUgY2F0YWxvZyBHRVQgaGFuZGxlcjsgbm90aGluZyBjaGFuZ2VkLicpCiAgICBzZWdtZW50ID0gYXN0LmdldF9zb3VyY2Vfc2VnbWVudCh0ZXh0LCBoYW5kbGVyc1swXSkKICAgIGF1dGggPSAnaWYgbm90IGhtYWMuY29tcGFyZV9kaWdlc3Qoc2VsZi5oZWFkZXJzLmdldCgiQXV0aG9yaXphdGlvbiIsICIiKSwgIkJlYXJlciAiICsgVE9LRU4pOicKICAgIG1hcmtlciA9ICdyb3V0ZSA9IHVybHNwbGl0KHNlbGYucGF0aCknCiAgICBpZiBhdXRoIG5vdCBpbiBzZWdtZW50IG9yIG1hcmtlciBub3QgaW4gc2VnbWVudCBvciBzZWdtZW50LmluZGV4KGF1dGgpID4gc2VnbWVudC5pbmRleChtYXJrZXIpOgogICAgICAgIHJhaXNlIFZhbHVlRXJyb3IoJ0F1dGhlbnRpY2F0ZWQgZ2F0ZXdheSBzb3VyY2UgZGlkIG5vdCBtYXRjaDsgbm90aGluZyBjaGFuZ2VkLicpCiAgICBpZiAnaGFuZGxlX2NhdGFsb2dfcmVhZCcgaW4gdGV4dDoKICAgICAgICBpZiAnaW52ZW50b3J5ID0gaGFuZGxlX2NhdGFsb2dfcmVhZChyb3V0ZS5wYXRoLCBwYXJzZV9xcyhyb3V0ZS5xdWVyeSwga2VlcF9ibGFua192YWx1ZXM9VHJ1ZSksIERCLCBjYXRlZ29yeV93aGVyZSknIG5vdCBpbiB0ZXh0OgogICAgICAgICAgICByYWlzZSBWYWx1ZUVycm9yKCdBbiB1bnJlY29nbml6ZWQgY2F0YWxvZyBleHRlbnNpb24gaXMgaW5zdGFsbGVkOyBub3RoaW5nIGNoYW5nZWQuJykKICAgICAgICBjb21waWxlKHRleHQsICc8ZXhpc3RpbmcgZ2F0ZXdheT4nLCAnZXhlYycpCiAgICAgICAgcmV0dXJuIGRhdGEKICAgIG5ld2xpbmUgPSAnXHJcbicgaWYgJ1xyXG4nIGluIHRleHQgZWxzZSAnXG4nCiAgICBuZWVkbGUgPSAnICAgICAgICByb3V0ZSA9IHVybHNwbGl0KHNlbGYucGF0aCknICsgbmV3bGluZQogICAgaWYgdGV4dC5jb3VudChuZWVkbGUpICE9IDE6CiAgICAgICAgcmFpc2UgVmFsdWVFcnJvcignRXhwZWN0ZWQgYSBzaW5nbGUgZ2F0ZXdheSByb3V0ZSBkaXNwYXRjaDsgbm90aGluZyBjaGFuZ2VkLicpCiAgICB1cGRhdGVkID0gdGV4dC5yZXBsYWNlKG5lZWRsZSwgbmVlZGxlICsgQkxPQ0sucmVwbGFjZSgnXG4nLCBuZXdsaW5lKSwgMSkKICAgIGNvbXBpbGUodXBkYXRlZCwgJzxjYW5kaWRhdGUgZ2F0ZXdheT4nLCAnZXhlYycpCiAgICByZXR1cm4gdXBkYXRlZC5lbmNvZGUoZW5jb2RpbmcpCgoKaWYgX19uYW1lX18gPT0gJ19fbWFpbl9fJzoKICAgIGlmIGxlbihzeXMuYXJndikgIT0gMzoKICAgICAgICByYWlzZSBTeXN0ZW1FeGl0KCdQcm92aWRlIHNvdXJjZSBhbmQgY2FuZGlkYXRlIHBhdGhzLicpCiAgICB0cnk6CiAgICAgICAgc291cmNlLCBkZXN0aW5hdGlvbiA9IG1hcChQYXRoLCBzeXMuYXJndlsxOl0pCiAgICAgICAgaWYgc291cmNlLnJlc29sdmUoKSA9PSBkZXN0aW5hdGlvbi5yZXNvbHZlKCk6CiAgICAgICAgICAgIHJhaXNlIFZhbHVlRXJyb3IoJ0NhbmRpZGF0ZSBtdXN0IG5vdCBvdmVyd3JpdGUgdGhlIHNvdXJjZS4nKQogICAgICAgIGRlc3RpbmF0aW9uLndyaXRlX2J5dGVzKHBhdGNoX3NvdXJjZShzb3VyY2UucmVhZF9ieXRlcygpKSkKICAgICAgICBwcmludCgnQXV0aGVudGljYXRlZCBhZGRpdGl2ZSBnYXRld2F5IHBhdGNoIGNvbXBpbGVkOiBQQVNTJykKICAgIGV4Y2VwdCAoT1NFcnJvciwgVmFsdWVFcnJvciwgU3ludGF4RXJyb3IsIFVuaWNvZGVFcnJvcikgYXMgZXJyb3I6CiAgICAgICAgcHJpbnQoJ1BhdGNoIG5vdCBwcmVwYXJlZDonLCBzdHIoZXJyb3IpKQogICAgICAgIHJhaXNlIFN5c3RlbUV4aXQoMSkK"))
    if ((Get-FileHash -LiteralPath $HelperStage -Algorithm SHA256).Hash -ne "c463fb331beae525f74a1c28cf4eeb75df7ea1feda9f2bd6c88e3f44058d502e") { throw "Embedded module failed its checksum." }
    & $Python -c "import pathlib,sys; compile(pathlib.Path(sys.argv[1]).read_bytes(), sys.argv[1], 'exec')" $HelperStage
    if ($LASTEXITCODE -ne 0) { throw "The full-catalog helper did not compile." }
    & $Python $Patcher $Source $SourceStage
    if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $SourceStage)) { throw "Gateway candidate was not prepared." }
    if ((Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash -ne $BeforeHash) { throw "Gateway changed during preflight. Nothing installed." }
    $CandidateHash = (Get-FileHash -LiteralPath $SourceStage -Algorithm SHA256).Hash
    # Use real backup paths; null File.Replace backup paths previously failed on this Windows setup.
    if ($HelperExisted) { [IO.File]::Replace($HelperStage, $Helper, $HelperBackup) } else { [IO.File]::Move($HelperStage, $Helper) }
    $HelperInstalled = $true
    [IO.File]::Replace($SourceStage, $Source, $SourceBackup)
    $SourceInstalled = $true
    if ((Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash -ne $CandidateHash) { throw "Installed source did not match the compiled candidate." }
    if ((Get-FileHash -LiteralPath $Helper -Algorithm SHA256).Hash -ne "c463fb331beae525f74a1c28cf4eeb75df7ea1feda9f2bd6c88e3f44058d502e") { throw "Installed catalog helper did not match its checksum." }
    if ((Get-FileHash -LiteralPath $SourceBackup -Algorithm SHA256).Hash -ne $BeforeHash) { throw "Original source backup did not match." }
    Write-Host "[3/5] Restarting only the verified catalog gateway..." -ForegroundColor Cyan
    $Running = VerifiedListener
    if ($Running) { Stop-Process -Id $Running.ProcessId -Force; $GatewayStopped = $true; Start-Sleep -Seconds 2 }
    StartGateway
    $Info = WaitForCatalog
    Write-Host "[4/5] Verifying full-index browsing and safe pagination..." -ForegroundColor Cyan
    $Page1 = Invoke-RestMethod -Uri "http://127.0.0.1:8766/browse?category=all" -Headers $Headers -TimeoutSec 30
    if ($Page1.capability -ne "full-catalog-v1" -or $Page1.totalRecords -le 0 -or @($Page1.items).Count -eq 0) { throw "The index did not return products." }
    if ($Page1.hasMore) {
        $Cursor = [Uri]::EscapeDataString([string]$Page1.nextCursor)
        $Page2 = Invoke-RestMethod -Uri ("http://127.0.0.1:8766/browse?category=all&cursor=" + $Cursor) -Headers $Headers -TimeoutSec 30
        if (@($Page2.items).Count -eq 0 -or $Page2.snapshotKey -ne $Page1.snapshotKey) { throw "Next-page verification failed." }
    }
    $Unauthorized = $false
    try { Invoke-RestMethod -Uri "http://127.0.0.1:8766/catalog-info" -TimeoutSec 10 | Out-Null } catch { if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401) { $Unauthorized = $true } }
    if (!$Unauthorized) { throw "Catalog authentication verification failed." }
    Write-Host "[5/5] FULL CATALOG BROWSING VERIFIED" -ForegroundColor Green
    Write-Host ("Source records: {0:N0}" -f [long]$Info.totalRecords)
    Write-Host "The existing full database was reused; no product-by-product import or raw-cost publication occurred."
    Write-Host ("Rollback gateway backup: " + $SourceBackup)
    Write-Host "Refresh the shopping preview. Add-to-cart pricing and freight remain automatic."
} catch {
    Write-Host ("FULL CATALOG UPDATE NOT VERIFIED: " + $_.Exception.Message) -ForegroundColor Red
    if ($SourceInstalled -and (Test-Path -LiteralPath $SourceBackup)) {
        try {
            $Owner = VerifiedListener
            if ($Owner) { Stop-Process -Id $Owner.ProcessId -Force; Start-Sleep -Seconds 1 }
            [IO.File]::Copy($SourceBackup, $Source, $true)
            if ($HelperExisted -and (Test-Path -LiteralPath $HelperBackup)) { [IO.File]::Copy($HelperBackup, $Helper, $true) }
            StartGateway
            Write-Host "Original gateway source restored and launcher restarted. Keep the backup; original live health still needs checking." -ForegroundColor Yellow
        } catch { Write-Host ("Automatic rollback did not complete. Retained backup: " + $SourceBackup) -ForegroundColor Red }
    } elseif ($HelperInstalled -and $HelperExisted -and (Test-Path -LiteralPath $HelperBackup)) {
        [IO.File]::Copy($HelperBackup, $Helper, $true)
    }
    throw
} finally {
    foreach ($Path in @($SourceStage, $HelperStage, $Patcher)) { if (Test-Path -LiteralPath $Path) { Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue } }
    Remove-Variable Token, Headers -ErrorAction SilentlyContinue
}
