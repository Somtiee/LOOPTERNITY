"use client";

import { useCallback, useState } from "react";
import { useAccount } from "wagmi";
import type { Hex } from "viem";
import {
  encryptBool,
  encryptUint256,
  getIncoLightning,
} from "@/web3/inco";
import { LOOPTERNITY_CONTRACT_ADDRESS } from "@/web3/config";

/**
 * Hook for encrypting game values with Inco Lightning (Base or Base Sepolia).
 * Use this next for encrypted survival-time submission.
 */
export function useIncoEncrypt() {
  const { address, isConnected } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ensureClient = useCallback(async () => {
    return getIncoLightning();
  }, []);

  const encryptSurvivalMs = useCallback(
    async (survivalMs: number | bigint): Promise<Hex | null> => {
      if (!address) {
        setError("Connect a wallet first");
        return null;
      }
      setBusy(true);
      setError(null);
      try {
        const value = typeof survivalMs === "bigint" ? survivalMs : BigInt(Math.floor(survivalMs));
        return await encryptUint256({
          value,
          accountAddress: address,
          dappAddress: LOOPTERNITY_CONTRACT_ADDRESS,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Encryption failed";
        setError(msg);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [address],
  );

  const encryptFlag = useCallback(
    async (flag: boolean): Promise<Hex | null> => {
      if (!address) {
        setError("Connect a wallet first");
        return null;
      }
      setBusy(true);
      setError(null);
      try {
        return await encryptBool({
          value: flag,
          accountAddress: address,
          dappAddress: LOOPTERNITY_CONTRACT_ADDRESS,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Encryption failed";
        setError(msg);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [address],
  );

  return {
    isConnected,
    address,
    busy,
    error,
    ensureClient,
    encryptSurvivalMs,
    encryptFlag,
    contractAddress: LOOPTERNITY_CONTRACT_ADDRESS,
  };
}
