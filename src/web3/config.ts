import type { Transport } from "viem";
import { defineChain } from "viem";
import { http } from "wagmi";

/** Robinhood Chain mainnet. Native gas token is ETH. */
export const ROBINHOOD_CHAIN_ID = 4663;
/** Reserved. Not wired into wagmi until a public testnet RPC is set. */
export const ROBINHOOD_TESTNET_CHAIN_ID = 46630;

export const ROBINHOOD_RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL?.trim() ||
  "https://rpc.mainnet.chain.robinhood.com";

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

export const transports: Record<typeof robinhood.id, Transport> = {
  [robinhood.id]: http(ROBINHOOD_RPC_URL, { retryCount: 2, timeout: 20_000 }),
};
