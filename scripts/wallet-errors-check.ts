/**
 * The copy a player sees when a mint fails.
 *
 * Run: npx tsx scripts/wallet-errors-check.ts
 *
 * The 2026-09-26 outage (commit 9dafa2a) had two halves. The first was
 * arithmetic: the client priced every mint with a fee cap below its own tip,
 * which viem rejects locally — before the wallet is opened — so mints threw
 * with no popup and no explanation. That override is gone; mints now send no
 * fee fields and the wallet prices them, so there is no formula left to sweep.
 *
 * This guards the second half, which is still live code. The catch in
 * useMintLoopitern.ts used to read `e.message` directly, so the post-run panel
 * rendered the calldata, the request arguments and a viem version banner. It
 * asks walletErrors.ts now, and everything below pins what that returns: one
 * short, retryable sentence — never a dump.
 *
 * Pure: no RPC, no network, no transaction. The assertions run the real
 * function, so they fail when the mapper's behaviour drifts rather than when a
 * string in here does.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { walletTxError } from "../src/web3/walletErrors";

function fail(msg: string): never {
  console.error(`\nFAIL: ${msg}`);
  process.exit(1);
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) fail(msg);
}

/**
 * A viem dump as it reached the player: a short cause, then the meta-message
 * block viem appends to every failed request. Calldata is abbreviated; the
 * markers are verbatim.
 */
const dump = (cause: string) =>
  `${cause} Request Arguments: chain: undefined (id: 4663) data: 0xf5da1b70000… Contract Call: function: mintWithVoucher Docs: https://viem.sh/docs/contract/writeContract Version: viem@2.55.16`;

/** The production paste, minus the calldata, exactly as reported. */
const productionPaste = [
  "The provided tip (`maxPriorityFeePerGas` = 0.1 gwei) cannot be higher than the fee cap (`maxFeePerGas` = 0.0684768 gwei).",
  "Request Arguments: chain: undefined (id: 4663) from: 0xED638d2de9E7b6E8D06514A161bb2cEFf28bfCDd",
  "to: 0xF1d6AD543a47D84d5C624f80C0F22395BF524175 value: 0.0004 ETH data: 0xf5da1b70000…",
  "maxFeePerGas: 0.0684768 gwei maxPriorityFeePerGas: 0.1 gwei",
  "Contract Call: address: 0xF1d6AD543a47D84d5C624f80C0F22395BF524175 function: mintWithVoucher",
  "Docs: https://viem.sh/docs/contract/writeContract Version: viem@2.55.16",
].join(" ");

function main() {
  const cases: Array<[string, string, string]> = [
    [
      "the production paste",
      productionPaste,
      "Gas pricing hiccup on Robinhood — retry the mint",
    ],
    [
      "an unrecognised dump",
      dump("Execution reverted."),
      "The mint failed on Robinhood. Retry.",
    ],
    [
      "user rejection inside a dump",
      dump("User rejected the request."),
      "Wallet rejected the mint",
    ],
    [
      "UsedNonce inside a dump",
      dump("Execution reverted with reason: UsedNonce()."),
      "This run was already minted — start a new run to mint again.",
    ],
    [
      "an expired voucher",
      dump("Execution reverted with reason: ExpiredVoucher()."),
      "The mint window expired — retry the mint.",
    ],
    [
      "WrongPrice revert",
      "Execution reverted: WrongPrice()",
      "Mint price mismatch. Retry.",
    ],
    [
      "underfunded",
      "Insufficient funds for gas * price + value",
      "Not enough ETH on Robinhood for the mint + gas",
    ],
  ];

  console.log("=== the copy the player sees ===");
  for (const [label, raw, expected] of cases) {
    const got = walletTxError(raw, 4663, "mint");
    assert(
      got === expected,
      `${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`,
    );
    // The two properties that make it usable in the panel: it names nothing a
    // player cannot act on (no calldata, no hex blob), and it fits on a line.
    assert(
      !/0x[0-9a-f]{8}/i.test(got),
      `${label}: calldata leaked into the player-facing copy`,
    );
    assert(
      got.length <= 80,
      `${label}: copy is ${got.length} chars, too long for the panel`,
    );
    console.log(`  ${label.padEnd(30)} → ${got}`);
  }

  console.log("\n=== a readable revert is still worth showing ===");
  // The dump guard must not swallow everything into generic copy: a short,
  // specific reason tells the player more than "the mint failed".
  const custom = "Execution reverted: NotWhitelisted()";
  assert(
    walletTxError(custom, 4663, "mint") === custom,
    "a short custom revert reason was swallowed by the generic copy",
  );
  console.log(`  ${"short custom revert".padEnd(30)} → ${custom}`);

  console.log("\n=== the mint still sends no fee fields ===");
  // The regression that cost the outage is invisible to tsc and to the build:
  // an override that is arithmetically valid in one fee market and invalid in
  // the next. It is only visible in the source, so assert on the source.
  const hook = readFileSync(
    join(process.cwd(), "src/web3/loopiterns/useMintLoopitern.ts"),
    "utf8",
  );
  const at = hook.indexOf("writeContractAsync({");
  // Without this the slice below would be a single character on a rename, and
  // every assertion under it would pass on nothing.
  assert(at !== -1, "no writeContractAsync({ call in useMintLoopitern.ts — the anchor for this check moved");
  const send = hook.slice(at);
  assert(
    send.includes("mintWithVoucher"),
    "the writeContractAsync call found is not the mint — the anchor for this check moved",
  );
  for (const field of ["maxFeePerGas", "maxPriorityFeePerGas", "gasPrice"]) {
    assert(
      !send.includes(field),
      `useMintLoopitern.ts passes ${field} to writeContractAsync again — mints must use wallet pricing (see commit 9dafa2a)`,
    );
  }
  console.log("  no fee override in the send ✓ (wallet prices the mint)");

  console.log("\nAll wallet-error checks passed.");
}

try {
  main();
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}
