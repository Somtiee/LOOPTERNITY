import { PLAYER } from "./constants";
import type { LoopiternRarityId } from "./mintTiers";
import type { GameMode } from "./types";

/**
 * LOOPITERN gameplay traits. ASH / NOVA / NORD stay looks-only.
 * Unequipped / P2M always use VANILLA_MODIFIERS (current PLAYER feel).
 */
export type RunModifiers = {
  maxShields: number;
  speedMul: number;
  freezeCharges: number;
  freezeDuration: number;
  tsunamiCharges: number;
};

export const VANILLA_MODIFIERS: RunModifiers = {
  maxShields: PLAYER.maxShields,
  speedMul: 1,
  freezeCharges: 0,
  freezeDuration: 0,
  tsunamiCharges: 0,
};

const TRAITS_BY_RARITY: Record<LoopiternRarityId, RunModifiers> = {
  0: {
    maxShields: 3,
    speedMul: 1.04,
    freezeCharges: 0,
    freezeDuration: 0,
    tsunamiCharges: 0,
  },
  1: {
    maxShields: 4,
    speedMul: 1.08,
    freezeCharges: 0,
    freezeDuration: 0,
    tsunamiCharges: 0,
  },
  2: {
    maxShields: 4,
    speedMul: 1.12,
    freezeCharges: 1,
    freezeDuration: 5,
    tsunamiCharges: 0,
  },
  3: {
    maxShields: 5,
    speedMul: 1.16,
    freezeCharges: 1,
    freezeDuration: 8,
    tsunamiCharges: 0,
  },
  4: {
    maxShields: 5,
    speedMul: 1.2,
    freezeCharges: 1,
    freezeDuration: 10,
    tsunamiCharges: 1,
  },
};

export function modifiersForRarity(
  rarity: LoopiternRarityId | null | undefined,
): RunModifiers {
  if (rarity == null) return VANILLA_MODIFIERS;
  return TRAITS_BY_RARITY[rarity] ?? VANILLA_MODIFIERS;
}

/** P2M is always vanilla, even if React state has a token selected. */
export function runModifiersForMode(
  mode: GameMode,
  equippedRarity: LoopiternRarityId | null | undefined,
): RunModifiers {
  if (mode !== "normal") return VANILLA_MODIFIERS;
  return modifiersForRarity(equippedRarity);
}

export function describeTraits(rarity: LoopiternRarityId): string {
  const m = modifiersForRarity(rarity);
  const pct = Math.round((m.speedMul - 1) * 100);
  const parts = [`+${pct}% move`, `${m.maxShields} shields`];
  if (m.freezeCharges > 0) parts.push(`Freeze ${m.freezeDuration}s`);
  if (m.tsunamiCharges > 0) parts.push("Tsunami");
  return parts.join(" · ");
}
