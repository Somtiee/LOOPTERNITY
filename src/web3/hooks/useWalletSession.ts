"use client";

import { useAccount } from "wagmi";
import { BASE_CHAIN } from "@/web3/config";

/**
 * RainbowKit can show an address while wagmi `isConnected` is still false
 * (`status === "reconnecting"` after refresh). Treat a session address as
 * connected so START RUN does not open Connect a Wallet again.
 */
export function useWalletSession() {
  const { address, chainId, status, isReconnecting, isConnecting } =
    useAccount();

  const restoring =
    status === "reconnecting" || (status === "connecting" && Boolean(address));
  const hasWallet = Boolean(address);
  const onBase = hasWallet && chainId === BASE_CHAIN.id;

  return {
    address,
    chainId,
    status,
    restoring,
    hasWallet,
    onBase,
    isConnected: hasWallet && status !== "disconnected",
    isReconnecting,
    isConnecting,
  };
}
