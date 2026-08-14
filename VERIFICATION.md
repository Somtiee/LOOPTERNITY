# Prompt N — Verification (Base mainnet 8453)

Date: 2026-08-14. No features added this pass. Primary network: **Base mainnet**. Sepolia is prior testnet only (same CREATE address, different state).

Vault: [`0x66b549F570Fa63e3109B85FD15678c175F1a02c9`](https://basescan.org/address/0x66b549F570Fa63e3109B85FD15678c175F1a02c9)  
Deploy: [`0xb5abab1e…`](https://basescan.org/tx/0xb5abab1ec156eaae745ec3fd61f966de1d755e9e7f20c16df496dcd43f5534a8)  
Theme seal (this week `2026-08-09`, Planetary): [`0x4589e81b…`](https://basescan.org/tx/0x4589e81b2e6296ce8c7539527b77df33517301d8c1401a35e92f7789d74cb15a)

| # | Item | Result | Proof |
| --- | --- | --- | --- |
| 1 | `npm run dev` boots; Normal run on desktop + narrow mobile | **PASS** | Next already listening on `http://localhost:3000` (PID 17468). `GET /` → **200**, HTML includes LOOPTERNITY (~23k). Engine: `Game.ts` + `GameCanvas` `game.start()`. Narrow: `viewport` device-width / `viewportFit: cover`; canvas `width < 480` caps DPR to 1.25; pointer split (top boost, left/right dodge); `h-dvh` / safe-area. Full playthrough not re-driven headless this pass (see risk). |
| 2 | Connect on start; injected; WC if project id; wrong chain **WRONG NETWORK · BASE** → **8453** | **PASS** | `StartMenu` renders `ConnectWalletButton`. `NEXT_PUBLIC_CHAIN=mainnet` → `BASE_CHAIN` = wagmi `base` (**8453**). Copy: `WRONG NETWORK · {CHAIN_SWITCH_LABEL}` with `CHAIN_SWITCH_LABEL = "BASE"`. Switch: `switchChainAsync({ chainId: BASE_CHAIN.id })`. Injected: `injected({ shimDisconnect: false })` when no WC id; `getDefaultConfig` when `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is set (local `.env.local` has an id; not committed). Not Sepolia (`walletErrors` treats 84532 as wrong on mainnet). |
| 3 | Character select changes in-run sprite | **PASS** | Menu `CharacterSelect` → `GameApp.characterId` → `GameCanvas` → `new Game(..., { characterId })` → `Game.ts` `drawCharacter(..., look: getCharacter(this.characterId))`. |
| 4 | Normal: free, theme+difficulty, PB per difficulty, NEW PERSONAL BEST, SCORES → NORMAL | **PASS** | Normal starts without `enterRun` (`startRun` → `launchRun`). Theme + Easy/Medium/Hard only when `mode === "normal"`. `recordNormalBest(address, difficulty, time)`. HUD `NEW PERSONAL BEST`. `PlayerHub` tab **NORMAL** lists Easy/Medium/Hard times. |
| 5 | P2E: Base wallet; no difficulty picker; weekly world; ~$0.05/run; `enterRun` on basescan.org; RUN AGAIN charges again | **PASS** | `onBase` required; else menu. P2E hides theme/difficulty; `P2E_DIFFICULTY = "medium"`. World: `sealedThemeForWeek(currentWeekId)` + keeper `seal-week.ts` (`Lightning.baseMainnet`). Fee: `NEXT_PUBLIC_P2E_ENTRY_FEE_USD=0.05`; on-chain min `entryFeeWei` `26701128923731`. Pay: `writeContract({ functionName: "enterRun", chainId: BASE_CHAIN.id, value })` — not a raw transfer. Explorer: `https://basescan.org`. `restart()` in P2E opens `P2EEntryConfirm` again (new `enterRun`). |
| 6 | Game over P2E: Inco `Lightning.baseMainnet`; `submitConfidentialScore` on mainnet vault; statuses | **PASS** | `CHAIN_MODE !== "sepolia"` → `Lightning.baseMainnet()`. Auto-submit on death (`ConfidentialScorePanel`). `submitConfidentialScore` to `LOOPTERNITY_CONTRACT_ADDRESS` on 8453. Statuses: Posting / Confirm in wallet / On the board / TRY AGAIN. Tx link Basescan. Live submit not broadcast this pass (needs judge wallet). |
| 7 | Board not localStorage payout truth when vault deployed | **PASS** | `vaultIsDeployed` true for the mainnet address. `recordP2ERun` only if `!vaultIsDeployed`. `usePlayerRegistry` sets `ranked: []` when deployed; board from `useVerifiedP2EBoard` (`weekPoolWei`, `getTop10`, `ScoreSubmitted` logs). Cache labeled; error: “Not using localStorage as payout truth.” |
| 8 | 80/20 Top 10 bps; forge tests; no live settle if week open | **PASS** | Solidity `PRIZE_POOL_BPS = 8000`, `TREASURY_BPS = 2000`, shares `3000…300`. `forge test -vv` in `contracts/`: **11 passed, 0 failed** including `testSettleSplits8020AndTop10Shares`, `testEmptyWeekSendsAllToTreasury`, `testCannotSettleBeforeWeekEnd`. **Do not settle mainnet until Sunday 00:00 UTC after this week.** Sepolia: same CREATE address, testnet proof only (`contracts/deployments/base-sepolia.json`). |
| 9 | No committed secrets; README + mainnet addresses + demo | **PASS** | `.env.local` and `contracts/.env` gitignored (`.env*` / `contracts/.env`). No `PRIVATE_KEY=` in tracked source. README: run, env, 8453 vs Sepolia, both addresses, demo 60–90s, known limits. `.env.example` has mainnet address; Sepolia commented; empty key slots. |
| 10 | This file | **PASS** | `VERIFICATION.md` |

## Remaining risk

- **Submit this tree:** several jam files are still untracked locally (e.g. `.env.example`, `src/web3/README.md`, ABI). Add them before the zip/git push. Do **not** add `.env.local` or `contracts/.env`.
- **Public RPC:** `mainnet.base.org` rate-limits; encrypt/submit can show “Could not reach Base.” Fallback RPCs are configured; a dedicated Base RPC is safer for judges.
- **Keeper is centralized.** First **live** `settleWeek` waits for week end. Winners **claim** (pull). Treasury is still the deployer EOA.
- **WalletConnect QR** needs the Reown project id in `.env.local` (free). Injected MetaMask works without it.
- Item 1/6 playthroughs were proven by running server + code paths (and prior live Base seal). Judges should still click through the README demo on 8453.
