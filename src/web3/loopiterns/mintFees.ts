/**
 * Mint fee math — how the client prices `mintWithVoucher`.
 *
 * Pure and dependency-free on purpose: `scripts/mint-fees-check.ts` runs the
 * real production numbers through a live Robinhood RPC without React, wagmi or
 * a browser in the way.
 */

/**
 * Fee overrides for the mint send — exactly one fee scheme, never both:
 * EIP-1559 fields or a legacy gas price. (wagmi's write params are a
 * discriminated union; an all-optional shape breaks its type guard.)
 */
export type MintFees =
  | { gasPrice: bigint }
  | { maxFeePerGas: bigint; maxPriorityFeePerGas?: bigint }
  | { gasPrice?: undefined; maxFeePerGas?: undefined; maxPriorityFeePerGas?: undefined };

/** Headroom over the RPC's own cap — gas on Robinhood is paid in ETH. */
export const FEE_BOOST = 2n;

/**
 * Priority-fee floor (0.1 gwei) so the tx never queues behind zero-tip txs.
 *
 * Measured against the live chain (2026-09-26): the median tx tip is 0, ~62% of
 * txs pay no tip at all, and p90 is ~0.034 gwei — so this floor is above the
 * going rate rather than below it, and costs ~0.00002 ETH of extra tip on a
 * 200k-gas mint. Kept: it is cheap insurance for the post-run screen, where a
 * mint that lingers unmined is the worst possible outcome.
 */
export const PRIORITY_FLOOR_WEI = 100_000_000n;

/**
 * The EIP-1559 fee pair for the mint.
 *
 * The rule that matters: `maxFeePerGas >= maxPriorityFeePerGas`, always. viem
 * asserts it locally (`TipAboveFeeCapError`) before the wallet is ever asked,
 * so violating it is not a "low fee" the chain might still accept — it is a
 * mint that can never be sent, with no wallet popup to explain why.
 *
 * That is exactly how this broke. The previous rule was
 * `cap = rpc.maxFeePerGas * 2` with `tip = the 0.1 gwei floor + rpc tip`.
 * viem's estimate on Robinhood is `baseFee * 1.2 + rpcTip`, and the RPC
 * reports a **0** tip, so the cap was only `baseFee * 2.4` — which falls under
 * the 0.1 gwei floor as soon as baseFee drops below 0.0417 gwei. Robinhood
 * Chain's baseFee sits at ~0.028 gwei, so *every* mint failed, for every
 * wallet, until baseFee happened to rise again.
 *
 * So the cap is now built from the base fee instead of scaled off the
 * estimate: `baseFee * 2 + tip`. The tip is covered by construction, and the
 * RPC's own headroom is still taken when it is larger (it wins on a busy
 * chain, where the estimate is the better signal).
 */
export function eip1559MintFees(args: {
  /** Latest block's base fee, or null if that read failed. */
  baseFeePerGas: bigint | null;
  rpcMaxFeePerGas?: bigint | null;
  rpcMaxPriorityFeePerGas?: bigint | null;
}): { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } {
  const maxPriorityFeePerGas =
    (args.rpcMaxPriorityFeePerGas ?? 0n) * FEE_BOOST + PRIORITY_FLOOR_WEI;
  const fromEstimate = (args.rpcMaxFeePerGas ?? 0n) * FEE_BOOST;
  // Without a base fee we cannot do better than a fixed multiple of the tip.
  // It is only a fallback for a failed block read, and it still satisfies the
  // invariant, so the mint is sendable rather than dead.
  const fromBaseFee =
    args.baseFeePerGas === null
      ? maxPriorityFeePerGas * FEE_BOOST
      : args.baseFeePerGas * FEE_BOOST + maxPriorityFeePerGas;
  return {
    maxFeePerGas: fromBaseFee > fromEstimate ? fromBaseFee : fromEstimate,
    maxPriorityFeePerGas,
  };
}
