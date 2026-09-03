# LOOPTERNITY mint-pot checker (Robinhood Chain 4663).
# Usage:  powershell -ExecutionPolicy Bypass -File .\check-pot.ps1
#     or:  .\check-pot.cmd   (from cmd.exe)

$contract = "0x7016CfF42264C8D499a32bBe2b5A039bfd0Ed19f"
$rpc      = "https://rpc.mainnet.chain.robinhood.com"
$cast     = "$env:USERPROFILE\.foundry\bin\cast.exe"

if (-not (Test-Path $cast)) { Write-Error "cast.exe not found at $cast - install Foundry."; exit 1 }

$pot    = & $cast balance $contract --rpc-url $rpc --ether
$supply = & $cast call $contract "totalSupply()(uint256)" --rpc-url $rpc
if ($supply -match '\[(\d+)\]') { $supply = $Matches[1] } else { $supply = [Convert]::ToUInt64($supply, 16) }

Write-Host "LOOPITERNS contract : $contract"
Write-Host "Mint pot           : $pot ETH"
Write-Host "Total minted       : $supply / 10000"
