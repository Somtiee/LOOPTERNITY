"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { waitForTransactionReceipt, readContract } from "wagmi/actions";
import type { Hex } from "viem";
import { loopternityVaultAbi } from "@/web3/abi/loopternityVault";
import {
  BASE_CHAIN,
  CHAIN_LABEL,
  LOOPTERNITY_CONTRACT_ADDRESS,
  vaultIsDeployed,
} from "@/web3/config";
import { wagmiConfig } from "@/web3/wagmiConfig";
import { chainSwitchHint, walletTxError } from "@/web3/walletErrors";
import {
  encryptRunScore,
  incoScoreSubmitValue,
  readIncoInputFeeWei,
} from "@/web3/inco";
import {
  computePerfectRun,
  formatMultiplier,
  survivalMs,
} from "@/game/score";
import { weekIdFromDate, weekIdKey } from "@/web3/p2e/week";
import type { HudSnapshot } from "@/game/types";

export type SubmitPhase =
  | "idle"
  | "encrypting"
  | "submitting"
  | "confirming"
  | "sealed"
  | "submitted"
  | "error";

function submitErrorMessage(e: unknown, chainId: number): string {
  return walletTxError(e, chainId, "score submit");
}

async function retryRpc<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw lastError;
}

async function waitForScoreReceipt(hash: `0x${string}`) {
  let lastError: unknown;
  for (let i = 0; i < 4; i++) {
    try {
      return await waitForTransactionReceipt(wagmiConfig, {
        hash,
        chainId: BASE_CHAIN.id,
        timeout: 60_000,
      });
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastError;
}

export function useSubmitConfidentialScore(hud: HudSnapshot) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [phase, setPhase] = useState<SubmitPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [ciphertexts, setCiphertexts] = useState<{
    encryptedSurvivalMs: Hex;
    encryptedMultiplier: Hex;
  } | null>(null);
  const inflight = useRef(false);
  const { writeContractAsync } = useWriteContract();

  const run = useMemo(() => {
    const perfect = computePerfectRun({
      survivalSeconds: hud.timeSurvived,
      nearMisses: hud.nearMisses,
      hitsTaken: hud.hitsTaken,
    });
    return {
      survivalMs: survivalMs(hud.timeSurvived),
      perfect,
      label: formatMultiplier(perfect.hundredths),
    };
  }, [hud.timeSurvived, hud.nearMisses, hud.hitsTaken]);

  const onBase = chainId === BASE_CHAIN.id;
  const clientWeekId = weekIdFromDate();

  const weekQuery = useReadContract({
    address: LOOPTERNITY_CONTRACT_ADDRESS,
    abi: loopternityVaultAbi,
    functionName: "currentWeekId",
    chainId: BASE_CHAIN.id,
    query: { enabled: vaultIsDeployed },
  });

  const onchainWeekId =
    typeof weekQuery.data === "string" ? weekQuery.data : null;
  const weekId = onchainWeekId ?? clientWeekId;

  const ticketsQuery = useReadContract({
    address: LOOPTERNITY_CONTRACT_ADDRESS,
    abi: loopternityVaultAbi,
    functionName: "unusedEntries",
    args: address ? [weekIdKey(weekId), address] : undefined,
    chainId: BASE_CHAIN.id,
    query: {
      enabled: vaultIsDeployed && Boolean(address) && Boolean(onchainWeekId),
    },
  });

  const unusedTickets =
    typeof ticketsQuery.data === "bigint" ? ticketsQuery.data : null;
  const hasTicket =
    !vaultIsDeployed || (unusedTickets !== null && unusedTickets > BigInt(0));
  const ticketsLoading =
    vaultIsDeployed && (weekQuery.isLoading || ticketsQuery.isLoading);

  const busy =
    phase === "encrypting" ||
    phase === "submitting" ||
    phase === "confirming";

  const submit = useCallback(async () => {
    if (inflight.current) return;
    if (phase === "submitted" || phase === "sealed") return;
    if (!isConnected || !address) {
      setError(`Connect a wallet on ${CHAIN_LABEL} first`);
      setPhase("error");
      return;
    }
    if (!onBase) {
      setError(chainSwitchHint(chainId));
      setPhase("error");
      return;
    }

    inflight.current = true;
    setError(null);
    setTxHash(null);

    try {
      if (vaultIsDeployed) {
        const weekRes = await retryRpc(() => weekQuery.refetch());
        const freshWeek =
          typeof weekRes.data === "string" ? weekRes.data : null;
        if (!freshWeek || freshWeek !== clientWeekId) {
          throw new Error(
            `Week mismatch (local ${clientWeekId} vs vault ${freshWeek ?? "…"}). Retry in a moment.`,
          );
        }
        const freshTickets = await retryRpc(() =>
          readContract(wagmiConfig, {
            address: LOOPTERNITY_CONTRACT_ADDRESS,
            abi: loopternityVaultAbi,
            functionName: "unusedEntries",
            args: [weekIdKey(freshWeek), address],
            chainId: BASE_CHAIN.id,
          }),
        );
        if (freshTickets === BigInt(0)) {
          throw new Error(
            "Pay the entry fee before submitting.",
          );
        }
      }

      setPhase("encrypting");
      const sealed = await encryptRunScore({
        survivalMs: BigInt(run.survivalMs),
        multiplierHundredths: BigInt(run.perfect.hundredths),
        accountAddress: address,
        dappAddress: LOOPTERNITY_CONTRACT_ADDRESS,
      });
      setCiphertexts(sealed);

      if (!vaultIsDeployed) {
        setPhase("sealed");
        return;
      }

      setPhase("submitting");
      const feePerInput = await retryRpc(() => readIncoInputFeeWei());
      if (feePerInput <= BigInt(0)) {
        throw new Error("Could not read Inco getFee(). Retry.");
      }
      const value = incoScoreSubmitValue(feePerInput);

      const hash = await writeContractAsync({
        address: LOOPTERNITY_CONTRACT_ADDRESS,
        abi: loopternityVaultAbi,
        functionName: "submitConfidentialScore",
        args: [sealed.encryptedSurvivalMs, sealed.encryptedMultiplier],
        value,
        chainId: BASE_CHAIN.id,
      });
      setTxHash(hash);
      setPhase("confirming");
      const receipt = await waitForScoreReceipt(hash);
      if (receipt.status !== "success") {
        throw new Error("Score transaction failed on Base");
      }
      await ticketsQuery.refetch();
      setPhase("submitted");
    } catch (e) {
      setError(submitErrorMessage(e, chainId));
      setPhase("error");
    } finally {
      inflight.current = false;
    }
  }, [
    address,
    chainId,
    clientWeekId,
    isConnected,
    onBase,
    phase,
    run.perfect.hundredths,
    run.survivalMs,
    ticketsQuery,
    weekQuery,
    writeContractAsync,
  ]);

  const statusLabel = (() => {
    if (error && phase === "error") return error;
    switch (phase) {
      case "encrypting":
        return "Posting this run…";
      case "submitting":
        return "Confirm in wallet…";
      case "confirming":
        return "Posting this run…";
      case "sealed":
        return "Saved.";
      case "submitted":
        return "On the board.";
      default:
        if (!isConnected) return "";
        if (!onBase) return chainSwitchHint(chainId);
        if (vaultIsDeployed && !hasTicket && !ticketsLoading) {
          return "This run was not paid. Start a new entry.";
        }
        return "";
    }
  })();

  return {
    address,
    isConnected,
    onBase,
    vaultIsDeployed,
    busy,
    phase,
    error,
    statusLabel,
    txHash,
    ciphertexts,
    run,
    submit,
    hasTicket,
    unusedTickets,
    ticketsLoading,
  };
}
