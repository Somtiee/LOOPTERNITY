# Official Inco Lightning + OpenZeppelin (deploy compile)

Extracted from npm tarballs (no `npm install` — `@inco/lightning` pulls git deps that hang this repo):

- `@inco/lightning@1.0.2` — `src/` only (tests omitted)
- `@openzeppelin/contracts@5.4.0`
- `@openzeppelin/contracts-upgradeable@5.4.0`

`Lib.sol` binds to executor `0x4b9911b0191B0b6a6eA8F2Ed562e20Cff5AC8624` (mainnet pepper). That CREATE2 address is live on **Base (8453)** and **Base Sepolia (84532)**. `Lightning.baseSepoliaTestnet()` in `@inco/lightning-js` uses the same pepper.

Local `forge test` (default profile) still uses `lib/inco-lightning-shim`.
