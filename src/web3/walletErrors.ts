import { CHAIN_LABEL, ROBINHOOD_CHAIN, WRONG_NETWORK_HINT } from "./config";

export function chainSwitchHint(chainId: number): string {
  if (chainId === 1) {
    return `Switch to ${CHAIN_LABEL} (${ROBINHOOD_CHAIN.id}), not Ethereum L1`;
  }
  if (chainId === 8453 || chainId === 84532) {
    return `Switch to ${CHAIN_LABEL} — this app is not on Base`;
  }
  if (chainId !== ROBINHOOD_CHAIN.id) {
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
    return "Max 5 LOOPITERNS per wallet";
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
  if (
    /failed to fetch|network error|http request failed|fetch failed|timeout|timed out|econnrefused|429|rate limit|json-rpc|rpc error/i.test(
      raw,
    )
  ) {
    return "Could not reach Robinhood Chain. Check your connection and retry.";
  }

  const trimmed = raw.replace(/^Error:\s*/i, "").trim();
  if (!trimmed) return `The ${verb} failed. Retry.`;
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}…` : trimmed;
}
