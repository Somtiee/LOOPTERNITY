import { keccak256, stringToHex } from "viem";
import type { ThemeId } from "@/game/types";

/**
 * Week id = Sunday 00:00 UTC as `YYYY-MM-DD`.
 *
 * Must match Solidity `LoopternityVault.weekIdAt` / `_weekStart`:
 * Unix day-of-week uses Thursday epoch, so `(daysSinceEpoch + 4) % 7 == 0` is Sunday.
 * JS `Date#getUTCDay()` is 0 on Sunday — subtracting that many days lands on the same Sunday.
 *
 * Example (from vault tests): warp `1786276800` (Sun 9 Aug 2026 12:00 UTC) → `"2026-08-09"`.
 */
export function weekIdFromDate(date = new Date()): string {
  const day = date.getUTCDay();
  const startMs = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - day,
  );
  return new Date(startMs).toISOString().slice(0, 10);
}

/** Solidity `keccak256(bytes(weekId))` — key for `unusedEntries` / week mappings. */
export function weekIdKey(weekId: string): `0x${string}` {
  return keccak256(stringToHex(weekId));
}

/** Order sealed onchain as euint256 index 0, 1, 2. Do not reorder. */
export const P2E_THEME_ORDER: readonly ThemeId[] = [
  "volcanic",
  "planetary",
  "antarctica",
];

export function weekEndsAt(weekId: string): Date {
  const start = new Date(`${weekId}T00:00:00.000Z`);
  return new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
}

export function msUntilWeekEnd(weekId: string, now = Date.now()): number {
  return Math.max(0, weekEndsAt(weekId).getTime() - now);
}

/** Previous Sunday UTC week id (the week that just ended if `weekId` is current). */
export function previousWeekId(weekId: string): string {
  const start = new Date(`${weekId}T00:00:00.000Z`);
  return weekIdFromDate(new Date(start.getTime() - 1));
}

/** Sunday UTC week ids before `fromWeekId`, newest first (previous week is `[0]`). */
export function pastWeekIds(fromWeekId: string, count = 4): string[] {
  const ids: string[] = [];
  let id = fromWeekId;
  for (let i = 0; i < count; i++) {
    id = previousWeekId(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Canonical P2E world for a week id. Same index the keeper encrypts in
 * `sealWeeklyTheme`. The week rolls at Sunday 00:00 UTC (`weekIdFromDate` /
 * vault `currentWeekId`); the world follows the week automatically.
 */
export function sealedThemeForWeek(weekId: string): ThemeId {
  let h = 2166136261;
  for (let i = 0; i < weekId.length; i++) {
    h ^= weekId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return P2E_THEME_ORDER[Math.abs(h) % P2E_THEME_ORDER.length]!;
}

export function themeIndex(id: ThemeId): number {
  return P2E_THEME_ORDER.indexOf(id);
}

export function themeFromIndex(index: number): ThemeId | null {
  return P2E_THEME_ORDER[index] ?? null;
}
