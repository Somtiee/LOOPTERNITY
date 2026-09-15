# LOOPTERNITY treasury sweep (Circle Arc testnet 5042002).
# Withdraws the FULL contract balance (native USDC) to the treasury via
# withdraw(to). Reads PRIVATE_KEY from .env in this folder - never prints it.
# Usage:  powershell -ExecutionPolicy Bypass -File .\sweep.ps1
#     or:  .\sweep.cmd   (from cmd.exe)

$ErrorActionPreference = "Stop"

$contract = "0x991Ad2Bb19e57fB427250ec9AEEd312e60d21990"
$treasury = "0xED638d2de9E7b6E8D06514A161bb2cEFf28bfCDd"
$rpc      = "https://rpc.testnet.arc.io"
$cast     = "$env:USERPROFILE\.foundry\bin\cast.exe"

if (-not (Test-Path $cast)) { Write-Error "cast.exe not found at $cast - install Foundry."; exit 1 }

$envFile = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $envFile)) { Write-Error ".env not found at $envFile"; exit 1 }

$key = Get-Content $envFile |
    Where-Object { $_ -match '^\s*PRIVATE_KEY\s*=' } |
    Select-Object -Last 1
$key = ($key -replace '^\s*PRIVATE_KEY\s*=\s*', '').Trim().Trim('"')
if (-not $key) { Write-Error "PRIVATE_KEY not set in $envFile"; exit 1 }

$pot = (& $cast balance $contract --rpc-url $rpc --ether).Trim()
Write-Host "Mint pot: $pot native USDC"
if ([double]::Parse($pot, [Globalization.CultureInfo]::InvariantCulture) -eq 0) {
    Write-Host "Nothing to withdraw yet - the pot is empty."
    exit 0
}

$confirm = Read-Host "Sweep $pot USDC to treasury $treasury ? (y/N)"
if ($confirm -notin @('y', 'Y')) { Write-Host "Cancelled - nothing sent."; exit 0 }

& $cast send $contract "withdraw(address)" $treasury --rpc-url $rpc --private-key $key
Write-Host "Done. Balance now: $(& $cast balance $contract --rpc-url $rpc --ether) native USDC"
