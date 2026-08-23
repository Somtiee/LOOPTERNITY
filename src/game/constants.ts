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
  /** Start just under the view so magma/gas/ice is on-screen from the first seconds. */
  startOffset: 165,
  waveAmp: 10,
  waveFreq: 2.4,
  /** Lurk distance — rise stays near the bottom of the screen, not hundreds of px off-camera. */
  maxGap: 185,
  warnGap: 190,
  /** On a rise hit, shove it far below so the next hits aren't instant. */
  hitPushback: 480,
  reliefTime: 2.8,
  /** Extra chase speed while the player is farther than maxGap (after a hit-shove, etc.). */
  catchUpSpeed: 560,
} as const;

/**
 * Timed undertow toward the rise. Strength caps at maxStage;
 * later pulses re-trigger relief without stacking power forever.
 *
 * Schedule: 14s → ×1, 45s → ×2, 80s → ×3, then every 50s a pulse.
 */
export const SINK = {
  firstAt: 14,
  secondAt: 45,
  thirdAt: 80,
  /** After ×3, re-pulse at ~2:10, 3:00… */
  pulseEverySec: 50,
  /** Hard ceiling on pull strength */
  maxStage: 3,
  /** On each pull event, give a short visible breath — still on-screen. */
  stageReliefProximity: 0.62,
  /**
   * Stop the undertow in the hot zone so the last stretch is dodge/boost.
   * Danger speed is still allowed to finish the catch (no teleport-away cap).
   */
  maxProximity: 0.82,
  /** Downward pull (px/s) per stage */
  pullPerStage: {
    easy: 55,
    medium: 82,
    hard: 115,
  } as Record<DifficultyId, number>,
  /** Extra danger rise speed per stage */
  dangerBonusPerStage: {
    easy: 34,
    medium: 50,
    hard: 66,
  } as Record<DifficultyId, number>,
  /** Safe gap shrinks each stage so the bar stays hungry */
  gapShrinkPerStage: 28,
  minGap: 140,
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
    dangerBaseSpeed: 252,
    dangerAccel: 2.5,
    obstacleSpacing: 230,
    obstacleSpeedMul: 0.7,
    enemySpawnMul: 1.25,
  },
  medium: {
    id: "medium",
    label: "Medium",
    climbSpeed: 330,
    dangerBaseSpeed: 292,
    dangerAccel: 3.3,
    obstacleSpacing: 185,
    obstacleSpeedMul: 1,
    enemySpawnMul: 1,
  },
  hard: {
    id: "hard",
    label: "Hard",
    climbSpeed: 360,
    dangerBaseSpeed: 332,
    dangerAccel: 4.1,
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
