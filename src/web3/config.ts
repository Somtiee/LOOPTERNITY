import { defineChain, fallback, http, type Transport } from "viem";

/**
 * Robinhood Chain MAINNET (4663). Native gas token is ETH (18 decimals).
 *
 * The app pointed at Circle Arc testnet (5042002, native-USDC gas) between
 * 2026-09-14 and 2026-09-22; that deployment is retired. Nothing in the app
 * should reference Arc or 5042002 any more — only this header records it.
 *
 * This file exists so the chain flip is a single-file edit: every chain
 * constant the app reads lives here, and callers import the chain-neutral
 * ACTIVE_* names rather than pinning a chain id of their own. Switching
 * chains again means editing this file, not the callers.
 */
export const ACTIVE_CHAIN_ID = 4663;

/** Named alias for ACTIVE_CHAIN_ID — the same value, spelled explicitly. */
export const ROBINHOOD_CHAIN_ID = ACTIVE_CHAIN_ID;

/**
 * Primary RPC — always the public Robinhood endpoint. The env var below is
 * only ever a fallback, never the default route, so public infrastructure
 * carries the traffic and the (browser-visible) provider key only absorbs
 * the overflow when the public RPC fails.
 */
export const ROBINHOOD_RPC_URL = "https://rpc.mainnet.chain.robinhood.com";

/**
 * Optional read fallback — e.g. a restrict-to-Robinhood Alchemy HTTPS URL
 * set via NEXT_PUBLIC_RPC_URL. Empty = public RPC only. NEXT_PUBLIC_ vars
 * are visible in the browser: use a scoped key, never an admin key.
 */
export const RPC_FALLBACK_URL =
  process.env.NEXT_PUBLIC_RPC_URL?.trim() || "";

export const EXPLORER_ORIGIN = "https://robinhoodchain.blockscout.com";

export const robinhoodChain = defineChain({
  id: ACTIVE_CHAIN_ID,
  name: "Robinhood",
  // Native gas token is ETH (18 decimals). Mint price and gas are both paid
  // in ETH — there is no USDC leg on this chain.
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [ROBINHOOD_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Robinhood Blockscout", url: EXPLORER_ORIGIN },
  },
  // Without this, viem's multicall throws ChainDoesNotSupportContract and
  // wagmi's useReadContracts silently falls back to N separate RPC calls
  // (one per token rarity read) — the inventory page would fan out to one
  // request per token.
  //
  // Verified on-chain 2026-09-22: eth_getCode 0xcA11bde05977b3631167028862bE2a173976CA11
  // on chain 4663 (rpc.mainnet.chain.robinhood.com, chain-id confirmed 4663)
  // returns Multicall3 runtime bytecode, not 0x — so the canonical pin below
  // is real on this chain and batched inventory reads work.
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
    },
  },
});

/** Active app chain. Switch the constants above, not the callers. */
export const ACTIVE_CHAIN = robinhoodChain;

export const CHAIN_LABEL = "Robinhood";
export const CHAIN_REQUIRED_LABEL = "Robinhood";
export const CHAIN_SWITCH_LABEL = "ROBINHOOD";
export const WRONG_NETWORK_HINT = "Switch to Robinhood.";

export const APP_NAME = "LOOPTERNITY";

export const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || "";

/**
 * Read transport for the chain: public Robinhood RPC first; the optional
 * NEXT_PUBLIC_RPC_URL (e.g. Alchemy) kicks in only when the public RPC
 * fails. `fallback` with no `rank` keeps the order deterministic —
 * public-primary. No fallback env → a single public transport.
 */
export const transports: Record<typeof robinhoodChain.id, Transport> = {
  [robinhoodChain.id]: RPC_FALLBACK_URL
    ? fallback([
        http(ROBINHOOD_RPC_URL, { retryCount: 2, timeout: 20_000 }),
        http(RPC_FALLBACK_URL, { retryCount: 2, timeout: 20_000 }),
      ])
    : http(ROBINHOOD_RPC_URL, { retryCount: 2, timeout: 20_000 }),
};

/* -------------------------------------------------------------------------
 * Arc-era aliases — DEPRECATED, remove once nothing imports them.
 *
 * These names survive the Arc → Robinhood flip so pre-flip imports keep
 * compiling, but their VALUES are the Robinhood chain, not Arc's. Reading
 * ARC_CHAIN_ID and getting 4663 is correct here, not a bug: the whole app
 * is on Robinhood now. New code must import the ACTIVE_* / ROBINHOOD_* names.
 * ---------------------------------------------------------------------- */

/** @deprecated Use ACTIVE_CHAIN_ID. Alias retained for pre-flip imports. */
export const ARC_CHAIN_ID = ACTIVE_CHAIN_ID;

/** @deprecated Use ROBINHOOD_RPC_URL. Alias retained for pre-flip imports. */
export const ARC_RPC_URL = ROBINHOOD_RPC_URL;

/** @deprecated Use RPC_FALLBACK_URL. Alias retained for pre-flip imports. */
export const ARC_RPC_FALLBACK_URL = RPC_FALLBACK_URL;

/** @deprecated Use ACTIVE_CHAIN. Alias retained for pre-flip imports. */
export const ARC_CHAIN = ACTIVE_CHAIN;

/** @deprecated Use robinhoodChain. Alias retained for pre-flip imports. */
export const arcTestnet = robinhoodChain;
