/**
 * Mint fee sanity check — the invariant that broke every mint.
 *
 * Run: npx tsx scripts/mint-fees-check.ts
 *
 * What this proves (2026-09-26, after every mint on Robinhood failed for every
 * wallet with "The provided tip (`maxPriorityFeePerGas` = 0.1 gwei) cannot be
 * higher than the fee cap (`maxFeePerGas` = 0.0684768 gwei)"):
 *
 *   1. The fee pair the client actually sends satisfies
 *      `maxFeePerGas >= maxPriorityFeePerGas` — the one rule viem asserts
 *      locally, before the wallet is asked, so a violation is a mint that can
 *      never be sent rather than a low fee the chain might still take.
 *   2. That holds across a dense sweep of base fees, not just today's.
 *   3. The cap covers `baseFee + tip`, so the tip is fully payable and the tx
 *      can be included at the base fee it was priced against.
 *   4. The previous rule is reproduced and shown failing under live chain
 *      conditions — so this stays a regression check, not a tautology. It
 *      failed because the cap was scaled off viem's estimate
 *      (`baseFee * 1.2`, since the RPC reports a 0 tip) while the tip was a
 *      fixed 0.1 gwei floor, so the two crossed at 0.0417 gwei of base fee.
 *   5. The copy the player sees for these errors is one short sentence, not
 *      the raw viem dump. The screenshot of this failure showed the calldata,
 *      the request arguments and a viem version banner, because the catch in
 *      useMintLoopitern.ts read `e.message` instead of asking
 *      walletErrors.ts.
 *
 * Reads the live Robinhood RPC, so it also fails loudly if the chain's fee
 * market moves somewhere the formula does not cover. No transaction is sent.
 */

import { assertRequest, createPublicClient, formatGwei, http } from "viem";
import {
  FEE_BOOST,
  PRIORITY_FLOOR_WEI,
  eip1559MintFees,
} from "../src/web3/loopiterns/mintFees";
import { walletTxError } from "../src/web3/walletErrors";

const RPC = "https://rpc.mainnet.chain.robinhood.com";
const client = createPublicClient({ transport: http(RPC, { timeout: 20_000 }) });

function fail(msg: string): never {
  console.error(`\nFAIL: ${msg}`);
  process.exit(1);
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) fail(msg);
}

const gwei = (v: bigint) => `${formatGwei(v)} gwei`;

/** The rule as it shipped before this fix — kept to prove the bug was real. */
function oldRule(rpcMaxFeePerGas: bigint, rpcMaxPriorityFeePerGas: bigint) {
  return {
    maxFeePerGas: rpcMaxFeePerGas * FEE_BOOST,
    maxPriorityFeePerGas: rpcMaxPriorityFeePerGas * FEE_BOOST + PRIORITY_FLOOR_WEI,
  };
}

/** viem's own pre-send assertion, the exact one that threw in production. */
function assertionRejects(fees: {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}): string | null {
  try {
    assertRequest(fees);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

function checkInvariant(
  label: string,
  baseFeePerGas: bigint,
  fees: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint },
) {
  const rejection = assertionRejects(fees);
  assert(
    rejection === null,
    `${label}: viem rejects the fee pair at baseFee ${gwei(baseFeePerGas)} — ${rejection}`,
  );
  assert(
    fees.maxFeePerGas >= fees.maxPriorityFeePerGas,
    `${label}: tip ${gwei(fees.maxPriorityFeePerGas)} exceeds cap ${gwei(fees.maxFeePerGas)} at baseFee ${gwei(baseFeePerGas)}`,
  );
  assert(
    fees.maxFeePerGas >= baseFeePerGas + fees.maxPriorityFeePerGas,
    `${label}: cap ${gwei(fees.maxFeePerGas)} does not cover baseFee + tip (${gwei(baseFeePerGas + fees.maxPriorityFeePerGas)}) — the tip would be unpaid`,
  );
  assert(fees.maxFeePerGas > 0n, `${label}: zero cap at baseFee ${gwei(baseFeePerGas)}`);
}

/** The production input: live RPC estimate + live base fee. */
async function liveInputs() {
  const [fees, block, rpcTip] = await Promise.all([
    client.estimateFeesPerGas(),
    client.getBlock({ blockTag: "latest" }),
    client.request({ method: "eth_maxPriorityFeePerGas" }),
  ]);
  return {
    rpcMaxFeePerGas: fees?.maxFeePerGas ?? null,
    rpcMaxPriorityFeePerGas: fees?.maxPriorityFeePerGas ?? null,
    baseFeePerGas: block.baseFeePerGas ?? null,
    rawRpcTip: BigInt(rpcTip),
  };
}

async function main() {
  const live = await liveInputs();
  console.log("=== live Robinhood Chain fee market (block from the RPC) ===");
  console.log(`  baseFeePerGas            : ${live.baseFeePerGas === null ? "n/a" : gwei(live.baseFeePerGas)}`);
  console.log(`  eth_maxPriorityFeePerGas : ${gwei(live.rawRpcTip)}`);
  console.log(`  viem maxFeePerGas        : ${live.rpcMaxFeePerGas === null ? "n/a" : gwei(live.rpcMaxFeePerGas)}`);
  console.log(`  viem maxPriorityFeePerGas: ${live.rpcMaxPriorityFeePerGas === null ? "n/a" : gwei(live.rpcMaxPriorityFeePerGas)}`);
  assert(live.baseFeePerGas !== null, "RPC returned no baseFeePerGas — cannot price the mint");
  assert(live.rpcMaxFeePerGas !== null, "RPC returned no maxFeePerGas estimate");

  const baseFee = live.baseFeePerGas;

  console.log("\n=== 1. the old rule, under live conditions (reproduction) ===");
  const old = oldRule(live.rpcMaxFeePerGas!, live.rpcMaxPriorityFeePerGas ?? 0n);
  console.log(`  cap (maxFeePerGas)       : ${gwei(old.maxFeePerGas)}`);
  console.log(`  tip (maxPriorityFeePerGas): ${gwei(old.maxPriorityFeePerGas)}`);
  const oldRejection = assertionRejects(old);
  assert(
    oldRejection !== null,
    "the old rule passes today — the reproduction no longer holds, so this check has stopped testing anything",
  );
  console.log(`  rejected by viem         : ${oldRejection!.split("\n")[0]}`);

  console.log("\n=== 2. the shipped rule, live input through the real function ===");
  const fixed = eip1559MintFees({
    baseFeePerGas: baseFee,
    rpcMaxFeePerGas: live.rpcMaxFeePerGas,
    rpcMaxPriorityFeePerGas: live.rpcMaxPriorityFeePerGas,
  });
  console.log(`  cap (maxFeePerGas)       : ${gwei(fixed.maxFeePerGas)}`);
  console.log(`  tip (maxPriorityFeePerGas): ${gwei(fixed.maxPriorityFeePerGas)}`);
  console.log(`  headroom over the tip    : ${gwei(fixed.maxFeePerGas - fixed.maxPriorityFeePerGas)}`);
  checkInvariant("live", baseFee, fixed);

  console.log("\n=== 3. dense baseFee sweep (0 → 2 gwei, 1e-6 gwei steps) ===");
  let swept = 0;
  for (let w = 0n; w <= 2_000_000_000n; w += 1_000_000n) {
    const fees = eip1559MintFees({
      baseFeePerGas: w,
      rpcMaxFeePerGas: (w * 12n) / 10n + (live.rpcMaxPriorityFeePerGas ?? 0n),
      rpcMaxPriorityFeePerGas: live.rpcMaxPriorityFeePerGas,
    });
    checkInvariant("sweep", w, fees);
    swept++;
  }
  console.log(`  ${swept} base fees, every one sendable ✓`);

  console.log("\n=== 4. extremes, incl. the failed-block-read fallback ===");
  const extremes: Array<[string, bigint | null]> = [
    ["baseFee 0", 0n],
    ["baseFee 1 wei", 1n],
    ["baseFee 10 gwei (congested)", 10_000_000_000n],
    ["baseFee 1000 gwei (absurd)", 1_000_000_000_000n],
    ["baseFee null (block read failed)", null],
  ];
  for (const [label, bf] of extremes) {
    const fees = eip1559MintFees({
      baseFeePerGas: bf,
      rpcMaxFeePerGas: bf === null ? null : (bf * 12n) / 10n + (live.rpcMaxPriorityFeePerGas ?? 0n),
      rpcMaxPriorityFeePerGas: live.rpcMaxPriorityFeePerGas,
    });
    checkInvariant(label, bf ?? fees.maxPriorityFeePerGas, fees);
    console.log(`  ${label.padEnd(34)} cap ${gwei(fees.maxFeePerGas).padStart(14)}  tip ${gwei(fees.maxPriorityFeePerGas)}`);
  }

  console.log("\n=== 5. where the old rule crossed over ===");
  // Start above zero: viem's assertion guards on truthiness, so a zero cap
  // slips past it and would report a bogus crossover at 0. The first base fee
  // with a real, non-zero cap is where the question is actually asked.
  let crossover: bigint | null = null;
  for (let w = 1_000_000n; w <= 2_000_000_000n; w += 1_000_000n) {
    if (assertionRejects(oldRule((w * 12n) / 10n, 0n)) === null) {
      crossover = w;
      break;
    }
  }
  assert(crossover !== null, "the old rule never became valid — the crossover model is wrong");
  console.log(`  the old rule is only sendable above ${gwei(crossover)} of base fee`);
  // The predicted crossover is 0.1 gwei / 2.4 = 0.0416666… gwei. Accept the
  // step either side of it rather than pinning the literal.
  assert(
    crossover >= 41_000_000n && crossover <= 42_000_000n,
    `crossover came out at ${gwei(crossover)}, not the predicted ~0.04167 gwei — the model behind this check needs revisiting`,
  );
  console.log(`  live base fee is ${gwei(baseFee)} — so it was dead for every wallet`);

  console.log("\n=== 6. the copy the player sees ===");
  // Faithful to the production paste: the short message plus the dump viem
  // attaches. The calldata is abbreviated; the markers are verbatim.
  const productionPaste = [
    "The provided tip (`maxPriorityFeePerGas` = 0.1 gwei) cannot be higher than the fee cap (`maxFeePerGas` = 0.0684768 gwei).",
    "Request Arguments: chain: undefined (id: 4663) from: 0xED638d2de9E7b6E8D06514A161bb2cEFf28bfCDd",
    "to: 0xF1d6AD543a47D84d5C624f80C0F22395BF524175 value: 0.0004 ETH data: 0xf5da1b70000…",
    "maxFeePerGas: 0.0684768 gwei maxPriorityFeePerGas: 0.1 gwei",
    "Contract Call: address: 0xF1d6AD543a47D84d5C624f80C0F22395BF524175 function: mintWithVoucher",
    "Docs: https://viem.sh/docs/contract/writeContract Version: viem@2.55.16",
  ].join(" ");
  const dump = (cause: string) =>
    `${cause} Request Arguments: chain: undefined (id: 4663) data: 0xf5da1b70000… Contract Call: function: mintWithVoucher Docs: https://viem.sh/docs/contract/writeContract Version: viem@2.55.16`;

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
  for (const [label, raw, expected] of cases) {
    const got = walletTxError(raw, 4663, "mint");
    assert(got === expected, `${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
    assert(!/0x[0-9a-f]{8}/i.test(got), `${label}: calldata leaked into the player-facing copy`);
    assert(got.length <= 80, `${label}: copy is ${got.length} chars, too long for the panel`);
    console.log(`  ${label.padEnd(30)} → ${got}`);
  }

  // A short, readable revert reason is still worth showing — the guard must not
  // swallow everything into generic copy.
  const custom = "Execution reverted: NotWhitelisted()";
  assert(
    walletTxError(custom, 4663, "mint") === custom,
    "a short custom revert reason was swallowed by the generic copy",
  );
  console.log(`  ${"short custom revert".padEnd(30)} → ${walletTxError(custom, 4663, "mint")}`);

  console.log("\nAll mint-fee checks passed.");
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
