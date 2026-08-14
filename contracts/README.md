# LOOPTERNITY contracts (Foundry)

## Networks

| Network | Chain ID | Status |
| --- | --- | --- |
| **Base mainnet** | 8453 | **Live** — `0x66b549F570Fa63e3109B85FD15678c175F1a02c9` (see `deployments/base-mainnet.json`) |
| Base Sepolia | 84532 | Testnet — same CREATE address, different fee/state |

Confidential values use Inco Lightning `bytes` → `euint256` (`@inco/lightning-js` on the client).

`Lightning.baseSepoliaTestnet()` and `Lightning.baseMainnet()` share the **mainnet pepper** executor `0x4b9911b0191B0b6a6eA8F2Ed562e20Cff5AC8624` (CREATE2 on both chains). Deploy compiles against official `@inco/lightning@1.0.2` in `vendor/` (`FOUNDRY_PROFILE=deploy`). Local `forge test` still uses `lib/inco-lightning-shim`.

## Sepolia deploy (Prompt E)

Constructor:

- `entryFeeWei` = `20000000000000` (0.00002 ETH) — wei only, no USD in Solidity
- `treasury` = deployer EOA until a dedicated treasury is set
- owner / keeper = deployer

1. Copy `contracts/.env.example` → `contracts/.env` (gitignored). Set `PRIVATE_KEY`. Never commit it.
2. Fund the deployer with Base Sepolia ETH (~0.002 ETH is enough).
3. From `contracts/`:

```powershell
$env:PATH = "$env:USERPROFILE\.foundry\bin;" + $env:PATH
$env:FOUNDRY_PROFILE = "deploy"
powershell -File script/deploy.ps1 -Network sepolia -Verify
```

Or:

```bash
export FOUNDRY_PROFILE=deploy
forge script script/DeployLoopternityVault.s.sol:DeployLoopternityVault \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" --broadcast --slow --chain 84532
```

4. Verify (optional, needs `BASESCAN_API_KEY`):

```bash
forge verify-contract <ADDRESS> src/LoopternityVault.sol:LoopternityVault \
  --chain 84532 --watch \
  --constructor-args $(cast abi-encode "constructor(uint256,address)" 20000000000000 <TREASURY>)
```

Live Sepolia deployment (see `deployments/base-sepolia.json`):

| Field | Value |
| --- | --- |
| Vault | `0x66b549F570Fa63e3109B85FD15678c175F1a02c9` |
| Deployer / treasury / owner | `0xEacA26c65bd43803CB07319D5055bB7CF8DEC00c` |
| entryFeeWei | `20000000000000` |
| Deploy tx | `0x92cb931d5c5b9c8510eb5c9bac0e75f0fe85ecd08c0598b65cddf267abb70ea2` |
| Basescan | https://sepolia.basescan.org/address/0x66b549F570Fa63e3109B85FD15678c175F1a02c9 |
| Blockscout | https://base-sepolia.blockscout.com/address/0x66b549F570Fa63e3109B85FD15678c175F1a02c9 (source verified) |
| Sourcify | exact match |

Leave `.env.local` on mainnet (Prompt MAINNET). Sepolia is testnet only.

## Base mainnet (production)

Constructor:

- `entryFeeWei` = `26701128923731` (~$0.05 at deploy; ETH ~$1872.58) — wei only
- `treasury` = deployer EOA (**interim**; call `setTreasury` for a multisig)
- owner / keeper = deployer

| Field | Value |
| --- | --- |
| Vault | `0x66b549F570Fa63e3109B85FD15678c175F1a02c9` |
| Deploy tx | `0xb5abab1ec156eaae745ec3fd61f966de1d755e9e7f20c16df496dcd43f5534a8` |
| Basescan | https://basescan.org/address/0x66b549F570Fa63e3109B85FD15678c175F1a02c9 |
| Sourcify | exact match |

Same CREATE address as Sepolia because the deployer used nonce 0 on both chains. **Do not treat Sepolia as production.** App env: `NEXT_PUBLIC_CHAIN=mainnet`.

## Keeper attestation (Hybrid A)

Encrypted survival × multiplier **cannot** be ranked inside the EVM without a TEE decrypt. After week end the owner/keeper decrypts allowed handles off-chain via Inco Lightning, computes:

`weeklyScore = (survivalMs / 1000) * (multiplierHundredths / 100) + activityBonus(runCount)`

`runCount` is public onchain. The keeper then calls `attestTop10` then `settleWeek`. **Browsers / localStorage are not trusted for payouts.**

### Settlement split (do not change)

- 80% of `weekPoolWei` = prize (`PRIZE_POOL_BPS = 8000`).
- 20% → `treasury` immediately on `settleWeek`.
- Top 10 shares of that 80%: `3000, 1800, 1200, 900, 800, 700, 600, 400, 300, 300`.
- `address(0)` ranks and leftover wei of the 80% accrue to treasury.
- Empty attested week → entire pool to treasury.
- Re-settle reverts `AlreadySettled`. Current week reverts `WeekNotEnded`.
- Winners pull via `claim(weekId)`.

Keeper (repo root, Base 8453 only). Default week = previous Sunday UTC. `--dry-run` prints the split and does not send. Do not invent winners. First live mainnet settle waits for a real week end. Payout math dry-run: `forge test` in `contracts/`.

```
npx tsx scripts/attest-week.ts --dry-run
npx tsx scripts/attest-week.ts
npx tsx scripts/settle-week.ts --dry-run
npx tsx scripts/settle-week.ts
```

## Tests

```bash
forge test -vv
```

## Mainnet deploy checklist (done)

Production vault is live on **8453**. Remaining ops:

1. `setTreasury` to a **multisig** when one exists (currently deployer EOA).
2. Optional: `transferOwnership` / `setKeeper` if keeper should not be the deployer.
3. Verify on Basescan when an API key is available (Sourcify already exact-match).
4. Keep `NEXT_PUBLIC_CHAIN=sepolia` only for test clients. Chain state is not shared even though the CREATE address matches.
5. After each Sunday 00:00 UTC: `npx tsx scripts/attest-week.ts` then `npx tsx scripts/settle-week.ts` (never settle the current week; never invent a Top 10).
