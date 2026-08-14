export type ThemeId = "volcanic" | "planetary" | "antarctica";
export type DifficultyId = "easy" | "medium" | "hard";
export type GameMode = "normal" | "p2e";
export type GamePhase = "playing" | "gameover";
export type CharacterId = "ash" | "nova" | "nord";

export type ThemePalette = {
  id: ThemeId;
  name: string;
  skyTop: string;
  skyBottom: string;
  accent: string;
  dangerCore: string;
  dangerGlow: string;
  dangerSurface: string;
  platform: string;
  platformEdge: string;
  particle: string;
  haze: string;
};

export type DifficultyConfig = {
  id: DifficultyId;
  label: string;
  climbSpeed: number;
  dangerBaseSpeed: number;
  dangerAccel: number;
  obstacleSpacing: number;
  obstacleSpeedMul: number;
  enemySpawnMul: number;
};

export type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ObstacleKind =
  | "rock"
  | "ledge"
  | "spike"
  | "ember"
  | "asteroid"
  | "crystal"
  | "iceberg"
  | "icicle";

export type Obstacle = Rect & {
  id: number;
  kind: ObstacleKind;
  drift: number;
  bob: number;
  bobSpeed: number;
  spin: number;
  warn: number;
};

export type EnemyKind = "dragon" | "alien" | "bear";

export type Enemy = {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  /** Horizontal patrol travel direction — flips over time / at walls */
  patrolDir: 1 | -1;
  /** Seconds until next intentional direction / lane change */
  turnT: number;
  /** Soft X target for crossing the field */
  wanderX: number;
  age: number;
  state: "enter" | "patrol" | "attack" | "recover";
  stateT: number;
};

export type ProjectileKind =
  | "fireball"
  | "plasma"
  | "icechunk"
  /** Falling hazards from above */
  | "fall_fire"
  | "fall_asteroid"
  | "fall_ice";

export type Projectile = {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  life: number;
  kind: ProjectileKind;
  spin?: number;
};

export type Pickup = {
  id: number;
  x: number;
  y: number;
  r: number;
  bob: number;
  kind: "shield";
};

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
};

export type HudSnapshot = {
  phase: GamePhase;
  shields: number;
  maxShields: number;
  timeSurvived: number;
  height: number;
  themeName: string;
  boostReady: boolean;
  /** 0 = rise far below, 1 = about to catch you */
  dangerProximity: number;
  threatLevel: number;
  intensity: number;
  dangerLabel: string;
  /** Minutes survived → continuous pull toward the rise (0 = none yet) */
  sinkStage: number;
  nearMisses: number;
  hitsTaken: number;
};
