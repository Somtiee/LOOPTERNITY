# LOOPTERNITY Launch Runbook

Operational checklist for the live deployment on Robinhood Chain (4663).
Everything here reflects the current tree and chain state — see
`contracts/deployments/robinhood-4663.json` for the deployment record.

## Current state (verify before acting)

| Item | Value |
| --- | --- |
| Contract | `0x7016CfF42264C8D499a32bBe2b5A039bfd0Ed19f` |
| Owner / treasury | `0xED638d2de9E7b6E8D06514A161bb2cEFf28bfCDd` |
| Mint price | 0.0002 ETH (`mintPrice()`) |
| Supply | 10,000 hard cap; rarity caps 5000 / 2500 / 1500 / 800 / 200 |
| Wallet cap | 5 mints per wallet (mint-only; secondary purchases uncapped) |
| RPC / explorer | `https://rpc.mainnet.chain.robinhood.com` / `https://robinhoodchain.blockscout.com` |

Quick live check:

```bash
cast call 0x7016CfF42264C8D499a32bBe2b5A039bfd0Ed19f "totalSupply()" \
  --rpc-url https://rpc.mainnet.chain.robinhood.com
```

## Open items, in order

1. **Verify the contract source on Blockscout.** The explorer's API is
   Cloudflare-gated, so `forge verify-contract` cannot reach it
   programmatically. Use the web UI: Contract → Verify & Publish,
   solc `0.8.29`, optimizer on (200 runs). Paste
   `contracts/src/Loopiterns.sol` with its OpenZeppelin imports flattened
   (`forge flatten`) if the UI doesn't resolve them.
2. **Set `baseURI` once the production domain is live.** It is deployed
   **empty**, so marketplace metadata does not resolve yet. Run from the
   treasury key:

   ```bash
   cast send 0x7016CfF42264C8D499a32bBe2b5A039bfd0Ed19f \
     "setBaseURI(string)" "https://<PRODUCTION-DOMAIN>/api/loopitern/token/" \
     --rpc-url https://rpc.mainnet.chain.robinhood.com \
     --private-key <TREASURY_PRIVATE_KEY>
   ```

   `tokenURI(id)` = `baseURI + id + ".json"`, so the value **must end with
   `/`**. Sanity-check afterwards:
   `cast call <addr> "tokenURI(uint256)" 1 --rpc-url …` should return
   `https://<domain>/api/loopitern/token/1.json`, and that URL must return
   the ERC-721 JSON (the route reads owner + rarity from chain and 404s on
   unminted ids).
3. **Optional: `setContractURI`** with a JSON URL for marketplace listing
   metadata (collection banner/description on OpenSea).

## Environment (Vercel)

From `docs/vercel-env.txt` — set in the Vercel project (Production +
Preview):

- `NEXT_PUBLIC_LOOPITERNS_ADDRESS=0x7016CfF42264C8D499a32bBe2b5A039bfd0Ed19f`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — Reown project id (mobile wallets)
- `NEXT_PUBLIC_RPC_URL` — optional override
- `NEXT_PUBLIC_LOOPITERNS_MINT_PRICE_WEI` — optional fallback
- `KV_REST_API_URL` / `KV_REST_API_TOKEN` — Vercel KV for wallet-synced
  personal bests

Never put `PRIVATE_KEY` in Vercel. It belongs only in `contracts/.env`
(git-ignored), used for owner transactions.

## Treasury sweep

The contract holds all mint ETH. `withdraw(to)` is **owner-only**, sends the
**full** balance, reverts `WithdrawFailed` on a rejecting receiver, emits
`Withdrawn(to, amount)`. Covered by `forge test` (21/21).

From `contracts/` (reads `PRIVATE_KEY` from `contracts/.env`, never prints it):

```powershell
powershell -ExecutionPolicy Bypass -File .\check-pot.ps1   # just show the pot
powershell -ExecutionPolicy Bypass -File .\sweep.ps1       # withdraw everything
```

## Emergency brake

`pause()` / `unpause()` (owner-only) halt minting via `whenNotPaused`.
Transfers and views keep working. If a bad frontend build ships wrong mint
requests, pause first, fix, unpause.

## Known non-issues (don't "fix" these)

- **`raritiesOf()` is source-only.** It was added after deploy and is not in
  the live bytecode. The app reads rarities through Multicall3 instead.
  Redeclaring would orphan the minted tokens — don't.
- **Client survival time is untrusted.** The contract stores
  `claimedSeconds` but never verifies it. The gates (45s…180s) are UX, not
  proof. On-chain truth = price paid, wallet cap, supply.
- **`contracts/foundry.toml` still carries Inco-era remappings and a
  `[profile.deploy]`** from the removed Base vault. Harmless — the default
  profile compiles and tests the active contract. Ignore them.

## Contract facts reference

Source of truth: `contracts/src/Loopiterns.sol` (solc 0.8.29, tests in
`contracts/test/Loopiterns.t.sol`).

- Rarity drop-down: requested tier sold out → next lower tier with supply;
  never an upgrade. All tiers exhausted → `SoldOut()`.
- Wrong value sent → `WrongPrice()`. 6th mint from a wallet → `WalletCap()`.
- Token ids start at 1 (`totalSupply() + 1`).
- `Minted(to, id, rarity, requested)` event lets the UI detect a
  drop-down mint (`rarity != requested`).
