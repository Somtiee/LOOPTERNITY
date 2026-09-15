# LOOPTERNITY

A 2D vertical endless survival climber that lives on **Circle Arc testnet** (chain id 5042002). You climb forever while a deadly force rises from below — dodge, boost, manage shields, survive as long as you can. It's also home of the **LOOPITERNS**, a 10,000-piece ERC-721 collection you mint by playing: score high enough in Play-to-Mint mode and you unlock a mint, then equip your LOOPITERN in Normal mode for real gameplay traits. Arc blue (`#3E8BFF`) runs through everything — the UI, the rarity accents, the marketplaces.

Arc's native gas token is **USDC** (18 decimals) — the same token the mint price is paid in. Wallets without custom-gas-token support may display it as "ETH"; it is USDC.

## Playing

Three modes from the start menu:

- **Normal (free)** — pick a world theme and Easy / Medium / Hard. Personal bests save locally, and sync to your wallet address if you connect one. Minted LOOPITERNS can be equipped here for gameplay traits.
- **P2M — Play-to-Mint** — the same climb at a locked Medium difficulty. The rarity gates are **score** thresholds (SCORE 15,000 for Common up to SCORE 60,000 for Legendary), not survival timers. Reach a gate, then pay the on-chain mint price (**0.65 USDC** per LOOPITERN) to mint. P2M requires a wallet connected and on Arc testnet before START unlocks — the mint lives on that chain.
- **P2E — Coming Soon** — disabled. No leaderboards, no prize payouts, nothing promised yet.

### Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move left / right | **A / D** or **← / →** | D-pad on the virtual pad |
| Boost | **W / ↑ / Space** | Boost on the virtual pad |
| Freeze (Rare+ equipped) | — | **FREEZE** button (mobile) |
| Tsunami (Legendary equipped) | — | **TSUNAMI** button (mobile) |

Shields absorb hits — the base runners hold a maximum of 3. The Freeze and Tsunami buttons only appear while you have a charge left, and disable when spent.

Base runners **ASH / NOVA / NORD** are looks-only and always available without a wallet or NFT.

## The LOOPITERN collection

10,000 ERC-721 tokens on Arc testnet, mint price **0.65 native USDC** (= `0.65e18`, set at deploy; the owner can adjust via `setMintPrice`), hard cap of **10 per wallet**.

### Art: 5 painted bases, not 10,000 paintings

There are exactly **five hand-painted hero bases** — one per rarity (`public/loopiterns/rarity-0..4.png`). Per-token uniqueness is **visible, on the character itself**, derived deterministically from `(tokenId, rarity)`:

- **Eye Tint, Belly Tint, Accent Tint** — a recolor of the base painting's palette, chosen per token.
- **Sketchbook shading** — every token gets a shading style, weight and tone, drawn only inside the character's painted shadow areas, the way an artist shades a cartoon portrait. This is what distinguishes tokens at a glance.
- **Cape Tint** — Legendary only.

Why not 10,000 unique paintings? Because that's not what this collection is: it's a mascot with five rarity identities, and every token is visibly *yours* through its tint and shading combination — same DNA in the marketplace still, in the equip portrait, and on the in-game climb rig. There is **no serial plate**; the serial number is metadata only. The in-game runner keeps its rarity silhouette (leaf nubs / visor / ice horns / crest / halo + cape) and applies the same DNA palette plus a torso mark.

The DNA is pure math — FNV-1a/xorshift over `tokenId|rarity|schema` (schema v4) — so the same token always renders identically everywhere, forever, with nothing stored on chain beyond the rarity.

### Rarity, gates and supply

Your final score in a P2M run sets the highest rarity you may request. If that tier is sold out, the mint **drops down** to the next lower rarity that still has supply — never up.

| Rarity | Supply | Score gate | In-game traits (Normal mode only) |
| --- | --- | --- | --- |
| Common | 5,000 | 15,000 | +4% move speed · 3 shields |
| Uncommon | 2,500 | 25,000 | +8% move speed · 4 shields |
| Rare | 1,500 | 35,000 | +12% move speed · 4 shields · Freeze 5s ×1 |
| Epic | 800 | 45,000 | +16% move speed · 5 shields · Freeze 8s ×1 |
| Legendary | 200 | 60,000 | +20% move speed · 5 shields · Freeze 10s ×1 · Tsunami ×1 |

The gates were raised by hand on 2026-09-15 (from the auto-calibrated 9,500→47,500 band) after playtest feedback that runs reached the old gates too easily. The original survival pacing (30/60/90/120/150s) survives only as a server-side sanity floor on the run's wall clock — it is not a gate. Freeze holds the rising danger; Tsunami (Legendary only) clears it. Trait modifiers apply **only in Normal mode** — P2M and unequipped runs are always vanilla.

## Minting

- **Voucher-only:** there is no public `mint()`. `mintWithVoucher` requires a server-signed EIP-712 voucher bound to (minter, rarity, deadline, single-use nonce, chain, contract). The server only signs after re-running your recorded run through the identical deterministic sim and confirming it genuinely reached the rarity's score gate — see `/api/loopitern/voucher`.
- **Price:** exactly `mintPrice` (currently 0.65 native USDC = `0.65e18`) — the contract reverts on any other value sent.
- **Wallet cap:** max 10 mints per wallet. The cap is mint-only: buying LOOPITERNS later on a secondary market is **not** capped, and everything you own shows in your in-game inventory (paginated, with Load More).
- **Drop-down:** request a rarity that's sold out and you get the next lower rarity with supply — the contract never mints above what you unlocked.

> **Honesty note:** the server voucher proves a run was *replayed and verified* to reach the score gate (15,000/60,000 at the extremes), not that a human held the controls — a bot can play too. What the chain enforces is the server signature, exact payment, the 10-per-wallet cap, the 10,000 supply, and the per-rarity caps with drop-down. The gates are a game ritual backed by server attestation, not a skill proof.

## Deploy status

**Deployed and live on Circle Arc TESTNET (5042002).** RPC `https://rpc.testnet.arc.io`, explorer `https://testnet.arcscan.app`. Minting is **voucher-only**: the v2 contract has no public `mint()` — `mintWithVoucher` requires a server-signed EIP-712 voucher (see Minting below). This is a testnet deployment — testnet USDC has no value, and when Arc mainnet launches the contract is redeployed there (runbook in `docs/vercel-env.txt`).

| | |
| --- | --- |
| Contract (v2, live) | [`0x991Ad2Bb19e57fB427250ec9AEEd312e60d21990`](https://testnet.arcscan.app/address/0x991Ad2Bb19e57fB427250ec9AEEd312e60d21990) |
| Name / symbol | LOOPITERNS / LOOP |
| Deploy tx | [`0xa36f388ea801beb90866040314ac2a50b06d013fa9d37cc9fa2e3034d824bc3f`](https://testnet.arcscan.app/tx/0xa36f388ea801beb90866040314ac2a50b06d013fa9d37cc9fa2e3034d824bc3f) (block 62,058,426, 2026-09-14) |
| Owner / treasury | `0xED638d2de9E7b6E8D06514A161bb2cEFf28bfCDd` |
| Voucher signer | `0x486eCE21831ffa07661EF745746e2ec47a486222` (same server key as the retired Robinhood v2; no funds) |
| Mint price | 0.65 native USDC (owner-adjustable via `setMintPrice`) |
| Minted at time of writing | 0 of 10,000 (fresh deploy) |
| baseURI | **empty** — must be set after deploy (see below) |
| Multicall3 | confirmed at the canonical `0xcA11bde05977b3631167028862bE2a173976CA11` on 5042002 (`eth_getCode`) — batched inventory reads work |
| Source verification | still a TODO — try the explorer's web UI on [testnet.arcscan.app](https://testnet.arcscan.app) (Contract → Verify & Publish, solc 0.8.29, optimizer on, 200 runs); `forge verify-contract` support for Arc is unconfirmed |

The deployment record lives in `contracts/deployments/arc-testnet-5042002.json`. If `NEXT_PUBLIC_LOOPITERNS_ADDRESS` is empty or zero, the mint UI honestly shows a "minting not live" state instead of pretending.

> **Retired chains (history only):** the previous deployment on Robinhood Chain (4663), contract `0x0914DcfdE10e5Df2aA1D8C850213712F64852637`, was **swept, paused, and retired on 2026-09-14** — its address, sweep and pause transactions are preserved in `contracts/deployments/robinhood-4663.json`. Before that, a v1 contract (`0x7016CfF42264C8D499a32bBe2b5A039bfd0Ed19f`) on the same chain was withdrawn and paused on 2026-09-03; its 3 minted tokens remain on-chain but were never read again. The app reads only the live Arc testnet contract.

### Deploy command (for the record / future contract)

```bash
cd contracts
forge script script/DeployLoopiterns.s.sol:DeployLoopiterns \
  --rpc-url arctestnet --chain 5042002 --broadcast --slow
```

Env vars (read from the environment by the script, or `contracts/.env`):

- `PRIVATE_KEY` — deployer key; becomes the contract owner (treasury).
- `MINT_PRICE_WEI` — e.g. `650000000000000000` for 0.65 native USDC.

The script always deploys with an empty `baseURI` — set it afterwards with `setBaseURI`.

App-side env (see `.env.example` and `docs/vercel-env.txt`):

- `NEXT_PUBLIC_LOOPITERNS_ADDRESS` — the deployed address; empty/zero = mint disabled.
- `NEXT_PUBLIC_LOOPITERNS_MINT_PRICE_WEI` — optional fallback if `mintPrice()` can't be read (native-USDC units, e.g. `650000000000000000`).
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — optional; enables WalletConnect/mobile wallets.
- `NEXT_PUBLIC_RPC_URL` — optional **fallback** RPC used only when the public Arc RPC fails (e.g. a restrict-to-Arc Alchemy URL; browser-visible, so use a scoped key, never an admin key).

## Treasury: how to withdraw

The contract accumulates mint USDC (native). The **owner-only** `withdraw(to)` sweeps the *full* native balance to an address, reverting (`WithdrawFailed`) if the transfer is rejected, and emits `Withdrawn(to, amount)`. Verified in tests (`forge test` → withdraw suite, 30/30 passing).

From `contracts/`, with the treasury key (`0xED638d…bfCDd` — the deployer/owner) in `contracts/.env` as `PRIVATE_KEY`:

```powershell
powershell -ExecutionPolicy Bypass -File .\sweep.ps1      # checks the pot, then withdraws everything
# or check the pot first:
powershell -ExecutionPolicy Bypass -File .\check-pot.ps1
```

Raw cast equivalent:

```bash
cast send 0x991Ad2Bb19e57fB427250ec9AEEd312e60d21990 \
  "withdraw(address)" 0xED638d2de9E7b6E8D06514A161bb2cEFf28bfCDd \
  --rpc-url https://rpc.testnet.arc.io \
  --private-key <TREASURY_PRIVATE_KEY>
```

## Metadata & OpenSea

`tokenURI(tokenId)` returns `baseURI + tokenId + ".json"`. The app serves metadata at `/api/loopitern/token/<id>` — it reads `ownerOf` and `tokenRarity` from chain, 503s if the contract isn't configured, 404s if the token was never minted (it never fabricates metadata) — and images at `/api/loopitern/<id>/<rarity>/still` (composed on demand, then cached to `public/loopiterns/generated/`).

Because the deployed `baseURI` is still **empty**, marketplaces cannot resolve token metadata yet. After the production domain is live, the treasury owner must run:

```bash
cast send 0x991Ad2Bb19e57fB427250ec9AEEd312e60d21990 \
  "setBaseURI(string)" "https://<PRODUCTION-DOMAIN>/api/loopitern/token/" \
  --rpc-url https://rpc.testnet.arc.io \
  --private-key <TREASURY_PRIVATE_KEY>
```

Until then: the in-game inventory art you see is generated locally from the same DNA — local previews, not marketplace data. Optional: `setContractURI` for marketplace listing metadata.

## Local dev

```bash
npm install
cp .env.example .env.local   # fill NEXT_PUBLIC_LOOPITERNS_ADDRESS etc.
npm run dev                  # http://localhost:3000 (--webpack)
npm run build && npm start
npx tsc --noEmit             # type check — should be clean
```

Contract (`contracts/`, Foundry):

```bash
cd contracts
forge build
forge test                   # 30 tests, incl. voucher forge/replay/expiry + withdraw suite + cap-10 at 0.65e18
```

LOOPITERN art & DNA tooling (all deterministic, safe to re-run):

```bash
npm run compose:loopitern                     # compose a still for a token
npx tsx src/game/loopiternTraits.check.ts     # DNA schema sanity checks
npx tsx src/game/loopiternStills.check.ts     # still compositor checks
npx tsx scripts/uniqueness-analysis.ts        # DNA collision analysis across the collection
npx tsx scripts/climb-preview.ts              # in-game climb-rig preview image
```

Architecture at a glance: `src/game/` is the pure Canvas 2D engine (no chain code), `src/web3/` is the wagmi/RainbowKit/viem shell targeting Arc testnet, `src/components/game/` is menu/HUD/pad UI, `src/app/api/loopitern/` serves metadata & stills, `contracts/` is the LOOPITERNS Foundry project.

## Roadmap

- **P2E — Coming Soon.** That's the entire roadmap: no verified scores, no leaderboards, no payout promises, nothing else committed. The old Inco / Base P2E vault path has been fully removed from the client and is not coming back in that form.
