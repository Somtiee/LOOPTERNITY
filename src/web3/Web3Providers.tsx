"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EIP1193Provider } from "viem";
import { useAccount, useConnect, WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { APP_NAME, ROBINHOOD_CHAIN, walletConnectProjectId } from "./config";
import { getRabbyProvider } from "./detectedRabbyWallet";
import { wagmiConfig } from "./wagmiConfig";

const loopternityTheme = darkTheme({
  accentColor: "#00C805",
  accentColorForeground: "#05140a",
  borderRadius: "medium",
  fontStack: "system",
  overlayBlur: "small",
});

async function authorizedAccounts(
  provider: EIP1193Provider,
): Promise<string[]> {
  const accounts = (await provider.request({
    method: "eth_accounts",
  })) as unknown;
  return Array.isArray(accounts)
    ? accounts.filter((a): a is string => typeof a === "string")
    : [];
}

function RestoreInjectedWallet() {
  const { isConnected } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const tried = useRef(false);

  useEffect(() => {
    if (tried.current || isConnected) return;

    const timer = window.setTimeout(() => {
      if (tried.current || isConnected) return;
      tried.current = true;

      void (async () => {
        try {
          const rabby = getRabbyProvider();
          const ethereum = (window as Window & { ethereum?: EIP1193Provider })
            .ethereum;

          const rabbyAccounts = rabby ? await authorizedAccounts(rabby) : [];
          const ethAccounts = ethereum
            ? await authorizedAccounts(ethereum)
            : [];
          if (rabbyAccounts.length === 0 && ethAccounts.length === 0) return;

          const preferRabby = rabbyAccounts.length > 0;
          const connector = preferRabby
            ? (connectors.find((c) => c.id === "rabby") ??
              connectors.find((c) => c.id === "io.rabby") ??
              connectors.find((c) => c.name.toLowerCase().includes("rabby")))
            : undefined;
          const fallback =
            connectors.find((c) => c.id === "injected") ??
            connectors.find((c) => c.type === "injected");
          const chosen = connector ?? fallback;
          if (!chosen) return;
          await connectAsync({ connector: chosen });
        } catch {
          /* Rabby/MetaMask conflict: ignore, user can tap CONNECT if needed */
        }
      })();
    }, 50);

    return () => window.clearTimeout(timer);
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
          modalSize="wide"
          initialChain={ROBINHOOD_CHAIN}
          appInfo={{ appName: APP_NAME }}
        >
          <RestoreInjectedWallet />
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
