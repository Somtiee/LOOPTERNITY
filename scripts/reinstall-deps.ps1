# Clean reinstall for Windows when node_modules is corrupted / locked.
# Close other terminals and Node processes first, then:
#   powershell -ExecutionPolicy Bypass -File scripts/reinstall-deps.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "Stopping node processes..."
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

if (Test-Path "node_modules") {
  Write-Host "Removing node_modules (robocopy mirror)..."
  $empty = Join-Path $root "_empty_nm"
  New-Item -ItemType Directory -Force -Path $empty | Out-Null
  & robocopy $empty "node_modules" /mir /r:1 /w:1 /nfl /ndl /njh /njs /nc /ns /np | Out-Null
  Remove-Item -Recurse -Force "node_modules" -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force $empty -ErrorAction SilentlyContinue
}

if (Test-Path "package-lock.json") {
  Remove-Item -Force "package-lock.json"
}

Write-Host "npm install --legacy-peer-deps..."
npm install --legacy-peer-deps --no-fund --no-audit
Write-Host "Done."
