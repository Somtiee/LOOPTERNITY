"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatEther, parseEther } from "viem";
import {
  useAccount,
  useChainId,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import {
  BASE_CHAIN,
  LOOPTERNITY_CONTRACT_ADDRESS,
  vaultIsDeployed,
  wagmiConfig,
} from "@/web3/config";
import { chainSwitchHint, walletTxError } from "@/web3/walletErrors";
import { loopternityVaultAbi } from "@/web3/abi/loopternityVault";
import {
  ethForUsd,
  fetchEthUsd,
  P2E_ENTRY_FEE_ETH_OVERRIDE,
  P2E_ENTRY_FEE_USD,
} from "@/web3/p2e/fees";
import { addPoolWei } from "@/web3/p2e/store";
import { weekIdFromDate } from "@/web3/p2e/week";

function payErrorMessage(e: unknown, chainId: number): string {
  return walletTxError(e, chainId, "entry fee");
}

function maxWei(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

export function useP2EEntryFee() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [ethUsd, setEthUsd] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const inflight = useRef(false);
  const { writeContractAsync } = useWriteContract();

  const clientWeekId = weekIdFromDate();
  const onBase = chainId === BASE_CHAIN.id;

  const feeQuery = useReadContract({
    address: LOOPTERNITY_CONTRACT_ADDRESS,
    abi: loopternityVaultAbi,
    functionName: "entryFeeWei",
    chainId: BASE_CHAIN.id,
    query: { enabled: vaultIsDeployed },
  });

  const weekQuery = useReadContract({
    address: LOOPTERNITY_CONTRACT_ADDRESS,
    abi: loopternityVaultAbi,
    functionName: "currentWeekId",
    chainId: BASE_CHAIN.id,
    query: { enabled: vaultIsDeployed },
  });

  useEffect(() => {
    if (P2E_ENTRY_FEE_ETH_OVERRIDE) return;
    let alive = true;
    void fetchEthUsd().then((n) => {
      if (alive) setEthUsd(n);
    });
    return () => {
      alive = false;
    };
  }, []);

  const displayEth = P2E_ENTRY_FEE_ETH_OVERRIDE
    ? Number(P2E_ENTRY_FEE_ETH_OVERRIDE)
    : ethUsd
      ? ethForUsd(P2E_ENTRY_FEE_USD, ethUsd)
      : 0.000027;
  const displayWei = parseEther(displayEth.toFixed(8));

  const onchainFee =
    typeof feeQuery.data === "bigint" ? feeQuery.data : null;
  const onchainWeekId =
    typeof weekQuery.data === "string" ? weekQuery.data : null;

  const payWei =
    vaultIsDeployed && onchainFee !== null
      ? maxWei(displayWei, onchainFee)
      : displayWei;

  const weekAligned =
    !vaultIsDeployed ||
    (onchainWeekId !== null && onchainWeekId === clientWeekId);

  const weekId = vaultIsDeployed && onchainWeekId ? onchainWeekId : clientWeekId;
  const feeReady =
    !vaultIsDeployed || (onchainFee !== null && onchainFee > BigInt(0));

  const pay = useCallback(async (): Promise<boolean> => {
    if (inflight.current) return false;
    if (!isConnected || !address) {
      setError("Connect a wallet first");
      return false;
    }
    if (!onBase) {
      setError(chainSwitchHint(chainId));
      return false;
    }

    inflight.current = true;
    setBusy(true);
    setError(null);
    setTxHash(null);

    try {
      if (vaultIsDeployed) {
        const [feeRes, weekRes] = await Promise.all([
          feeQuery.refetch(),
          weekQuery.refetch(),
        ]);
        const freshFee =
          typeof feeRes.data === "bigint" ? feeRes.data : null;
        const freshWeek =
          typeof weekRes.data === "string" ? weekRes.data : null;

        if (freshFee === null || freshFee === BigInt(0)) {
          setError("Could not read the vault fee. Check RPC and retry.");
          return false;
        }
        if (!freshWeek || freshWeek !== clientWeekId) {
          setError(
            `Week mismatch (local ${clientWeekId} vs vault ${freshWeek ?? "…"}). Retry in a moment.`,
          );
          return false;
        }

        const value = maxWei(displayWei, freshFee);
        const hash = await writeContractAsync({
          address: LOOPTERNITY_CONTRACT_ADDRESS,
          abi: loopternityVaultAbi,
          functionName: "enterRun",
          args: [freshWeek],
          value,
          chainId: BASE_CHAIN.id,
        });
        setTxHash(hash);
        const receipt = await waitForTransactionReceipt(wagmiConfig, {
          hash,
          chainId: BASE_CHAIN.id,
        });
        if (receipt.status !== "success") {
          throw new Error("Entry transaction failed on Base");
        }
      } else {
        addPoolWei(displayWei);
      }
      return true;
    } catch (e) {
      setError(payErrorMessage(e, chainId));
      return false;
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }, [
    address,
    chainId,
    clientWeekId,
    displayWei,
    feeQuery,
    isConnected,
    onBase,
    weekQuery,
    writeContractAsync,
  ]);

  const ethAmount = Number(formatEther(payWei));

  return {
    usd: P2E_ENTRY_FEE_USD,
    ethAmount,
    ethLabel: `${ethAmount.toFixed(6)} ETH`,
    weiLabel: formatEther(payWei),
    wei: payWei,
    ethUsd,
    vaultIsDeployed,
    requiresOnchainPayment: vaultIsDeployed,
    weekId,
    clientWeekId,
    onchainWeekId,
    weekAligned,
    feeReady,
    feeLoading: vaultIsDeployed && (feeQuery.isLoading || weekQuery.isLoading),
    rpcError:
      vaultIsDeployed && (feeQuery.isError || weekQuery.isError)
        ? "Could not reach Base. Check your connection and retry."
        : null,
    retryReads: () => {
      void feeQuery.refetch();
      void weekQuery.refetch();
    },
    txHash,
    busy,
    error,
    pay,
    isConnected,
    onBase,
  };
}
