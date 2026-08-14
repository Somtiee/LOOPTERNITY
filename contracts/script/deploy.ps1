# Deploy LoopternityVault (Foundry). Run from repo root or contracts/.
# Usage: powershell -File contracts/script/deploy.ps1 [-Network sepolia|mainnet] [-Verify]
param(
  [ValidateSet("sepolia", "mainnet")]
  [string]$Network = "sepolia",
  [switch]$Verify
)

$ErrorActionPreference = "Stop"
$contracts = Split-Path -Parent $PSScriptRoot
Set-Location $contracts

$foundryBin = Join-Path $env:USERPROFILE ".foundry\bin"
if (Test-Path $foundryBin) {
  $env:PATH = "$foundryBin;" + $env:PATH
}

$envFile = Join-Path $contracts ".env"
if (-not (Test-Path $envFile)) {
  throw "Missing $envFile. Copy .env.example to .env and set PRIVATE_KEY (never commit it)."
}

Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) { return }
  $eq = $line.IndexOf("=")
  if ($eq -lt 1) { return }
  $name = $line.Substring(0, $eq).Trim()
  $value = $line.Substring($eq + 1).Trim()
  if ($value.StartsWith('"') -and $value.EndsWith('"') -and $value.Length -ge 2) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  Set-Item -Path "Env:$name" -Value $value
}

if (-not $env:PRIVATE_KEY) {
  throw "PRIVATE_KEY is empty in contracts/.env"
}

$rpc = if ($Network -eq "mainnet") {
  if ($env:BASE_MAINNET_RPC_URL) { $env:BASE_MAINNET_RPC_URL } else { "https://mainnet.base.org" }
} else {
  if ($env:BASE_SEPOLIA_RPC_URL) { $env:BASE_SEPOLIA_RPC_URL } else { "https://sepolia.base.org" }
}
$chainId = if ($Network -eq "mainnet") { 8453 } else { 84532 }

Write-Host "Network: $Network (chain $chainId)"
Write-Host "RPC: $rpc"
Write-Host "ENTRY_FEE_WEI: $($env:ENTRY_FEE_WEI)"

$deployer = (& cast wallet address --private-key $env:PRIVATE_KEY).Trim()
Write-Host "Deployer: $deployer"

$bal = (& cast balance $deployer --rpc-url $rpc).Trim()
Write-Host "Balance wei: $bal"
if ([bigint]$bal -eq 0) {
  throw "Deployer has 0 ETH on $Network. Fund $deployer then re-run."
}

$env:FOUNDRY_PROFILE = "deploy"

$verifyArgs = @()
if ($Verify -and $env:BASESCAN_API_KEY) {
  $verifyArgs = @("--verify", "--etherscan-api-key", $env:BASESCAN_API_KEY)
} elseif ($Verify) {
  Write-Host "BASESCAN_API_KEY empty - will try Sourcify after broadcast."
}

& forge script script/DeployLoopternityVault.s.sol:DeployLoopternityVault `
  --rpc-url $rpc `
  --broadcast `
  --slow `
  --chain $chainId `
  @verifyArgs

if ($LASTEXITCODE -ne 0) { throw "forge script failed ($LASTEXITCODE)" }

if ($Verify -and -not $env:BASESCAN_API_KEY) {
  $latest = Get-ChildItem (Join-Path $contracts "broadcast\DeployLoopternityVault.s.sol\$chainId") -Filter "run-latest.json" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($latest) {
    $json = Get-Content $latest.FullName -Raw | ConvertFrom-Json
    $addr = $json.receipts[0].contractAddress
    if ($addr) {
      Write-Host "Sourcify verify $addr"
      & forge verify-contract $addr src/LoopternityVault.sol:LoopternityVault --chain $chainId --verifier sourcify
    }
  }
}

Write-Host "Done. Record address in src/web3/README.md. Sepolia is not mainnet."
