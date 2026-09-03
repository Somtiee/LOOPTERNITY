"use client";

import { useMemo } from "react";
import { useReadContract } from "wagmi";
import { ROBINHOOD_CHAIN_ID } from "@/web3/config";
import { loopiternsAbi } from "./abi";
import { getLoopiternsAddress } from "./address";

export type LoopiternsSupply = {
  /** True when the contract address is configured. */
  configured: boolean;
  /** First live read still in flight. */
  loading: boolean;
  /** Read failed — do not render static caps as live numbers. */
  error: boolean;
  /** totalSupply, or null when not read. */
  totalSupply: number | null;
  /** remainingAll as [common..legendary], or null when not read. */
  remainingByRarity: number[] | null;
  /** Sum of remainingByRarity when read, else null. */
  remainingAll: number | null;
  paused: boolean | null;
  /**
   * Sold out per live reads: totalSupply >= 10000 or remainingAll == 0.
   * False when the read failed or the contract address is missing —
   * a failed read never fakes sellout.
   */
  soldOut: boolean;
  refetch: () => void;
};

const MAX_SUPPLY = 10_000;

function toCount(n: bigint | undefined): number | null {
  if (n === undefined) return null;
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

/**
 * Wallet-independent LOOPITERNS supply reads for the StartMenu.
 * All calls fail soft when the contract address is missing.
 */
export function useLoopiternsSupply(): LoopiternsSupply {
  const contract = getLoopiternsAddress();
  const enabled = Boolean(contract);

  const totalSupplyQuery = useReadContract({
    address: contract,
    abi: loopiternsAbi,
    functionName: "totalSupply",
    chainId: ROBINHOOD_CHAIN_ID,
    query: { enabled },
  });

  const remainingQuery = useReadContract({
    address: contract,
    abi: loopiternsAbi,
    functionName: "remainingAll",
    chainId: ROBINHOOD_CHAIN_ID,
    query: { enabled },
  });

  const pausedQuery = useReadContract({
    address: contract,
    abi: loopiternsAbi,
    functionName: "paused",
    chainId: ROBINHOOD_CHAIN_ID,
    query: { enabled },
  });

  const remainingByRarity = useMemo(() => {
    const raw = remainingQuery.data;
    if (!raw) return null;
    const list = [...raw];
    if (list.length !== 5) return null;
    return list.map((n) => toCount(n) ?? 0);
  }, [remainingQuery.data]);

  const remainingAll =
    remainingQuery.isError || remainingByRarity === null
      ? null
      : remainingByRarity.reduce((sum, n) => sum + n, 0);

  // Each read fails soft on its own — a partial failure keeps the values
  // that did come back, and soldOut only fires on a value that was read.
  const failed = Boolean(totalSupplyQuery.isError || remainingQuery.isError);
  const totalSupply = totalSupplyQuery.isError
    ? null
    : toCount(totalSupplyQuery.data);

  const soldOut =
    (totalSupply !== null && totalSupply >= MAX_SUPPLY) ||
    remainingAll === 0;

  return {
    configured: enabled,
    loading: Boolean(enabled && (totalSupplyQuery.isPending || remainingQuery.isPending)),
    error: failed,
    totalSupply,
    remainingByRarity: remainingQuery.isError ? null : remainingByRarity,
    remainingAll: failed ? null : remainingAll,
    paused: pausedQuery.isError ? null : pausedQuery.data ?? null,
    soldOut,
    refetch: () => {
      void totalSupplyQuery.refetch();
      void remainingQuery.refetch();
      void pausedQuery.refetch();
    },
  };
}
