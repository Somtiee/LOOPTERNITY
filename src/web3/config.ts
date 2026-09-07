import { defineChain, fallback, http, type Transport } from "viem";

/** Robinhood Chain mainnet. Native gas token is ETH. */
export const ROBINHOOD_CHAIN_ID = 4663;
/** Reserved. Not wired into wagmi until a public testnet RPC is set. */
export const ROBINHOOD_TESTNET_CHAIN_ID = 46630;

/**
 * Primary RPC — always the public Robinhood endpoint. The env var below is
 * only ever a fallback, never the default route, so public infrastructure
 * carries the traffic and the (browser-visible) Alchemy key only absorbs
 * the overflow when the public RPC fails.
 */
export const ROBINHOOD_RPC_URL = "https://rpc.mainnet.chain.robinhood.com";

/**
 * Optional read fallback — e.g. a restrict-to-Robinhood Alchemy HTTPS URL
 * set via NEXT_PUBLIC_RPC_URL. Empty = public RPC only, exactly the
 * pre-fallback behavior. NEXT_PUBLIC_ vars are visible in the browser:
 * use a scoped key, never an admin key.
 */
export const ROBINHOOD_RPC_FALLBACK_URL =
  process.env.NEXT_PUBLIC_RPC_URL?.trim() || "";

export const EXPLORER_ORIGIN = "https://robinhoodchain.blockscout.com";

export const robinhood = defineChain({
  id: ROBINHOOD_CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [ROBINHOOD_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: EXPLORER_ORIGIN },
  },
  // Without this, viem's multicall throws ChainDoesNotSupportContract and
  // wagmi's useReadContracts silently falls back to N separate RPC calls
  // (one per token rarity read). Multicall3 is deployed at the canonical
  // address on 4663 — verified on-chain.
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
    },
  },
});

/** Active app chain. Testnet (46630) is defined as an id only for now. */
export const ROBINHOOD_CHAIN = robinhood;

export const CHAIN_LABEL = "Robinhood Chain";
export const CHAIN_REQUIRED_LABEL = "Robinhood Chain";
export const CHAIN_SWITCH_LABEL = "ROBINHOOD";
export const WRONG_NETWORK_HINT = "Switch to Robinhood Chain.";

export const APP_NAME = "LOOPTERNITY";

export const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || "";

/**
 * Read transport for the chain: public Robinhood first; the optional
 * NEXT_PUBLIC_RPC_URL (Alchemy) kicks in only when the public RPC fails.
 * `fallback` with no `rank` keeps the order deterministic — public-primary.
 * No fallback env → a single public transport, byte-for-byte today's behavior.
 */
export const transports: Record<typeof robinhood.id, Transport> = {
  [robinhood.id]: ROBINHOOD_RPC_FALLBACK_URL
    ? fallback([
        http(ROBINHOOD_RPC_URL, { retryCount: 2, timeout: 20_000 }),
        http(ROBINHOOD_RPC_FALLBACK_URL, { retryCount: 2, timeout: 20_000 }),
      ])
    : http(ROBINHOOD_RPC_URL, { retryCount: 2, timeout: 20_000 }),
};
