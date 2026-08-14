"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, type State } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import {
  APP_NAME,
  BASE_CHAIN,
  wagmiConfig,
  walletConnectProjectId,
} from "./config";

const loopternityTheme = darkTheme({
  accentColor: "#ff6a2a",
  accentColorForeground: "#0a0608",
  borderRadius: "medium",
  fontStack: "system",
  overlayBlur: "small",
});

export function Web3Providers({
  children,
  initialState,
}: {
  children: ReactNode;
  initialState?: State;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  useEffect(() => {
    if (!walletConnectProjectId) {
      console.info(
        "[LOOPTERNITY] Optional free Reown project id: https://cloud.reown.com → NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID. MetaMask / Rabby still work without it.",
      );
    }
  }, []);

  return (
    <WagmiProvider
      config={wagmiConfig}
      initialState={initialState}
      reconnectOnMount
    >
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={loopternityTheme}
          modalSize="compact"
          initialChain={BASE_CHAIN}
          appInfo={{ appName: APP_NAME }}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
