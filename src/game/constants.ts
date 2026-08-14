import type { DifficultyConfig, DifficultyId, ThemeId } from "./types";

export const WORLD = {
  width: 720,
  viewHeight: 720,
  wallPadding: 24,
} as const;

export const PLAYER = {
  width: 28,
  height: 46,
  maxSpeedX: 340,
  accelX: 2600,
  frictionX: 2000,
  climbSpeed: 320,
  hitInvuln: 1.55,
  lavaKnock: 200,
  maxShields: 3,
  boostImpulse: 520,
  boostDuration: 0.4,
  boostCooldown: 0.7,
} as const;

export const DANGER = {
  startOffset: 340,
  waveAmp: 10,
  waveFreq: 2.4,
  maxGap: 560,
  warnGap: 220,
  hitPushback: 480,
  reliefTime: 2.8,
} as const;

/**
 * Timed undertow toward the rise. Strength caps at maxStage;
 * later pulses re-trigger relief without stacking power forever.
 *
 * Schedule: 30s → ×1, 2:00 → ×2, 4:00 → ×3, then every 2 min a pulse.
 */
export const SINK = {
  firstAt: 30,
  secondAt: 120,
  thirdAt: 240,
  /** After ×3, re-pulse at 6:00, 8:00, 10:00… */
  pulseEverySec: 120,
  /** Hard ceiling on pull strength */
  maxStage: 3,
  /** On each pull event, shove the rise away so the bar sits here (safer) */
  stageReliefProximity: 0.5,
  /**
   * Undertow alone can never fill the proximity bar past this.
   * You won't get yanked into the rise while the bar still looks mild.
   */
  maxProximity: 0.25,
  /** Downward pull (px/s) per stage */
  pullPerStage: {
    easy: 55,
    medium: 82,
    hard: 115,
  } as Record<DifficultyId, number>,
  /** Extra danger rise speed per stage */
  dangerBonusPerStage: {
    easy: 20,
    medium: 32,
    hard: 48,
  } as Record<DifficultyId, number>,
  /** Safe gap shrinks each stage so the bar stays hungry */
  gapShrinkPerStage: 50,
  minGap: 250,
} as const;

/** stage = pull strength (0–maxStage); eventId bumps on every pull pulse */
export function sinkProgress(timeSec: number): { stage: number; eventId: number } {
  if (timeSec < SINK.firstAt) return { stage: 0, eventId: 0 };
  if (timeSec < SINK.secondAt) return { stage: 1, eventId: 1 };
  if (timeSec < SINK.thirdAt) return { stage: 2, eventId: 2 };
  const extra = Math.floor((timeSec - SINK.thirdAt) / SINK.pulseEverySec);
  return { stage: SINK.maxStage, eventId: 3 + extra };
}

export const OBSTACLES = {
  minWidth: 58,
  maxWidth: 168,
  height: 22,
  spawnAhead: 1100,
  cullBelow: 560,
} as const;

export const ENEMIES = {
  firstHeight: 420,
  baseInterval: 9,
  cullBelow: 480,
} as const;

export const PICKUPS = {
  firstHeight: 620,
  spacing: 980,
  radius: 14,
} as const;

export const FALLING = {
  firstDelay: 6,
  baseInterval: 5.2,
  speedMin: 240,
  speedMax: 360,
} as const;

export const DIFFICULTIES: Record<DifficultyId, DifficultyConfig> = {
  easy: {
    id: "easy",
    label: "Easy",
    climbSpeed: 300,
    dangerBaseSpeed: 70,
    dangerAccel: 0.9,
    obstacleSpacing: 230,
    obstacleSpeedMul: 0.7,
    enemySpawnMul: 1.25,
  },
  medium: {
    id: "medium",
    label: "Medium",
    climbSpeed: 330,
    dangerBaseSpeed: 88,
    dangerAccel: 1.5,
    obstacleSpacing: 185,
    obstacleSpeedMul: 1,
    enemySpawnMul: 1,
  },
  hard: {
    id: "hard",
    label: "Hard",
    climbSpeed: 360,
    dangerBaseSpeed: 108,
    dangerAccel: 2.2,
    obstacleSpacing: 150,
    obstacleSpeedMul: 1.25,
    enemySpawnMul: 0.75,
  },
};

export const THEME_META: Record<
  ThemeId,
  { blurb: string; dangerLabel: string; enemyLabel: string }
> = {
  volcanic: {
    blurb: "Magma surges. Dragons hunt the updraft.",
    dangerLabel: "Magma",
    enemyLabel: "Dragon",
  },
  planetary: {
    blurb: "A toxic nebula rises through deep space.",
    dangerLabel: "Toxic Gas",
    enemyLabel: "Alien",
  },
  antarctica: {
    blurb: "The freeze climbs. Bears lunge from the ice.",
    dangerLabel: "Cold Front",
    enemyLabel: "Polar Bear",
  },
};

/** 0→1 as the run goes on — drives enemy density & pickup scarcity */
export function runIntensity(timeSec: number) {
  return Math.min(1, Math.max(0, timeSec / 140));
}

/** Enemy AI sharpness — Easy = dumb wander, Hard = hunts you */
export function enemySmartMul(id: DifficultyId) {
  if (id === "hard") return 1.75;
  if (id === "easy") return 0.42;
  return 0.95;
}

/** Enemy move speed scale — all difficulties slower; Easy crawls, Hard still readable */
export function enemySpeedMul(id: DifficultyId) {
  if (id === "hard") return 0.9;
  if (id === "easy") return 0.48;
  return 0.68;
}

export const DEFAULT_DIFFICULTY: DifficultyId = "medium";
export const DEFAULT_THEME: ThemeId = "volcanic";
