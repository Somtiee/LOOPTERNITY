# LOOPTERNITY Web3 / P2E

Default client chain is **Base mainnet** (`NEXT_PUBLIC_CHAIN` unset or `mainnet`). `Lightning.baseMainnet()`. Set `NEXT_PUBLIC_CHAIN=sepolia` only for the testnet vault.

Connecting a wallet **registers** the player. P2E **PAY & START** `writeContract`s `enterRun(weekId)` on the Base mainnet vault (`value >= entryFeeWei()`), then waits for a **8453** receipt before the run starts. Not a raw ETH transfer. Local `addPoolWei` is only used when the vault address is unset.

After a paid P2E death the client encrypts survival ms + multiplier with `Lightning.baseMainnet()` bound to the mainnet vault, then `submitConfidentialScore` with `msg.value = inco.getFee() * 2` (wallet confirm). Local P2E ranks are not payout truth while the vault is deployed.

## Week id

Sunday 00:00 UTC as `YYYY-MM-DD`. Client: `weekIdFromDate` in `src/web3/p2e/week.ts`. Solidity: `currentWeekId()` / `weekIdAt` (`_weekStart` uses `(daysSinceEpoch + 4) % 7` so Sunday is the week start — same as JS `getUTCDay() === 0`). Example: Unix `1786276800` → `2026-08-09`.

## Weekly theme seal

Players cannot pick the P2E world. Difficulty is fixed (hidden Medium). The week id rolls at Sunday 00:00 UTC (`currentWeekId` / `weekIdFromDate`). The world is `sealedThemeForWeek(weekId)` (index 0 volcanic, 1 planetary, 2 antarctica) — the same index the keeper encrypts in `sealWeeklyTheme`. Keeper `themeSealed` is the on-chain record.

Keeper (owner/keeper key only), from the repo root:

```
npx tsx scripts/seal-week.ts
npx tsx scripts/seal-week.ts --dry-run
```

Needs `PRIVATE_KEY` in `contracts/.env` (ETH on Base for gas + `inco.getFee()`), RPC `BASE_MAINNET_RPC_URL` (default `https://mainnet.base.org`), vault `NEXT_PUBLIC_LOOPTERNITY_CONTRACT_ADDRESS`. Encrypts with `Lightning.baseMainnet()`. Idempotent if already sealed. Cron after Sunday 00:00 UTC. Sepolia is irrelevant.

## Modes

- **Normal** — free (no entry fee). Base wallet required so personal bests save to your address.
- **P2E** — Base wallet required. ~$0.05 ETH entry per run (on-chain min = `entryFeeWei`). Weekly sealed world. Ranked board.

## Env

See `.env.example`. Restart `npm run dev` after changing `.env.local`.

## Ranking (Hybrid A)

`weeklyScore = (survivalMs / 1000) × (multiplierHundredths / 100) + activityBonus(runCount)`

`runCount` is public onchain (`ScoreSubmitted`). Survival and multiplier stay encrypted. The keeper decrypts allowed handles after week end and calls `attestTop10` on **8453**. Settlement uses that Top 10 order and `TOP10_SHARES_BPS` of 80% of `weekPoolWei`. **localStorage is never payout authority.**

Client SCORES board:

- During the week: wallets that submitted + public `runCount`. No plaintext scores.
- After `attestTop10`: official ranks and ETH shares from `getTop10` + `weekPoolWei` (same math as `settleWeek`).
- After `settleWeek`: SCORES shows `claimable` and a **CLAIM** button. Winners pull ETH with `claim(weekId)`.
- Prize pool is mainnet `weekPoolWei` while the vault is live — not `poolWei` in localStorage.
- RPC failure may show a labeled **offline cache**, never a fake local leaderboard.

Keeper (after the week ends — default = previous Sunday UTC week). Current week must not settle early. Re-settle reverts. Do not invent winners; dry-run payout math with forge tests. First live mainnet settle waits for a real Sunday rollover.

```
npx tsx scripts/attest-week.ts --dry-run
npx tsx scripts/attest-week.ts
npx tsx scripts/attest-week.ts --week=2026-08-09

npx tsx scripts/settle-week.ts --dry-run
npx tsx scripts/settle-week.ts
npx tsx scripts/settle-week.ts --week=2026-08-09
```

`settleWeek` pays 20% of the pool to treasury immediately. Unused Top 10 slots and leftover wei of the 80% also go to treasury (unchanged contract split). Entry fees stay per run (`enterRun` + `entryFeeWei`).

## Vault

Foundry: `contracts/src/LoopternityVault.sol`. Same CREATE address on Sepolia and mainnet (deployer nonce 0). **Production is 8453.**

### Base mainnet (production)

| Field | Value |
| --- | --- |
| Network | Base (chain id **8453**) |
| RPC | `https://mainnet.base.org` |
| Vault | `0x66b549F570Fa63e3109B85FD15678c175F1a02c9` |
| Deployer / owner / keeper | `0xEacA26c65bd43803CB07319D5055bB7CF8DEC00c` |
| entryFeeWei | `26701128923731` (~$0.05 at deploy) |
| Treasury | deployer EOA (**interim** — `setTreasury` to a multisig when ready) |
| Deploy tx | `0xb5abab1ec156eaae745ec3fd61f966de1d755e9e7f20c16df496dcd43f5534a8` |
| Basescan | https://basescan.org/address/0x66b549F570Fa63e3109B85FD15678c175F1a02c9 |
| Sourcify | exact match |
| Inco client | `Lightning.baseMainnet()` |

### Base Sepolia (testnet only)

| Field | Value |
| --- | --- |
| Network | Base Sepolia (**84532**) |
| Vault | `0x66b549F570Fa63e3109B85FD15678c175F1a02c9` |
| entryFeeWei | `20000000000000` |
| Deploy tx | `0x92cb931d5c5b9c8510eb5c9bac0e75f0fe85ecd08c0598b65cddf267abb70ea2` |
| Explorer | https://sepolia.basescan.org/address/0x66b549F570Fa63e3109B85FD15678c175F1a02c9 |
