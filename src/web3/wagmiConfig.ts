"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
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

/**
 * RainbowKit `getDefaultConfig` is client-only (Next.js 16). Do not import
 * this module from a Server Component / `layout.tsx`.
 */
export const wagmiConfig = walletConnectProjectId
  ? getDefaultConfig({
      appName: APP_NAME,
      appDescription: "Vertical endless survival on Base.",
      projectId: walletConnectProjectId,
      chains: [BASE_CHAIN],
      ssr: true,
      storage: wagmiStorage,
      transports,
    })
  : createConfig({
      chains: [BASE_CHAIN],
      connectors: [
        injected({
          shimDisconnect: false,
        }),
      ],
      storage: wagmiStorage,
      transports,
      ssr: true,
      multiInjectedProviderDiscovery: true,
    });
