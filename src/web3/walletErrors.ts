import {
  BASE_CHAIN,
  CHAIN_LABEL,
  CHAIN_MODE,
  WRONG_NETWORK_HINT,
} from "./config";

/** Wrong-network copy. Production is Base 8453, never Sepolia. */
export function chainSwitchHint(chainId: number): string {
  if (CHAIN_MODE === "mainnet" && chainId === 84532) {
    return WRONG_NETWORK_HINT;
  }
  if (chainId === 1) {
    return `Switch to ${CHAIN_LABEL} (${BASE_CHAIN.id}), not Ethereum L1`;
  }
  if (chainId !== BASE_CHAIN.id) {
    return CHAIN_MODE === "mainnet"
      ? WRONG_NETWORK_HINT
      : `Switch to ${CHAIN_LABEL} (chain ${BASE_CHAIN.id})`;
  }
  return WRONG_NETWORK_HINT;
}

function rawMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/**
 * Human wallet / RPC / Inco errors. Always retryable copy — never dump a stack.
 */
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
  if (/chain mismatch|wrong chain|chain id|unsupported chain/i.test(raw)) {
    return chainSwitchHint(chainId);
  }
  if (
    /failed to fetch|network error|http request failed|fetch failed|timeout|timed out|econnrefused|429|rate limit|json-rpc|rpc error/i.test(
      raw,
    )
  ) {
    return "Could not reach Base. Check your connection and retry.";
  }
  if (/encrypt|inco|lightning|getfee/i.test(raw)) {
    return "Could not encrypt with Inco. Retry in a moment.";
  }
  if (/WrongWeek|wrong week/i.test(raw)) {
    return "Week id mismatch with the vault — wait a moment and retry";
  }
  if (/Underpaid/i.test(raw)) {
    return "Fee too low for the vault — retry";
  }
  if (/NoEntry/i.test(raw)) {
    return "Pay the entry fee first, then retry.";
  }
  if (/FeeNotPaid|fee not paid/i.test(raw)) {
    return "Inco input fee was wrong — retry";
  }
  if (/NothingToClaim/i.test(raw)) {
    return "Nothing to claim for that week";
  }
  if (/paused|EnforcedPause/i.test(raw)) {
    return "Vault is paused";
  }

  const trimmed = raw.replace(/^Error:\s*/i, "").trim();
  if (!trimmed) return `The ${verb} failed. Retry.`;
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}…` : trimmed;
}
