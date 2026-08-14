import type { CharacterId, DifficultyId } from "@/game/types";
import { DEFAULT_CHARACTER, isCharacterId } from "@/game/characters";
import { sealedThemeForWeek, weekIdFromDate } from "./week";
import { rankWeek, settlePayouts, skillScore, TREASURY_BPS } from "./ranking";
import type {
  AddressKey,
  NormalBests,
  P2EDatabase,
  P2ERunRecord,
  PlayerProfile,
  WeekState,
} from "./types";

const KEY = "loopternity.p2e.v1";
const GUEST_CHARACTER_KEY = "loopternity.character.v1";
/** Device-only Normal PBs. Never merged into a wallet profile. */
const GUEST_BESTS_KEY = "loopternity.normalBest.guest.v1";

function emptyBests(): NormalBests {
  return { easy: 0, medium: 0, hard: 0 };
}

function coerceBests(value: unknown): NormalBests {
  const raw = value && typeof value === "object" ? (value as Partial<NormalBests>) : {};
  return {
    easy: Number(raw.easy) || 0,
    medium: Number(raw.medium) || 0,
    hard: Number(raw.hard) || 0,
  };
}

function emptyDb(): P2EDatabase {
  return { players: {}, week: null, archive: [] };
}

function readDb(): P2EDatabase {
  if (typeof window === "undefined") return emptyDb();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyDb();
    const parsed = JSON.parse(raw) as P2EDatabase;
    if (!parsed.players) parsed.players = {};
    if (!parsed.archive) parsed.archive = [];
    return parsed;
  } catch {
    return emptyDb();
  }
}

function writeDb(db: P2EDatabase) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(db));
}

function newWeek(weekId: string): WeekState {
  return {
    weekId,
    // Demo / vault-unset only. Live P2E world comes from mainnet `themeSealed`.
    themeId: sealedThemeForWeek(weekId),
    poolWei: "0",
    treasuryAccruedWei: "0",
    settled: false,
    runs: [],
    payouts: [],
  };
}

/** Spreadsheet-only when the vault address is unset. Live weeks settle on 8453. */
function rollWeek(db: P2EDatabase, now = new Date()): WeekState {
  const id = weekIdFromDate(now);
  if (db.week && db.week.weekId !== id && !db.week.settled) {
    const prize = (BigInt(db.week.poolWei || "0") * BigInt(TREASURY_BPS)) / 10000n;
    db.week.payouts = settlePayouts(db.week);
    db.week.treasuryAccruedWei = prize.toString();
    db.week.settled = true;
    db.archive = [db.week, ...db.archive].slice(0, 24);
  }
  if (!db.week || db.week.weekId !== id) {
    db.week = newWeek(id);
  }
  return db.week;
}

export function registerPlayer(address: AddressKey): PlayerProfile {
  const db = readDb();
  const key = address.toLowerCase();
  const now = Date.now();
  const existing = db.players[key];
  const profile: PlayerProfile = existing
    ? {
        ...existing,
        address,
        lastSeen: now,
        // Keep this wallet's PBs. Do not import guest / other-wallet times.
        normalBest: coerceBests(existing.normalBest),
        characterId: existing.characterId ?? getGuestCharacterId(),
      }
    : {
        address,
        registeredAt: now,
        lastSeen: now,
        normalBest: emptyBests(),
        characterId: getGuestCharacterId(),
      };
  db.players[key] = profile;
  writeDb(db);
  return profile;
}

export function getPlayer(address: AddressKey | undefined): PlayerProfile | null {
  if (!address) return null;
  return readDb().players[address.toLowerCase()] ?? null;
}

export function getGuestCharacterId(): CharacterId {
  if (typeof window === "undefined") return DEFAULT_CHARACTER;
  try {
    const raw = localStorage.getItem(GUEST_CHARACTER_KEY);
    if (isCharacterId(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_CHARACTER;
}

export function setGuestCharacterId(characterId: CharacterId) {
  if (typeof window === "undefined") return;
  localStorage.setItem(GUEST_CHARACTER_KEY, characterId);
}

export function getGuestNormalBests(): NormalBests {
  if (typeof window === "undefined") return emptyBests();
  try {
    const raw = localStorage.getItem(GUEST_BESTS_KEY);
    if (!raw) return emptyBests();
    return coerceBests(JSON.parse(raw));
  } catch {
    return emptyBests();
  }
}

function writeGuestNormalBests(bests: NormalBests) {
  if (typeof window === "undefined") return;
  localStorage.setItem(GUEST_BESTS_KEY, JSON.stringify(bests));
}

/**
 * Device-only Normal PBs. Connecting a wallet never copies these onto that
 * address, and this store is never written from `recordNormalBest`.
 */
export function recordGuestNormalBest(
  difficulty: DifficultyId,
  survivalSeconds: number,
): { isNewBest: boolean; previous: number; current: number } {
  const bests = getGuestNormalBests();
  const previous = bests[difficulty] ?? 0;
  const isNewBest = survivalSeconds > previous + 0.05;
  if (isNewBest) bests[difficulty] = survivalSeconds;
  writeGuestNormalBests(bests);
  return { isNewBest, previous, current: bests[difficulty] };
}

export function setPlayerCharacter(
  address: AddressKey,
  characterId: CharacterId,
): PlayerProfile {
  setGuestCharacterId(characterId);
  const db = readDb();
  const key = address.toLowerCase();
  const now = Date.now();
  const existing = db.players[key];
  const profile: PlayerProfile = existing
    ? {
        ...existing,
        address,
        lastSeen: now,
        normalBest: coerceBests(existing.normalBest),
        characterId,
      }
    : {
        address,
        registeredAt: now,
        lastSeen: now,
        normalBest: emptyBests(),
        characterId,
      };
  db.players[key] = profile;
  writeDb(db);
  return profile;
}

export function resolveCharacterId(address?: AddressKey): CharacterId {
  if (address) {
    const saved = getPlayer(address)?.characterId;
    if (isCharacterId(saved)) return saved;
  }
  return getGuestCharacterId();
}

/**
 * Normal-mode personal best for one wallet. Guest times stay on
 * `GUEST_BESTS_KEY` and are never copied here.
 */
export function recordNormalBest(
  address: AddressKey,
  difficulty: DifficultyId,
  survivalSeconds: number,
): { isNewBest: boolean; previous: number; current: number } {
  const db = readDb();
  const key = address.toLowerCase();
  const existing = db.players[key];
  const now = Date.now();
  const profile: PlayerProfile = existing
    ? {
        ...existing,
        address,
        lastSeen: now,
        normalBest: coerceBests(existing.normalBest),
        characterId: existing.characterId ?? getGuestCharacterId(),
      }
    : {
        address,
        registeredAt: now,
        lastSeen: now,
        normalBest: emptyBests(),
        characterId: getGuestCharacterId(),
      };
  const previous = profile.normalBest[difficulty] ?? 0;
  const isNewBest = survivalSeconds > previous + 0.05;
  if (isNewBest) profile.normalBest[difficulty] = survivalSeconds;
  db.players[key] = profile;
  writeDb(db);
  return {
    isNewBest,
    previous,
    current: profile.normalBest[difficulty],
  };
}

export function currentWeek(): WeekState {
  const db = readDb();
  const week = rollWeek(db);
  writeDb(db);
  return week;
}

/** Demo pool only when the vault address is unset. Live prize pool is `weekPoolWei`. */
export function addPoolWei(amountWei: bigint): WeekState {
  const db = readDb();
  const week = rollWeek(db);
  week.poolWei = (BigInt(week.poolWei || "0") + amountWei).toString();
  writeDb(db);
  return week;
}

export function recordP2ERun(
  run: Omit<P2ERunRecord, "weekId" | "skillScore"> & { weekId?: string },
): WeekState {
  const db = readDb();
  const week = rollWeek(db);
  const record: P2ERunRecord = {
    ...run,
    weekId: week.weekId,
    skillScore: skillScore(run.survivalSeconds, run.multiplierHundredths),
  };
  week.runs.push(record);
  writeDb(db);
  return week;
}

export function attachSealedThemeCipher(cipher: `0x${string}`): void {
  const db = readDb();
  const week = rollWeek(db);
  if (!week.sealedThemeCipher) {
    week.sealedThemeCipher = cipher;
    writeDb(db);
  }
}

export function weeklyStandings() {
  const week = currentWeek();
  return {
    week,
    ranked: rankWeek(week.runs),
  };
}

export function listPlayers(): PlayerProfile[] {
  return Object.values(readDb().players);
}
