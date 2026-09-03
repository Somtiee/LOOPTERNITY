import type { CharacterId, DifficultyId } from "@/game/types";

export type AddressKey = `0x${string}`;

export type NormalBests = Record<DifficultyId, number>;

export type PlayerProfile = {
  address: AddressKey;
  registeredAt: number;
  lastSeen: number;
  normalBest: NormalBests;
  /** Last selected runner. Cosmetic only. */
  characterId?: CharacterId;
};

export type PlayerDatabase = {
  players: Record<string, PlayerProfile>;
};
