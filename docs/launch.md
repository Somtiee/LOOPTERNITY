# LOOPTERNITY Launch Runbook

Operational checklist for the live deployment on Robinhood Chain (4663).
Everything here reflects the current tree and chain state — see the `v3` block
in `contracts/deployments/robinhood-4663.json` for the deployment record (the
top-level fields in that file describe the retired v2).

## Current state (verify before acting)

| Item | Value |
| --- | --- |
| Contract (v3) | `0xF1d6AD543a47D84d5C624f80C0F22395BF524175` |
| Owner / treasury | `0xED638d2de9E7b6E8D06514A161bb2cEFf28bfCDd` |
| Mint price | 0.0004 ETH (`400000000000000` wei, `mintPrice()`) |
| Supply | 10,000 hard cap; rarity caps 5000 / 2500 / 1500 / 800 / 200 |
| Wallet cap | 10 mints per wallet (mint-only; secondary purchases uncapped) |
| RPC / explorer | `https://rpc.mainnet.chain.robinhood.com` / `https://robinhoodchain.blockscout.com` |

Quick live check:

```bash
cast call 0xF1d6AD543a47D84d5C624f80C0F22395BF524175 "totalSupply()" \
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
   cast send 0xF1d6AD543a47D84d5C624f80C0F22395BF524175 \
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

- `NEXT_PUBLIC_LOOPITERNS_ADDRESS=0xF1d6AD543a47D84d5C624f80C0F22395BF524175`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — Reown project id (mobile wallets)
- `VOUCHER_SIGNER_PRIVATE_KEY` — server-only key that signs mint vouchers
  (address must equal on-chain `mintSigner`, currently
  `0x486eCE21831ffa07661EF745746e2ec47a486222`; lives in `contracts/.env`)
- `NEXT_PUBLIC_RPC_URL` — optional override
- `NEXT_PUBLIC_LOOPITERNS_MINT_PRICE_WEI` — optional fallback
- `KV_REST_API_URL` / `KV_REST_API_TOKEN` — Vercel KV for wallet-synced
  personal bests

Never put `PRIVATE_KEY` in Vercel. It belongs only in `contracts/.env`
(git-ignored), used for owner transactions.

## Treasury sweep

The contract holds all mint ETH. `withdraw(to)` is **owner-only**, sends the
**full** balance, reverts `WithdrawFailed` on a rejecting receiver, emits
`Withdrawn(to, amount)`. Covered by `forge test` (32/32).

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

- **`raritiesOf()` is a batched view getter and must not be redeclared.** It
  is declared `external view` at `contracts/src/Loopiterns.sol:115`, so it is
  present in the deployed v3 bytecode (selector `0x8bff1fcc` dispatches — a
  live probe returns `ERC721NonexistentToken` for an unminted id while an
  unknown selector reverts with empty data). It cannot mint, cannot change
  price and cannot bypass any cap. The app reads rarities through Multicall3
  instead, and the app ABI omits it, so no UI code calls it. Changing its
  signature would change the deployed selector set — don't, without a fresh
  deploy.
- **Client survival time is untrusted — but the voucher gate is server-side.**
  The contract has no public `mint()`; minting requires a signed voucher. The
  server checks the rarity **score** gates (15k/25k/35k/45k/60k) AND a
  run-seed attestation: a seed is stamped at run start and a voucher is only
  signed after real wall-clock time ≥ the anti-spam floor passed since. On-chain
  truth = signature, price paid, wallet cap, supply. (`claimedSeconds` still
  exists on the struct but is vestigial — `mintWithVoucher` writes 0; v1's use
  of it was UX only, and v1 is withdrawn, paused, retired.)
- **`contracts/foundry.toml` still carries Inco-era remappings and a
  `[profile.deploy]`** from the removed Base vault. Harmless — the default
  profile compiles and tests the active contract. Ignore them.

## Contract facts reference

Source of truth: `contracts/src/Loopiterns.sol` (solc 0.8.29, tests in
`contracts/test/Loopiterns.t.sol`).

- Rarity drop-down: requested tier sold out → next lower tier with supply;
  never an upgrade. All tiers exhausted → `SoldOut()`.
- Wrong value sent → `WrongPrice()`. 11th mint from a wallet → `WalletCap()`.
- Token ids start at 1 (`totalSupply() + 1`).
- `Minted(to, id, rarity, requested)` event lets the UI detect a
  drop-down mint (`rarity != requested`).
