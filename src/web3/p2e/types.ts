import type { CharacterId, DifficultyId, ThemeId } from "@/game/types";
import type { Hex } from "viem";

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

export type P2ERunRecord = {
  address: AddressKey;
  weekId: string;
  at: number;
  survivalSeconds: number;
  multiplierHundredths: number;
  skillScore: number;
  encryptedSurvivalMs?: Hex;
  encryptedMultiplier?: Hex;
};

export type WeekPayout = {
  address: AddressKey;
  rank: number;
  shareBps: number;
  amountWei: string;
};

export type WeekState = {
  weekId: string;
  themeId: ThemeId;
  /** Inco-sealed theme index (0–2), if encryption already ran */
  sealedThemeCipher?: Hex;
  poolWei: string;
  treasuryAccruedWei: string;
  settled: boolean;
  runs: P2ERunRecord[];
  payouts: WeekPayout[];
};

export type P2EDatabase = {
  players: Record<string, PlayerProfile>;
  week: WeekState | null;
  archive: WeekState[];
};
