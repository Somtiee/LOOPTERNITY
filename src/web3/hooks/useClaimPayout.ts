"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { formatEther } from "viem";
import {
  useAccount,
  useChainId,
  useReadContract,
  useReadContracts,
  useWriteContract,
} from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import {
  BASE_CHAIN,
  EXPLORER_ORIGIN,
  LOOPTERNITY_CONTRACT_ADDRESS,
  vaultIsDeployed,
  wagmiConfig,
} from "@/web3/config";
import { chainSwitchHint, walletTxError } from "@/web3/walletErrors";
import { loopternityVaultAbi } from "@/web3/abi/loopternityVault";
import { pastWeekIds, weekIdFromDate, weekIdKey } from "@/web3/p2e/week";

const LOOKBACK = 8;
const ZERO = "0x0000000000000000000000000000000000000000";

export type ClaimWeekStatus = "claimable" | "claimed" | "pending" | "none";

export type ClaimWeekRow = {
  weekId: string;
  claimableWei: bigint;
  settled: boolean;
  inTop10: boolean;
  rank: number | null;
  status: ClaimWeekStatus;
};

function claimErrorMessage(e: unknown, chainId: number): string {
  return walletTxError(e, chainId, "claim");
}

function rowStatus(
  claimableWei: bigint,
  settled: boolean,
  inTop10: boolean,
): ClaimWeekStatus {
  if (claimableWei > BigInt(0)) return "claimable";
  if (settled && inTop10) return "claimed";
  if (settled) return "none";
  return "pending";
}

export function useClaimPayout() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [busyWeek, setBusyWeek] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const inflight = useRef(false);
  const { writeContractAsync } = useWriteContract();

  const onBase = chainId === BASE_CHAIN.id;
  const clientWeekId = weekIdFromDate();

  const currentWeekQuery = useReadContract({
    address: LOOPTERNITY_CONTRACT_ADDRESS,
    abi: loopternityVaultAbi,
    functionName: "currentWeekId",
    chainId: BASE_CHAIN.id,
    query: { enabled: vaultIsDeployed },
  });

  const currentWeekId =
    typeof currentWeekQuery.data === "string"
      ? currentWeekQuery.data
      : clientWeekId;

  const weekIds = useMemo(
    () => pastWeekIds(currentWeekId, LOOKBACK),
    [currentWeekId],
  );

  const contracts = useMemo(() => {
    if (!vaultIsDeployed || !address) return [];
    return weekIds.flatMap((id) => [
      {
        address: LOOPTERNITY_CONTRACT_ADDRESS,
        abi: loopternityVaultAbi,
        functionName: "claimable" as const,
        args: [weekIdKey(id), address] as const,
        chainId: BASE_CHAIN.id,
      },
      {
        address: LOOPTERNITY_CONTRACT_ADDRESS,
        abi: loopternityVaultAbi,
        functionName: "weekSettled" as const,
        args: [id] as const,
        chainId: BASE_CHAIN.id,
      },
      {
        address: LOOPTERNITY_CONTRACT_ADDRESS,
        abi: loopternityVaultAbi,
        functionName: "getTop10" as const,
        args: [id] as const,
        chainId: BASE_CHAIN.id,
      },
    ]);
  }, [address, weekIds]);

  const reads = useReadContracts({
    contracts,
    query: {
      enabled: vaultIsDeployed && Boolean(address) && contracts.length > 0,
      refetchInterval: 20_000,
    },
  });

  const rows: ClaimWeekRow[] = useMemo(() => {
    if (!address) return [];
    return weekIds.map((id, i) => {
      const claimRes = reads.data?.[i * 3];
      const settledRes = reads.data?.[i * 3 + 1];
      const topRes = reads.data?.[i * 3 + 2];
      const claimableWei =
        claimRes?.status === "success" && typeof claimRes.result === "bigint"
          ? claimRes.result
          : BigInt(0);
      const settled =
        settledRes?.status === "success" && settledRes.result === true;
      const top10 = (
        topRes?.status === "success" ? topRes.result : []
      ) as readonly `0x${string}`[];
      const idx = top10.findIndex(
        (a) => a && a.toLowerCase() === address.toLowerCase() && a.toLowerCase() !== ZERO,
      );
      const inTop10 = idx >= 0;
      return {
        weekId: id,
        claimableWei,
        settled,
        inTop10,
        rank: inTop10 ? idx + 1 : null,
        status: rowStatus(claimableWei, settled, inTop10),
      };
    });
  }, [address, reads.data, weekIds]);

  const visibleRows = useMemo(() => {
    return rows.filter((row, i) => {
      if (i === 0) return true;
      return row.status === "claimable" || row.status === "claimed";
    });
  }, [rows]);

  const totalClaimableWei = rows.reduce(
    (s, r) => s + r.claimableWei,
    BigInt(0),
  );

  const refetch = reads.refetch;

  const claim = useCallback(
    async (weekId: string): Promise<boolean> => {
      if (inflight.current) return false;
      if (!isConnected || !address) {
        setError("Connect a wallet first");
        return false;
      }
      if (!onBase) {
        setError(chainSwitchHint(chainId));
        return false;
      }
      if (!vaultIsDeployed) {
        setError("Vault is not configured");
        return false;
      }

      inflight.current = true;
      setBusyWeek(weekId);
      setError(null);
      setTxHash(null);

      try {
        const hash = await writeContractAsync({
          address: LOOPTERNITY_CONTRACT_ADDRESS,
          abi: loopternityVaultAbi,
          functionName: "claim",
          args: [weekId],
          chainId: BASE_CHAIN.id,
        });
        setTxHash(hash);
        const receipt = await waitForTransactionReceipt(wagmiConfig, {
          hash,
          chainId: BASE_CHAIN.id,
        });
        if (receipt.status !== "success") {
          throw new Error("Claim transaction failed on Base");
        }
        await refetch();
        return true;
      } catch (e) {
        setError(claimErrorMessage(e, chainId));
        return false;
      } finally {
        inflight.current = false;
        setBusyWeek(null);
      }
    },
    [address, chainId, isConnected, onBase, refetch, writeContractAsync],
  );

  return {
    enabled: vaultIsDeployed,
    isConnected,
    onBase,
    currentWeekId,
    previousWeekId: weekIds[0] ?? null,
    rows: visibleRows,
    allRows: rows,
    totalClaimableWei,
    totalClaimableLabel: formatEther(totalClaimableWei),
    loading: vaultIsDeployed && Boolean(address) && reads.isLoading,
    error,
    txHash,
    explorerTx: txHash ? `${EXPLORER_ORIGIN}/tx/${txHash}` : null,
    busyWeek,
    claim,
    refetch,
  };
}
