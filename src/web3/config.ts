import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { injected } from "wagmi/connectors";
import { createConfig, fallback, http } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";

/**
 * `sepolia` = Base Sepolia testnet vault (Prompt E).
 * Default / `mainnet` = Base mainnet (production goal). Unset env stays mainnet.
 */
export type LoopternityChainMode = "mainnet" | "sepolia";

const chainEnv = process.env.NEXT_PUBLIC_CHAIN?.trim().toLowerCase();
export const CHAIN_MODE: LoopternityChainMode =
  chainEnv === "sepolia" ? "sepolia" : "mainnet";

export const BASE_CHAIN = CHAIN_MODE === "sepolia" ? baseSepolia : base;

export const CHAIN_LABEL =
  CHAIN_MODE === "sepolia" ? "Base Sepolia" : "Base";

export const CHAIN_REQUIRED_LABEL =
  CHAIN_MODE === "sepolia" ? "Base Sepolia" : "Base";

export const CHAIN_SWITCH_LABEL =
  CHAIN_MODE === "sepolia" ? "BASE SEPOLIA" : "BASE";

/** Shown when the wallet is on the wrong chain. Mainnet must not say Sepolia. */
export const WRONG_NETWORK_HINT =
  CHAIN_MODE === "sepolia"
    ? "Switch to Base Sepolia to play."
    : "Switch to Base.";

export const EXPLORER_ORIGIN =
  CHAIN_MODE === "sepolia"
    ? "https://sepolia.basescan.org"
    : "https://basescan.org";

export const APP_NAME = "LOOPTERNITY";

export const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || "";

/** LoopternityVault on the configured chain (mainnet 8453 when NEXT_PUBLIC_CHAIN=mainnet). */
export const LOOPTERNITY_CONTRACT_ADDRESS = (process.env
  .NEXT_PUBLIC_LOOPTERNITY_CONTRACT_ADDRESS?.trim() ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const;

export const vaultIsDeployed =
  LOOPTERNITY_CONTRACT_ADDRESS.toLowerCase() !== ZERO_ADDRESS;

/** LoopternityVault CREATE block on Base mainnet (8453). Log scans start here. */
export const VAULT_DEPLOY_BLOCK = BigInt(
  process.env.NEXT_PUBLIC_VAULT_DEPLOY_BLOCK?.trim() || "49966576",
);

export const baseRpcUrl =
  process.env.NEXT_PUBLIC_BASE_RPC_URL?.trim() ||
  (CHAIN_MODE === "sepolia"
    ? "https://sepolia.base.org"
    : "https://mainnet.base.org");

const BASE_RPC_FALLBACKS =
  CHAIN_MODE === "sepolia"
    ? ["https://sepolia.base.org"]
    : [
        "https://mainnet.base.org",
        "https://base.llamarpc.com",
        "https://1rpc.io/base",
      ];

export const baseRpcUrls = [
  baseRpcUrl,
  ...BASE_RPC_FALLBACKS.filter((url) => url !== baseRpcUrl),
];

const transports = {
  [BASE_CHAIN.id]: fallback(
    baseRpcUrls.map((url) => http(url, { retryCount: 2, timeout: 20_000 })),
  ),
} as const;

/**
 * RainbowKit `getDefaultConfig` needs a Reown/WalletConnect Cloud project id
 * (free: https://cloud.reown.com). Without one, browser wallets still work via
 * injected MetaMask / Rabby / Coinbase. Do not use a fake id — it hangs connect.
 */
export const wagmiConfig = walletConnectProjectId
  ? getDefaultConfig({
      appName: APP_NAME,
      appDescription: "Vertical endless survival on Base.",
      projectId: walletConnectProjectId,
      chains: [BASE_CHAIN],
      ssr: true,
      transports,
    })
  : createConfig({
      chains: [BASE_CHAIN],
      connectors: [
        injected({
          shimDisconnect: false,
        }),
      ],
      transports,
      ssr: true,
      multiInjectedProviderDiscovery: true,
    });
