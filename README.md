# LOOPTERNITY

Vertical endless survival on **Base mainnet (8453)**. Climb forever. Dodge. Manage shields. Optional P2E: ~$0.05 ETH per run, encrypted weekly scores (Inco Lightning), Top 10 split of the prize pool.

**Inco Summer Game Jam** — production vault is live on Base. Sepolia is prior testnet only.

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Connect a wallet on **Base (8453)** — not Ethereum L1, not Sepolia.

Need ETH on Base for P2E gas + the ~$0.05 entry. Normal mode is free (wallet still required so personal bests bind to your address).

Optional: a free [Reown Cloud](https://cloud.reown.com) project id in `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` enables WalletConnect QR / mobile. Desktop MetaMask / Rabby work with that field empty.

## Env

Copy `.env.example` → `.env.local`. Restart `npm run dev` after edits. Never commit `.env.local` or `contracts/.env`.

| Variable | Production value |
| --- | --- |
| `NEXT_PUBLIC_CHAIN` | `mainnet` (8453). `sepolia` is testnet only. |
| `NEXT_PUBLIC_BASE_RPC_URL` | `https://mainnet.base.org` |
| `NEXT_PUBLIC_LOOPTERNITY_CONTRACT_ADDRESS` | `0x66b549F570Fa63e3109B85FD15678c175F1a02c9` |
| `NEXT_PUBLIC_VAULT_DEPLOY_BLOCK` | `49966576` |
| `NEXT_PUBLIC_P2E_ENTRY_FEE_USD` | `0.05` (display). On-chain min is `entryFeeWei`. |
| `NEXT_PUBLIC_P2E_TREASURY_ADDRESS` | `0xEacA26c65bd43803CB07319D5055bB7CF8DEC00c` (interim) |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | empty or your Reown id |

Keeper scripts (`seal-week`, `attest-week`, `settle-week`) load `PRIVATE_KEY` from `contracts/.env` (see `contracts/.env.example`). That file is gitignored.

## Base mainnet vs Sepolia

Same CREATE address on both chains (deployer nonce 0). **Different state, different `entryFeeWei`. Production is 8453.** Do not treat Sepolia as live.

| | Base mainnet (production) | Base Sepolia (testnet) |
| --- | --- | --- |
| Chain id | **8453** | 84532 |
| Vault | [`0x66b549F570Fa63e3109B85FD15678c175F1a02c9`](https://basescan.org/address/0x66b549F570Fa63e3109B85FD15678c175F1a02c9) | [`0x66b549F570Fa63e3109B85FD15678c175F1a02c9`](https://sepolia.basescan.org/address/0x66b549F570Fa63e3109B85FD15678c175F1a02c9) **testnet** |
| `entryFeeWei` | `26701128923731` (~$0.05 at deploy) | `20000000000000` |
| Deploy tx | [`0xb5abab1e…`](https://basescan.org/tx/0xb5abab1ec156eaae745ec3fd61f966de1d755e9e7f20c16df496dcd43f5534a8) | [`0x92cb931d…`](https://sepolia.basescan.org/tx/0x92cb931d5c5b9c8510eb5c9bac0e75f0fe85ecd08c0598b65cddf267abb70ea2) |
| Record | `contracts/deployments/base-mainnet.json` | `contracts/deployments/base-sepolia.json` |
| Inco | `Lightning.baseMainnet()` | `Lightning.baseSepoliaTestnet()` |
| App env | `NEXT_PUBLIC_CHAIN=mainnet` | `NEXT_PUBLIC_CHAIN=sepolia` (commented in `.env.example`) |

ABI: [`src/web3/abi/loopternityVault.ts`](src/web3/abi/loopternityVault.ts) (from `contracts/src/LoopternityVault.sol`).

Owner / keeper / interim treasury: [`0xEacA26c65bd43803CB07319D5055bB7CF8DEC00c`](https://basescan.org/address/0xEacA26c65bd43803CB07319D5055bB7CF8DEC00c).

## Architecture

```
src/game/          Canvas engine, themes, input, scoring (no chain)
src/web3/          Wagmi / RainbowKit, Inco Lightning, vault ABI, P2E hooks
src/components/    Menu, HUD, wallet chrome
contracts/         Foundry vault (LoopternityVault.sol)
scripts/           Keeper: seal-week, attest-week, settle-week
```

- **`src/game`** — climb loop, three worlds (Volcanic / Planetary / Antarctica), Normal difficulty.
- **`src/web3`** — connect on Base, `enterRun`, encrypt + `submitConfidentialScore`, SCORES board, `claim`. Deep dive: [`src/web3/README.md`](src/web3/README.md).
- **`contracts`** — weekly pool, Inco handles, `attestTop10` / `settleWeek` / `claim`. Notes: [`contracts/README.md`](contracts/README.md).

## Player flow (Base mainnet)

1. **CONNECT WALLET** on Base (8453).
2. **Normal (free)** — pick world + Easy / Medium / Hard. Survival personal bests save to that wallet. Not the prize board.
3. **P2E (~$0.05 / run)** — one world for the week (rolls Sunday 00:00 UTC). **PAY & START** calls `enterRun(weekId)` on the vault (`value >= entryFeeWei`). ETH sits in the vault as `weekPoolWei`.
4. Play, die. The run **encrypts** survival ms + multiplier (`Lightning.baseMainnet()`, bound to the vault) and **`submitConfidentialScore`** (confirm in wallet). Plaintext scores are not stored onchain.
5. **SCORES** — during the week: wallets that submitted + public `runCount`. After Sunday attest: official Top 10. Rank = **best run** (time × multiplier) + **activity bonus** (more runs help, capped).
6. After week end the keeper **`attestTop10`** then **`settleWeek`**: **80%** prize / **20%** treasury. Winners **`claim(weekId)`** (pull). Unused Top 10 slots of the 80% also go to treasury.

Controls: **A/D** or **←/→** (touch: left / right half). Boost: **W / ↑ / Space** or tap top. Shields absorb hits (max 3).

## Demo (60–90s)

1. Open localhost:3000. Confirm the wallet is on **Base mainnet (8453)**. Connect.
2. **Normal** — start a short run, die. If it is a new best, HUD shows **NEW PERSONAL BEST**. Open **SCORES → NORMAL**.
3. **P2E** — **ENTER · $0.05**. Confirm `enterRun` (~$0.05 ETH + gas). Play the sealed weekly world, die.
4. Confirm the **score submit** in the wallet (auto-starts on death). Wait for Base. **SCORES → BOARD** should list the wallet / run count.
5. Say out loud: week seals Sunday 00:00 UTC; keeper attests Top 10; `settleWeek` is 80/20; winners tap **CLAIM** (`claim(weekId)`). Current week cannot settle early.

## Known limits

- **Keeper is centralized** — owner/keeper EOA attests and settles. Browsers cannot decrypt other players’ scores.
- **First live settle waits for week end** — `settleWeek` reverts until the next Sunday 00:00 UTC. Do not invent a Top 10.
- **Treasury is still the deployer EOA** until `setTreasury` to a multisig.
- **Claim is pull** — settle credits winners; they call `claim`. There is no push payout in the vault.
- **Public RPC** (`mainnet.base.org`) rate-limits; a dedicated Base RPC is more reliable for judges.
- Same CREATE address on Sepolia ≠ same pool or scores. Use 8453.

## Keeper (ops, not the player client)

```bash
npx tsx scripts/seal-week.ts
npx tsx scripts/attest-week.ts --dry-run
npx tsx scripts/settle-week.ts --dry-run
```

Needs `PRIVATE_KEY` in `contracts/.env` with Base ETH for gas + Inco input fees.

Live production uses **GitHub Actions** (`.github/workflows/weekly-p2e.yml`) every Sunday 00:05 UTC: seal the new week, then attest + settle the week that just ended. The keeper key stays in GitHub Actions secrets (`KEEPER_PRIVATE_KEY`) — never in the Vercel client bundle. Vercel serverless timeouts cannot run Inco decrypt + settle reliably.

## Stack

Next.js 16 + React 19 + TypeScript, Canvas 2D, Tailwind, wagmi / RainbowKit, viem, Inco Lightning, Foundry.
