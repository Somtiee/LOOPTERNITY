/**
 * P2M run score — the single source of truth for the formula, the weights,
 * and the formatting. The rarity gates (mintTiers.ts) are SCORE thresholds,
 * not survival-time thresholds.
 *
 *   score = climbPx·A + steerPx·B + nearMisses·C + boostSeconds·D
 *
 * The client HUD computes it live from the same sim stats the voucher
 * server replays, so both sides derive the identical number from the input
 * log — a client-sent score is never the rarity authority.
 *
 * Weight notes (climb is deliberately the main term):
 *   - A = 1 per vertical px climbed. The danger's catch-up mechanic pins
 *     every runner to roughly the same height at a given time, so climbPx
 *     alone behaves like the old survival clock.
 *   - B = 1 per horizontal px steered (measured AFTER the wall clamp, so
 *     hugging a wall earns nothing).
 *   - C = 50 per close pass (near miss).
 *   - D = 100 per second of boost.
 * Bonuses only ever ADD — the rarity thresholds in mintTiers.ts sit at the
 * zero-bonus climb floor, so any run that survives to a gate time clears
 * that gate's score, and aggressive play pulls it slightly earlier.
 */

export type RunScoreStats = {
  /** Peak height climbed above the start, in world px. */
  climbPx: number;
  /** Cumulative horizontal travel (post wall-clamp), in px. */
  steerPx: number;
  /** Close passes registered by the sim. */
  nearMisses: number;
  /** Seconds spent boosting. */
  boostSeconds: number;
};

/** Small integer weights — keep these stable; thresholds are tuned to them. */
export const SCORE_WEIGHTS = {
  /** A — vertical px climbed (the main term). */
  climbPx: 1,
  /** B — horizontal px steered. */
  steerPx: 1,
  /** C — per near miss. */
  nearMisses: 50,
  /** D — per second of boost. */
  boostSeconds: 100,
} as const;

export function climbScore(stats: RunScoreStats): number {
  const climb = Math.max(0, stats.climbPx);
  const steer = Math.max(0, stats.steerPx);
  const near = Math.max(0, stats.nearMisses);
  const boost = Math.max(0, stats.boostSeconds);
  return Math.floor(
    climb * SCORE_WEIGHTS.climbPx +
      steer * SCORE_WEIGHTS.steerPx +
      near * SCORE_WEIGHTS.nearMisses +
      boost * SCORE_WEIGHTS.boostSeconds,
  );
}

/**
 * Comma-grouped score, e.g. 12450 → "12,450" — the format the rarity
 * cards and HUD use ("SCORE 12,000").
 */
export function formatScore(score: number): string {
  return Math.max(0, Math.floor(score)).toLocaleString("en-US");
}

/** mm:ss.s survival time — HUD flavor and replay sanity only, never a gate. */
export function formatSurvivalTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m <= 0) return `${s.toFixed(1)}s`;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}
