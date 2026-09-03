"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { isLoopiternRarityId } from "@/game/mintTiers";
import { ROBINHOOD_CHAIN_ID } from "@/web3/config";
import { useWalletSession } from "@/web3/hooks/useWalletSession";
import { walletTxError } from "@/web3/walletErrors";
import { loopiternsAbi } from "./abi";
import { getLoopiternsAddress } from "./address";
import type { EquippedLoopitern } from "./equip";

// Rarity reads are batched through Multicall3 (declared on the chain), so one
// page costs a single RPC call regardless of page size. The 5-per-wallet cap
// only limits minting — tokens bought on secondary markets also count here.
const PAGE_SIZE = 24;

export type OwnedLoopitern = EquippedLoopitern;

export function useLoopiternsInventory() {
  const { address, hasWallet, onRobinhood } = useWalletSession();
  const contract = getLoopiternsAddress();
  const enabled = Boolean(contract && address && onRobinhood);

  const tokensQuery = useReadContract({
    address: contract,
    abi: loopiternsAbi,
    functionName: "tokensOfOwner",
    args: address ? [address] : undefined,
    chainId: ROBINHOOD_CHAIN_ID,
    query: { enabled },
  });

  // Full owned list — drives the equipped-token check and pagination state,
  // so a token beyond the current page is never treated as unowned.
  const allIds = useMemo(() => {
    const raw = tokensQuery.data;
    if (!raw) return [] as bigint[];
    return [...raw];
  }, [tokensQuery.data]);

  const [shownCount, setShownCount] = useState(PAGE_SIZE);

  // Reset pagination when the wallet changes so a new address starts fresh.
  useEffect(() => {
    setShownCount(PAGE_SIZE);
  }, [address]);

  const ids = useMemo(
    () => allIds.slice(0, shownCount),
    [allIds, shownCount],
  );

  const rarityQuery = useReadContracts({
    contracts: ids.map((id) => ({
      address: contract,
      abi: loopiternsAbi,
      functionName: "tokenRarity" as const,
      args: [id] as const,
      chainId: ROBINHOOD_CHAIN_ID,
    })),
    query: { enabled: enabled && ids.length > 0 },
  });

  const tokens = useMemo((): OwnedLoopitern[] => {
    const out: OwnedLoopitern[] = [];
    for (let i = 0; i < ids.length; i += 1) {
      const result = rarityQuery.data?.[i];
      if (!result || result.status !== "success") continue;
      const rarity = Number(result.result);
      if (!isLoopiternRarityId(rarity)) continue;
      out.push({ tokenId: ids[i]!, rarity });
    }
    return out;
  }, [ids, rarityQuery.data]);

  const loading = Boolean(
    enabled &&
      (tokensQuery.isPending ||
        (ids.length > 0 && rarityQuery.isPending && tokens.length === 0)),
  );

  // One human message (walletErrors.ts) for RPC / wallet read hiccups.
  const errorMessage = useMemo(() => {
    if (!tokensQuery.isError) return null;
    return walletTxError(tokensQuery.error, ROBINHOOD_CHAIN_ID, "load");
  }, [tokensQuery.isError, tokensQuery.error]);

  const hasMore = allIds.length > shownCount;
  const loadMore = useCallback(() => {
    setShownCount((count) => count + PAGE_SIZE);
  }, []);

  return {
    configured: Boolean(contract),
    hasWallet,
    onRobinhood,
    loading,
    tokens,
    // Every owned id (not just the current page) — for ownership checks.
    tokenIds: allIds,
    totalOwned: allIds.length,
    shownCount: ids.length,
    hasMore,
    loadMore,
    error: Boolean(tokensQuery.isError),
    errorMessage,
    refetch: tokensQuery.refetch,
  };
}
