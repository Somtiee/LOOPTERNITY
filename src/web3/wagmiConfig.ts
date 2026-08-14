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

/** Single EIP-1193 connector. Do not also MIPD-discover MetaMask — that restore fails when Rabby owns the page. */
export const injectedConnector = injected({
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
 * Do not import this module from a Server Component.
 */
export const wagmiConfig = createConfig({
  chains: [BASE_CHAIN],
  connectors: [injectedConnector, ...rainbowConnectors],
  storage: wagmiStorage,
  transports,
  ssr: true,
  multiInjectedProviderDiscovery: false,
});
