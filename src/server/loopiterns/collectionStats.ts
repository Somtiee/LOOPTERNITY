/**
 * Live LOOPITERNS collection numbers for the public mint page (/LOOPITERNS).
 *
 * Server-only: this module talks to the Robinhood RPC directly rather than
 * through wagmi, so the marketing page renders real figures for a visitor
 * with no wallet connected — and so its first paint (and its link preview)
 * carries numbers instead of placeholders.
 *
 * Honesty rules, the same ones the client hook keeps:
 *  - Every figure is either a real chain read or null. Nothing is defaulted
 *    to a plausible-looking constant, and a failed read never reports
 *    "sold out".
 *  - The block number the read landed on is returned alongside the figures,
 *    so the page can say when they were true rather than implying "now".
 *
 * Load: a short module-level TTL cache plus in-flight coalescing means a
 * traffic spike costs at most one round of RPC reads per TTL per instance.
 * On a failed refresh the last good read is served (flagged `stale`) rather
 * than blanking figures that were true fifteen seconds ago.
 */

import { createPublicClient } from "viem";
import { RARITIES } from "@/game/mintTiers";
import { loopiternsAbi } from "@/web3/loopiterns/abi";
import { getLoopiternsAddress } from "@/web3/loopiterns/address";
import { ACTIVE_CHAIN, transports } from "@/web3/config";

/** Sum of the contract's per-rarity caps — the enforced 10,000 collection cap. */
export const COLLECTION_MAX_SUPPLY = RARITIES.reduce(
  (sum, rarity) => sum + rarity.supply,
  0,
);

export type CollectionStats = {
  /** Every figure below is a real chain read (possibly the last good one). */
  ok: boolean;
  /** The contract address is configured at all. */
  configured: boolean;
  /** The refresh that produced these figures failed — they are the prior read. */
  stale: boolean;
  totalSupply: number | null;
  maxSupply: number;
  /** remainingAll summed, or null when the read failed. */
  remaining: number | null;
  /** [common..legendary] remaining, or null when the read failed. */
  remainingByRarity: number[] | null;
  /** Live mintPrice in wei as a decimal string (bigint is not JSON-safe). */
  mintPriceWei: string | null;
  paused: boolean | null;
  /** True only on a read that actually says the collection is exhausted. */
  soldOut: boolean | null;
  /** Block the figures were read at, null when nothing was ever read. */
  blockNumber: number | null;
  /** ISO timestamp of the read that produced these figures. */
  readAt: string | null;
};

const TTL_MS = 15_000;

const client = createPublicClient({
  chain: ACTIVE_CHAIN,
  transport: transports[ACTIVE_CHAIN.id],
});

type ReadResult = { stats: CollectionStats; readOk: boolean };

function emptyStats(configured: boolean): CollectionStats {
  return {
    ok: false,
    configured,
    stale: false,
    totalSupply: null,
    maxSupply: COLLECTION_MAX_SUPPLY,
    remaining: null,
    remainingByRarity: null,
    mintPriceWei: null,
    paused: null,
    soldOut: null,
    blockNumber: null,
    readAt: null,
  };
}

/** A bigint read that may have failed. `undefined` = failed, never zero. */
function count(value: bigint | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.trunc(n));
}

async function readStats(): Promise<ReadResult> {
  const address = getLoopiternsAddress();
  if (!address) {
    return { stats: emptyStats(false), readOk: false };
  }

  // Independent reads, so one failing selector does not blank the rest.
  const [supplyR, remainingR, pausedR, priceR, blockR] = await Promise.allSettled([
    client.readContract({
      address,
      abi: loopiternsAbi,
      functionName: "totalSupply",
    }),
    client.readContract({
      address,
      abi: loopiternsAbi,
      functionName: "remainingAll",
    }),
    client.readContract({
      address,
      abi: loopiternsAbi,
      functionName: "paused",
    }),
    client.readContract({
      address,
      abi: loopiternsAbi,
      functionName: "mintPrice",
    }),
    client.getBlockNumber(),
  ]);

  const totalSupply =
    supplyR.status === "fulfilled" ? count(supplyR.value) : null;

  let remainingByRarity: number[] | null = null;
  if (remainingR.status === "fulfilled") {
    const list = [...remainingR.value];
    if (list.length === RARITIES.length) {
      remainingByRarity = list.map((n) => count(n) ?? 0);
    }
  }

  const remaining =
    remainingByRarity === null
      ? null
      : remainingByRarity.reduce((sum, n) => sum + n, 0);

  const paused = pausedR.status === "fulfilled" ? pausedR.value : null;
  const mintPriceWei =
    priceR.status === "fulfilled" ? priceR.value.toString() : null;
  const blockNumber =
    blockR.status === "fulfilled" ? Number(blockR.value) : null;

  // Only a read that came back can declare sellout.
  const soldOut =
    (totalSupply !== null && totalSupply >= COLLECTION_MAX_SUPPLY) ||
    remaining === 0;

  const readOk =
    totalSupply !== null ||
    remainingByRarity !== null ||
    paused !== null ||
    mintPriceWei !== null;

  return {
    stats: {
      ok: readOk,
      configured: true,
      stale: false,
      totalSupply,
      maxSupply: COLLECTION_MAX_SUPPLY,
      remaining,
      remainingByRarity,
      mintPriceWei,
      paused,
      soldOut,
      blockNumber: Number.isFinite(blockNumber) ? blockNumber : null,
      readAt: new Date().toISOString(),
    },
    readOk,
  };
}

let cached: CollectionStats | null = null;
let cachedAt = 0;
let inFlight: Promise<CollectionStats> | null = null;

/** Latest collection figures, fresh within TTL_MS. Never throws. */
export async function getCollectionStats(): Promise<CollectionStats> {
  const now = Date.now();
  if (cached && now - cachedAt < TTL_MS) return cached;
  if (inFlight) return inFlight;

  inFlight = readStats()
    .then(({ stats, readOk }) => {
      if (readOk) {
        cached = stats;
        cachedAt = Date.now();
        return stats;
      }
      // Nothing readable (RPC down, or address unset). Reuse the last real
      // read rather than inventing or blanking figures — but mark it stale
      // so the UI can say the numbers stopped refreshing.
      if (cached) return { ...cached, stale: true };
      return stats;
    })
    .catch(() => (cached ? { ...cached, stale: true } : emptyStats(false)))
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
