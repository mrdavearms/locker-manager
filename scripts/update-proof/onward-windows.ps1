# Proves a freshly built Windows installer gives a copy that can update ITSELF to a
# later version, before it is published (docs/audits/2026-10-20-stability-audit.md,
# finding 4: 0.11.0 to 0.11.3 shipped able to install but not to update onward).
#
# Usage: onward-windows.ps1 -NewInstaller <this version's installer> -NextInstaller <the
# same commit built with the version raised by one>
#
# Installs this version per user as a copy that has already updated once, points it at
# a web server on this computer that offers the next version, starts it, and waits for
# it to install the next version, restart into it and pass its self-test.
param(
  [Parameter(Mandatory = $true)][string]$NewInstaller,
  [Parameter(Mandatory = $true)][string]$NextInstaller
)
$ErrorActionPreference = 'Stop'
$port = if ($env:ONWARD_PORT) { $env:ONWARD_PORT } else { '8765' }
$installDir = Join-Path $env:LOCALAPPDATA 'Programs\Locker Manager'
$exe = Join-Path $installDir 'Locker Manager.exe'
$userData = Join-Path $env:APPDATA 'Locker Manager'
$log = Join-Path $userData 'logs\main.log'
$feed = Join-Path $env:RUNNER_TEMP 'onward-feed'

function Installed-Version { if (Test-Path $exe) { ((Get-Item $exe).VersionInfo.ProductVersion -replace '^(\d+\.\d+\.\d+)\.0$', '$1') } else { '' } }
function Show-Log { if (Test-Path $log) { Write-Host '----- app log -----'; Get-Content $log -Tail 80 } }
function Wait-For([scriptblock]$cond, [int]$seconds, [string]$what) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) { if (& $cond) { return } ; Start-Sleep -Seconds 3 }
  Show-Log
  throw "Timed out after $seconds s waiting for: $what"
}

Write-Host "Installing $NewInstaller silently (per user)"
Start-Process -Wait -FilePath $NewInstaller -ArgumentList '/S'
Wait-For { Test-Path $exe } 120 'the installed app'
$new = Installed-Version
$parts = $new.Split('.')
$next = "$($parts[0]).$($parts[1]).$([int]$parts[2] + 1)"
Write-Host "Proving $new updates itself to $next"

# A copy that has already updated once: the note of that update, and a leftover download.
New-Item -ItemType Directory -Force $userData | Out-Null
Set-Content -Path (Join-Path $userData 'update-attempt.json') -Value "{`"version`":`"$new`"}" -Encoding ascii
$pending = Join-Path $env:LOCALAPPDATA 'locker-manager-onward-proof\pending'
New-Item -ItemType Directory -Force $pending | Out-Null
Copy-Item $NewInstaller (Join-Path $pending 'Locker-Manager-Setup-old.exe')

# The feed on this computer only.
"provider: generic`nurl: http://127.0.0.1:$port/`nupdaterCacheDirName: locker-manager-onward-proof`n" |
  Set-Content -Path (Join-Path $installDir 'resources\app-update.yml') -Encoding ascii
New-Item -ItemType Directory -Force $feed | Out-Null
Copy-Item $NextInstaller (Join-Path $feed 'next.exe')
$bytes = [System.IO.File]::ReadAllBytes((Join-Path $feed 'next.exe'))
$sha = [Convert]::ToBase64String([System.Security.Cryptography.SHA512]::Create().ComputeHash($bytes))
$date = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.000Z')
@"
version: $next
files:
  - url: http://127.0.0.1:$port/next.exe
    sha512: $sha
    size: $($bytes.Length)
path: http://127.0.0.1:$port/next.exe
sha512: $sha
releaseDate: '$date'
"@ | Set-Content -Path (Join-Path $feed 'latest.yml') -Encoding ascii
$server = Start-Process -PassThru -WindowStyle Hidden -FilePath python -ArgumentList '-m', 'http.server', $port, '--bind', '127.0.0.1', '--directory', $feed
try {
  Start-Sleep -Seconds 2
  if (Test-Path $log) { Remove-Item $log }
  Start-Process -FilePath $exe
  Wait-For { (Installed-Version) -eq $next } 300 "the installed version to become $next"
  Wait-For { (Test-Path $log) -and (Select-String -Path $log -Pattern "Locker Manager $next starting" -Quiet) } 120 "$next to start"
  Show-Log
  if (-not (Select-String -Path $log -Pattern 'windows-self-install=yes' -Quiet)) { throw "$new did not start able to install updates" }
  if (Select-String -Path $log -Pattern 'windows-install-failed' -Quiet) { throw 'the install was recorded as failed' }
} finally {
  taskkill /IM "Locker Manager.exe" /F 2>$null | Out-Null
  Stop-Process -Id $server.Id -ErrorAction SilentlyContinue
}
Wait-For { -not (Get-Process -Name 'Locker Manager' -ErrorAction SilentlyContinue) } 60 'the app to close'

$test = Start-Process -Wait -PassThru -FilePath $exe -ArgumentList '--self-test'
if ($test.ExitCode -ne 0) { Show-Log; throw "$next failed its self-test after updating" }
$msg = "Windows: $new, after an earlier update, updated itself to $next and passed its self-test."
Write-Host $msg
if ($env:GITHUB_STEP_SUMMARY) { Add-Content -Path $env:GITHUB_STEP_SUMMARY -Value "- $msg" }
