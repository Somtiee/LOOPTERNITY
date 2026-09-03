import type { LoopiternRarityId } from "@/game/mintTiers";
import { isLoopiternRarityId } from "@/game/mintTiers";

const KEY = "loopternity.loopitern.equip.v1";

export type EquippedLoopitern = {
  tokenId: bigint;
  rarity: LoopiternRarityId;
};

type EquipMap = Record<string, { tokenId: string; rarity: number } | "none">;

function readMap(): EquipMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as EquipMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: EquipMap) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(map));
}

/** Last equipped LOOPITERN for this wallet. Guests cannot equip. */
export function getEquippedLoopitern(
  address: string | undefined,
): EquippedLoopitern | null {
  if (!address) return null;
  const entry = readMap()[address.toLowerCase()];
  if (!entry || entry === "none") return null;
  if (!isLoopiternRarityId(entry.rarity)) return null;
  try {
    return { tokenId: BigInt(entry.tokenId), rarity: entry.rarity };
  } catch {
    return null;
  }
}

export function setEquippedLoopitern(
  address: string,
  token: EquippedLoopitern | null,
) {
  if (typeof window === "undefined") return;
  const map = readMap();
  map[address.toLowerCase()] = token
    ? { tokenId: token.tokenId.toString(), rarity: token.rarity }
    : "none";
  writeMap(map);
}
