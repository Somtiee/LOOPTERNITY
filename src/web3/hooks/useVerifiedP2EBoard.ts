"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient, useReadContract } from "wagmi";
import { parseAbiItem, type Address } from "viem";
import { loopternityVaultAbi } from "@/web3/abi/loopternityVault";
import {
  BASE_CHAIN,
  LOOPTERNITY_CONTRACT_ADDRESS,
  VAULT_DEPLOY_BLOCK,
  vaultIsDeployed,
  ZERO_ADDRESS,
} from "@/web3/config";
import {
  settlementPayoutsFromTop10,
  type OfficialBoardRow,
} from "@/web3/p2e/ranking";
import {
  readVerifiedCache,
  writeVerifiedCache,
  type VerifiedSubmitter,
} from "@/web3/p2e/verifiedCache";

const scoreSubmittedEvent = parseAbiItem(
  "event ScoreSubmitted(address indexed player, string weekId, uint256 runCount)",
);
const top10AttestedEvent = parseAbiItem(
  "event Top10Attested(string weekId, address indexed attester)",
);

export type VerifiedBoardSource = "mainnet" | "cache" | "local";

export function useVerifiedP2EBoard(weekId: string | null) {
  const publicClient = usePublicClient({ chainId: BASE_CHAIN.id });
  const enabled = vaultIsDeployed && Boolean(weekId);

  const poolQuery = useReadContract({
    address: LOOPTERNITY_CONTRACT_ADDRESS,
    abi: loopternityVaultAbi,
    functionName: "weekPoolWei",
    args: weekId ? [weekId] : undefined,
    chainId: BASE_CHAIN.id,
    query: { enabled, refetchInterval: 30_000 },
  });

  const settledQuery = useReadContract({
    address: LOOPTERNITY_CONTRACT_ADDRESS,
    abi: loopternityVaultAbi,
    functionName: "weekSettled",
    args: weekId ? [weekId] : undefined,
    chainId: BASE_CHAIN.id,
    query: { enabled, refetchInterval: 30_000 },
  });

  const top10Query = useReadContract({
    address: LOOPTERNITY_CONTRACT_ADDRESS,
    abi: loopternityVaultAbi,
    functionName: "getTop10",
    args: weekId ? [weekId] : undefined,
    chainId: BASE_CHAIN.id,
    query: { enabled, refetchInterval: 30_000 },
  });

  const logsQuery = useQuery({
    queryKey: ["p2e-verified-logs", BASE_CHAIN.id, weekId],
    enabled: enabled && Boolean(publicClient),
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!publicClient || !weekId) {
        return { submitters: [] as VerifiedSubmitter[], attested: false };
      }
      const [submitted, attestedLogs] = await Promise.all([
        publicClient.getLogs({
          address: LOOPTERNITY_CONTRACT_ADDRESS,
          event: scoreSubmittedEvent,
          fromBlock: VAULT_DEPLOY_BLOCK,
          toBlock: "latest",
        }),
        publicClient.getLogs({
          address: LOOPTERNITY_CONTRACT_ADDRESS,
          event: top10AttestedEvent,
          fromBlock: VAULT_DEPLOY_BLOCK,
          toBlock: "latest",
        }),
      ]);

      const byPlayer = new Map<string, number>();
      for (const log of submitted) {
        if (log.args.weekId !== weekId) continue;
        const player = log.args.player;
        const runCount = log.args.runCount;
        if (!player || runCount === undefined) continue;
        byPlayer.set(player.toLowerCase(), Number(runCount));
      }
      const submitters: VerifiedSubmitter[] = [...byPlayer.entries()].map(
        ([addr, runCount]) => ({
          address: addr as Address,
          runCount,
        }),
      );
      submitters.sort((a, b) => a.address.localeCompare(b.address));

      const attested = attestedLogs.some((log) => log.args.weekId === weekId);
      return { submitters, attested };
    },
  });

  const cache = useMemo(() => readVerifiedCache(), []);

  const poolWei =
    typeof poolQuery.data === "bigint" ? poolQuery.data : null;
  const settled = settledQuery.data === true;
  const top10 = (top10Query.data as readonly Address[] | undefined) ?? null;
  const hasNonZeroTop =
    top10?.some((a) => a && a.toLowerCase() !== ZERO_ADDRESS) ?? false;
  const attested = logsQuery.data?.attested === true || settled || hasNonZeroTop;

  const liveOk =
    enabled &&
    poolWei !== null &&
    top10 !== null &&
    !poolQuery.isError &&
    !settledQuery.isError &&
    !top10Query.isError &&
    !logsQuery.isError &&
    Boolean(logsQuery.data);

  const fromCache =
    !liveOk &&
    Boolean(cache) &&
    cache?.weekId === weekId &&
    enabled;

  const poolStr = liveOk
    ? poolWei!.toString()
    : fromCache
      ? cache!.poolWei
      : "0";
  const settledFlag = liveOk
    ? settled
    : fromCache
      ? cache!.settled
      : false;
  const attestedFlag = liveOk
    ? attested
    : fromCache
      ? cache!.attested
      : false;
  const top10Live = liveOk ? top10! : fromCache ? cache!.top10 : [];
  const submitters = liveOk
    ? logsQuery.data!.submitters
    : fromCache
      ? cache!.submitters
      : [];

  useEffect(() => {
    if (!liveOk || !weekId) return;
    writeVerifiedCache({
      weekId,
      fetchedAt: Date.now(),
      poolWei: poolStr,
      settled: settledFlag,
      attested: attestedFlag,
      top10: [...top10Live],
      submitters,
    });
  }, [
    attestedFlag,
    liveOk,
    poolStr,
    settledFlag,
    submitters,
    top10Live,
    weekId,
  ]);

  const runsByAddr = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of submitters) m.set(s.address.toLowerCase(), s.runCount);
    return m;
  }, [submitters]);

  const officialBoard: OfficialBoardRow[] = useMemo(() => {
    if (!attestedFlag) return [];
    return settlementPayoutsFromTop10(BigInt(poolStr || "0"), top10Live).map(
      (row) => ({
        ...row,
        runs: runsByAddr.get(row.address.toLowerCase()) ?? 0,
      }),
    );
  }, [attestedFlag, poolStr, runsByAddr, top10Live]);

  const loading =
    enabled &&
    !liveOk &&
    !fromCache &&
    (poolQuery.isLoading ||
      settledQuery.isLoading ||
      top10Query.isLoading ||
      logsQuery.isLoading);

  const error =
    enabled && !liveOk && !fromCache
      ? "Could not read Base ranking. Not using localStorage as payout truth."
      : null;

  const refetchPool = poolQuery.refetch;
  const refetchSettled = settledQuery.refetch;
  const refetchTop10 = top10Query.refetch;
  const refetchLogs = logsQuery.refetch;
  const refetch = useCallback(async () => {
    await Promise.all([
      refetchPool(),
      refetchSettled(),
      refetchTop10(),
      refetchLogs(),
    ]);
  }, [refetchLogs, refetchPool, refetchSettled, refetchTop10]);

  const source: VerifiedBoardSource = !vaultIsDeployed
    ? "local"
    : liveOk
      ? "mainnet"
      : fromCache
        ? "cache"
        : "mainnet";

  return {
    enabled,
    loading,
    error,
    source,
    poolWei: poolStr,
    settled: settledFlag,
    attested: attestedFlag,
    submitters,
    officialBoard,
    refetch,
  };
}
