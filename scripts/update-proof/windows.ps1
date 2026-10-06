# Proves the PREVIOUS release updates itself to THIS one on Windows (SPEC.md 14).
# Run by release.yml after publishing. Needs GH_TOKEN, NEW_TAG and PREV_TAG.
$ErrorActionPreference = 'Stop'
$new = $env:NEW_TAG.TrimStart('v')
$prev = $env:PREV_TAG.TrimStart('v')
$repo = $env:GITHUB_REPOSITORY
$exe = Join-Path $env:LOCALAPPDATA 'Programs\Locker Manager\Locker Manager.exe'
$log = Join-Path $env:APPDATA 'Locker Manager\logs\main.log'

# Windows reports file versions with four parts (0.1.0.0); compare on three.
function Installed-Version { if (Test-Path $exe) { ((Get-Item $exe).VersionInfo.ProductVersion -replace '^(\d+\.\d+\.\d+)\.0$', '$1') } else { '' } }
function Show-Log { if (Test-Path $log) { Write-Host '----- app log -----'; Get-Content $log -Tail 60 } }
function Wait-For([scriptblock]$cond, [int]$seconds, [string]$what) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) { if (& $cond) { return } ; Start-Sleep -Seconds 3 }
  Show-Log
  throw "Timed out after $seconds s waiting for: $what"
}

Write-Host "Installing $prev silently (per user)"
New-Item -ItemType Directory -Force prev | Out-Null
gh release download $env:PREV_TAG --repo $repo --pattern "Locker-Manager-Setup-$prev.exe" --dir prev --clobber
Start-Process -Wait -FilePath "prev\Locker-Manager-Setup-$prev.exe" -ArgumentList '/S'
Wait-For { Test-Path $exe } 120 'the installed app'
$v = Installed-Version
Write-Host "Installed version: $v"
if ($v -ne $prev) { throw "Expected $prev to be installed, found $v" }

Write-Host "Starting $prev; it checks for updates 30 seconds after launch"
if (Test-Path $log) { Remove-Item $log }
Start-Process -FilePath $exe
Wait-For { (Test-Path $log) -and (Select-String -Path $log -Pattern "has been downloaded" -Quiet) } 600 "version $new to download"
Select-String -Path $log -Pattern "Found version|has been downloaded" | ForEach-Object { Write-Host $_.Line }

Write-Host 'Closing the app normally; the update installs on quit'
taskkill /IM "Locker Manager.exe" | Out-Null
Wait-For { -not (Get-Process -Name 'Locker Manager' -ErrorAction SilentlyContinue) } 60 'the app to close'
Wait-For { (Installed-Version) -eq $new } 300 "the installed version to become $new"

Write-Host "Starting $new to check it runs"
Remove-Item $log -ErrorAction SilentlyContinue
Start-Process -FilePath $exe
Wait-For { (Test-Path $log) -and (Select-String -Path $log -Pattern "Locker Manager $new starting" -Quiet) } 120 "$new to start"
taskkill /IM "Locker Manager.exe" | Out-Null

$msg = "Windows: $prev found, downloaded and installed $new by itself, and $new starts."
Write-Host $msg
Add-Content -Path $env:GITHUB_STEP_SUMMARY -Value "- $msg"
