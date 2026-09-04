/**
 * ClimbSim — the deterministic, headless climb simulation.
 *
 * Ported line-for-line from the old imperative update loop in
 * src/game/engine/Game.ts so the run FEELS identical, with one contract:
 * the same (seed, options, input sequence) produces bit-identical state in
 * every JavaScript engine. That lets the server re-run a player's run from
 * the recorded input log and refuse to sign a voucher for a run that
 * doesn't genuinely survive the rarity gate — playing is the only way.
 *
 * Determinism rules (enforced everywhere in this file):
 *   - fixed timestep: every step is exactly SIM_TICK (1/60) — no wall clock
 *   - randomness: seeded mulberry32 (this.rng), never Math.random
 *   - trig: simSin (pure +,* polynomial), never Math.sin
 *   - lerps: expLerp(base) — precomputed 1 - base**(1/60), never Math.pow
 *   - hypot: simHypot (sqrt form), never Math.hypot
 *
 * Everything cosmetic (particles, stars, scenery, shake, flashes, banners,
 * audio) stays in the client-side Game shell, driven by the SimEvents each
 * step returns. The shell may use Math.random freely — it never feeds back
 * into this sim.
 */

import {
  DANGER,
  DIFFICULTIES,
  ENEMIES,
  FALLING,
  OBSTACLES,
  PICKUPS,
  PLAYER,
  SINK,
  THEME_META,
  TSUNAMI,
  WORLD,
  enemySmartMul,
  enemySpeedMul,
  runIntensity,
  sinkProgress,
} from "../constants";
import { aabb, clamp, lerp } from "../math";
import { VANILLA_MODIFIERS, type RunModifiers } from "../traits";
import type {
  DifficultyId,
  Enemy,
  EnemyKind,
  GamePhase,
  HudSnapshot,
  Obstacle,
  ObstacleKind,
  Pickup,
  Projectile,
  Rect,
  ThemeId,
} from "../types";
import { createRng, randRange, type Rng } from "./rng";
import { SIM_TICK, expLerp, simHypot, simSin } from "./simMath";

export type PlayerState = {
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

/** Inputs consumed by one 60Hz tick. */
export type TickInputs = {
  /** -1..1 (analog deflection allowed); 0 = no steering */
  axis: number;
  /** Boost pressed-or-held during this tick (matches consumeBoost semantics). */
  boost: boolean;
  /** Freeze pressed this tick (edge). */
  freeze: boolean;
  /** Tsunami pressed this tick (edge). */
  tsunami: boolean;
};

/** Cosmetic/audio signals emitted by a tick — never gameplay state. */
export type SimEvent =
  | { kind: "boost" }
  | { kind: "freeze" }
  | { kind: "tsunami"; killed: { x: number; y: number }[] }
  | { kind: "hit" }
  | { kind: "gameOver" }
  | { kind: "nearMiss" }
  | { kind: "enemyAppear"; enemy: EnemyKind }
  | { kind: "enemyShot"; x: number; y: number }
  | { kind: "projectileHit"; x: number; y: number }
  | { kind: "shieldPickup"; healed: boolean; x: number; y: number }
  | { kind: "sinkStage"; stage: number; maxStage: boolean };

export type ClimbSimOptions = {
  /** 32-bit session seed — same seed + same inputs = same run, everywhere. */
  seed: number;
  /** Playfield width in css px. Locked for the whole run (affects spawns,
   *  walls, AI bounds). Validated to an integer server-side. */
  width: number;
  /** View height in css px (camera / culling only). Also replayed exactly. */
  height?: number;
  themeId?: ThemeId;
  difficultyId?: DifficultyId;
  modifiers?: RunModifiers;
};

const NO_EVENTS: SimEvent[] = [];

/** Mirrors the `name` on each ThemePalette (kept pure here — no palette import). */
const SIM_THEME_NAMES: Record<ThemeId, string> = {
  volcanic: "Volcanic Eruption",
  planetary: "Planetary",
  antarctica: "Antarctica",
};

export class ClimbSim {
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  readonly themeId: ThemeId;
  readonly difficultyId: DifficultyId;
  readonly modifiers: RunModifiers;

  private rng: Rng;
  private events: SimEvent[] = [];

  phase: GamePhase = "playing";
  shields: number = PLAYER.maxShields;
  freezeCharges = 0;
  freezeT = 0;
  tsunamiCharges = 0;
  time = 0;
  tick = 0;
  cameraY = 0;
  dangerY = 0;
  private nextObstacleY = 0;
  private nextPickupY = 0;
  private nextEnemyAt = 0;
  /** Until this sim time, at most one enemy may be on the field (post-Tsunami). */
  private soloEnemyUntil = 0;
  private nextFallAt = 0;
  private dangerReliefT = 0;
  private obstacleId = 0;
  private enemyId = 0;
  private pickupId = 0;
  private projId = 0;
  threatPulse = 0;
  private sinkStage = 0;
  private sinkEventId = 0;
  /** Next tick: apply a short on-screen breath after a new pull stage */
  private sinkReliefPending = false;
  /** Brief window after a new stage where undertow is paused */
  private sinkReliefT = 0;
  private nearMissCd = 0;
  nearMissCount = 0;
  hitsTaken = 0;

  player: PlayerState = {
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

  obstacles: Obstacle[] = [];
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  pickups: Pickup[] = [];

  constructor(opts: ClimbSimOptions) {
    this.seed = opts.seed >>> 0;
    this.width = opts.width;
    this.height = opts.height ?? WORLD.viewHeight;
    this.themeId = opts.themeId ?? "volcanic";
    this.difficultyId = opts.difficultyId ?? "medium";
    this.modifiers = opts.modifiers ?? VANILLA_MODIFIERS;
    this.rng = createRng(this.seed);
    this.init();
  }

  private init() {
    const diff = DIFFICULTIES[this.difficultyId];
    this.shields = this.modifiers.maxShields;
    this.freezeCharges = this.modifiers.freezeCharges;
    this.tsunamiCharges = this.modifiers.tsunamiCharges;

    this.player = {
      x: this.width / 2 - PLAYER.width / 2,
      y: 120,
      vx: 0,
      vy: diff.climbSpeed * this.modifiers.speedMul,
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
    this.soloEnemyUntil = 0;
    this.nextFallAt = FALLING.firstDelay;

    this.ensureObstacles();
    this.ensurePickups();
  }

  private enemyKind(): EnemyKind {
    if (this.themeId === "planetary") return "alien";
    if (this.themeId === "antarctica") return "bear";
    return "dragon";
  }

  /** One fixed 1/60s tick. Returns the cosmetic events it produced. */
  step(inputs: TickInputs): SimEvent[] {
    if (this.phase !== "playing") return NO_EVENTS;
    this.events = [];
    const dt = SIM_TICK;
    const diff = DIFFICULTIES[this.difficultyId];

    this.tick += 1;
    this.time += dt;
    this.player.bob += dt * 10;
    this.player.invuln = Math.max(0, this.player.invuln - dt);
    this.player.boostCd = Math.max(0, this.player.boostCd - dt);
    this.player.boostT = Math.max(0, this.player.boostT - dt);
    this.dangerReliefT = Math.max(0, this.dangerReliefT - dt);
    this.sinkReliefT = Math.max(0, this.sinkReliefT - dt);
    this.nearMissCd = Math.max(0, this.nearMissCd - dt);

    if (inputs.boost && this.player.boostCd <= 0) {
      this.player.boostT = PLAYER.boostDuration;
      this.player.boostCd = PLAYER.boostCooldown;
      this.events.push({ kind: "boost" });
    }

    if (
      inputs.freeze &&
      this.freezeCharges > 0 &&
      this.freezeT <= 0 &&
      this.modifiers.freezeDuration > 0
    ) {
      this.freezeCharges -= 1;
      this.freezeT = this.modifiers.freezeDuration;
      this.events.push({ kind: "freeze" });
    }

    if (inputs.tsunami && this.tsunamiCharges > 0) {
      this.tsunamiCharges -= 1;
      this.triggerTsunami();
    }

    this.freezeT = Math.max(0, this.freezeT - dt);
    const frozen = this.freezeT > 0;

    const axis = inputs.axis;
    const accelX = PLAYER.accelX * this.modifiers.speedMul;
    const maxSpeedX = PLAYER.maxSpeedX * this.modifiers.speedMul;
    if (axis !== 0) {
      this.player.vx += axis * accelX * dt;
      this.player.facing = axis < 0 ? -1 : 1;
    } else {
      const fr = PLAYER.frictionX * dt;
      if (Math.abs(this.player.vx) <= fr) this.player.vx = 0;
      else this.player.vx -= Math.sign(this.player.vx) * fr;
    }
    this.player.vx = clamp(this.player.vx, -maxSpeedX, maxSpeedX);

    // Pull schedule: 28s → ×1, 65s → ×2, 110s → ×3, then pulse
    const progress = sinkProgress(this.time);
    if (progress.eventId > this.sinkEventId) {
      this.sinkEventId = progress.eventId;
      this.sinkStage = progress.stage;
      this.sinkReliefPending = true;
      this.sinkReliefT = 1.1;
      this.events.push({
        kind: "sinkStage",
        stage: this.sinkStage,
        maxStage: this.sinkStage >= SINK.maxStage,
      });
    }

    // Undertow pulls until the hot zone; the rise itself can still finish the catch
    const proxNow = this.computeDangerProximity();
    const sinkEngaged =
      !frozen &&
      this.sinkStage > 0 &&
      this.sinkReliefT <= 0 &&
      proxNow < SINK.maxProximity;

    const sinkPull = sinkEngaged
      ? this.sinkStage * SINK.pullPerStage[this.difficultyId]
      : 0;
    const pulse = 1 + simSin(this.time * 3.1) * 0.035;
    const boostMul =
      this.player.boostT > 0
        ? 1 +
          (PLAYER.boostImpulse / Math.max(1, diff.climbSpeed)) *
            (this.player.boostT / PLAYER.boostDuration)
        : 1;
    // The rarity trait scales BOTH axes of movement — horizontal steering
    // above and the climb itself here — so a Legendary visibly out-climbs a
    // Common instead of just side-dodging faster. P2M always replays with
    // speedMul 1 (vanilla), so replay attestation is unaffected.
    const climbSpeed = diff.climbSpeed * this.modifiers.speedMul;
    this.player.vy = climbSpeed * pulse * boostMul - sinkPull;
    this.player.x += this.player.vx * dt;
    this.player.y += this.player.vy * dt;

    const minX = WORLD.wallPadding;
    const maxX = this.width - WORLD.wallPadding - PLAYER.width;
    this.player.x = clamp(this.player.x, minX, maxX);

    const dangerBonus = sinkEngaged
      ? this.sinkStage * SINK.dangerBonusPerStage[this.difficultyId]
      : 0;
    if (!frozen) {
      const dangerSpeed =
        diff.dangerBaseSpeed + this.time * diff.dangerAccel + dangerBonus;
      this.dangerY += dangerSpeed * dt;

      const maxGap = Math.max(
        SINK.minGap,
        DANGER.maxGap - this.sinkStage * SINK.gapShrinkPerStage,
      );
      const extraGap = this.player.y - this.dangerY - maxGap;
      if (this.dangerReliefT <= 0 && extraGap > 0) {
        this.dangerY += Math.min(extraGap, DANGER.catchUpSpeed * dt);
      }
    } else {
      this.nextEnemyAt += dt;
      this.nextFallAt += dt;
    }

    // New pull stage: a short on-screen breath, then the hunt resumes
    if (this.sinkReliefPending) {
      this.setDangerProximity(SINK.stageReliefProximity);
      this.sinkReliefPending = false;
    }

    const gap = this.player.y - this.dangerY;
    this.threatPulse = clamp(1 - gap / DANGER.warnGap, 0, 1);

    this.ensureObstacles();
    this.ensurePickups();
    if (!frozen) {
      this.spawnEnemies();
      this.spawnFallingHazards();
    }
    this.updateObstacles(diff.obstacleSpeedMul);
    if (!frozen) {
      this.updateEnemies();
      this.updateProjectiles();
    }
    this.updatePickups();
    this.resolveObstacleHits();
    this.resolveEnemyHits();
    this.resolveProjectileHits();
    this.resolvePickupCollect();
    this.resolveDangerHit();
    this.detectNearMiss();

    const targetCam = this.player.y + this.height * 0.22;
    this.cameraY = lerp(this.cameraY, targetCam, expLerp(0.001));

    return this.events;
  }

  // --- Spawning ------------------------------------------------------------

  private themeObstacleKinds(): ObstacleKind[] {
    switch (this.themeId) {
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
    const fieldW = this.width;
    const kinds = this.themeObstacleKinds();

    while (this.nextObstacleY < top) {
      const kind = kinds[Math.floor(this.rng.next() * kinds.length)]!;
      const tall = kind === "spike" || kind === "icicle" || kind === "ember";
      const w = tall
        ? randRange(this.rng, 36, 70)
        : randRange(this.rng, OBSTACLES.minWidth, OBSTACLES.maxWidth);
      const h = tall
        ? randRange(this.rng, 34, 58)
        : OBSTACLES.height + randRange(this.rng, -2, 14);

      const sideBias = this.rng.next();
      let x: number;
      if (sideBias < 0.3) x = WORLD.wallPadding + randRange(this.rng, 0, 50);
      else if (sideBias > 0.7)
        x = fieldW - WORLD.wallPadding - w - randRange(this.rng, 0, 50);
      else
        x = randRange(this.rng, WORLD.wallPadding, fieldW - WORLD.wallPadding - w);

      this.obstacles.push({
        id: ++this.obstacleId,
        kind,
        x,
        y: this.nextObstacleY,
        w,
        h,
        drift: randRange(this.rng, -28, 28) * diff.obstacleSpeedMul,
        bob: this.rng.next() * Math.PI * 2,
        bobSpeed: randRange(this.rng, 1.2, 2.8),
        spin: randRange(this.rng, -1.2, 1.2),
        warn: 1,
      });

      this.nextObstacleY += diff.obstacleSpacing * randRange(this.rng, 0.8, 1.25);
    }

    const cullY = this.cameraY - this.height - OBSTACLES.cullBelow;
    this.obstacles = this.obstacles.filter((o) => o.y + o.h > cullY);
  }

  private ensurePickups() {
    const top = this.player.y + OBSTACLES.spawnAhead;
    const fieldW = this.width;
    const intensity = runIntensity(this.time);
    // Scarcer shields as the run goes on
    const spacingMul = 1 + intensity * 1.35;
    while (this.nextPickupY < top) {
      this.pickups.push({
        id: ++this.pickupId,
        x: randRange(this.rng, WORLD.wallPadding + 30, fieldW - WORLD.wallPadding - 30),
        y: this.nextPickupY,
        r: PICKUPS.radius,
        bob: this.rng.next() * Math.PI * 2,
        kind: "shield",
      });
      this.nextPickupY += PICKUPS.spacing * spacingMul * randRange(this.rng, 0.85, 1.25);
    }
    const cullY = this.cameraY - this.height - 400;
    this.pickups = this.pickups.filter((p) => p.y > cullY);
  }

  private spawnEnemies() {
    if (this.player.y < ENEMIES.firstHeight) return;
    if (this.time < this.nextEnemyAt) return;

    const intensity = runIntensity(this.time);
    // Post-Tsunami solo window: one enemy at a time until it expires, so the
    // wave buys a real breather instead of a 3-second gap before the pair
    // re-forms.
    const maxAlive =
      this.time < this.soloEnemyUntil
        ? 1
        : 1 + Math.floor(intensity * 1.5); // 1 → 2
    if (this.enemies.length >= maxAlive) {
      this.nextEnemyAt = this.time + 1.5;
      return;
    }

    const diff = DIFFICULTIES[this.difficultyId];
    const kind = this.enemyKind();
    const fromLeft = this.rng.next() > 0.5;
    const fieldW = this.width;
    const y = this.player.y + randRange(this.rng, 160, 300);

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
      turnT: randRange(this.rng, 1.1, 2.2),
      wanderX: randRange(this.rng, WORLD.wallPadding + 40, fieldW - WORLD.wallPadding - w - 40),
      age: 0,
      state: "enter",
      stateT: 0,
    });

    this.events.push({ kind: "enemyAppear", enemy: kind });
    const intervalMul = Math.max(0.4, 1 - intensity * 0.55);
    this.nextEnemyAt =
      this.time +
      ENEMIES.baseInterval *
        diff.enemySpawnMul *
        intervalMul *
        randRange(this.rng, 0.75, 1.1);
  }

  private updateObstacles(speedMul: number) {
    const dt = SIM_TICK;
    const fieldW = this.width;
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

  private updateEnemies() {
    const dt = SIM_TICK;
    const pcx = this.player.x + PLAYER.width / 2;
    const pcy = this.player.y + PLAYER.height * 0.5;
    const fieldW = this.width;

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
    else e.patrolDir = this.rng.next() > 0.5 ? 1 : -1;

    // Easy mostly wanders; Hard often cuts toward the player
    const chaseChance = clamp(0.12 + smart * 0.38, 0.12, 0.85);
    if (this.rng.next() < chaseChance) {
      e.wanderX = clamp(playerCx - e.w / 2, pad, fieldW - pad - e.w);
    } else {
      e.wanderX = randRange(this.rng, pad, fieldW - pad - e.w);
    }
    e.facing = e.patrolDir;
    // Dumb = slower turns / longer lanes; smart = retargets faster
    e.turnT = randRange(this.rng, 1.4, 3.2) / Math.max(0.45, smart * 0.9);
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
      e.x = lerp(e.x, e.wanderX, expLerp(0.018 * smart * spd));
      e.y = lerp(e.y, pcy + 120, expLerp(0.022 * smart * spd));
      e.facing = e.patrolDir;
      if (e.stateT > 1.8 / Math.max(0.5, smart)) {
        e.state = "patrol";
        e.stateT = 0;
        e.turnT = randRange(this.rng, 1.0, 2.0);
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
        (42 + smart * 16) * spd * (0.85 + Math.abs(simSin(e.age * 0.45)) * 0.2);
      e.x += e.patrolDir * speed * dt;
      e.x = lerp(e.x, e.wanderX, expLerp(0.035 * spd));
      e.x = clamp(e.x, pad, fieldW - pad - e.w);
      e.facing = e.patrolDir;

      const hoverY = pcy + (130 - smart * 12) + simSin(e.age * 1.0 + e.id) * 12;
      e.y = lerp(e.y, hoverY, expLerp(0.035));

      // Easy attacks rarely; Hard attacks often
      if (e.stateT > (3.4 - smart * 0.7) / Math.max(0.55, smart)) {
        e.state = "attack";
        e.stateT = 0;
        // Easy: weak aim; Hard: locks onto player
        const aimBias = smart < 0.7 ? randRange(this.rng, -120, 120) : 0;
        e.facing = (Math.sign(pcx + aimBias - (e.x + e.w / 2)) ||
          e.patrolDir) as 1 | -1;
        const ecx = e.x + e.w / 2;
        const ecy = e.y + e.h * 0.4;
        const dx = pcx + aimBias - ecx;
        const dy = pcy - ecy;
        const len = simHypot(dx, dy) || 1;
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
        if (smart > 1.35 && this.rng.next() > 0.4) {
          this.projectiles.push({
            id: ++this.projId,
            x: ecx - 7,
            y: ecy - 7,
            w: 12,
            h: 12,
            vx: (dx / len) * shotSpeed * 0.85 + randRange(this.rng, -30, 30),
            vy: (dy / len) * shotSpeed * 0.85,
            life: 2.4,
            kind: "fireball",
          });
        }
        this.events.push({ kind: "enemyShot", x: ecx, y: ecy });
      }
    } else if (e.state === "attack") {
      e.x += e.facing * (55 * smart * spd) * dt;
      e.y -= (32 + smart * 10) * spd * dt;
      if (e.stateT > 0.65 / Math.min(smart, 1.25)) {
        e.state = "recover";
        e.stateT = 0;
        e.patrolDir = (-e.facing || -1) as 1 | -1;
        e.facing = e.patrolDir;
        e.wanderX = randRange(this.rng, pad, fieldW - pad - e.w);
      }
    } else {
      e.x = lerp(e.x, e.wanderX, expLerp(0.025 * spd));
      e.y = lerp(e.y, pcy + 140, expLerp(0.025 * spd));
      e.facing = e.patrolDir;
      if (e.stateT > 1.8 / Math.max(0.55, smart)) {
        e.state = "patrol";
        e.stateT = 0;
        e.turnT = randRange(this.rng, 0.9, 1.8);
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
      e.x = lerp(e.x, e.wanderX, expLerp(0.022 * smart * spd));
      e.y = lerp(e.y, pcy + 100, expLerp(0.028 * smart * spd));
      if (e.stateT > 1.7 / Math.max(0.5, smart)) {
        e.state = "patrol";
        e.stateT = 0;
        e.turnT = randRange(this.rng, 1.0, 2.0);
      }
    } else if (e.state === "patrol") {
      e.turnT -= dt;
      if (e.turnT <= 0 || e.x <= pad || e.x + e.w >= fieldW - pad) {
        this.retargetEnemyLane(e, fieldW, smart, pcx);
      }

      const speed = 36 * smart * spd;
      e.x += e.patrolDir * speed * dt;
      e.x = lerp(e.x, e.wanderX, expLerp(0.04 * spd));
      e.x = clamp(e.x, pad, fieldW - pad - e.w);
      e.facing = e.patrolDir;

      const hoverY = pcy + (110 - smart * 10) + simSin(e.age * 1.2 + e.id) * 9;
      e.y = lerp(e.y, hoverY, expLerp(0.04));

      if (e.stateT > (3.1 - smart * 0.6) / Math.max(0.55, smart)) {
        e.state = "attack";
        e.stateT = 0;
        e.facing = e.patrolDir;
        const ecx = e.x + e.w / 2;
        const ecy = e.y + e.h / 2;
        const bolts = smart > 1.4 ? 3 : smart > 0.9 ? 2 : 1;
        const aimSlip = smart < 0.7 ? randRange(this.rng, -80, 80) : 0;
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
        this.events.push({ kind: "enemyShot", x: ecx, y: ecy });
      }
    } else if (e.state === "attack") {
      e.x += e.patrolDir * (65 * smart * spd) * dt;
      e.y += simSin(e.age * 2.5) * 4 * dt;
      if (e.stateT > 0.7 / Math.min(smart, 1.25)) {
        e.state = "recover";
        e.stateT = 0;
        e.patrolDir = (-e.patrolDir || 1) as 1 | -1;
        e.facing = e.patrolDir;
        e.wanderX = randRange(this.rng, pad, fieldW - pad - e.w);
      }
    } else {
      e.x = lerp(e.x, e.wanderX, expLerp(0.028 * spd));
      e.y += this.player.vy * 0.28 * dt;
      e.facing = e.patrolDir;
      if (e.stateT > 1.7 / Math.max(0.55, smart)) {
        e.state = "patrol";
        e.stateT = 0;
        e.turnT = randRange(this.rng, 0.8, 1.6);
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
      e.x = lerp(e.x, e.wanderX, expLerp(0.025 * smart * spd));
      e.y = lerp(e.y, this.player.y + 18, expLerp(0.032 * smart * spd));
      e.facing = e.patrolDir;
      if (e.stateT > 1.6 / Math.max(0.5, smart)) {
        e.state = "patrol";
        e.stateT = 0;
        e.turnT = randRange(this.rng, 1.3, 2.4);
      }
    } else if (e.state === "patrol") {
      e.turnT -= dt;
      if (e.turnT <= 0 || e.x <= pad || e.x + e.w >= fieldW - pad) {
        this.retargetEnemyLane(e, fieldW, smart, pcx);
        // Easy bears pace aimlessly; Hard commits to a direction less randomly
        if (this.rng.next() < (smart < 0.7 ? 0.7 : 0.4)) {
          e.patrolDir = (-e.patrolDir || 1) as 1 | -1;
          e.facing = e.patrolDir;
        }
      }

      const speed = 22 * smart * spd;
      e.x += e.patrolDir * speed * dt;
      e.x = lerp(e.x, e.wanderX, expLerp(0.028 * spd));
      e.x = clamp(e.x, pad, fieldW - pad - e.w);
      e.facing = e.patrolDir;
      e.y = lerp(e.y, this.player.y + 14, expLerp(0.04));

      const chargeRange = 55 + smart * 35;
      if (
        e.stateT > (2.8 - smart * 0.5) / Math.max(0.55, smart) &&
        Math.abs(e.y - this.player.y) < chargeRange
      ) {
        e.state = "attack";
        e.stateT = 0;
        const aimSlip = smart < 0.7 ? randRange(this.rng, -90, 90) : 0;
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
        e.wanderX = randRange(this.rng, pad, fieldW - pad - e.w);
        e.turnT = randRange(this.rng, 1.0, 2.0);
      }
    } else {
      e.x = lerp(e.x, e.wanderX, expLerp(0.025 * spd));
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
    const fieldW = this.width;
    const speed = randRange(this.rng, FALLING.speedMin, FALLING.speedMax);
    // Spawn above the camera / player
    const y = this.player.y + this.height * 0.75 + randRange(this.rng, 40, 160);
    const x = randRange(this.rng, WORLD.wallPadding + 20, fieldW - WORLD.wallPadding - 40);

    if (this.themeId === "volcanic") {
      this.projectiles.push({
        id: ++this.projId,
        x,
        y,
        w: 18,
        h: 18,
        vx: randRange(this.rng, -30, 30),
        vy: -speed,
        life: 5,
        kind: "fall_fire",
      });
    } else if (this.themeId === "planetary") {
      const s = randRange(this.rng, 20, 34);
      this.projectiles.push({
        id: ++this.projId,
        x,
        y,
        w: s,
        h: s,
        vx: randRange(this.rng, -40, 40),
        vy: -speed * 0.9,
        life: 5.5,
        kind: "fall_asteroid",
        spin: randRange(this.rng, -3, 3),
      });
    } else {
      // Slim ice droplets — sometimes a small cluster
      const count = this.rng.next() > 0.55 ? 3 : 1;
      for (let i = 0; i < count; i++) {
        this.projectiles.push({
          id: ++this.projId,
          x: x + i * 16 + randRange(this.rng, -6, 6),
          y: y + randRange(this.rng, 0, 40),
          w: 6,
          h: 16,
          vx: randRange(this.rng, -12, 12),
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
        randRange(this.rng, 0.85, 1.2);
  }

  private updateProjectiles() {
    const dt = SIM_TICK;
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

  private updatePickups() {
    const dt = SIM_TICK;
    for (const p of this.pickups) p.bob += dt * 4;
  }

  // --- Collisions ----------------------------------------------------------

  playerRect(): Rect {
    return {
      x: this.player.x + 4,
      y: this.player.y,
      w: PLAYER.width - 8,
      h: PLAYER.height - 4,
    };
  }

  /** Collision rect including the bob offset (bob is gameplay, not cosmetic). */
  obstacleRect(o: Obstacle): Rect {
    const bobY = simSin(o.bob) * (o.kind === "asteroid" ? 10 : 5);
    return { x: o.x, y: o.y + bobY, w: o.w, h: o.h };
  }

  private resolveObstacleHits() {
    if (this.player.invuln > 0) return;
    const pr = this.playerRect();
    for (const o of this.obstacles) {
      if (!aabb(pr, this.obstacleRect(o))) continue;
      this.takeHit();
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
      this.takeHit();
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
      this.takeHit();
      this.events.push({
        kind: "projectileHit",
        x: p.x + p.w / 2,
        y: p.y + p.h / 2,
      });
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
        y: p.y - p.r + simSin(p.bob) * 6,
        w: p.r * 2,
        h: p.r * 2,
      };
      if (!aabb(pr, rect)) continue;
      this.pickups.splice(i, 1);
      const healed = this.shields < this.modifiers.maxShields;
      if (healed) {
        this.shields += 1;
      }
      this.events.push({ kind: "shieldPickup", healed, x: p.x, y: p.y });
    }
  }

  private resolveDangerHit() {
    if (this.player.invuln > 0) return;
    const feet = this.player.y;
    const surface =
      this.dangerY + simSin(this.time * DANGER.waveFreq) * DANGER.waveAmp;
    if (feet <= surface + 8) {
      this.takeHit();
      // Shove rising danger far below so the next two hits aren't instant
      this.dangerY = this.player.y - DANGER.hitPushback;
      this.dangerReliefT = DANGER.reliefTime;
      this.player.y += PLAYER.lavaKnock;
      this.player.boostT = Math.max(this.player.boostT, 0.22);
    }
  }

  private takeHit() {
    if (this.player.invuln > 0 || this.phase !== "playing") return;
    this.shields -= 1;
    this.hitsTaken += 1;
    this.player.invuln = PLAYER.hitInvuln;
    this.events.push({ kind: "hit" });

    if (this.shields <= 0) {
      this.shields = 0;
      this.phase = "gameover";
      this.events.push({ kind: "gameOver" });
    }
  }

  /**
   * Legendary one-shot: wash every enemy off the screen, clear all shots,
   * shove the rise far below (same pushback a danger hit buys), and hold the
   * field to a single enemy for a full breather — the first spawn is delayed,
   * then a solo window keeps the pair from re-forming. Kill centers ride the
   * event so the shell can burst particles where each Dragon / Bear / Alien
   * died.
   */
  private triggerTsunami() {
    const killed = this.enemies.map((e) => ({
      x: e.x + e.w / 2,
      y: e.y + e.h / 2,
    }));
    this.enemies = [];
    this.projectiles = [];
    this.nextEnemyAt = Math.max(
      this.nextEnemyAt,
      this.time + TSUNAMI.respawnDelaySec,
    );
    // First enemy returns after the respawn delay; the second is held back
    // for the full solo window after that.
    this.soloEnemyUntil = Math.max(
      this.soloEnemyUntil,
      this.time + TSUNAMI.respawnDelaySec + TSUNAMI.soloDurationSec,
    );
    this.dangerY = this.player.y - DANGER.hitPushback;
    this.dangerReliefT = DANGER.reliefTime;
    this.events.push({ kind: "tsunami", killed });
  }

  /** Close pass by an obstacle / enemy / projectile without colliding. */
  private detectNearMiss() {
    if (this.nearMissCd > 0 || this.player.invuln > 0) return;
    const pr = this.playerRect();
    const bodies: Rect[] = [
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
        this.events.push({ kind: "nearMiss" });
        break;
      }
    }
  }

  private gapToRect(pr: Rect, r: Rect) {
    const dx = Math.abs(pr.x + pr.w / 2 - (r.x + r.w / 2)) - (pr.w + r.w) * 0.5;
    const dy = Math.abs(pr.y + pr.h / 2 - (r.y + r.h / 2)) - (pr.h + r.h) * 0.5;
    return Math.max(dx, dy);
  }

  // --- Derived state -------------------------------------------------------

  /** World Y → screen Y (used for camera-relative danger proximity). */
  worldToScreen(y: number) {
    return this.cameraY - y + this.height * 0.55;
  }

  /**
   * How close the rise is to the player in camera space.
   * Fills as magma/gas/ice approaches the bottom of the view / your feet.
   */
  computeDangerProximity() {
    const surface =
      this.dangerY + simSin(this.time * DANGER.waveFreq) * DANGER.waveAmp;
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
    const wave = simSin(this.time * DANGER.waveFreq) * DANGER.waveAmp;
    this.dangerY = this.player.y - screenDist - wave;
  }

  /** HUD snapshot built purely from sim state (same shape the old loop emitted). */
  hudSnapshot(): HudSnapshot {
    return {
      phase: this.phase,
      shields: this.shields,
      maxShields: this.modifiers.maxShields,
      timeSurvived: this.time,
      height: Math.max(0, this.player.y),
      themeName: SIM_THEME_NAMES[this.themeId],
      boostReady: this.player.boostCd <= 0,
      dangerProximity: this.computeDangerProximity(),
      threatLevel: this.threatPulse,
      intensity: runIntensity(this.time),
      dangerLabel: THEME_META[this.themeId].dangerLabel,
      sinkStage: this.sinkStage,
      nearMisses: this.nearMissCount,
      hitsTaken: this.hitsTaken,
      freezeReady:
        this.freezeCharges > 0 &&
        this.freezeT <= 0 &&
        this.modifiers.freezeDuration > 0,
      freezeActive: this.freezeT > 0,
      tsunamiReady: this.tsunamiCharges > 0,
    };
  }
}
