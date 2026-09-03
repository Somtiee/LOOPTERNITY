"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { ROBINHOOD_CHAIN } from "@/web3/config";

const RESTORE_MS = 1500;

/**
 * After refresh, wagmi can sit in `reconnecting` while a MetaMask-targeted
 * connector fails. Do not block START on that. Address + chain are enough.
 */
export function useWalletSession() {
  const { address, chainId, status, isReconnecting, isConnecting } =
    useAccount();
  const [restoreExpired, setRestoreExpired] = useState(false);

  const reconnecting =
    status === "reconnecting" || (status === "connecting" && Boolean(address));

  useEffect(() => {
    if (!reconnecting) {
      setRestoreExpired(false);
      return;
    }
    const id = window.setTimeout(() => setRestoreExpired(true), RESTORE_MS);
    return () => window.clearTimeout(id);
  }, [reconnecting]);

  const restoring = reconnecting && !restoreExpired;
  const hasWallet = Boolean(address);
  const onRobinhood = hasWallet && chainId === ROBINHOOD_CHAIN.id;

  return {
    address,
    chainId,
    status,
    restoring,
    hasWallet,
    onRobinhood,
    isConnected: hasWallet && status !== "disconnected",
    isReconnecting,
    isConnecting,
  };
}
