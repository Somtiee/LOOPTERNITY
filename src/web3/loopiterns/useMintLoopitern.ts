"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatEther, parseEventLogs, type Address } from "viem";
import {
  usePublicClient,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import {
  highestRarityForSurvival,
  isLoopiternRarityId,
  resolveMintRarity,
  type LoopiternRarity,
} from "@/game/mintTiers";
import { stillApiPath } from "@/game/loopiternStills";
import type { RunInputLog } from "@/game/sim/inputLog";
import type { RunRecord } from "@/game/engine/Game";
import { EXPLORER_ORIGIN, ROBINHOOD_CHAIN_ID } from "@/web3/config";
import { useWalletSession } from "@/web3/hooks/useWalletSession";
import { walletTxError } from "@/web3/walletErrors";
import { loopiternsAbi } from "./abi";
import { getLoopiternsAddress, getMintPriceFallbackWei } from "./address";

export type MintTxStatus =
  | "idle"
  | "confirm"
  | "pending"
  | "success"
  | "error";

/** On-chain per-wallet mint cap — the chain rejects mint #6. */
export const MAX_LOOPITERNS_PER_WALLET = 5;
const MAX_PER_WALLET = MAX_LOOPITERNS_PER_WALLET;

/** Voucher response from POST /api/loopitern/voucher. */
type Voucher = {
  deadline: string;
  nonce: string;
  signature: `0x${string}`;
};

function remainingToNumbers(
  data: readonly bigint[] | undefined,
): number[] | undefined {
  if (!data || data.length !== 5) return undefined;
  return data.map((n) => {
    const v = Number(n);
    return Number.isFinite(v) ? Math.max(0, v) : 0;
  });
}

export function formatMintPriceEth(wei: bigint): string {
  const eth = formatEther(wei);
  const n = Number(eth);
  if (!Number.isFinite(n) || n === 0) return `${eth} ETH`;
  if (n >= 0.0001) {
    return `${n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")} ETH`;
  }
  return `${eth} ETH`;
}

async function fetchVoucher(
  address: Address,
  rarity: number,
  timeSurvived: number,
  sessionId: string,
  inputLog: RunInputLog,
): Promise<Voucher> {
  const res = await fetch("/api/loopitern/voucher", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address,
      rarity,
      timeSurvived,
      sessionId,
      inputLog,
    }),
  });
  const data = (await res.json().catch(() => null)) as
    | (Voucher & { error?: string })
    | { error: string }
    | null;
  if (!res.ok || !data || !("signature" in data) || !data.signature) {
    const reason =
      data && "error" in data && typeof data.error === "string"
        ? data.error
        : "Could not get a mint voucher. Retry.";
    throw new Error(reason);
  }
  return {
    deadline: data.deadline,
    nonce: data.nonce,
    signature: data.signature,
  };
}

/**
 * P2M mint (v2, voucher-gated + replay-attested). The client asks this
 * server for a signed voucher; the server re-runs the recorded input log
 * through the identical deterministic sim and only signs if the replayed
 * run genuinely survived the rarity gate; the chain checks the signature,
 * price, max 5, 10k cap, and per-rarity remaining. No "verified" badge —
 * the voucher only proves the server watched a real run reach the gate.
 */
export function useMintLoopitern(
  timeSurvived: number,
  sessionId: string | null,
  runRecord: RunRecord | null,
) {
  const { address: wallet, onRobinhood, hasWallet, chainId } =
    useWalletSession();
  const publicClient = usePublicClient({ chainId: ROBINHOOD_CHAIN_ID });
  const contract = getLoopiternsAddress();
  const [localError, setLocalError] = useState<string | null>(null);
  const [tokenId, setTokenId] = useState<bigint | null>(null);

  const enabled = Boolean(contract);
  const balanceEnabled = Boolean(contract && wallet);

  const mintPriceQuery = useReadContract({
    address: contract,
    abi: loopiternsAbi,
    functionName: "mintPrice",
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

  const totalSupplyQuery = useReadContract({
    address: contract,
    abi: loopiternsAbi,
    functionName: "totalSupply",
    chainId: ROBINHOOD_CHAIN_ID,
    query: { enabled },
  });

  const balanceQuery = useReadContract({
    address: contract,
    abi: loopiternsAbi,
    functionName: "balanceOf",
    args: wallet ? [wallet] : undefined,
    chainId: ROBINHOOD_CHAIN_ID,
    query: { enabled: balanceEnabled },
  });

  const pausedQuery = useReadContract({
    address: contract,
    abi: loopiternsAbi,
    functionName: "paused",
    chainId: ROBINHOOD_CHAIN_ID,
    query: { enabled },
  });

  const mintPrice =
    mintPriceQuery.data !== undefined
      ? mintPriceQuery.data
      : getMintPriceFallbackWei();

  const remainingByRarity = remainingToNumbers(remainingQuery.data);
  const ownedCount = Number(balanceQuery.data ?? 0n);
  const paused = Boolean(pausedQuery.data);
  const loading = Boolean(
    contract &&
      (mintPriceQuery.isPending ||
        remainingQuery.isPending ||
        (balanceEnabled && balanceQuery.isPending)),
  );

  const refetchPrice = mintPriceQuery.refetch;
  const refetchRemaining = remainingQuery.refetch;
  const refetchSupply = totalSupplyQuery.refetch;
  const refetchBalance = balanceQuery.refetch;
  const refetchPaused = pausedQuery.refetch;

  const requested = highestRarityForSurvival(timeSurvived);
  const resolved: LoopiternRarity | null = resolveMintRarity(
    requested,
    remainingByRarity,
  );

  const {
    writeContractAsync,
    data: hash,
    isPending: isConfirmingWallet,
    error: writeError,
    reset,
  } = useWriteContract();

  const {
    data: receipt,
    isPending: isMining,
    isSuccess: isMined,
    error: waitError,
  } = useWaitForTransactionReceipt({
    hash,
    chainId: ROBINHOOD_CHAIN_ID,
    query: { enabled: Boolean(hash) },
  });

  const refetchInventory = useCallback(() => {
    void refetchRemaining();
    void refetchSupply();
    void refetchBalance();
    void refetchPrice();
    void refetchPaused();
  }, [
    refetchRemaining,
    refetchSupply,
    refetchBalance,
    refetchPrice,
    refetchPaused,
  ]);

  useEffect(() => {
    if (!receipt || receipt.status !== "success") return;
    const minted = parseEventLogs({
      abi: loopiternsAbi,
      eventName: "Minted",
      logs: receipt.logs,
    });
    const id = minted[0]?.args.id;
    if (id !== undefined) setTokenId(id);
    // Warm the composed still (and its static public/ cache) so the equip
    // rows show the real recolored token immediately. Fire-and-forget —
    // the portrait falls back to the rarity base if this loses the race.
    const rarity = minted[0]?.args.rarity;
    if (id !== undefined && rarity !== undefined && isLoopiternRarityId(rarity)) {
      void fetch(stillApiPath(Number(id), rarity)).catch(() => {});
    }
    refetchInventory();
  }, [receipt, refetchInventory]);

  const status: MintTxStatus = useMemo(() => {
    if (isMined && receipt?.status === "success") return "success";
    if (localError || writeError || waitError) return "error";
    if (isConfirmingWallet) return "confirm";
    if (hash && isMining) return "pending";
    if (hash && !isMined) return "pending";
    return "idle";
  }, [
    hash,
    isConfirmingWallet,
    isMined,
    isMining,
    localError,
    receipt?.status,
    waitError,
    writeError,
  ]);

  const errorMessage = useMemo(() => {
    if (status !== "error") return null;
    const err = localError
      ? null
      : (writeError ?? waitError);
    if (localError) return localError;
    if (err) {
      return walletTxError(
        err,
        chainId ?? ROBINHOOD_CHAIN_ID,
        "mint",
      );
    }
    return "The mint failed. Retry.";
  }, [chainId, localError, status, waitError, writeError]);

  const mint = useCallback(async () => {
    if (!contract || !resolved || mintPrice === undefined) return;
    if (!hasWallet || !onRobinhood) return;
    if (!wallet) return;
    if (ownedCount >= MAX_PER_WALLET || paused) return;
    if (!sessionId || !runRecord) {
      setLocalError("No verified run — hit NEW GAME, play, then mint.");
      return;
    }
    setLocalError(null);
    setTokenId(null);
    reset();
    try {
      // 1) Server voucher — rarity gate + session clock + full run replay
      //    live there. The replay is authoritative.
      const voucher = await fetchVoucher(
        wallet,
        resolved.id,
        timeSurvived,
        sessionId,
        runRecord.inputLog,
      );
      const args = [
        resolved.id,
        BigInt(voucher.deadline),
        BigInt(voucher.nonce),
        voucher.signature,
      ] as const;
      // 2) Pre-flight the mint as an eth_call from the player's address:
      //    catches an already-minted run (UsedNonce), an expired voucher, a
      //    price change, the wallet cap, or a sellout BEFORE gas is spent.
      //    Falls back to a direct send if the RPC can't simulate.
      if (publicClient) {
        const { request } = await publicClient.simulateContract({
          address: contract,
          abi: loopiternsAbi,
          functionName: "mintWithVoucher",
          args: [...args],
          value: mintPrice,
          account: wallet,
        });
        await writeContractAsync(request);
      } else {
        // 3) On-chain mint with the signed voucher.
        await writeContractAsync({
          address: contract,
          abi: loopiternsAbi,
          functionName: "mintWithVoucher",
          args: [...args],
          value: mintPrice,
          chainId: ROBINHOOD_CHAIN_ID,
        });
      }
    } catch (e) {
      const message =
        e instanceof Error && e.message
          ? e.message
          : walletTxError(e, chainId ?? ROBINHOOD_CHAIN_ID, "mint");
      // The run already minted (stuck-tx retry, second tab, …) — the chain
      // would reject a second mint; say so plainly instead of a raw revert.
      if (/UsedNonce/i.test(message)) {
        setLocalError(
          "This run was already minted — start a new run to mint again.",
        );
        return;
      }
      if (/ExpiredVoucher/i.test(message)) {
        setLocalError("The mint window expired — retry the mint.");
        return;
      }
      setLocalError(message);
    }
  }, [
    chainId,
    contract,
    hasWallet,
    mintPrice,
    onRobinhood,
    ownedCount,
    paused,
    publicClient,
    reset,
    resolved,
    runRecord,
    sessionId,
    timeSurvived,
    wallet,
    writeContractAsync,
  ]);

  const explorerTxUrl = hash ? `${EXPLORER_ORIGIN}/tx/${hash}` : null;

  return {
    configured: Boolean(contract),
    contractAddress: contract as Address | undefined,
    loading,
    mintPrice,
    remainingByRarity,
    ownedCount,
    paused,
    requested,
    resolved,
    status,
    errorMessage,
    txHash: hash,
    tokenId,
    explorerTxUrl,
    mint,
    refetchInventory,
  };
}
