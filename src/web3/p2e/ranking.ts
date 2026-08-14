import type { Address } from "viem";
import type { P2ERunRecord, WeekPayout, WeekState } from "./types";

const ZERO = "0x0000000000000000000000000000000000000000";

/** 80% of weekly fees → top 10; 20% stays in treasury. */
export const PRIZE_POOL_BPS = 8000;
export const TREASURY_BPS = 2000;

/** Share of the 80% prize pool for ranks 1–10 (sums to 10000 bps). */
export const TOP10_SHARES_BPS = [
  3000, 1800, 1200, 900, 800, 700, 600, 400, 300, 300,
] as const;

export type RankedWallet = {
  address: `0x${string}`;
  bestSkill: number;
  runs: number;
  activityBonus: number;
  weeklyScore: number;
  bestSurvival: number;
  bestMultiplier: number;
};

/** Official board row after `attestTop10`. Payouts match `settleWeek`. */
export type OfficialBoardRow = {
  address: `0x${string}`;
  rank: number;
  runs: number;
  shareBps: number;
  amountWei: string;
};

/**
 * Diminishing activity bonus from completed P2E runs this week.
 * Early runs help; spam of short deaths barely moves the needle.
 */
export function activityBonus(runCount: number): number {
  let bonus = 0;
  for (let i = 1; i <= runCount; i++) {
    if (i === 1) bonus += 8;
    else if (i === 2) bonus += 5;
    else if (i === 3) bonus += 3;
    else if (i <= 6) bonus += 2;
    else bonus += 1;
  }
  return Math.min(bonus, 40);
}

export function skillScore(
  survivalSeconds: number,
  multiplierHundredths: number,
): number {
  return survivalSeconds * (multiplierHundredths / 100);
}

/**
 * Same Hybrid A the vault comments / keeper use:
 * `(survivalMs / 1000) * (hundredths / 100) + activityBonus(runCount)`
 * ≡ `survivalMs * hundredths / 100000 + activityBonus`.
 */
export function hybridAScore(
  survivalMs: bigint,
  multiplierHundredths: bigint,
  runCount: number,
): number {
  const skill =
    (Number(survivalMs) * Number(multiplierHundredths)) / 100000;
  return skill + activityBonus(runCount);
}

export function rankWeek(runs: P2ERunRecord[]): RankedWallet[] {
  const byWallet = new Map<string, P2ERunRecord[]>();
  for (const run of runs) {
    const list = byWallet.get(run.address) ?? [];
    list.push(run);
    byWallet.set(run.address, list);
  }

  const ranked: RankedWallet[] = [];
  for (const [address, list] of byWallet) {
    let best = list[0]!;
    for (const r of list) {
      if (r.skillScore > best.skillScore) best = r;
    }
    const bonus = activityBonus(list.length);
    ranked.push({
      address: address as `0x${string}`,
      bestSkill: best.skillScore,
      runs: list.length,
      activityBonus: bonus,
      weeklyScore: best.skillScore + bonus,
      bestSurvival: best.survivalSeconds,
      bestMultiplier: best.multiplierHundredths / 100,
    });
  }

  ranked.sort((a, b) => {
    if (b.weeklyScore !== a.weeklyScore) return b.weeklyScore - a.weeklyScore;
    return a.address.localeCompare(b.address);
  });
  return ranked;
}

/**
 * Payouts `settleWeek` will credit from an attested `getTop10` + `weekPoolWei`.
 * Empty slots are skipped (their share goes to treasury), matching Solidity.
 */
export function settlementPayoutsFromTop10(
  poolWei: bigint,
  top10: readonly Address[],
): OfficialBoardRow[] {
  const prize = (poolWei * BigInt(PRIZE_POOL_BPS)) / BigInt(10000);
  const rows: OfficialBoardRow[] = [];
  for (let i = 0; i < 10; i++) {
    const address = top10[i];
    if (!address || address.toLowerCase() === ZERO) continue;
    const shareBps = TOP10_SHARES_BPS[i]!;
    const amountWei = (prize * BigInt(shareBps)) / BigInt(10000);
    rows.push({
      address,
      rank: i + 1,
      runs: 0,
      shareBps,
      amountWei: amountWei.toString(),
    });
  }
  return rows;
}

/**
 * Same split as `settleWeek`: 20% of pool + unused Top 10 slots of the 80%
 * + rounding leftover → treasury. Does not change bps.
 */
export function settlementSplit(
  poolWei: bigint,
  top10: readonly Address[],
): {
  prize: bigint;
  allocated: bigint;
  leftoverPrize: bigint;
  treasuryWei: bigint;
} {
  const prize = (poolWei * BigInt(PRIZE_POOL_BPS)) / BigInt(10000);
  const payouts = settlementPayoutsFromTop10(poolWei, top10);
  const allocated = payouts.reduce(
    (sum, row) => sum + BigInt(row.amountWei),
    BigInt(0),
  );
  const leftoverPrize = prize - allocated;
  const treasuryWei = poolWei - allocated;
  return { prize, allocated, leftoverPrize, treasuryWei };
}

/** localStorage demo only (vault unset). Live ETH is `scripts/settle-week.ts`. */
export function settlePayouts(week: WeekState): WeekPayout[] {
  const ranked = rankWeek(week.runs);
  const pool = BigInt(week.poolWei || "0");
  const prize = (pool * BigInt(PRIZE_POOL_BPS)) / BigInt(10000);
  const payouts: WeekPayout[] = [];

  for (let i = 0; i < Math.min(10, ranked.length); i++) {
    const share = BigInt(TOP10_SHARES_BPS[i]!);
    payouts.push({
      address: ranked[i]!.address,
      rank: i + 1,
      shareBps: Number(share),
      amountWei: ((prize * share) / BigInt(10000)).toString(),
    });
  }
  return payouts;
}
