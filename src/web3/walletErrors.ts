import { ACTIVE_CHAIN, CHAIN_LABEL, WRONG_NETWORK_HINT } from "./config";

export function chainSwitchHint(chainId: number): string {
  if (chainId === 1) {
    return `Switch to ${CHAIN_LABEL} (${ACTIVE_CHAIN.id}), not Ethereum L1`;
  }
  if (chainId === 8453 || chainId === 84532) {
    return `Switch to ${CHAIN_LABEL} — this app is not on Base`;
  }
  if (chainId !== ACTIVE_CHAIN.id) {
    return WRONG_NETWORK_HINT;
  }
  return WRONG_NETWORK_HINT;
}

function rawMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const o = e as {
      shortMessage?: unknown;
      details?: unknown;
      message?: unknown;
    };
    const parts = [o.shortMessage, o.details, o.message]
      .filter((x): x is string => typeof x === "string" && x.length > 0);
    if (parts.length) return parts.join(" ");
  }
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/**
 * True when the error is a transient network/RPC failure (public Robinhood
 * RPC dropped, timed out, or rate-limited) — not a chain revert. Such errors
 * are always retryable, and the wallet may still reach Robinhood through its
 * own RPC even when ours cannot.
 */
export function isReachabilityError(raw: string): boolean {
  return /failed to fetch|network error|http request failed|fetch failed|timeout|timed out|econnrefused|429|rate limit|json-rpc|rpc error/i.test(
    raw,
  );
}

/**
 * viem / RPC error dumps. `rawMessage` has to concatenate `shortMessage`,
 * `details` and `message` to find the real cause, which also drags in the
 * meta-message block viem attaches to every failed request.
 */
const RAW_DUMP =
  /request arguments:|contract call:|docs:\s*https?:\/\/viem\.sh|version:\s*viem@|metaMessages/i;

/** Human wallet / RPC errors. Always retryable copy — never dump a stack. */
export function walletTxError(
  e: unknown,
  chainId: number,
  verb: string,
): string {
  const raw = rawMessage(e);

  if (/user rejected|denied transaction|user denied|rejected the request/i.test(raw)) {
    return `Wallet rejected the ${verb}`;
  }
  if (/insufficient funds|exceeds the balance|insufficient balance/i.test(raw)) {
    return `Not enough ETH on ${CHAIN_LABEL} for the ${verb} + gas`;
  }
  if (/chain mismatch|wrong chain|unsupported chain/i.test(raw)) {
    return chainSwitchHint(chainId);
  }
  if (/WalletCap/i.test(raw)) {
    return "Max 10 LOOPITERNS per wallet";
  }
  if (/SoldOut/i.test(raw)) {
    return "Sold out";
  }
  if (/WrongPrice/i.test(raw)) {
    return "Mint price mismatch. Retry.";
  }
  if (/InvalidRarity/i.test(raw)) {
    return "That rarity cannot be minted.";
  }
  if (/EnforcedPause/i.test(raw)) {
    return "Minting is paused.";
  }
  // The run already minted (stuck-tx retry, second tab, …) — the chain would
  // reject a second mint; say so plainly instead of a raw revert.
  if (/UsedNonce/i.test(raw)) {
    return "This run was already minted — start a new run to mint again.";
  }
  if (/ExpiredVoucher/i.test(raw)) {
    return "The mint window expired — retry the mint.";
  }
  // viem refuses to send a tip above the fee cap and throws locally, before
  // the wallet is asked, so there is no popup to explain the silence. Retrying
  // recomputes both fees (mintFees.ts), which is the actual fix.
  if (/cannot be higher than the fee cap|TipAboveFeeCap/i.test(raw)) {
    return `Gas pricing hiccup on ${CHAIN_LABEL} — retry the ${verb}`;
  }
  if (isReachabilityError(raw)) {
    return "Could not reach Robinhood. Check your connection and retry.";
  }

  // A viem / node error dump is never useful to a player: the calldata,
  // "Request Arguments", "Contract Call" and a version banner run to hundreds
  // of characters and name nothing they can act on. Checked after the specific
  // maps above, because a dump still carries the short message that identifies
  // the real cause. Anything short and readable (a custom revert string) still
  // falls through to the truncation below.
  if (RAW_DUMP.test(raw)) {
    return `The ${verb} failed on ${CHAIN_LABEL}. Retry.`;
  }

  const trimmed = raw.replace(/^Error:\s*/i, "").trim();
  if (!trimmed) return `The ${verb} failed. Retry.`;
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}…` : trimmed;
}
