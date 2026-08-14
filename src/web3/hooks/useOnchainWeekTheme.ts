"use client";

import { useCallback } from "react";
import { useReadContract } from "wagmi";
import type { ThemeId } from "@/game/types";
import { loopternityVaultAbi } from "@/web3/abi/loopternityVault";
import {
  BASE_CHAIN,
  LOOPTERNITY_CONTRACT_ADDRESS,
  vaultIsDeployed,
} from "@/web3/config";
import { sealedThemeForWeek, weekIdFromDate } from "@/web3/p2e/week";

export type OnchainWeekThemeStatus =
  | "local"
  | "loading"
  | "error"
  | "unsealed"
  | "sealed";

export type OnchainWeekTheme = {
  status: OnchainWeekThemeStatus;
  weekId: string | null;
  themeId: ThemeId | null;
  /** True when this week's world is known so P2E can launch. */
  playable: boolean;
  error: string | null;
  refetch: () => void;
};

/**
 * Live P2E world = `sealedThemeForWeek(currentWeekId)`.
 * The week (and world) roll at Sunday 00:00 UTC. Keeper `themeSealed` is the
 * on-chain record; it must not lock players out of the current week.
 */
export function useOnchainWeekTheme(): OnchainWeekTheme {
  const clientWeekId = weekIdFromDate();

  const weekQuery = useReadContract({
    address: LOOPTERNITY_CONTRACT_ADDRESS,
    abi: loopternityVaultAbi,
    functionName: "currentWeekId",
    chainId: BASE_CHAIN.id,
    query: { enabled: vaultIsDeployed, refetchInterval: 30_000 },
  });

  const onchainWeekId =
    typeof weekQuery.data === "string" ? weekQuery.data : null;

  const sealedQuery = useReadContract({
    address: LOOPTERNITY_CONTRACT_ADDRESS,
    abi: loopternityVaultAbi,
    functionName: "themeSealed",
    args: onchainWeekId ? [onchainWeekId] : undefined,
    chainId: BASE_CHAIN.id,
    query: {
      enabled: vaultIsDeployed && Boolean(onchainWeekId),
      refetchInterval: 30_000,
    },
  });

  const refetchWeek = weekQuery.refetch;
  const refetchSealed = sealedQuery.refetch;
  const refetch = useCallback(() => {
    void refetchWeek();
    void refetchSealed();
  }, [refetchSealed, refetchWeek]);

  if (!vaultIsDeployed) {
    return {
      status: "local",
      weekId: clientWeekId,
      themeId: sealedThemeForWeek(clientWeekId),
      playable: true,
      error: null,
      refetch,
    };
  }

  if (weekQuery.isError) {
    return {
      status: "error",
      weekId: onchainWeekId,
      themeId: null,
      playable: false,
      error: "Could not read this week. Retry.",
      refetch,
    };
  }

  if (weekQuery.isLoading) {
    return {
      status: "loading",
      weekId: onchainWeekId,
      themeId: null,
      playable: false,
      error: null,
      refetch,
    };
  }

  if (!onchainWeekId) {
    return {
      status: "error",
      weekId: null,
      themeId: null,
      playable: false,
      error: "Could not read this week. Retry.",
      refetch,
    };
  }

  return {
    status: sealedQuery.data === true ? "sealed" : "unsealed",
    weekId: onchainWeekId,
    themeId: sealedThemeForWeek(onchainWeekId),
    playable: true,
    error: null,
    refetch,
  };
}
