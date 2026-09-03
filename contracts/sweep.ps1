# LOOPTERNITY treasury sweep (Robinhood Chain 4663).
# Withdraws the FULL contract balance to the treasury via withdraw(to).
# Reads PRIVATE_KEY from .env in this folder - never prints it.
# Usage:  powershell -ExecutionPolicy Bypass -File .\sweep.ps1
#     or:  .\sweep.cmd   (from cmd.exe)

$ErrorActionPreference = "Stop"

$contract = "0x7016CfF42264C8D499a32bBe2b5A039bfd0Ed19f"
$treasury = "0xED638d2de9E7b6E8D06514A161bb2cEFf28bfCDd"
$rpc      = "https://rpc.mainnet.chain.robinhood.com"
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
Write-Host "Mint pot: $pot ETH"
if ([double]::Parse($pot, [Globalization.CultureInfo]::InvariantCulture) -eq 0) {
    Write-Host "Nothing to withdraw yet - the pot is empty."
    exit 0
}

$confirm = Read-Host "Sweep $pot ETH to treasury $treasury ? (y/N)"
if ($confirm -notin @('y', 'Y')) { Write-Host "Cancelled - nothing sent."; exit 0 }

& $cast send $contract "withdraw(address)" $treasury --rpc-url $rpc --private-key $key
Write-Host "Done. Balance now: $(& $cast balance $contract --rpc-url $rpc --ether) ETH"
