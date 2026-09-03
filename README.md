# LOOPTERNITY

A 2D vertical endless survival climber that lives on **Robinhood Chain** (chain id 4663). You climb forever while a deadly force rises from below — dodge, boost, manage shields, survive as long as you can. It's also home of the **LOOPITERNS**, a 10,000-piece ERC-721 collection you mint by surviving: last long enough in Play-to-Mint mode and you unlock a mint, then equip your LOOPITERN in Normal mode for real gameplay traits. Robinhood green (`#00C805`) runs through everything — the UI, the rarity accents, the marketplaces.

## Playing

Three modes from the start menu:

- **Normal (free)** — pick a world theme and Easy / Medium / Hard. Personal bests save locally, and sync to your wallet address if you connect one. Minted LOOPITERNS can be equipped here for gameplay traits.
- **P2M — Play-to-Mint (free)** — the same climb at a locked Medium difficulty. Survive to unlock mint tiers (45s Common → 180s Legendary), then mint a LOOPITERN for the on-chain price. Starts without a wallet; connect one only when you're ready to mint.
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

10,000 ERC-721 tokens on Robinhood Chain, mint price **0.0002 ETH** (≈ $0.50, set at deploy; the owner can adjust via `setMintPrice`), hard cap of **5 per wallet**.

### Art: 5 painted bases, not 10,000 paintings

There are exactly **five hand-painted hero bases** — one per rarity (`public/loopiterns/rarity-0..4.png`). Per-token uniqueness is **visible, on the character itself**, derived deterministically from `(tokenId, rarity)`:

- **Eye Tint, Belly Tint, Accent Tint** — a recolor of the base painting's palette, chosen per token.
- **Sketchbook shading** — every token gets a shading style, weight and tone, drawn only inside the character's painted shadow areas, the way an artist shades a cartoon portrait. This is what distinguishes tokens at a glance.
- **Cape Tint** — Legendary only.

Why not 10,000 unique paintings? Because that's not what this collection is: it's a mascot with five rarity identities, and every token is visibly *yours* through its tint and shading combination — same DNA in the marketplace still, in the equip portrait, and on the in-game climb rig. There is **no serial plate**; the serial number is metadata only. The in-game runner keeps its rarity silhouette (leaf nubs / visor / ice horns / crest / halo + cape) and applies the same DNA palette plus a torso mark.

The DNA is pure math — FNV-1a/xorshift over `tokenId|rarity|schema` (schema v4) — so the same token always renders identically everywhere, forever, with nothing stored on chain beyond the rarity.

### Rarity, gates and supply

Your survival time in a P2M run sets the highest rarity you may request. If that tier is sold out, the mint **drops down** to the next lower rarity that still has supply — never up.

| Rarity | Supply | Survival gate | In-game traits (Normal mode only) |
| --- | --- | --- | --- |
| Common | 5,000 | 45s | +4% move speed · 3 shields |
| Uncommon | 2,500 | 60s | +8% move speed · 4 shields |
| Rare | 1,500 | 90s | +12% move speed · 4 shields · Freeze 5s ×1 |
| Epic | 800 | 120s | +16% move speed · 5 shields · Freeze 8s ×1 |
| Legendary | 200 | 180s | +20% move speed · 5 shields · Freeze 10s ×1 · Tsunami ×1 |

Freeze holds the rising danger; Tsunami (Legendary only) clears it. Trait modifiers apply **only in Normal mode** — P2M and unequipped runs are always vanilla.

## Minting

- **Price:** exactly `mintPrice` (currently 0.0002 ETH) — the contract reverts on any other value sent.
- **Wallet cap:** max 5 mints per wallet. The cap is mint-only: buying LOOPITERNS later on a secondary market like OpenSea is **not** capped, and everything you own shows in your in-game inventory (paginated, with Load More).
- **Drop-down:** request a rarity that's sold out and you get the next lower rarity with supply — the contract never mints above what you unlocked.

> **Honesty note:** client survival time is spoofable. The contract does **not** prove you lasted 45 or 180 seconds — it can't. What the chain enforces is payment, the wallet cap, the 10,000 supply, and the per-rarity caps with drop-down. Treat the gates as a game ritual, not a skill proof.

## Deploy status

**Deployed and live on Robinhood Chain (4663).**

| | |
| --- | --- |
| Contract | [`0x7016CfF42264C8D499a32bBe2b5A039bfd0Ed19f`](https://robinhoodchain.blockscout.com/address/0x7016CfF42264C8D499a32bBe2b5A039bfd0Ed19f) |
| Name / symbol | LOOPITERNS / LOOP |
| Deploy tx | [`0x865c1df8e634023117d484c25ded458cd26dd34464a50c1c90c570582b51f06c`](https://robinhoodchain.blockscout.com/tx/0x865c1df8e634023117d484c25ded458cd26dd34464a50c1c90c570582b51f06c) (block 51,832,171, 2026-09-01) |
| Owner / treasury | `0xED638d2de9E7b6E8D06514A161bb2cEFf28bfCDd` |
| Mint price | 0.0002 ETH (owner-adjustable via `setMintPrice`) |
| Minted at time of writing | 3 of 10,000 |
| baseURI | **empty** — must be set after deploy (see below) |
| Source verification | still a TODO — Blockscout's API is Cloudflare-gated for `forge verify-contract`; verify via the explorer's web UI (Contract → Verify & Publish, solc 0.8.29, optimizer on) |

The deployment record lives in `contracts/deployments/robinhood-4663.json`. If `NEXT_PUBLIC_LOOPITERNS_ADDRESS` is empty or zero, the mint UI honestly shows a "minting not live" state instead of pretending.

Note: the batched `raritiesOf()` getter exists in the contract **source** but was added after this deployment, so it is *not* in the live bytecode. The app doesn't need it (it reads rarities via Multicall3), and redeploying just to add it would mean abandoning the already-minted tokens for zero practical gain. Don't.

### Deploy command (for the record / future contract)

```bash
cd contracts
forge script script/DeployLoopiterns.s.sol:DeployLoopiterns \
  --rpc-url robinhood --chain 4663 --broadcast --slow
```

Env vars (read from the environment by the script, or `contracts/.env`):

- `PRIVATE_KEY` — deployer key; becomes the contract owner (treasury).
- `MINT_PRICE_WEI` — e.g. `200000000000000` for 0.0002 ETH.

The script always deploys with an empty `baseURI` (despite a stale comment mentioning an optional `BASE_URI`, the code does not read it) — set it afterwards with `setBaseURI`.

App-side env (see `.env.example` and `docs/vercel-env.txt`):

- `NEXT_PUBLIC_LOOPITERNS_ADDRESS` — the deployed address; empty/zero = mint disabled.
- `NEXT_PUBLIC_LOOPITERNS_MINT_PRICE_WEI` — optional fallback if `mintPrice()` can't be read.
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — optional; enables WalletConnect/mobile wallets.
- `NEXT_PUBLIC_RPC_URL` — optional; defaults to `https://rpc.mainnet.chain.robinhood.com`.

## Treasury: how to withdraw

The contract accumulates mint ETH. The **owner-only** `withdraw(to)` sweeps the *full* balance to an address, reverting (`WithdrawFailed`) if the transfer is rejected, and emits `Withdrawn(to, amount)`. Verified in tests (`forge test` → withdraw suite, 21/21 passing).

From `contracts/`, with the treasury key (`0xED638d…bfCDd` — the deployer/owner) in `contracts/.env` as `PRIVATE_KEY`:

```powershell
powershell -ExecutionPolicy Bypass -File .\sweep.ps1      # checks the pot, then withdraws everything
# or check the pot first:
powershell -ExecutionPolicy Bypass -File .\check-pot.ps1
```

Raw cast equivalent:

```bash
cast send 0x7016CfF42264C8D499a32bBe2b5A039bfd0Ed19f \
  "withdraw(address)" 0xED638d2de9E7b6E8D06514A161bb2cEFf28bfCDd \
  --rpc-url https://rpc.mainnet.chain.robinhood.com \
  --private-key <TREASURY_PRIVATE_KEY>
```

## Metadata & OpenSea

`tokenURI(tokenId)` returns `baseURI + tokenId + ".json"`. The app serves metadata at `/api/loopitern/token/<id>` — it reads `ownerOf` and `tokenRarity` from chain, 503s if the contract isn't configured, 404s if the token was never minted (it never fabricates metadata) — and images at `/api/loopitern/<id>/<rarity>/still` (composed on demand, then cached to `public/loopiterns/generated/`).

Because the deployed `baseURI` is still **empty**, marketplaces cannot resolve token metadata yet. After the production domain is live, the treasury owner must run:

```bash
cast send 0x7016CfF42264C8D499a32bBe2b5A039bfd0Ed19f \
  "setBaseURI(string)" "https://<PRODUCTION-DOMAIN>/api/loopitern/token/" \
  --rpc-url https://rpc.mainnet.chain.robinhood.com \
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
forge test                   # 21 tests, including the withdraw suite
```

LOOPITERN art & DNA tooling (all deterministic, safe to re-run):

```bash
npm run compose:loopitern                     # compose a still for a token
npx tsx src/game/loopiternTraits.check.ts     # DNA schema sanity checks
npx tsx src/game/loopiternStills.check.ts     # still compositor checks
npx tsx scripts/uniqueness-analysis.ts        # DNA collision analysis across the collection
npx tsx scripts/climb-preview.ts              # in-game climb-rig preview image
```

Architecture at a glance: `src/game/` is the pure Canvas 2D engine (no chain code), `src/web3/` is the wagmi/RainbowKit/viem shell targeting Robinhood Chain, `src/components/game/` is menu/HUD/pad UI, `src/app/api/loopitern/` serves metadata & stills, `contracts/` is the LOOPITERNS Foundry project.

## Roadmap

- **P2E — Coming Soon.** That's the entire roadmap: no verified scores, no leaderboards, no payout promises, nothing else committed. The old Inco / Base P2E vault path has been fully removed from the client and is not coming back in that form.
