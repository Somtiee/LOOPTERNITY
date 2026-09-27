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
  highestRarityForScore,
  isLoopiternRarityId,
  resolveMintRarity,
  type LoopiternRarity,
} from "@/game/mintTiers";
import { stillApiPath } from "@/game/loopiternStills";
import type { RunInputLog } from "@/game/sim/inputLog";
import type { RunRecord } from "@/game/engine/Game";
import { ACTIVE_CHAIN_ID, EXPLORER_ORIGIN } from "@/web3/config";
import { useWalletSession } from "@/web3/hooks/useWalletSession";
import { isReachabilityError, walletTxError } from "@/web3/walletErrors";
import { loopiternsAbi } from "./abi";
import { getLoopiternsAddress, getMintPriceFallbackWei } from "./address";

export type MintTxStatus =
  | "idle"
  | "confirm"
  | "pending"
  | "success"
  | "error";

/** On-chain per-wallet mint cap — the chain rejects mint #11. */
export const MAX_LOOPITERNS_PER_WALLET = 10;
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

/** Robinhood Chain's native gas token is ETH, 18 decimals — the mint price's unit. */
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
  score: number,
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
      score,
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

/** Give the public RPC this long to validate the mint, then move on. */
const RPC_DEADLINE_MS = 8_000;

/** Reject with a reachability-shaped error after `ms` — bounds RPC hangs. */
function withRpcDeadline<T>(p: Promise<T>, ms = RPC_DEADLINE_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timed out")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * P2M mint (v2, voucher-gated + replay-attested). The client asks this
 * server for a signed voucher; the server re-runs the recorded input log
 * through the identical deterministic sim and only signs if the replayed
 * run genuinely reached the rarity's SCORE gate; the chain checks the
 * signature, price, max 10, 10k cap, and per-rarity remaining. No
 * "verified" badge — the voucher only proves the server watched a real run
 * reach the gate.
 */
export function useMintLoopitern(
  score: number,
  timeSurvived: number,
  sessionId: string | null,
  runRecord: RunRecord | null,
) {
  const { address: wallet, onRobinhood, hasWallet, chainId } =
    useWalletSession();
  const publicClient = usePublicClient({ chainId: ACTIVE_CHAIN_ID });
  const contract = getLoopiternsAddress();
  const [localError, setLocalError] = useState<string | null>(null);
  const [tokenId, setTokenId] = useState<bigint | null>(null);

  const enabled = Boolean(contract);
  const balanceEnabled = Boolean(contract && wallet);

  const mintPriceQuery = useReadContract({
    address: contract,
    abi: loopiternsAbi,
    functionName: "mintPrice",
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled },
  });

  const remainingQuery = useReadContract({
    address: contract,
    abi: loopiternsAbi,
    functionName: "remainingAll",
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled },
  });

  const totalSupplyQuery = useReadContract({
    address: contract,
    abi: loopiternsAbi,
    functionName: "totalSupply",
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled },
  });

  const balanceQuery = useReadContract({
    address: contract,
    abi: loopiternsAbi,
    functionName: "balanceOf",
    args: wallet ? [wallet] : undefined,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: balanceEnabled },
  });

  const pausedQuery = useReadContract({
    address: contract,
    abi: loopiternsAbi,
    functionName: "paused",
    chainId: ACTIVE_CHAIN_ID,
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

  const requested = highestRarityForScore(score);
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
    chainId: ACTIVE_CHAIN_ID,
    // Receipt polling rides the public Robinhood RPC; a transient 429/timeout
    // there must not surface as a failed mint while the tx is really just
    // waiting for a block — retry quietly before giving up.
    query: {
      enabled: Boolean(hash),
      retry: 5,
      retryDelay: (n) => Math.min(1500 * 2 ** n, 15_000),
    },
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
        chainId ?? ACTIVE_CHAIN_ID,
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
      // 1) Server voucher — score gate + session clock + full run replay
      //    live there. The replayed score is authoritative.
      //
      //    Kept in its own try: everything this can throw is already human
      //    copy (the server's reason, or fetchVoucher's own fallback), so it
      //    must not be run through the wallet-error mapper below.
      let voucher: Voucher;
      try {
        voucher = await fetchVoucher(
          wallet,
          resolved.id,
          score,
          timeSurvived,
          sessionId,
          runRecord.inputLog,
        );
      } catch (e) {
        setLocalError(
          e instanceof Error && e.message
            ? e.message
            : "Could not get a mint voucher. Retry.",
        );
        return;
      }
      const args = [
        resolved.id,
        BigInt(voucher.deadline),
        BigInt(voucher.nonce),
        voucher.signature,
      ] as const;
      // 2) Pre-flight the mint as an eth_call from the player's address:
      //    catches an already-minted run (UsedNonce), an expired voucher, a
      //    price change, the wallet cap, or a sellout BEFORE gas is spent.
      //    A transient public-RPC failure falls through to the send — the
      //    wallet talks to Robinhood through its own RPC, which may be fine.
      if (publicClient) {
        try {
          await withRpcDeadline(
            publicClient.simulateContract({
              address: contract,
              abi: loopiternsAbi,
              functionName: "mintWithVoucher",
              args: [...args],
              value: mintPrice,
              account: wallet,
            }),
          );
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          if (!isReachabilityError(message)) throw e;
        }
      }
      // 3) On-chain mint with the signed voucher. No fee fields are passed, so
      //    the wallet prices the tx itself. That is deliberate: a client-side
      //    fee rule once built a cap below its own tip at low base fees, and
      //    viem asserts that pair locally — before the wallet is opened — so
      //    every mint threw with no popup and no explanation (commit 9dafa2a).
      //    Do not reintroduce maxFeePerGas/maxPriorityFeePerGas here: wallet
      //    pricing is what priced the mints that did land on this chain, and
      //    gas is ~2¢ against a 0.0004 ETH mint.
      await writeContractAsync({
        address: contract,
        abi: loopiternsAbi,
        functionName: "mintWithVoucher",
        args: [...args],
        value: mintPrice,
        chainId: ACTIVE_CHAIN_ID,
      });
    } catch (e) {
      // Everything left is a wallet / chain / viem error. Map it centrally so
      // the player gets one sentence of retryable copy — a raw viem dump
      // (Request Arguments, Contract Call, calldata, Docs: viem.sh) used to be
      // shown here verbatim, because this branch read `e.message` directly
      // instead of asking walletErrors.ts. The already-minted and
      // expired-voucher cases are mapped there too.
      setLocalError(walletTxError(e, chainId ?? ACTIVE_CHAIN_ID, "mint"));
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
    score,
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
