/**
 * LOOPITERNS rarity gates for P2M UX / eligibility preview.
 *
 * The gates are SCORE thresholds (src/game/score.ts), not survival time.
 * A client-sent score is spoofable on its own, so the voucher route
 * requires a server-issued run seed and re-runs the recorded input log
 * through the same deterministic sim; the REPLAYED score is the rarity
 * authority. The session's wall clock is kept only as a sanity floor
 * (a fraction of minSeconds) so a fabricated log can't be POSTed instantly.
 * On-chain mint still only enforces price, max 10 per wallet, 10k cap,
 * and remaining supply per rarity.
 *
 * Threshold history: originally auto-calibrated (scripts/calibrate-score.ts,
 * run 2026-09) from the height the Medium climb constants produce at the
 * tier's old survival gate (30/60/90/120/150s). Raised by hand on
 * 2026-09-15 (15_000/25_000/35_000/45_000/60_000) after playtest feedback
 * that the game had gotten too easy. A distance-only run now has to
 * outlast the old gate times to clear a gate — bonuses (steer px, near
 * misses, boost seconds) only pull gates earlier for active play. Do not
 * retune the climb to move these numbers.
 */

import { formatScore } from "./score";

export type LoopiternRarityId = 0 | 1 | 2 | 3 | 4;

export type LoopiternRarity = {
  id: LoopiternRarityId;
  name: "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary";
  /** Score gate — replayed score must reach this for the tier. */
  minScore: number;
  /**
   * Old survival gate (seconds). NOT a rarity gate anymore — the voucher
   * route uses it only as the session wall-clock sanity floor (a fraction
   * of this), and it documents each tier's intended pacing.
   */
  minSeconds: number;
  supply: number;
  /** Arc-blue family; brighter as rarity climbs. */
  accent: string;
};

export const RARITIES: readonly LoopiternRarity[] = [
  {
    id: 0,
    name: "Common",
    minScore: 15_000,
    minSeconds: 30,
    supply: 5_000,
    accent: "#2E63D6",
  },
  {
    id: 1,
    name: "Uncommon",
    minScore: 25_000,
    minSeconds: 60,
    supply: 2_500,
    accent: "#3E8BFF",
  },
  {
    id: 2,
    name: "Rare",
    minScore: 35_000,
    minSeconds: 90,
    supply: 1_500,
    accent: "#62A8FF",
  },
  {
    id: 3,
    name: "Epic",
    minScore: 45_000,
    minSeconds: 120,
    supply: 800,
    accent: "#9CC6FF",
  },
  {
    id: 4,
    name: "Legendary",
    minScore: 60_000,
    minSeconds: 150,
    supply: 200,
    accent: "#D6E9FF",
  },
] as const;

const FULL_REMAINING: number[] = RARITIES.map((r) => r.supply);

function cleanScore(score: number): number {
  if (!Number.isFinite(score) || score < 0) return 0;
  return score;
}

export function rarityById(id: number): LoopiternRarity | undefined {
  return RARITIES.find((r) => r.id === id);
}

export function isLoopiternRarityId(id: number): id is LoopiternRarityId {
  return id === 0 || id === 1 || id === 2 || id === 3 || id === 4;
}

export function highestRarityForScore(
  score: number,
): LoopiternRarity | null {
  const s = cleanScore(score);
  let reached: LoopiternRarity | null = null;
  for (const rarity of RARITIES) {
    if (s >= rarity.minScore) reached = rarity;
  }
  return reached;
}

export function unlockedRarities(score: number): LoopiternRarity[] {
  const s = cleanScore(score);
  return RARITIES.filter((rarity) => s >= rarity.minScore);
}

export function nextRarityGate(score: number): LoopiternRarity | null {
  const s = cleanScore(score);
  return RARITIES.find((rarity) => s < rarity.minScore) ?? null;
}

function remainingFor(
  remainingByRarity: number[] | undefined,
): number[] {
  if (!remainingByRarity || remainingByRarity.length !== 5) {
    return [...FULL_REMAINING];
  }
  return remainingByRarity.map((n, i) => {
    if (!Number.isFinite(n)) return FULL_REMAINING[i] ?? 0;
    return Math.max(0, n);
  });
}

/**
 * Highest unlocked rarity that still has remaining supply.
 * If that tier is 0, drop to the next lower unlocked tier.
 * Never upgrades above `unlocked`. Null = sold out for this run.
 */
export function resolveMintRarity(
  unlocked: LoopiternRarity | null,
  remainingByRarity?: number[],
): LoopiternRarity | null {
  if (!unlocked) return null;
  const remaining = remainingFor(remainingByRarity);
  for (let id = unlocked.id; id >= 0; id -= 1) {
    if ((remaining[id] ?? 0) > 0) {
      return rarityById(id) ?? null;
    }
  }
  return null;
}

/** Gate label for cards / HUD, e.g. "SCORE 12,000". */
export function formatRarityGate(minScore: number): string {
  return `SCORE ${formatScore(minScore)}`;
}
