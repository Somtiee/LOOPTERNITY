import type { DifficultyId } from "@/game/types";
import type { AddressKey, NormalBests } from "./types";

export function emptyBests(): NormalBests {
  return { easy: 0, medium: 0, hard: 0 };
}

export function coerceBests(value: unknown): NormalBests {
  const raw = value && typeof value === "object" ? (value as Partial<NormalBests>) : {};
  return {
    easy: Number(raw.easy) || 0,
    medium: Number(raw.medium) || 0,
    hard: Number(raw.hard) || 0,
  };
}

export function mergeNormalBests(a: NormalBests, b: NormalBests): NormalBests {
  return {
    easy: Math.max(a.easy || 0, b.easy || 0),
    medium: Math.max(a.medium || 0, b.medium || 0),
    hard: Math.max(a.hard || 0, b.hard || 0),
  };
}

export function isAddressKey(value: string): value is AddressKey {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export const DIFF_KEYS: DifficultyId[] = ["easy", "medium", "hard"];
