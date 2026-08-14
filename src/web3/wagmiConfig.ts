"use client";

import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { cookieStorage, createConfig, createStorage } from "wagmi";
import { injected } from "wagmi/connectors";
import {
  APP_NAME,
  BASE_CHAIN,
  transports,
  walletConnectProjectId,
} from "./config";

const wagmiStorage = createStorage({
  storage: cookieStorage,
  key: "loopternity.wagmi",
});

const reconnectInjected = injected({
  shimDisconnect: false,
});

const rainbowConnectors = walletConnectProjectId
  ? connectorsForWallets(
      [
        {
          groupName: "Installed",
          wallets: [
            injectedWallet,
            rabbyWallet,
            metaMaskWallet,
            rainbowWallet,
            coinbaseWallet,
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
 * Injected connector uses `shimDisconnect: false` so Rabby/MetaMask stay
 * connected after refresh. Do not import this module from a Server Component.
 */
export const wagmiConfig = createConfig({
  chains: [BASE_CHAIN],
  connectors: [reconnectInjected, ...rainbowConnectors],
  storage: wagmiStorage,
  transports,
  ssr: true,
  multiInjectedProviderDiscovery: true,
});
