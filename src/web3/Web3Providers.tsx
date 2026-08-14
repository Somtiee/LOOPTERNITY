"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { APP_NAME, BASE_CHAIN, walletConnectProjectId } from "./config";
import { wagmiConfig } from "./wagmiConfig";

const loopternityTheme = darkTheme({
  accentColor: "#ff6a2a",
  accentColorForeground: "#0a0608",
  borderRadius: "medium",
  fontStack: "system",
  overlayBlur: "small",
});

export function Web3Providers({ children }: { children: ReactNode }) {
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
    <WagmiProvider config={wagmiConfig} reconnectOnMount>
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
