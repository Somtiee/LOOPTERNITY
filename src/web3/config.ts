import { defineChain, fallback, http, type Transport } from "viem";

/**
 * Circle Arc TESTNET. USDC is the native gas token (18 decimals) — confirmed
 * against docs.arc.io (connect-to-arc reference). Arc mainnet chain id is
 * deliberately NOT hardcoded here: when mainnet lands, switch these
 * constants (or move them behind an env flag) in one place — this file.
 */
export const ARC_CHAIN_ID = 5042002;

/**
 * Primary RPC — always the public Arc testnet endpoint. The env var below is
 * only ever a fallback, never the default route, so public infrastructure
 * carries the traffic and the (browser-visible) provider key only absorbs
 * the overflow when the public RPC fails.
 */
export const ARC_RPC_URL = "https://rpc.testnet.arc.io";

/**
 * Optional read fallback — e.g. a restrict-to-Arc Alchemy HTTPS URL set via
 * NEXT_PUBLIC_RPC_URL. Empty = public RPC only. NEXT_PUBLIC_ vars are
 * visible in the browser: use a scoped key, never an admin key.
 */
export const ARC_RPC_FALLBACK_URL =
  process.env.NEXT_PUBLIC_RPC_URL?.trim() || "";

export const EXPLORER_ORIGIN = "https://testnet.arcscan.app";

export const arcTestnet = defineChain({
  id: ARC_CHAIN_ID,
  name: "Arc Testnet",
  // Native gas token is USDC (18 decimals), per docs.arc.io. Wallets without
  // custom-gas-token support may display it as "ETH" — it is USDC.
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: [ARC_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Arcscan", url: EXPLORER_ORIGIN },
  },
  // Without this, viem's multicall throws ChainDoesNotSupportContract and
  // wagmi's useReadContracts silently falls back to N separate RPC calls
  // (one per token rarity read). Multicall3 is deployed at the canonical
  // address on Arc testnet 5042002 — verified on-chain via eth_getCode.
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
    },
  },
});

/** Active app chain. Arc mainnet: switch the constants above, not callers. */
export const ARC_CHAIN = arcTestnet;

export const CHAIN_LABEL = "Arc Testnet";
export const CHAIN_REQUIRED_LABEL = "Arc Testnet";
export const CHAIN_SWITCH_LABEL = "ARC";
export const WRONG_NETWORK_HINT = "Switch to Arc.";

export const APP_NAME = "LOOPTERNITY";

export const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || "";

/**
 * Read transport for the chain: public Arc testnet first; the optional
 * NEXT_PUBLIC_RPC_URL (e.g. Alchemy) kicks in only when the public RPC
 * fails. `fallback` with no `rank` keeps the order deterministic —
 * public-primary. No fallback env → a single public transport.
 */
export const transports: Record<typeof arcTestnet.id, Transport> = {
  [arcTestnet.id]: ARC_RPC_FALLBACK_URL
    ? fallback([
        http(ARC_RPC_URL, { retryCount: 2, timeout: 20_000 }),
        http(ARC_RPC_FALLBACK_URL, { retryCount: 2, timeout: 20_000 }),
      ])
    : http(ARC_RPC_URL, { retryCount: 2, timeout: 20_000 }),
};
