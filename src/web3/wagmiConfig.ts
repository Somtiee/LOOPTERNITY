"use client";

import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  braveWallet,
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  okxWallet,
  rainbowWallet,
  walletConnectWallet,
  zerionWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, createStorage, noopStorage } from "wagmi";
import { injected } from "wagmi/connectors";
import {
  APP_NAME,
  ROBINHOOD_CHAIN,
  transports,
  walletConnectProjectId,
} from "./config";
import { detectedRabbyWallet } from "./detectedRabbyWallet";

/** Client-only. Cookie storage was tripping Next.js router init (E668). */
const wagmiStorage = createStorage({
  key: "loopternity.wagmi",
  storage: typeof window !== "undefined" ? window.localStorage : noopStorage,
});

const injectedConnector = injected({
  shimDisconnect: false,
});

/**
 * EVM wallets only. MIPD is off so Keplr / Phantom / Backpack / Sui are not
 * auto-inserted above Rabby and MetaMask.
 */
const rainbowConnectors = walletConnectProjectId
  ? connectorsForWallets(
      [
        {
          groupName: "EVM",
          wallets: [
            injectedWallet,
            detectedRabbyWallet,
            metaMaskWallet,
            coinbaseWallet,
          ],
        },
        {
          groupName: "More",
          wallets: [
            rainbowWallet,
            braveWallet,
            okxWallet,
            zerionWallet,
            walletConnectWallet,
          ],
        },
      ],
      {
        appName: APP_NAME,
        projectId: walletConnectProjectId,
      },
    )
  : [];

/**
 * Do not import this module from a Server Component.
 */
export const wagmiConfig = createConfig({
  chains: [ROBINHOOD_CHAIN],
  connectors: walletConnectProjectId
    ? rainbowConnectors
    : [injectedConnector],
  storage: wagmiStorage,
  transports,
  ssr: true,
  multiInjectedProviderDiscovery: false,
});
