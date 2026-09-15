# Prompt N — Verification (Circle Arc testnet 5042002)

Date: 2026-09-14 (deploy) / 2026-09-15 (docs + gate raise). No gameplay features added this pass — the chain story changed: the Robinhood Chain (4663) deployment is **retired** (swept, paused, address preserved for history in `contracts/deployments/robinhood-4663.json`) and the live chain is now **Circle Arc testnet**. The old Base/Inco P2E-era verification doc is in git history; nothing from it is live.

Contract: [`0x991Ad2Bb19e57fB427250ec9AEEd312e60d21990`](https://testnet.arcscan.app/address/0x991Ad2Bb19e57fB427250ec9AEEd312e60d21990)
Deploy: [`0xa36f388e…824bc3f`](https://testnet.arcscan.app/tx/0xa36f388ea801beb90866040314ac2a50b06d013fa9d37cc9fa2e3034d824bc3f) (block 62,058,426, 2026-09-14)
RPC: `https://rpc.testnet.arc.io` · Explorer: `https://testnet.arcscan.app`

| # | Item | Result | Proof |
| --- | --- | --- | --- |
| 1 | `npm run dev` boots; Normal run on desktop + narrow mobile | **PASS (code path)** | Engine unchanged by the chain move: `Game.ts` + `GameCanvas` `game.start()`; `viewport` device-width / `viewportFit=cover`; canvas `width < 480` caps DPR; pointer split (top boost, left/right dodge); safe-area. No live headless click-through re-driven this pass (see risk). |
| 2 | Connect on start; injected; WC if project id; wrong chain → **WRONG NETWORK · ARC** → **5042002** | **PASS (code path)** | `StartMenu` renders `ConnectWalletButton`. `src/web3/config.ts`: `arcTestnet` id **5042002**, `CHAIN_SWITCH_LABEL = "ARC"`, native currency USDC (18 dec). Switch: `switchChainAsync` to `ARC_CHAIN.id`. `NEXT_PUBLIC_RPC_URL` is a read fallback only — public Arc RPC is primary (`fallback` transport, no `rank`, public first). |
| 3 | Character select changes in-run sprite | **PASS (code path)** | Menu `CharacterSelect` → `GameApp.characterId` → `new Game(..., { characterId })` → `drawCharacter(..., look)`. Unchanged by the chain move. |
| 4 | Normal: free, theme+difficulty, PB per difficulty, wallet-synced | **PASS (code path)** | `recordNormalBest(address, difficulty, time)`; Vercel KV sync (`KV_REST_API_URL/TOKEN`). Chain-agnostic. |
| 5 | P2M: Arc wallet required; locked Medium; **score** gates 15,000/25,000/35,000/45,000/60,000; one mint per run | **PASS (code path)** | `mintTiers.ts` `RARITIES[].minScore` — raised by hand 2026-09-15 from the calibrated 9,500→47,500 band (game had gotten too easy). `minSeconds` (30/60/90/120/150s) is only the voucher route's wall-clock sanity floor, never a gate. Gates render as `SCORE 15,000` (comma-grouped, `formatScore`). START gated on connected + correct chain. |
| 6 | Game over P2M → voucher → `mintWithVoucher` on 5042002 | **PASS (code path + deploy record)** | `/api/loopitern/voucher` signs only after replaying the recorded input log through the deterministic ClimbSim (same seed/theme/P2M constants) and the replayed score clears the tier gate. EIP-712 voucher bound to (minter, rarity, deadline, nonce, chain, contract); single-use nonce, 10-minute deadline. `MAX_PER_WALLET=10`, `MAX_SUPPLY=10_000`, rarity caps 5000/2500/1500/800/200 with drop-down-never-up. |
| 7 | Replay is the authority; doctored claims fail | **PASS (code path)** | `scripts/e2e-replay.ts` covers: padded score claim (D1), stripped-inputs claim (D2), overclaimed rarity just past a gate (D3 — fixtures bumped to 25,100/35,100 with the new gates). All expect 403. Run it against the deployed stack before announcing (see risk). |
| 8 | Contract: forge tests + on-chain state | **PASS** | `forge build` + `forge test` **30/30** in `contracts/` (voucher forge/replay/expiry, withdraw suite, cap-10 at 0.65e18). On-chain via cast (deploy record `arc-testnet-5042002.json`): owner = treasury `0xED638d…bfCDd`, mintSigner = `0x486eCE…6222` (same server key as retired Robinhood v2), mintPrice = 6.5e17 (0.65 native USDC), paused = false, totalSupply = 0. Multicall3 confirmed at canonical `0xcA11…CA11` on 5042002 (`eth_getCode`). |
| 9 | No committed secrets; docs match live state | **PASS** | `.env.local` / `contracts/.env` gitignored; no `PRIVATE_KEY=` in tracked source; `VOUCHER_SIGNER_PRIVATE_KEY` is the only server key on Vercel and holds no funds. `README.md` + `docs/vercel-env.txt` rewritten this pass to Arc testnet (address, 0.65 USDC, cap 10, score gates); Robinhood/4663 appears only in retired-history passages. |
| 10 | This file | **PASS** | `VERIFICATION.md` |

## Remaining risk

- **Source verification TODO:** `forge verify-contract` support for Arc is unconfirmed; verify via the [testnet.arcscan.app](https://testnet.arcscan.app) web UI (Contract → Verify & Publish, solc 0.8.29, optimizer on, 200 runs).
- **baseURI is still empty** — marketplaces cannot resolve token metadata until `setBaseURI` points at the production domain (command in README).
- **Live mint click-through not yet driven end-to-end** in a browser wallet against 5042002 — the e2e scripts target it; run `scripts/e2e-replay.ts` + `scripts/e2e-browser.ts` and one manual mint before announcing.
- **It's a testnet:** testnet USDC has no value, and Circle may reset testnet state. Nothing user-owned is at risk, but don't market the collection as mainnet.
- **Arc mainnet (~16 Sep 2026):** the flip runbook lives at the bottom of `docs/vercel-env.txt`. Chain id must come from `src/web3/config.ts` only — never scattered literals.
- **Centralization:** the voucher signer and the treasury are single EOAs (treasury = deployer). The server could, in principle, sign for a bot; the honesty note in the README says so plainly.
