import {
  DANGER,
  DEFAULT_DIFFICULTY,
  DEFAULT_THEME,
  DIFFICULTIES,
  ENEMIES,
  FALLING,
  OBSTACLES,
  PICKUPS,
  PLAYER,
  SINK,
  THEME_META,
  WORLD,
  enemySmartMul,
  enemySpeedMul,
  runIntensity,
  sinkProgress,
} from "../constants";
import { DEFAULT_CHARACTER, getCharacter } from "../characters";
import { KeyboardInput } from "../input/KeyboardInput";
import { aabb, clamp, lerp, randRange } from "../math";
import { drawCharacter } from "../render/drawCharacter";
import { getTheme } from "../themes";
import type {
  CharacterId,
  DifficultyId,
  Enemy,
  EnemyKind,
  GamePhase,
  HudSnapshot,
  Obstacle,
  ObstacleKind,
  Particle,
  Pickup,
  Projectile,
  ThemeId,
  ThemePalette,
} from "../types";

export type GameAudioHooks = {
  onBoost?: () => void;
  onHit?: () => void;
  onShieldPickup?: () => void;
  onEnemyAppear?: () => void;
  onGameOver?: () => void;
  onNearMiss?: () => void;
};

export type GameOptions = {
  themeId?: ThemeId;
  difficultyId?: DifficultyId;
  characterId?: CharacterId;
  onHud?: (hud: HudSnapshot) => void;
  audio?: GameAudioHooks;
  /** When false, R / Space / boost will not restart after death (P2E re-entry). */
  keyboardRestart?: boolean;
};

type PlayerState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  invuln: number;
  bob: number;
  boostT: number;
  boostCd: number;
};

/**
 * Imperative canvas game. World Y increases upward.
 */
export class Game {
  private ctx: CanvasRenderingContext2D;
  private width: number = WORLD.width;
  private height: number = WORLD.viewHeight;
  private dpr = 1;

  private input: KeyboardInput;
  private theme: ThemePalette;
  private difficultyId: DifficultyId;
  private characterId: CharacterId;
  private onHud?: (hud: HudSnapshot) => void;
  private audio?: GameAudioHooks;
  private nearMissCd = 0;
  private nearMissCount = 0;
  private hitsTaken = 0;
  private keyboardRestart = true;

  private phase: GamePhase = "playing";
  private shields: number = PLAYER.maxShields;
  private time = 0;
  private cameraY = 0;
  private dangerY = 0;
  private nextObstacleY = 0;
  private nextPickupY = 0;
  private nextEnemyAt = 0;
  private nextFallAt = 0;
  private dangerReliefT = 0;
  private obstacleId = 0;
  private enemyId = 0;
  private pickupId = 0;
  private projId = 0;
  private shake = 0;
  private hitFlash = 0;
  private collectFlash = 0;
  private threatPulse = 0;
  private alertBanner = 0;
  private bannerText = "";
  private sinkStage = 0;
  private sinkEventId = 0;
  /** Next frame: apply halfway safety shove after a new pull stage */
  private sinkReliefPending = false;
  /** Brief window after a new stage where the halfway bar is held */
  private sinkReliefT = 0;
  private paused = false;
  private stars: { x: number; y: number; r: number; tw: number }[] = [];

  private player: PlayerState = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    facing: 1,
    invuln: 0,
    bob: 0,
    boostT: 0,
    boostCd: 0,
  };

  private obstacles: Obstacle[] = [];
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private pickups: Pickup[] = [];
  private particles: Particle[] = [];
  private scenery: { x: number; y: number; w: number; h: number; shade: number }[] =
    [];

  private raf = 0;
  private lastTs = 0;
  private running = false;
  private hudAcc = 0;
  private pauseDrawn = false;

  constructor(canvas: HTMLCanvasElement, input: KeyboardInput, options: GameOptions = {}) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.input = input;
    this.theme = getTheme(options.themeId ?? DEFAULT_THEME);
    this.difficultyId = options.difficultyId ?? DEFAULT_DIFFICULTY;
    this.characterId = options.characterId ?? DEFAULT_CHARACTER;
    this.onHud = options.onHud;
    this.audio = options.audio;
    this.keyboardRestart = options.keyboardRestart !== false;
    this.reset();
  }

  setSize(cssWidth: number, cssHeight: number, dpr: number) {
    this.width = Math.max(280, cssWidth);
    this.height = Math.max(420, cssHeight);
    this.dpr = dpr;
    const canvas = this.ctx.canvas;
    canvas.width = Math.floor(this.width * dpr);
    canvas.height = Math.floor(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTs = performance.now();
    const tick = (ts: number) => {
      if (!this.running) return;
      const dt = Math.min(0.033, (ts - this.lastTs) / 1000);
      this.lastTs = ts;
      if (!this.paused) {
        this.pauseDrawn = false;
        this.update(dt);
        this.draw();
      } else if (!this.pauseDrawn) {
        this.draw();
        this.pauseDrawn = true;
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.pauseDrawn = false;
    if (!paused) this.lastTs = performance.now();
  }

  isPaused() {
    return this.paused;
  }

  restart() {
    this.paused = false;
    this.reset();
    this.emitHud(true);
  }

  private playWidth() {
    return this.width;
  }

  private enemyKind(): EnemyKind {
    if (this.theme.id === "planetary") return "alien";
    if (this.theme.id === "antarctica") return "bear";
    return "dragon";
  }

  private reset() {
    const diff = DIFFICULTIES[this.difficultyId];
    this.phase = "playing";
    this.shields = PLAYER.maxShields;
    this.time = 0;
    this.shake = 0;
    this.hitFlash = 0;
    this.collectFlash = 0;
    this.threatPulse = 0;
    this.alertBanner = 0;
    this.bannerText = "";
    this.sinkStage = 0;
    this.sinkEventId = 0;
    this.sinkReliefPending = false;
    this.sinkReliefT = 0;
    this.paused = false;
    this.dangerReliefT = 0;
    this.nearMissCd = 0;
    this.nearMissCount = 0;
    this.hitsTaken = 0;
    this.obstacleId = 0;
    this.enemyId = 0;
    this.pickupId = 0;
    this.projId = 0;
    this.obstacles = [];
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.particles = [];
    this.scenery = [];
    this.stars = [];

    this.player = {
      x: this.playWidth() / 2 - PLAYER.width / 2,
      y: 120,
      vx: 0,
      vy: diff.climbSpeed,
      facing: 1,
      invuln: 0,
      bob: 0,
      boostT: 0,
      boostCd: 0,
    };

    this.cameraY = this.player.y + 80;
    this.dangerY = this.player.y - DANGER.startOffset;
    this.nextObstacleY = this.player.y + 260;
    this.nextPickupY = this.player.y + PICKUPS.firstHeight;
    this.nextEnemyAt = this.time + 4.5 * diff.enemySpawnMul;
    this.nextFallAt = FALLING.firstDelay;

    this.seedScenery();
    this.seedStars();
    this.ensureObstacles();
    this.ensurePickups();
  }

  private seedScenery() {
    const w = this.playWidth();
    for (let i = 0; i < 48; i++) {
      this.scenery.push({
        x: randRange(10, Math.max(40, w - 30)),
        y: randRange(-200, 1600),
        w: randRange(8, 28),
        h: randRange(40, 130),
        shade: Math.random(),
      });
    }
  }

  private seedStars() {
    const w = this.playWidth();
    for (let i = 0; i < 90; i++) {
      this.stars.push({
        x: randRange(0, w),
        y: randRange(0, 2000),
        r: randRange(0.6, 2.2),
        tw: Math.random() * Math.PI * 2,
      });
    }
  }

  private update(dt: number) {
    if (this.phase === "gameover") {
      if (
        this.keyboardRestart &&
        (this.input.consumeRestart() || this.input.consumeBoost())
      ) {
        this.restart();
        return;
      }
      this.input.consumeRestart();
      this.input.consumeBoost();
      this.updateParticles(dt);
      this.shake = Math.max(0, this.shake - dt * 8);
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      this.collectFlash = Math.max(0, this.collectFlash - dt);
      this.alertBanner = Math.max(0, this.alertBanner - dt);
      return;
    }

    if (this.input.consumeRestart()) {
      // ignore mid-run accidental R spam for restart — only R after death via above
    }

    const diff = DIFFICULTIES[this.difficultyId];
    this.time += dt;
    this.player.bob += dt * 10;
    this.player.invuln = Math.max(0, this.player.invuln - dt);
    this.player.boostCd = Math.max(0, this.player.boostCd - dt);
    this.player.boostT = Math.max(0, this.player.boostT - dt);
    this.shake = Math.max(0, this.shake - dt * 6);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.collectFlash = Math.max(0, this.collectFlash - dt);
    this.alertBanner = Math.max(0, this.alertBanner - dt);
    this.dangerReliefT = Math.max(0, this.dangerReliefT - dt);
    this.sinkReliefT = Math.max(0, this.sinkReliefT - dt);
    this.nearMissCd = Math.max(0, this.nearMissCd - dt);

    if (this.input.consumeBoost() && this.player.boostCd <= 0) {
      this.player.boostT = PLAYER.boostDuration;
      this.player.boostCd = PLAYER.boostCooldown;
      this.audio?.onBoost?.();
      this.burstParticles(
        this.player.x + PLAYER.width / 2,
        this.player.y + 8,
        12,
        this.theme.accent,
      );
    }

    const axis = this.input.axis();
    if (axis !== 0) {
      this.player.vx += axis * PLAYER.accelX * dt;
      this.player.facing = axis < 0 ? -1 : 1;
    } else {
      const fr = PLAYER.frictionX * dt;
      if (Math.abs(this.player.vx) <= fr) this.player.vx = 0;
      else this.player.vx -= Math.sign(this.player.vx) * fr;
    }
    this.player.vx = clamp(this.player.vx, -PLAYER.maxSpeedX, PLAYER.maxSpeedX);

    // Pull schedule: 30s → ×1, 2:00 → ×2, 4:00 → ×3, then pulse every 2 min
    const progress = sinkProgress(this.time);
    if (progress.eventId > this.sinkEventId) {
      this.sinkEventId = progress.eventId;
      this.sinkStage = progress.stage;
      this.sinkReliefPending = true;
      this.sinkReliefT = 1.6;
      const label = THEME_META[this.theme.id].dangerLabel.toUpperCase();
      const capped =
        this.sinkStage >= SINK.maxStage ? " (MAX)" : "";
      this.bannerText = `${label} PULL ×${this.sinkStage}${capped} — BOOST UP!`;
      this.alertBanner = 2.8;
      this.shake = Math.max(this.shake, 0.5);
      this.burstParticles(
        this.player.x + PLAYER.width / 2,
        this.player.y - 20,
        16,
        this.theme.dangerGlow,
      );
    }

    // Undertow only pulls while the bar is under the 25% ceiling (never yanks into the rise)
    const proxNow = this.computeDangerProximity();
    const sinkEngaged =
      this.sinkStage > 0 &&
      this.sinkReliefT <= 0 &&
      proxNow < SINK.maxProximity;

    const sinkPull = sinkEngaged
      ? this.sinkStage * SINK.pullPerStage[this.difficultyId]
      : 0;
    const pulse = 1 + Math.sin(this.time * 3.1) * 0.035;
    const boostMul =
      this.player.boostT > 0
        ? 1 + (PLAYER.boostImpulse / Math.max(1, diff.climbSpeed)) * (this.player.boostT / PLAYER.boostDuration)
        : 1;
    this.player.vy = diff.climbSpeed * pulse * boostMul - sinkPull;
    this.player.x += this.player.vx * dt;
    this.player.y += this.player.vy * dt;

    const minX = WORLD.wallPadding;
    const maxX = this.playWidth() - WORLD.wallPadding - PLAYER.width;
    this.player.x = clamp(this.player.x, minX, maxX);

    const dangerBonus = sinkEngaged
      ? this.sinkStage * SINK.dangerBonusPerStage[this.difficultyId]
      : 0;
    const dangerSpeed =
      diff.dangerBaseSpeed + this.time * diff.dangerAccel + dangerBonus;
    this.dangerY += dangerSpeed * dt;

    const maxGap = Math.max(
      SINK.minGap,
      DANGER.maxGap - this.sinkStage * SINK.gapShrinkPerStage,
    );
    if (
      this.dangerReliefT <= 0 &&
      this.player.y - this.dangerY > maxGap
    ) {
      this.dangerY = this.player.y - maxGap;
    }

    // New pull stage: empty bar to ~halfway so you get a safe breath
    if (this.sinkReliefPending) {
      this.setDangerProximity(SINK.stageReliefProximity);
      this.sinkReliefPending = false;
    } else if (this.sinkStage > 0 && this.sinkReliefT <= 0) {
      // Undertow alone can never push the bar past 25%
      if (this.computeDangerProximity() > SINK.maxProximity) {
        this.setDangerProximity(SINK.maxProximity);
      }
    }

    const gap = this.player.y - this.dangerY;
    this.threatPulse = clamp(1 - gap / DANGER.warnGap, 0, 1);

    this.ensureObstacles();
    this.ensurePickups();
    this.spawnEnemies();
    this.spawnFallingHazards();
    this.updateObstacles(dt, diff.obstacleSpeedMul);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updatePickups(dt);
    this.resolveObstacleHits();
    this.resolveEnemyHits();
    this.resolveProjectileHits();
    this.resolvePickupCollect();
    this.resolveDangerHit();
    this.detectNearMiss();

    const targetCam = this.player.y + this.height * 0.22;
    this.cameraY = lerp(this.cameraY, targetCam, 1 - Math.pow(0.001, dt));

    this.spawnAmbientParticles(dt);
    this.updateParticles(dt);
    this.emitHud();
  }

  private themeObstacleKinds(): ObstacleKind[] {
    switch (this.theme.id) {
      case "planetary":
        return ["asteroid", "crystal", "ledge"];
      case "antarctica":
        return ["iceberg", "icicle", "spike", "ledge"];
      default:
        return ["rock", "ember", "spike", "ledge"];
    }
  }

  private ensureObstacles() {
    const diff = DIFFICULTIES[this.difficultyId];
    const top = this.player.y + OBSTACLES.spawnAhead;
    const fieldW = this.playWidth();
    const kinds = this.themeObstacleKinds();

    while (this.nextObstacleY < top) {
      const kind = kinds[Math.floor(Math.random() * kinds.length)]!;
      const tall = kind === "spike" || kind === "icicle" || kind === "ember";
      const w = tall
        ? randRange(36, 70)
        : randRange(OBSTACLES.minWidth, OBSTACLES.maxWidth);
      const h = tall
        ? randRange(34, 58)
        : OBSTACLES.height + randRange(-2, 14);

      const sideBias = Math.random();
      let x: number;
      if (sideBias < 0.3) x = WORLD.wallPadding + randRange(0, 50);
      else if (sideBias > 0.7)
        x = fieldW - WORLD.wallPadding - w - randRange(0, 50);
      else x = randRange(WORLD.wallPadding, fieldW - WORLD.wallPadding - w);

      this.obstacles.push({
        id: ++this.obstacleId,
        kind,
        x,
        y: this.nextObstacleY,
        w,
        h,
        drift: randRange(-28, 28) * diff.obstacleSpeedMul,
        bob: Math.random() * Math.PI * 2,
        bobSpeed: randRange(1.2, 2.8),
        spin: randRange(-1.2, 1.2),
        warn: 1,
      });

      this.nextObstacleY += diff.obstacleSpacing * randRange(0.8, 1.25);
    }

    const cullY = this.cameraY - this.height - OBSTACLES.cullBelow;
    this.obstacles = this.obstacles.filter((o) => o.y + o.h > cullY);
  }

  private ensurePickups() {
    const top = this.player.y + OBSTACLES.spawnAhead;
    const fieldW = this.playWidth();
    const intensity = runIntensity(this.time);
    // Scarcer shields as the run goes on
    const spacingMul = 1 + intensity * 1.35;
    while (this.nextPickupY < top) {
      this.pickups.push({
        id: ++this.pickupId,
        x: randRange(WORLD.wallPadding + 30, fieldW - WORLD.wallPadding - 30),
        y: this.nextPickupY,
        r: PICKUPS.radius,
        bob: Math.random() * Math.PI * 2,
        kind: "shield",
      });
      this.nextPickupY += PICKUPS.spacing * spacingMul * randRange(0.85, 1.25);
    }
    const cullY = this.cameraY - this.height - 400;
    this.pickups = this.pickups.filter((p) => p.y > cullY);
  }

  private spawnEnemies() {
    if (this.player.y < ENEMIES.firstHeight) return;
    if (this.time < this.nextEnemyAt) return;

    const intensity = runIntensity(this.time);
    const maxAlive = 1 + Math.floor(intensity * 1.5); // 1 → 2
    if (this.enemies.length >= maxAlive) {
      this.nextEnemyAt = this.time + 1.5;
      return;
    }

    const diff = DIFFICULTIES[this.difficultyId];
    const kind = this.enemyKind();
    const fromLeft = Math.random() > 0.5;
    const fieldW = this.playWidth();
    const y = this.player.y + randRange(160, 300);

    let w = 40;
    let h = 40;
    if (kind === "dragon") {
      w = 64;
      h = 38;
    } else if (kind === "bear") {
      w = 58;
      h = 40;
    } else {
      w = 38;
      h = 38;
    }

    const patrolDir: 1 | -1 = fromLeft ? 1 : -1;
    this.enemies.push({
      id: ++this.enemyId,
      kind,
      x: fromLeft ? -w - 10 : fieldW + 10,
      y,
      w,
      h,
      vx: fromLeft ? 70 : -70,
      vy: 0,
      facing: patrolDir,
      patrolDir,
      turnT: randRange(1.1, 2.2),
      wanderX: randRange(WORLD.wallPadding + 40, fieldW - WORLD.wallPadding - w - 40),
      age: 0,
      state: "enter",
      stateT: 0,
    });

    this.bannerText =
      this.theme.id === "planetary"
        ? "ALIEN INBOUND"
        : this.theme.id === "antarctica"
          ? "BEAR APPROACHING"
          : "DRAGON INBOUND";
    this.alertBanner = 1.6;
    this.shake = Math.max(this.shake, 0.25);
    this.audio?.onEnemyAppear?.();
    const intervalMul = Math.max(0.4, 1 - intensity * 0.55);
    this.nextEnemyAt =
      this.time +
      ENEMIES.baseInterval *
        diff.enemySpawnMul *
        intervalMul *
        randRange(0.75, 1.1);
  }

  private updateObstacles(dt: number, speedMul: number) {
    const fieldW = this.playWidth();
    for (const o of this.obstacles) {
      o.x += o.drift * dt * speedMul;
      o.bob += o.bobSpeed * dt;
      o.warn = Math.max(0, o.warn - dt * 0.7);
      if (o.kind === "asteroid" || o.kind === "ember") {
        o.spin += dt * 2.2;
      }
      if (o.x < WORLD.wallPadding) {
        o.x = WORLD.wallPadding;
        o.drift = Math.abs(o.drift);
      } else if (o.x + o.w > fieldW - WORLD.wallPadding) {
        o.x = fieldW - WORLD.wallPadding - o.w;
        o.drift = -Math.abs(o.drift);
      }
    }
  }

  private updateEnemies(dt: number) {
    const pcx = this.player.x + PLAYER.width / 2;
    const pcy = this.player.y + PLAYER.height * 0.5;
    const fieldW = this.playWidth();

    for (const e of this.enemies) {
      e.age += dt;
      e.stateT += dt;

      if (e.kind === "dragon") this.tickDragon(e, dt, pcx, pcy, fieldW);
      else if (e.kind === "alien") this.tickAlien(e, dt, pcx, pcy, fieldW);
      else this.tickBear(e, dt, pcx, pcy, fieldW);
    }

    const cullY = this.cameraY - this.height - ENEMIES.cullBelow;
    this.enemies = this.enemies.filter(
      (e) => e.y + e.h > cullY && e.x > -220 && e.x < fieldW + 220,
    );
  }

  /** Flip left/right and pick a new cross-field lane */
  private retargetEnemyLane(
    e: Enemy,
    fieldW: number,
    smart: number,
    playerCx: number,
  ) {
    const pad = WORLD.wallPadding + 24;
    const hitL = e.x <= pad;
    const hitR = e.x + e.w >= fieldW - pad;
    if (hitL) e.patrolDir = 1;
    else if (hitR) e.patrolDir = -1;
    else e.patrolDir = Math.random() > 0.5 ? 1 : -1;

    // Easy mostly wanders; Hard often cuts toward the player
    const chaseChance = clamp(0.12 + smart * 0.38, 0.12, 0.85);
    if (Math.random() < chaseChance) {
      e.wanderX = clamp(playerCx - e.w / 2, pad, fieldW - pad - e.w);
    } else {
      e.wanderX = randRange(pad, fieldW - pad - e.w);
    }
    e.facing = e.patrolDir;
    // Dumb = slower turns / longer lanes; smart = retargets faster
    e.turnT = randRange(1.4, 3.2) / Math.max(0.45, smart * 0.9);
  }

  private tickDragon(
    e: Enemy,
    dt: number,
    pcx: number,
    pcy: number,
    fieldW: number,
  ) {
    const smart = enemySmartMul(this.difficultyId);
    const spd = enemySpeedMul(this.difficultyId);
    const pad = WORLD.wallPadding + 20;

    if (e.state === "enter") {
      e.x = lerp(e.x, e.wanderX, 1 - Math.pow(0.018 * smart * spd, dt));
      e.y = lerp(e.y, pcy + 120, 1 - Math.pow(0.022 * smart * spd, dt));
      e.facing = e.patrolDir;
      if (e.stateT > 1.8 / Math.max(0.5, smart)) {
        e.state = "patrol";
        e.stateT = 0;
        e.turnT = randRange(1.0, 2.0);
      }
    } else if (e.state === "patrol") {
      e.turnT -= dt;
      if (e.turnT <= 0 || e.x <= pad || e.x + e.w >= fieldW - pad) {
        this.retargetEnemyLane(e, fieldW, smart, pcx);
        // Hard: keep correcting toward player lane
        if (smart > 1.2) {
          e.wanderX = lerp(e.wanderX, pcx - e.w / 2, 0.4 * (smart - 1));
          e.wanderX = clamp(e.wanderX, pad, fieldW - pad - e.w);
        }
      }

      const speed =
        (42 + smart * 16) * spd * (0.85 + Math.abs(Math.sin(e.age * 0.45)) * 0.2);
      e.x += e.patrolDir * speed * dt;
      e.x = lerp(e.x, e.wanderX, 1 - Math.pow(0.035 * spd, dt));
      e.x = clamp(e.x, pad, fieldW - pad - e.w);
      e.facing = e.patrolDir;

      const hoverY = pcy + (130 - smart * 12) + Math.sin(e.age * 1.0 + e.id) * 12;
      e.y = lerp(e.y, hoverY, 1 - Math.pow(0.035, dt));

      // Easy attacks rarely; Hard attacks often
      if (e.stateT > (3.4 - smart * 0.7) / Math.max(0.55, smart)) {
        e.state = "attack";
        e.stateT = 0;
        // Easy: weak aim; Hard: locks onto player
        const aimBias = smart < 0.7 ? randRange(-120, 120) : 0;
        e.facing = (Math.sign(pcx + aimBias - (e.x + e.w / 2)) ||
          e.patrolDir) as 1 | -1;
        const ecx = e.x + e.w / 2;
        const ecy = e.y + e.h * 0.4;
        const dx = pcx + aimBias - ecx;
        const dy = pcy - ecy;
        const len = Math.hypot(dx, dy) || 1;
        const shotSpeed = (85 + smart * 25) * spd;
        this.projectiles.push({
          id: ++this.projId,
          x: ecx - 7,
          y: ecy - 7,
          w: 14,
          h: 14,
          vx: (dx / len) * shotSpeed,
          vy: (dy / len) * shotSpeed,
          life: 2.6,
          kind: "fireball",
        });
        if (smart > 1.35 && Math.random() > 0.4) {
          this.projectiles.push({
            id: ++this.projId,
            x: ecx - 7,
            y: ecy - 7,
            w: 12,
            h: 12,
            vx: (dx / len) * shotSpeed * 0.85 + randRange(-30, 30),
            vy: (dy / len) * shotSpeed * 0.85,
            life: 2.4,
            kind: "fireball",
          });
        }
        this.burstParticles(ecx, ecy, 6, this.theme.dangerGlow);
      }
    } else if (e.state === "attack") {
      e.x += e.facing * (55 * smart * spd) * dt;
      e.y -= (32 + smart * 10) * spd * dt;
      if (e.stateT > 0.65 / Math.min(smart, 1.25)) {
        e.state = "recover";
        e.stateT = 0;
        e.patrolDir = (-e.facing || -1) as 1 | -1;
        e.facing = e.patrolDir;
        e.wanderX = randRange(pad, fieldW - pad - e.w);
      }
    } else {
      e.x = lerp(e.x, e.wanderX, 1 - Math.pow(0.025 * spd, dt));
      e.y = lerp(e.y, pcy + 140, 1 - Math.pow(0.025 * spd, dt));
      e.facing = e.patrolDir;
      if (e.stateT > 1.8 / Math.max(0.55, smart)) {
        e.state = "patrol";
        e.stateT = 0;
        e.turnT = randRange(0.9, 1.8);
      }
    }
  }

  private tickAlien(
    e: Enemy,
    dt: number,
    pcx: number,
    pcy: number,
    fieldW: number,
  ) {
    const smart = enemySmartMul(this.difficultyId);
    const spd = enemySpeedMul(this.difficultyId);
    const pad = WORLD.wallPadding + 20;

    if (e.state === "enter") {
      e.x = lerp(e.x, e.wanderX, 1 - Math.pow(0.022 * smart * spd, dt));
      e.y = lerp(e.y, pcy + 100, 1 - Math.pow(0.028 * spd, dt));
      if (e.stateT > 1.7 / Math.max(0.5, smart)) {
        e.state = "patrol";
        e.stateT = 0;
        e.turnT = randRange(1.0, 2.0);
      }
    } else if (e.state === "patrol") {
      e.turnT -= dt;
      if (e.turnT <= 0 || e.x <= pad || e.x + e.w >= fieldW - pad) {
        this.retargetEnemyLane(e, fieldW, smart, pcx);
      }

      const speed = 36 * smart * spd;
      e.x += e.patrolDir * speed * dt;
      e.x = lerp(e.x, e.wanderX, 1 - Math.pow(0.04 * spd, dt));
      e.x = clamp(e.x, pad, fieldW - pad - e.w);
      e.facing = e.patrolDir;

      const hoverY = pcy + (110 - smart * 10) + Math.sin(e.age * 1.2 + e.id) * 9;
      e.y = lerp(e.y, hoverY, 1 - Math.pow(0.04, dt));

      if (e.stateT > (3.1 - smart * 0.6) / Math.max(0.55, smart)) {
        e.state = "attack";
        e.stateT = 0;
        e.facing = e.patrolDir;
        const ecx = e.x + e.w / 2;
        const ecy = e.y + e.h / 2;
        const bolts = smart > 1.4 ? 3 : smart > 0.9 ? 2 : 1;
        const aimSlip = smart < 0.7 ? randRange(-80, 80) : 0;
        for (let i = 0; i < bolts; i++) {
          const spread = bolts === 1 ? 0 : (i - (bolts - 1) / 2) * 45;
          this.projectiles.push({
            id: ++this.projId,
            x: ecx - 6,
            y: ecy - 6,
            w: 12,
            h: 12,
            vx: (pcx + aimSlip - ecx) * (0.14 * smart) + spread,
            vy: -(75 + smart * 20) * spd,
            life: 2.4,
            kind: "plasma",
          });
        }
      }
    } else if (e.state === "attack") {
      e.x += e.patrolDir * (65 * smart * spd) * dt;
      e.y += Math.sin(e.age * 2.5) * 4 * dt;
      if (e.stateT > 0.7 / Math.min(smart, 1.25)) {
        e.state = "recover";
        e.stateT = 0;
        e.patrolDir = (-e.patrolDir || 1) as 1 | -1;
        e.facing = e.patrolDir;
        e.wanderX = randRange(pad, fieldW - pad - e.w);
      }
    } else {
      e.x = lerp(e.x, e.wanderX, 1 - Math.pow(0.028 * spd, dt));
      e.y += this.player.vy * 0.28 * dt;
      e.facing = e.patrolDir;
      if (e.stateT > 1.7 / Math.max(0.55, smart)) {
        e.state = "patrol";
        e.stateT = 0;
        e.turnT = randRange(0.8, 1.6);
      }
    }
  }

  private tickBear(
    e: Enemy,
    dt: number,
    pcx: number,
    pcy: number,
    fieldW: number,
  ) {
    const smart = enemySmartMul(this.difficultyId);
    const spd = enemySpeedMul(this.difficultyId);
    const pad = WORLD.wallPadding + 16;

    if (e.state === "enter") {
      e.x = lerp(e.x, e.wanderX, 1 - Math.pow(0.025 * smart * spd, dt));
      e.y = lerp(e.y, this.player.y + 18, 1 - Math.pow(0.032 * smart * spd, dt));
      e.facing = e.patrolDir;
      if (e.stateT > 1.6 / Math.max(0.5, smart)) {
        e.state = "patrol";
        e.stateT = 0;
        e.turnT = randRange(1.3, 2.4);
      }
    } else if (e.state === "patrol") {
      e.turnT -= dt;
      if (e.turnT <= 0 || e.x <= pad || e.x + e.w >= fieldW - pad) {
        this.retargetEnemyLane(e, fieldW, smart, pcx);
        // Easy bears pace aimlessly; Hard commits to a direction less randomly
        if (Math.random() < (smart < 0.7 ? 0.7 : 0.4)) {
          e.patrolDir = (-e.patrolDir || 1) as 1 | -1;
          e.facing = e.patrolDir;
        }
      }

      const speed = 22 * smart * spd;
      e.x += e.patrolDir * speed * dt;
      e.x = lerp(e.x, e.wanderX, 1 - Math.pow(0.028 * spd, dt));
      e.x = clamp(e.x, pad, fieldW - pad - e.w);
      e.facing = e.patrolDir;
      e.y = lerp(e.y, this.player.y + 14, 1 - Math.pow(0.04, dt));

      const chargeRange = 55 + smart * 35;
      if (
        e.stateT > (2.8 - smart * 0.5) / Math.max(0.55, smart) &&
        Math.abs(e.y - this.player.y) < chargeRange
      ) {
        e.state = "attack";
        e.stateT = 0;
        const aimSlip = smart < 0.7 ? randRange(-90, 90) : 0;
        e.facing = (Math.sign(pcx + aimSlip - (e.x + e.w / 2)) ||
          e.patrolDir) as 1 | -1;
        e.patrolDir = e.facing;
        e.vx = e.facing * (110 * smart * spd);
      }
    } else if (e.state === "attack") {
      e.x += e.vx * dt;
      e.vx *= 1 - dt * (1.8 / Math.max(0.6, smart));
      e.y += this.player.vy * 0.18 * dt;
      if (e.stateT > 0.7 / Math.min(smart, 1.25)) {
        e.state = "recover";
        e.stateT = 0;
        e.patrolDir = (-e.facing || -1) as 1 | -1;
        e.facing = e.patrolDir;
        e.wanderX = randRange(pad, fieldW - pad - e.w);
        e.turnT = randRange(1.0, 2.0);
      }
    } else {
      e.x = lerp(e.x, e.wanderX, 1 - Math.pow(0.025 * spd, dt));
      e.y += this.player.vy * 0.32 * dt;
      e.facing = e.patrolDir;
      if (e.stateT > 1.8 / Math.max(0.55, smart)) {
        e.state = "patrol";
        e.stateT = 0;
      }
    }
  }

  private spawnFallingHazards() {
    if (this.time < this.nextFallAt) return;
    const fieldW = this.playWidth();
    const speed = randRange(FALLING.speedMin, FALLING.speedMax);
    // Spawn above the camera / player
    const y = this.player.y + this.height * 0.75 + randRange(40, 160);
    const x = randRange(WORLD.wallPadding + 20, fieldW - WORLD.wallPadding - 40);

    if (this.theme.id === "volcanic") {
      this.projectiles.push({
        id: ++this.projId,
        x,
        y,
        w: 18,
        h: 18,
        vx: randRange(-30, 30),
        vy: -speed,
        life: 5,
        kind: "fall_fire",
      });
    } else if (this.theme.id === "planetary") {
      const s = randRange(20, 34);
      this.projectiles.push({
        id: ++this.projId,
        x,
        y,
        w: s,
        h: s,
        vx: randRange(-40, 40),
        vy: -speed * 0.9,
        life: 5.5,
        kind: "fall_asteroid",
        spin: randRange(-3, 3),
      });
    } else {
      // Slim ice droplets — sometimes a small cluster
      const count = Math.random() > 0.55 ? 3 : 1;
      for (let i = 0; i < count; i++) {
        this.projectiles.push({
          id: ++this.projId,
          x: x + i * 16 + randRange(-6, 6),
          y: y + randRange(0, 40),
          w: 6,
          h: 16,
          vx: randRange(-12, 12),
          vy: -speed * 1.15,
          life: 4.5,
          kind: "fall_ice",
        });
      }
    }

    const diff = DIFFICULTIES[this.difficultyId];
    this.nextFallAt =
      this.time +
      FALLING.baseInterval *
        (diff.id === "hard" ? 0.75 : diff.id === "easy" ? 1.25 : 1) *
        randRange(0.85, 1.2);
  }

  private updateProjectiles(dt: number) {
    for (const p of this.projectiles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.spin != null) p.spin += dt * 2.5;
      if (p.kind === "plasma") p.vy += 40 * dt;
      if (p.kind === "icechunk") p.vy -= 30 * dt;
      // Falling hazards accelerate slightly downward (world -y)
      if (
        p.kind === "fall_fire" ||
        p.kind === "fall_asteroid" ||
        p.kind === "fall_ice"
      ) {
        p.vy -= 40 * dt;
      }
    }
    const cullY = this.cameraY - this.height - 200;
    this.projectiles = this.projectiles.filter(
      (p) => p.life > 0 && p.y > cullY,
    );
  }

  private updatePickups(dt: number) {
    for (const p of this.pickups) p.bob += dt * 4;
  }

  private playerRect() {
    return {
      x: this.player.x + 4,
      y: this.player.y,
      w: PLAYER.width - 8,
      h: PLAYER.height - 4,
    };
  }

  private obstacleRect(o: Obstacle) {
    const bobY = Math.sin(o.bob) * (o.kind === "asteroid" ? 10 : 5);
    return { x: o.x, y: o.y + bobY, w: o.w, h: o.h };
  }

  private resolveObstacleHits() {
    if (this.player.invuln > 0) return;
    const pr = this.playerRect();
    for (const o of this.obstacles) {
      if (!aabb(pr, this.obstacleRect(o))) continue;
      this.takeHit("obstacle");
      const mid = o.x + o.w / 2;
      const push = this.player.x + PLAYER.width / 2 < mid ? -1 : 1;
      this.player.vx = push * 240;
      this.player.y += 40;
      break;
    }
  }

  private resolveEnemyHits() {
    if (this.player.invuln > 0) return;
    const pr = this.playerRect();
    for (const e of this.enemies) {
      if (!aabb(pr, { x: e.x + 6, y: e.y + 4, w: e.w - 12, h: e.h - 8 })) continue;
      this.takeHit("enemy");
      this.player.vx = -e.facing * 200;
      this.player.y += 50;
      break;
    }
  }

  private resolveProjectileHits() {
    if (this.player.invuln > 0) return;
    const pr = this.playerRect();
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!;
      if (!aabb(pr, p)) continue;
      this.takeHit("projectile");
      this.burstParticles(p.x + p.w / 2, p.y + p.h / 2, 14, this.theme.dangerSurface);
      this.projectiles.splice(i, 1);
      break;
    }
  }

  private resolvePickupCollect() {
    const pr = this.playerRect();
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i]!;
      const rect = {
        x: p.x - p.r,
        y: p.y - p.r + Math.sin(p.bob) * 6,
        w: p.r * 2,
        h: p.r * 2,
      };
      if (!aabb(pr, rect)) continue;
      this.pickups.splice(i, 1);
      if (this.shields < PLAYER.maxShields) {
        this.shields += 1;
        this.collectFlash = 0.35;
        this.audio?.onShieldPickup?.();
        this.burstParticles(p.x, p.y, 18, "#ffe08a");
        this.burstParticles(p.x, p.y, 10, this.theme.accent);
      } else {
        this.collectFlash = 0.2;
        this.burstParticles(p.x, p.y, 10, "#ffffff");
      }
    }
  }

  private resolveDangerHit() {
    if (this.player.invuln > 0) return;
    const feet = this.player.y;
    const surface =
      this.dangerY + Math.sin(this.time * DANGER.waveFreq) * DANGER.waveAmp;
    if (feet <= surface + 8) {
      this.takeHit("danger");
      // Shove rising danger far below so the next two hits aren't instant
      this.dangerY = this.player.y - DANGER.hitPushback;
      this.dangerReliefT = DANGER.reliefTime;
      this.player.y += PLAYER.lavaKnock;
      this.player.boostT = Math.max(this.player.boostT, 0.22);
      this.burstParticles(
        this.player.x + PLAYER.width / 2,
        this.dangerY + 20,
        14,
        this.theme.dangerSurface,
      );
    }
  }

  private takeHit(_source: string) {
    if (this.player.invuln > 0 || this.phase !== "playing") return;
    this.shields -= 1;
    this.hitsTaken += 1;
    this.player.invuln = PLAYER.hitInvuln;
    this.shake = 0.6;
    this.hitFlash = 0.28;
    this.audio?.onHit?.();
    this.burstParticles(
      this.player.x + PLAYER.width / 2,
      this.player.y + 10,
      18,
      this.theme.dangerGlow,
    );

    if (this.shields <= 0) {
      this.shields = 0;
      this.phase = "gameover";
      this.audio?.onGameOver?.();
      this.emitHud(true);
      this.burstParticles(
        this.player.x + PLAYER.width / 2,
        this.player.y + 16,
        32,
        this.theme.accent,
      );
    }
  }

  /** Close pass by an obstacle / enemy / projectile without colliding. */
  private detectNearMiss() {
    if (this.nearMissCd > 0 || this.player.invuln > 0) return;
    const pr = this.playerRect();
    const bodies: { x: number; y: number; w: number; h: number }[] = [
      ...this.obstacles.map((o) => this.obstacleRect(o)),
      ...this.enemies,
      ...this.projectiles,
    ];
    for (const r of bodies) {
      if (aabb(pr, r)) continue;
      const gap = this.gapToRect(pr, r);
      if (gap > 0 && gap < 18) {
        this.nearMissCd = 0.55;
        this.nearMissCount += 1;
        this.audio?.onNearMiss?.();
        break;
      }
    }
  }

  private gapToRect(
    pr: { x: number; y: number; w: number; h: number },
    r: { x: number; y: number; w: number; h: number },
  ) {
    const dx = Math.abs(pr.x + pr.w / 2 - (r.x + r.w / 2)) - (pr.w + r.w) * 0.5;
    const dy = Math.abs(pr.y + pr.h / 2 - (r.y + r.h / 2)) - (pr.h + r.h) * 0.5;
    return Math.max(dx, dy);
  }

  private burstParticles(x: number, y: number, count: number, color: string) {
    const cap = this.width < 480 ? 48 : 80;
    const room = Math.max(0, cap - this.particles.length);
    const n = Math.min(count, room);
    for (let i = 0; i < n; i++) {
      const ang = randRange(0, Math.PI * 2);
      const spd = randRange(50, 200);
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: randRange(0.35, 0.95),
        maxLife: 0.95,
        size: randRange(2, 5.5),
        color,
      });
    }
  }

  private spawnAmbientParticles(dt: number) {
    const cap = this.width < 480 ? 48 : 80;
    if (this.particles.length >= cap) return;
    if (Math.random() > dt * (16 + this.threatPulse * 20)) return;
    this.particles.push({
      x: randRange(0, this.playWidth()),
      y: this.dangerY + randRange(0, 40),
      vx: randRange(-20, 20),
      vy: randRange(40, 120),
      life: randRange(0.4, 1.1),
      maxLife: 1.1,
      size: randRange(1.5, 3.5),
      color: this.theme.dangerGlow,
    });
  }

  private updateParticles(dt: number) {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private emitHud(force = false) {
    this.hudAcc += force ? 1 : 0.016;
    if (!force && this.hudAcc < 0.1) return;
    this.hudAcc = 0;
    this.onHud?.({
      phase: this.phase,
      shields: this.shields,
      maxShields: PLAYER.maxShields,
      timeSurvived: this.time,
      height: Math.max(0, this.player.y),
      themeName: this.theme.name,
      boostReady: this.player.boostCd <= 0,
      dangerProximity: this.computeDangerProximity(),
      threatLevel: this.threatPulse,
      intensity: runIntensity(this.time),
      dangerLabel: THEME_META[this.theme.id].dangerLabel,
      sinkStage: this.sinkStage,
      nearMisses: this.nearMissCount,
      hitsTaken: this.hitsTaken,
    });
  }

  /**
   * How close the rise is to the player in camera space.
   * Fills as magma/gas/ice approaches the bottom of the view / your feet.
   */
  private computeDangerProximity() {
    const surface =
      this.dangerY + Math.sin(this.time * DANGER.waveFreq) * DANGER.waveAmp;
    const dangerSy = this.worldToScreen(surface);
    const playerSy = this.worldToScreen(this.player.y);
    // Screen px from player down to the rise (larger = safer)
    const screenDist = dangerSy - playerSy;
    // ~full view height below you ≈ empty; near your feet ≈ full
    const span = Math.max(280, this.height * 0.95);
    return clamp(1 - screenDist / span, 0, 1);
  }

  /** Place the rise so the proximity bar reads approximately `proximity`. */
  private setDangerProximity(proximity: number) {
    const p = clamp(proximity, 0, 1);
    const span = Math.max(280, this.height * 0.95);
    const screenDist = span * (1 - p);
    const wave =
      Math.sin(this.time * DANGER.waveFreq) * DANGER.waveAmp;
    this.dangerY = this.player.y - screenDist - wave;
  }

  // --- Rendering -----------------------------------------------------------

  private worldToScreen(y: number) {
    return this.cameraY - y + this.height * 0.55;
  }

  private draw() {
    const ctx = this.ctx;
    const { width: w, height: h } = this;
    const shakeX = (Math.random() - 0.5) * this.shake * 14;
    const shakeY = (Math.random() - 0.5) * this.shake * 10;

    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.translate(shakeX, shakeY);

    this.drawBackground();
    this.drawScenery();
    this.drawObstacles();
    this.drawPickups();
    this.drawEnemies();
    this.drawProjectiles();
    this.drawPlayer();
    this.drawDanger();
    this.drawParticles();
    this.drawVignette();
    this.drawThreatOverlay();
    this.drawAlertBanner();

    if (this.hitFlash > 0) {
      ctx.fillStyle = this.themeHitFlash(this.hitFlash);
      ctx.fillRect(0, 0, w, h);
    }
    if (this.collectFlash > 0) {
      ctx.fillStyle = `rgba(255, 220, 120, ${this.collectFlash * 0.25})`;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.restore();
  }

  private themeHitFlash(amount: number) {
    const a = amount * 0.35;
    switch (this.theme.id) {
      case "planetary":
        return `rgba(80, 255, 160, ${a})`;
      case "antarctica":
        return `rgba(160, 220, 255, ${a})`;
      default:
        return `rgba(255, 80, 40, ${a})`;
    }
  }

  private drawBackground() {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, this.height);
    g.addColorStop(0, this.theme.skyTop);
    g.addColorStop(1, this.theme.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.width, this.height);

    if (this.theme.id === "planetary") {
      this.drawGalaxySky();
    } else {
      ctx.fillStyle = this.theme.haze;
      for (let i = 0; i < 6; i++) {
        const yy = ((this.time * 30 + i * 90) % (this.height + 40)) - 20;
        ctx.fillRect(0, yy, this.width, 18);
      }
    }

    const wallGrad = ctx.createLinearGradient(0, 0, 56, 0);
    wallGrad.addColorStop(0, "rgba(0,0,0,0.4)");
    wallGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, 56, this.height);

    const wallGradR = ctx.createLinearGradient(this.width, 0, this.width - 56, 0);
    wallGradR.addColorStop(0, "rgba(0,0,0,0.4)");
    wallGradR.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = wallGradR;
    ctx.fillRect(this.width - 56, 0, 56, this.height);
  }

  private drawGalaxySky() {
    const ctx = this.ctx;
    // Nebula clouds
    const nebula = ctx.createRadialGradient(
      this.width * 0.3,
      this.height * 0.25,
      10,
      this.width * 0.35,
      this.height * 0.3,
      this.width * 0.55,
    );
    nebula.addColorStop(0, "rgba(120, 60, 220, 0.28)");
    nebula.addColorStop(0.45, "rgba(40, 180, 140, 0.12)");
    nebula.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, this.width, this.height);

    const nebula2 = ctx.createRadialGradient(
      this.width * 0.75,
      this.height * 0.55,
      8,
      this.width * 0.7,
      this.height * 0.6,
      this.width * 0.5,
    );
    nebula2.addColorStop(0, "rgba(80, 40, 180, 0.22)");
    nebula2.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = nebula2;
    ctx.fillRect(0, 0, this.width, this.height);

    // Parallax stars
    const period = 2000;
    for (const s of this.stars) {
      let y = s.y;
      const cam = this.cameraY * 0.35;
      while (y < cam - 100) y += period;
      while (y > cam + period) y -= period;
      const sy = ((cam + this.height * 0.5 - y) % this.height + this.height) % this.height;
      const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(this.time * 3 + s.tw));
      ctx.fillStyle = `rgba(230, 220, 255, ${twinkle})`;
      ctx.beginPath();
      ctx.arc(s.x, sy, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Soft cosmic haze bands
    ctx.fillStyle = "rgba(160, 100, 255, 0.04)";
    for (let i = 0; i < 5; i++) {
      const yy = ((this.time * 18 + i * 110) % (this.height + 40)) - 20;
      ctx.fillRect(0, yy, this.width, 22);
    }
  }

  private sceneryFill(alpha: number) {
    switch (this.theme.id) {
      case "planetary":
        return `rgba(40, 55, 90, ${alpha})`;
      case "antarctica":
        return `rgba(50, 80, 110, ${alpha})`;
      default:
        return `rgba(40, 18, 12, ${alpha})`;
    }
  }

  private drawScenery() {
    const ctx = this.ctx;
    const camBottom = this.cameraY - this.height;
    const camTop = this.cameraY + this.height;

    for (const s of this.scenery) {
      const period = 1600;
      let y = s.y;
      while (y < camBottom) y += period;
      while (y > camTop) y -= period;
      const sy = this.worldToScreen(y);
      if (sy < -140 || sy > this.height + 140) continue;
      const alpha = 0.15 + s.shade * 0.25;
      ctx.fillStyle = this.sceneryFill(alpha);
      ctx.beginPath();
      if (this.theme.id === "planetary") {
        ctx.ellipse(
          s.x + s.w * 0.5,
          sy - s.h * 0.3,
          s.w * 0.7,
          s.h * 0.35,
          0,
          0,
          Math.PI * 2,
        );
      } else {
        ctx.moveTo(s.x, sy);
        ctx.lineTo(s.x + s.w * 0.5, sy - s.h);
        ctx.lineTo(s.x + s.w, sy);
        ctx.closePath();
      }
      ctx.fill();
    }
  }

  private drawObstacles() {
    const ctx = this.ctx;
    for (const o of this.obstacles) {
      const rect = this.obstacleRect(o);
      const top = this.worldToScreen(rect.y + rect.h);
      if (top < -50 || top > this.height + 50) continue;

      // Warning ring for fresh obstacles
      if (o.warn > 0.15) {
        ctx.strokeStyle = `rgba(255,220,120,${o.warn * 0.55})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(rect.x - 4, top - 4, rect.w + 8, rect.h + 8);
        ctx.setLineDash([]);
      }

      ctx.fillStyle = this.theme.platform;
      ctx.strokeStyle = this.theme.platformEdge;
      ctx.lineWidth = 2;

      ctx.save();
      if (o.kind === "asteroid" || o.kind === "ember") {
        ctx.translate(rect.x + rect.w / 2, top + rect.h / 2);
        ctx.rotate(o.spin);
        ctx.translate(-(rect.x + rect.w / 2), -(top + rect.h / 2));
      }

      if (o.kind === "spike" || o.kind === "icicle") {
        ctx.beginPath();
        ctx.moveTo(rect.x, top + rect.h);
        ctx.lineTo(rect.x + rect.w * 0.5, top);
        ctx.lineTo(rect.x + rect.w, top + rect.h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle =
          o.kind === "icicle" ? "rgba(200,240,255,0.35)" : "rgba(255,100,40,0.3)";
        ctx.beginPath();
        ctx.moveTo(rect.x + rect.w * 0.25, top + rect.h * 0.7);
        ctx.lineTo(rect.x + rect.w * 0.5, top + 6);
        ctx.lineTo(rect.x + rect.w * 0.75, top + rect.h * 0.7);
        ctx.fill();
      } else if (o.kind === "asteroid" || o.kind === "ember" || o.kind === "rock") {
        ctx.beginPath();
        ctx.moveTo(rect.x, top + rect.h * 0.7);
        ctx.lineTo(rect.x + rect.w * 0.2, top + 2);
        ctx.lineTo(rect.x + rect.w * 0.55, top - 5);
        ctx.lineTo(rect.x + rect.w * 0.9, top + 6);
        ctx.lineTo(rect.x + rect.w, top + rect.h * 0.75);
        ctx.lineTo(rect.x + rect.w * 0.6, top + rect.h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        if (o.kind === "ember") {
          ctx.fillStyle = "rgba(255,120,40,0.45)";
          ctx.beginPath();
          ctx.arc(rect.x + rect.w * 0.45, top + rect.h * 0.4, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (o.kind === "crystal") {
        ctx.fillStyle = "#3d5a80";
        ctx.beginPath();
        ctx.moveTo(rect.x + rect.w * 0.5, top - 4);
        ctx.lineTo(rect.x + rect.w, top + rect.h * 0.45);
        ctx.lineTo(rect.x + rect.w * 0.7, top + rect.h);
        ctx.lineTo(rect.x + rect.w * 0.3, top + rect.h);
        ctx.lineTo(rect.x, top + rect.h * 0.45);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#8affc8";
        ctx.stroke();
      } else if (o.kind === "iceberg") {
        ctx.fillStyle = "#6a9bb8";
        ctx.beginPath();
        ctx.moveTo(rect.x, top + rect.h);
        ctx.lineTo(rect.x + 8, top + 4);
        ctx.lineTo(rect.x + rect.w * 0.45, top);
        ctx.lineTo(rect.x + rect.w - 6, top + 8);
        ctx.lineTo(rect.x + rect.w, top + rect.h);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#d8f0ff";
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.roundRect(rect.x, top, rect.w, rect.h, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = `${this.theme.accent}33`;
        ctx.fillRect(rect.x + 4, top + 3, rect.w - 8, 3);
      }

      ctx.restore();
    }
  }

  private drawPickups() {
    const ctx = this.ctx;
    for (const p of this.pickups) {
      const bob = Math.sin(p.bob) * 6;
      const sy = this.worldToScreen(p.y + bob);
      if (sy < -40 || sy > this.height + 40) continue;

      const glow = ctx.createRadialGradient(p.x, sy, 2, p.x, sy, p.r * 2.2);
      glow.addColorStop(0, "rgba(255,230,140,0.8)");
      glow.addColorStop(1, "rgba(255,180,60,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, sy, p.r * 2.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffd76a";
      ctx.strokeStyle = "#fff6c8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, sy, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Mini shield glyph
      ctx.fillStyle = "#2a1a08";
      ctx.beginPath();
      ctx.moveTo(p.x, sy - 7);
      ctx.lineTo(p.x + 7, sy - 2);
      ctx.lineTo(p.x + 5, sy + 6);
      ctx.lineTo(p.x, sy + 9);
      ctx.lineTo(p.x - 5, sy + 6);
      ctx.lineTo(p.x - 7, sy - 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawEnemies() {
    const ctx = this.ctx;
    for (const e of this.enemies) {
      const sy = this.worldToScreen(e.y + e.h);
      if (sy < -80 || sy > this.height + 80) continue;

      ctx.fillStyle = `${this.theme.accent}22`;
      ctx.beginPath();
      ctx.ellipse(e.x + e.w / 2, sy - e.h / 2, e.w * 0.7, e.h * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();

      if (e.kind === "dragon") this.drawDragon(e, sy);
      else if (e.kind === "alien") this.drawAlien(e, sy);
      else this.drawBear(e, sy);
    }
  }

  private drawDragon(e: Enemy, sy: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(e.x + e.w / 2, sy - e.h / 2);
    ctx.scale(e.facing * 0.68, 0.68);
    const flap = Math.sin(e.age * 8) * 10;

    // Large bat wing (back)
    ctx.fillStyle = "#4a1018";
    ctx.beginPath();
    ctx.moveTo(-8, -6);
    ctx.lineTo(-52, -34 - flap);
    ctx.lineTo(-58, -8);
    ctx.lineTo(-40, 2);
    ctx.lineTo(-10, 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#2a080c";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-8, -4);
    ctx.lineTo(-50, -30 - flap);
    ctx.moveTo(-8, 0);
    ctx.lineTo(-54, -10);
    ctx.stroke();

    // Tail
    ctx.strokeStyle = "#9a2a1a";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-28, 6);
    ctx.quadraticCurveTo(-48, 18 + Math.sin(e.age * 3) * 4, -62, 4);
    ctx.stroke();
    ctx.fillStyle = "#ff6a2a";
    ctx.beginPath();
    ctx.moveTo(-62, 4);
    ctx.lineTo(-72, -2);
    ctx.lineTo(-68, 10);
    ctx.fill();

    // Body
    const g = ctx.createLinearGradient(-24, -18, 30, 16);
    g.addColorStop(0, "#e24a2e");
    g.addColorStop(0.5, "#b02818");
    g.addColorStop(1, "#6a120c");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(-4, 2, 30, 16, -0.15, 0, Math.PI * 2);
    ctx.fill();

    // Belly plates
    ctx.strokeStyle = "rgba(255,200,120,0.35)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(-2 + i * 5, 6, 4, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }

    // Neck + head
    ctx.fillStyle = "#d43820";
    ctx.beginPath();
    ctx.ellipse(22, -6, 12, 9, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(36, -12, 14, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    // Jaw
    ctx.fillStyle = "#a02018";
    ctx.beginPath();
    ctx.ellipse(42, -6, 10, 5, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Horns
    ctx.fillStyle = "#f0d080";
    ctx.beginPath();
    ctx.moveTo(30, -20);
    ctx.lineTo(28, -32);
    ctx.lineTo(34, -18);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(38, -20);
    ctx.lineTo(42, -30);
    ctx.lineTo(44, -16);
    ctx.fill();

    // Eye
    ctx.fillStyle = "#ffe066";
    ctx.beginPath();
    ctx.arc(40, -14, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a0800";
    ctx.beginPath();
    ctx.arc(41, -14, 1.4, 0, Math.PI * 2);
    ctx.fill();

    // Front wing
    ctx.fillStyle = "rgba(90, 20, 30, 0.85)";
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(18, -28 - flap * 0.7);
    ctx.lineTo(28, -6);
    ctx.lineTo(8, 6);
    ctx.closePath();
    ctx.fill();

    if (e.state === "patrol" && e.stateT > 1.2) {
      ctx.fillStyle = "rgba(255,120,40,0.55)";
      ctx.beginPath();
      ctx.moveTo(48, -8);
      ctx.lineTo(68, -4);
      ctx.lineTo(48, 0);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawAlien(e: Enemy, sy: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(e.x + e.w / 2, sy - e.h / 2);
    ctx.scale(0.72, 0.72);
    const pulse = Math.sin(e.age * 6) * 3;

    ctx.fillStyle = "rgba(180, 140, 255, 0.3)";
    ctx.beginPath();
    ctx.arc(0, 0, 30 + pulse, 0, Math.PI * 2);
    ctx.fill();

    // Torso
    ctx.fillStyle = "#2a1848";
    ctx.beginPath();
    ctx.ellipse(0, 8, 13, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    // Big head
    const hg = ctx.createRadialGradient(-4, -14, 2, 0, -12, 18);
    hg.addColorStop(0, "#d8c4ff");
    hg.addColorStop(1, "#7c5cbf");
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.ellipse(0, -12, 18, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    // Huge eyes
    ctx.fillStyle = "#0a0614";
    ctx.beginPath();
    ctx.ellipse(-7, -13, 6, 9, -0.15, 0, Math.PI * 2);
    ctx.ellipse(7, -13, 6, 9, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#7cffb0";
    ctx.beginPath();
    ctx.arc(-5, -12, 1.8, 0, Math.PI * 2);
    ctx.arc(9, -12, 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Thin limbs
    ctx.strokeStyle = "#b388ff";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-10, 14);
    ctx.lineTo(-18, 28);
    ctx.moveTo(10, 14);
    ctx.lineTo(18, 28);
    ctx.moveTo(-8, 0);
    ctx.lineTo(-20, 10);
    ctx.moveTo(8, 0);
    ctx.lineTo(20, 10);
    ctx.stroke();

    ctx.restore();
  }

  private drawBear(e: Enemy, sy: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(e.x + e.w / 2, sy - e.h / 2);
    ctx.scale(e.facing * 0.66, 0.66);
    const plod = Math.sin(e.age * 6) * 3;

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(0, 26, 28, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hind legs (thick)
    ctx.fillStyle = "#dce8f0";
    ctx.beginPath();
    ctx.roundRect(-28, 8 + plod, 14, 20, 4);
    ctx.roundRect(-12, 8 - plod, 14, 20, 4);
    ctx.fill();

    // Forelegs
    ctx.beginPath();
    ctx.roundRect(8, 10 - plod, 13, 18, 4);
    ctx.roundRect(22, 10 + plod, 13, 18, 4);
    ctx.fill();

    // Massive body
    const body = ctx.createLinearGradient(0, -16, 0, 20);
    body.addColorStop(0, "#f4f8fc");
    body.addColorStop(1, "#c5d4e0");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 2, 32, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    // Shoulder hump
    ctx.beginPath();
    ctx.ellipse(10, -8, 16, 12, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.fillStyle = "#eef4f8";
    ctx.beginPath();
    ctx.ellipse(30, -6, 16, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Round ears
    ctx.beginPath();
    ctx.arc(22, -18, 6, 0, Math.PI * 2);
    ctx.arc(36, -18, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#b8c8d4";
    ctx.beginPath();
    ctx.arc(22, -18, 3, 0, Math.PI * 2);
    ctx.arc(36, -18, 3, 0, Math.PI * 2);
    ctx.fill();

    // Snout
    ctx.fillStyle = "#dde8f0";
    ctx.beginPath();
    ctx.ellipse(42, -2, 9, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a2430";
    ctx.beginPath();
    ctx.ellipse(46, -3, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eye
    ctx.fillStyle = "#15202a";
    ctx.beginPath();
    ctx.arc(34, -8, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Charge telegraph
    if (e.state === "patrol" && e.stateT > 0.85) {
      ctx.fillStyle = "rgba(120,200,255,0.4)";
      ctx.fillRect(48, -6, 22, 5);
    }

    ctx.restore();
  }

  private drawProjectiles() {
    const ctx = this.ctx;
    for (const p of this.projectiles) {
      const sy = this.worldToScreen(p.y + p.h / 2);
      if (sy < -40 || sy > this.height + 40) continue;
      const cx = p.x + p.w / 2;

      if (p.kind === "fireball" || p.kind === "fall_fire") {
        const r = p.kind === "fall_fire" ? 16 : 14;
        const g = ctx.createRadialGradient(cx, sy, 1, cx, sy, r);
        g.addColorStop(0, "#fff2a8");
        g.addColorStop(0.4, "#ff7a20");
        g.addColorStop(1, "rgba(255,40,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, sy, r, 0, Math.PI * 2);
        ctx.fill();
        if (p.kind === "fall_fire") {
          ctx.fillStyle = "rgba(255,160,40,0.55)";
          ctx.beginPath();
          ctx.moveTo(cx - 4, sy - 10);
          ctx.lineTo(cx, sy - 26);
          ctx.lineTo(cx + 4, sy - 10);
          ctx.fill();
        }
      } else if (p.kind === "fall_asteroid") {
        ctx.save();
        ctx.translate(cx, sy);
        ctx.rotate(p.spin ?? 0);
        ctx.fillStyle = "#5a4a6a";
        ctx.strokeStyle = "#c4b5fd";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-p.w * 0.45, 0);
        ctx.lineTo(-p.w * 0.2, -p.h * 0.4);
        ctx.lineTo(p.w * 0.25, -p.h * 0.35);
        ctx.lineTo(p.w * 0.45, 0.05 * p.h);
        ctx.lineTo(p.w * 0.15, p.h * 0.4);
        ctx.lineTo(-p.w * 0.3, p.h * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(180,140,255,0.35)";
        ctx.beginPath();
        ctx.arc(-2, -2, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (p.kind === "fall_ice") {
        ctx.fillStyle = "rgba(210, 240, 255, 0.9)";
        ctx.strokeStyle = "rgba(140, 200, 255, 0.7)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, sy - p.h * 0.55);
        ctx.lineTo(cx + p.w * 0.45, sy + p.h * 0.45);
        ctx.lineTo(cx - p.w * 0.45, sy + p.h * 0.45);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (p.kind === "plasma") {
        ctx.fillStyle = "#8affc8";
        ctx.shadowColor = "#6dffb0";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(cx, sy, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = "#d8f0ff";
        ctx.beginPath();
        ctx.moveTo(cx, sy - 7);
        ctx.lineTo(cx + 6, sy + 5);
        ctx.lineTo(cx - 6, sy + 5);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  private drawPlayer() {
    const ctx = this.ctx;
    const p = this.player;
    const sy = this.worldToScreen(p.y);
    const blink = p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0;
    if (blink) return;

    ctx.save();
    ctx.translate(p.x + PLAYER.width / 2, sy);
    drawCharacter(ctx, {
      look: getCharacter(this.characterId),
      facing: p.facing,
      bob: p.bob,
      vxNorm: clamp(p.vx / PLAYER.maxSpeedX, -1, 1),
      boosting: p.boostT > 0,
      accent: this.theme.accent,
    });
    ctx.restore();
  }

  private drawDanger() {
    if (this.theme.id === "planetary") {
      this.drawGaseousDanger();
      return;
    }

    const ctx = this.ctx;
    const surface =
      this.dangerY + Math.sin(this.time * DANGER.waveFreq) * DANGER.waveAmp;
    const sy = this.worldToScreen(surface);
    const steps = Math.max(22, Math.floor(this.width / 28));
    const deep = this.theme.id === "antarctica" ? "#061520" : "#2a0500";
    const rim =
      this.theme.id === "antarctica"
        ? "rgba(200, 235, 255, 0.6)"
        : "rgba(255, 200, 80, 0.55)";
    const glowTop =
      this.theme.id === "antarctica"
        ? "rgba(140, 210, 255, 0)"
        : "rgba(255, 80, 0, 0)";
    const glowBot =
      this.theme.id === "antarctica"
        ? "rgba(140, 210, 255, 0.24)"
        : "rgba(255, 60, 0, 0.28)";

    if (sy < this.height) {
      const g = ctx.createLinearGradient(0, sy, 0, this.height + 40);
      g.addColorStop(0, this.theme.dangerSurface);
      g.addColorStop(0.15, this.theme.dangerGlow);
      g.addColorStop(0.55, this.theme.dangerCore);
      g.addColorStop(1, deep);
      ctx.fillStyle = g;
      ctx.fillRect(0, sy, this.width, this.height - sy + 60);
    }

    ctx.beginPath();
    ctx.moveTo(0, sy + 8);
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * this.width;
      const wave =
        this.theme.id === "antarctica"
          ? Math.abs(Math.sin(this.time * 3.2 + i * 1.1)) * 12 +
            Math.sin(this.time * 1.4 + i * 0.4) * 3
          : Math.sin(this.time * 5 + i * 0.7) * 7 +
            Math.sin(this.time * 2.2 + i) * 4;
      ctx.lineTo(x, sy - wave);
    }
    ctx.lineTo(this.width, sy + 20);
    ctx.closePath();
    ctx.fillStyle = this.theme.dangerSurface;
    ctx.fill();

    ctx.strokeStyle = rim;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * this.width;
      const wave =
        this.theme.id === "antarctica"
          ? Math.abs(Math.sin(this.time * 3.2 + i * 1.1)) * 12 +
            Math.sin(this.time * 1.4 + i * 0.4) * 3
          : Math.sin(this.time * 5 + i * 0.7) * 7 +
            Math.sin(this.time * 2.2 + i) * 4;
      if (i === 0) ctx.moveTo(x, sy - wave);
      else ctx.lineTo(x, sy - wave);
    }
    ctx.stroke();

    const glow = ctx.createLinearGradient(0, sy - 100, 0, sy);
    glow.addColorStop(0, glowTop);
    glow.addColorStop(1, glowBot);
    ctx.fillStyle = glow;
    ctx.fillRect(0, sy - 100, this.width, 100);
  }

  /** Soft layered toxic nebula gas — not a hard lava line */
  private drawGaseousDanger() {
    const ctx = this.ctx;
    const surface =
      this.dangerY + Math.sin(this.time * DANGER.waveFreq) * DANGER.waveAmp;
    const sy = this.worldToScreen(surface);

    if (sy < this.height + 80) {
      const body = ctx.createLinearGradient(0, sy - 40, 0, this.height + 40);
      body.addColorStop(0, "rgba(124, 252, 176, 0.05)");
      body.addColorStop(0.15, "rgba(167, 139, 250, 0.28)");
      body.addColorStop(0.45, "rgba(91, 45, 142, 0.55)");
      body.addColorStop(1, "rgba(10, 2, 24, 0.92)");
      ctx.fillStyle = body;
      ctx.fillRect(0, sy - 40, this.width, this.height - sy + 100);
    }

    // Wispy gas blobs along the crest
    for (let i = 0; i < 8; i++) {
      const bx =
        ((i / 8) * this.width + Math.sin(this.time * 1.2 + i) * 30 + this.width) %
        this.width;
      const by = sy - 10 - Math.sin(this.time * 2 + i * 0.7) * 18;
      const br = 36 + (i % 3) * 12;
      const cloud = ctx.createRadialGradient(bx, by, 4, bx, by, br);
      cloud.addColorStop(0, "rgba(196, 181, 253, 0.45)");
      cloud.addColorStop(0.4, "rgba(124, 252, 176, 0.18)");
      cloud.addColorStop(1, "rgba(80, 40, 160, 0)");
      ctx.fillStyle = cloud;
      ctx.beginPath();
      ctx.ellipse(bx, by, br, br * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Soft crest stroke
    ctx.strokeStyle = "rgba(200, 180, 255, 0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const steps = Math.max(20, Math.floor(this.width / 30));
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * this.width;
      const wave =
        Math.sin(this.time * 1.6 + i * 0.5) * 14 +
        Math.sin(this.time * 0.7 + i * 0.2) * 8;
      if (i === 0) ctx.moveTo(x, sy - wave);
      else ctx.lineTo(x, sy - wave);
    }
    ctx.stroke();

    // Floating gas motes
    ctx.fillStyle = "rgba(180, 255, 210, 0.35)";
    for (let i = 0; i < 14; i++) {
      const bx = ((this.time * 28 + i * 61) % (this.width + 40)) - 20;
      const by = sy - 8 - Math.sin(this.time * 2.4 + i) * 16 - (i % 5) * 6;
      ctx.globalAlpha = 0.25 + (i % 3) * 0.1;
      ctx.beginPath();
      ctx.arc(bx, by, 2 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const haze = ctx.createLinearGradient(0, sy - 120, 0, sy);
    haze.addColorStop(0, "rgba(140, 90, 255, 0)");
    haze.addColorStop(1, "rgba(120, 255, 180, 0.16)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, sy - 120, this.width, 120);
  }

  private drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const sy = this.worldToScreen(p.y);
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(p.x, sy, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawVignette() {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(
      this.width / 2,
      this.height * 0.45,
      this.height * 0.2,
      this.width / 2,
      this.height * 0.5,
      this.height * 0.78,
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  private drawThreatOverlay() {
    if (this.threatPulse <= 0.05) return;
    const ctx = this.ctx;
    const a = this.threatPulse * 0.22;
    const g = ctx.createLinearGradient(0, this.height, 0, this.height * 0.45);
    g.addColorStop(0, this.themeHitFlash(a / 0.35).replace(/[\d.]+\)$/, `${a})`));
    g.addColorStop(1, "rgba(0,0,0,0)");
    // Simpler reliable overlay:
    ctx.fillStyle =
      this.theme.id === "planetary"
        ? `rgba(140, 80, 220, ${a})`
        : this.theme.id === "antarctica"
          ? `rgba(100, 180, 255, ${a})`
          : `rgba(255, 60, 20, ${a})`;
    ctx.fillRect(0, this.height * 0.55, this.width, this.height * 0.45);
  }

  private drawAlertBanner() {
    if (this.alertBanner <= 0 || !this.bannerText) return;
    const ctx = this.ctx;
    const a = clamp(this.alertBanner, 0, 1);

    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 64, this.width, 34);
    ctx.fillStyle = this.theme.accent;
    ctx.font = "700 13px Orbitron, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(this.bannerText, this.width / 2, 86);
    ctx.restore();
  }
}
