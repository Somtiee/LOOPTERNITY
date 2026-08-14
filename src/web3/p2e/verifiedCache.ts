import type { Address } from "viem";

const KEY = "loopternity.p2e.verified.v1";

export type VerifiedSubmitter = {
  address: Address;
  runCount: number;
};

export type VerifiedBoardCache = {
  weekId: string;
  fetchedAt: number;
  poolWei: string;
  settled: boolean;
  attested: boolean;
  top10: Address[];
  submitters: VerifiedSubmitter[];
};

export function readVerifiedCache(): VerifiedBoardCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as VerifiedBoardCache;
  } catch {
    return null;
  }
}

export function writeVerifiedCache(cache: VerifiedBoardCache): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* quota / private mode */
  }
}
