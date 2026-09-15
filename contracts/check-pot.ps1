# LOOPTERNITY mint-pot checker (Circle Arc testnet 5042002).
# Usage:  powershell -ExecutionPolicy Bypass -File .\check-pot.ps1
#     or:  .\check-pot.cmd   (from cmd.exe)

$contract = "0x991Ad2Bb19e57fB427250ec9AEEd312e60d21990"
$rpc      = "https://rpc.testnet.arc.io"
$cast     = "$env:USERPROFILE\.foundry\bin\cast.exe"

if (-not (Test-Path $cast)) { Write-Error "cast.exe not found at $cast - install Foundry."; exit 1 }

$pot    = & $cast balance $contract --rpc-url $rpc --ether
$supply = & $cast call $contract "totalSupply()(uint256)" --rpc-url $rpc
if ($supply -match '\[(\d+)\]') { $supply = $Matches[1] } else { $supply = [Convert]::ToUInt64($supply, 16) }

Write-Host "LOOPITERNS contract : $contract"
Write-Host "Mint pot           : $pot native USDC"
Write-Host "Total minted       : $supply / 10000"
