"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAccount, useConnect, WagmiProvider } from "wagmi";
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

function RestoreInjectedWallet() {
  const { isConnected } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const tried = useRef(false);

  useEffect(() => {
    if (tried.current || isConnected) return;
    const ethereum = (
      window as Window & {
        ethereum?: { request: (args: { method: string }) => Promise<unknown> };
      }
    ).ethereum;
    if (!ethereum) return;
    const injected = connectors.find((c) => c.id === "injected");
    if (!injected) return;
    tried.current = true;

    void (async () => {
      try {
        const accounts = (await ethereum.request({
          method: "eth_accounts",
        })) as unknown;
        if (!Array.isArray(accounts) || accounts.length === 0) return;
        await connectAsync({ connector: injected });
      } catch {
        /* Rabby/MetaMask conflict: ignore, user can tap CONNECT if needed */
      }
    })();
  }, [connectAsync, connectors, isConnected]);

  return null;
}

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
    <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={loopternityTheme}
          modalSize="compact"
          initialChain={BASE_CHAIN}
          appInfo={{ appName: APP_NAME }}
        >
          <RestoreInjectedWallet />
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
