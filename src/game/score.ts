import { clamp } from "./math";

/** Encoded as hundredths so it fits an Inco euint256 (100 = 1.00×, 300 = 3.00×). */
export const MULTIPLIER_MIN = 100;
export const MULTIPLIER_MAX = 300;

export type RunPerformance = {
  survivalSeconds: number;
  nearMisses: number;
  hitsTaken: number;
};

export type PerfectRunResult = {
  /** Integer hundredths, e.g. 145 → 1.45× */
  hundredths: number;
  multiplier: number;
  cleanRun: boolean;
  nearMisses: number;
};

/**
 * Perfect-run multiplier from close dodges, unused-hit cleanliness, and time survived.
 * The killing blow always counts as one hit, so a clean run is `hitsTaken <= 1`.
 */
export function computePerfectRun(stats: RunPerformance): PerfectRunResult {
  const nearMissBonus = Math.min(stats.nearMisses * 8, 80);
  const midHits = Math.max(0, stats.hitsTaken - 1);
  const cleanBonus = midHits === 0 ? 40 : Math.max(0, 24 - midHits * 8);
  const survivalBonus = Math.min(Math.floor(stats.survivalSeconds / 30) * 5, 40);
  const hundredths = clamp(
    100 + nearMissBonus + cleanBonus + survivalBonus,
    MULTIPLIER_MIN,
    MULTIPLIER_MAX,
  );

  return {
    hundredths,
    multiplier: hundredths / 100,
    cleanRun: midHits === 0,
    nearMisses: stats.nearMisses,
  };
}

export function survivalMs(seconds: number) {
  return Math.max(0, Math.floor(seconds * 1000));
}

export function formatMultiplier(hundredths: number) {
  return `${(hundredths / 100).toFixed(2)}×`;
}

export function formatSurvivalTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m <= 0) return `${s.toFixed(1)}s`;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}
