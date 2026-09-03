/**
 * LOOPITERNS rarity gates for P2M UX / eligibility preview.
 *
 * Client `timeSurvived` is spoofable on its own, so the voucher route
 * now requires a server-issued run seed: a seed is created when the run
 * starts, and a voucher is only signed if real wall-clock time passed
 * between seed issue and the claim (see /api/loopitern/run-seed).
 * On-chain mint still only enforces price, max 5 per wallet, 10k cap,
 * and remaining supply per rarity.
 */

export type LoopiternRarityId = 0 | 1 | 2 | 3 | 4;

export type LoopiternRarity = {
  id: LoopiternRarityId;
  name: "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary";
  minSeconds: number;
  supply: number;
  /** Robinhood-green family; brighter as rarity climbs. */
  accent: string;
};

export const RARITIES: readonly LoopiternRarity[] = [
  {
    id: 0,
    name: "Common",
    minSeconds: 30,
    supply: 5_000,
    accent: "#3D9A4A",
  },
  {
    id: 1,
    name: "Uncommon",
    minSeconds: 60,
    supply: 2_500,
    accent: "#00C805",
  },
  {
    id: 2,
    name: "Rare",
    minSeconds: 90,
    supply: 1_500,
    accent: "#5CFF61",
  },
  {
    id: 3,
    name: "Epic",
    minSeconds: 120,
    supply: 800,
    accent: "#9AFF7A",
  },
  {
    id: 4,
    name: "Legendary",
    minSeconds: 150,
    supply: 200,
    accent: "#C8FF9A",
  },
] as const;

const FULL_REMAINING: number[] = RARITIES.map((r) => r.supply);

function survivalSeconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return seconds;
}

export function rarityById(id: number): LoopiternRarity | undefined {
  return RARITIES.find((r) => r.id === id);
}

export function isLoopiternRarityId(id: number): id is LoopiternRarityId {
  return id === 0 || id === 1 || id === 2 || id === 3 || id === 4;
}

export function highestRarityForSurvival(
  seconds: number,
): LoopiternRarity | null {
  const t = survivalSeconds(seconds);
  let reached: LoopiternRarity | null = null;
  for (const rarity of RARITIES) {
    if (t >= rarity.minSeconds) reached = rarity;
  }
  return reached;
}

export function unlockedRarities(seconds: number): LoopiternRarity[] {
  const t = survivalSeconds(seconds);
  return RARITIES.filter((rarity) => t >= rarity.minSeconds);
}

export function nextRarityGate(seconds: number): LoopiternRarity | null {
  const t = survivalSeconds(seconds);
  return RARITIES.find((rarity) => t < rarity.minSeconds) ?? null;
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

export function formatRarityGate(minSeconds: number): string {
  const m = Math.floor(minSeconds / 60);
  const s = minSeconds % 60;
  if (m <= 0) return `${s}s`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
