import {
  DANGER,
  DEFAULT_DIFFICULTY,
  DEFAULT_THEME,
  PLAYER,
  THEME_META,
  WORLD,
} from "../constants";
import { DEFAULT_CHARACTER, getCharacter } from "../characters";
import { loopiternRigPalette } from "../loopiternArt";
import { dnaFromTokenId } from "../loopiternTraits";
import { KeyboardInput } from "../input/KeyboardInput";
import { clamp, randRange } from "../math";
import { drawCharacter } from "../render/drawCharacter";
import { drawLoopitern } from "../render/drawLoopitern";
import { getTheme } from "../themes";
import { VANILLA_MODIFIERS, type RunModifiers } from "../traits";
import {
  ClimbSim,
  type PlayerState,
  type SimEvent,
  type TickInputs,
} from "../sim/ClimbSim";
import {
  createInputRecorder,
  type InputRecorder,
  type RunInputLog,
} from "../sim/inputLog";
import { SIM_TICK } from "../sim/simMath";
import type {
  CharacterId,
  DifficultyId,
  Enemy,
  GameMode,
  GamePhase,
  HudSnapshot,
  Obstacle,
  Particle,
  Pickup,
  Projectile,
  ThemeId,
  ThemePalette,
} from "../types";
import type { LoopiternRarityId } from "../mintTiers";

export type GameAudioHooks = {
  onBoost?: () => void;
  onHit?: () => void;
  onShieldPickup?: () => void;
  onEnemyAppear?: () => void;
  onGameOver?: () => void;
  onNearMiss?: () => void;
  onFreeze?: () => void;
  onTsunami?: () => void;
};

/** A finished, replayable run: the input log plus the run's honest clock. */
export type RunRecord = {
  inputLog: RunInputLog;
  timeSurvived: number;
};

export type GameOptions = {
  themeId?: ThemeId;
  difficultyId?: DifficultyId;
  characterId?: CharacterId;
  onHud?: (hud: HudSnapshot) => void;
  audio?: GameAudioHooks;
  /** When false, R / Space / boost will not restart after death (P2E re-entry). */
  keyboardRestart?: boolean;
  /** Default = vanilla PLAYER. P2M must pass VANILLA_MODIFIERS. */
  modifiers?: RunModifiers;
  /** Defense in depth: non-normal modes ignore modifiers. */
  mode?: GameMode;
  /** LOOPITERN runner art in Normal when a token is equipped. */
  equippedRarity?: LoopiternRarityId | null;
  /**
   * Equipped token id. With equippedRarity it derives the DNA palette for
   * the climb rig (colors + mark only — gameplay traits stay rarity-only).
   * DNA is never persisted; it is re-derived from tokenId + rarity.
   */
  equippedTokenId?: number | null;
  /**
   * Deterministic session seed (P2M). The server pins the same seed to the
   * session and replays the recorded inputs through the identical ClimbSim
   * before signing a mint voucher. Omitted → fresh random seed per run
   * (Normal keeps its roguelite freshness).
   */
  seed?: number;
  /** Sim playfield dims (css px, integers). Locked for the run; the renderer
   *  letterboxes if the canvas is resized mid-run. Defaults to WORLD dims. */
  width?: number;
  height?: number;
  /** P2M: called once, when the recorded run dies. */
  onRunRecord?: (record: RunRecord) => void;
};

/**
 * Canvas game shell. All gameplay lives in the deterministic ClimbSim
 * (src/game/sim/ClimbSim.ts) stepped at a fixed 60Hz; this class owns the
 * RAF accumulator loop, input sampling + recording, and 100% of the
 * cosmetics: rendering, particles, stars, scenery, shake, flashes, banners,
 * audio. Nothing cosmetic feeds back into the sim, so Math.random stays
 * safe here.
 */
export class Game {
  private ctx: CanvasRenderingContext2D;
  private input: KeyboardInput;
  private theme: ThemePalette;
  private difficultyId: DifficultyId;
  private themeId: ThemeId;
  private characterId: CharacterId;
  private onHud?: (hud: HudSnapshot) => void;
  private audio?: GameAudioHooks;
  private keyboardRestart = true;
  private runMode: GameMode = "normal";
  private equippedRarity: LoopiternRarityId | null = null;
  private equippedTokenId: number | null = null;

  /** Session seed for replay attestation (P2M); undefined = random per run. */
  private sessionSeed?: number;
  private onRunRecord?: (record: RunRecord) => void;
  private sim!: ClimbSim;
  private recorder: InputRecorder | null = null;
  /** Modifiers as passed at construction (Normal honors equipped traits). */
  private baseModifiers: RunModifiers = VANILLA_MODIFIERS;

  // --- cosmetics (never affect the sim) ---
  private shake = 0;
  private hitFlash = 0;
  private collectFlash = 0;
  private alertBanner = 0;
  private bannerText = "";
  private paused = false;
  private stars: { x: number; y: number; r: number; tw: number }[] = [];
  private particles: Particle[] = [];
  private scenery: { x: number; y: number; w: number; h: number; shade: number }[] =
    [];

  private raf = 0;
  private lastTs = 0;
  private running = false;
  private hudAcc = 0;
  private pauseDrawn = false;
  /** Leftover real time carried into the next frame's fixed steps. */
  private acc = 0;

  constructor(canvas: HTMLCanvasElement, input: KeyboardInput, options: GameOptions = {}) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.input = input;
    this.themeId = options.themeId ?? DEFAULT_THEME;
    this.theme = getTheme(this.themeId);
    this.difficultyId = options.difficultyId ?? DEFAULT_DIFFICULTY;
    this.characterId = options.characterId ?? DEFAULT_CHARACTER;
    this.onHud = options.onHud;
    this.audio = options.audio;
    this.keyboardRestart = options.keyboardRestart !== false;
    this.runMode = options.mode ?? "normal";
    this.baseModifiers = options.modifiers ?? VANILLA_MODIFIERS;
    this.sessionSeed = options.seed;
    this.onRunRecord = options.onRunRecord;
    this.equippedRarity =
      this.runMode === "normal" ? (options.equippedRarity ?? null) : null;
    this.equippedTokenId =
      this.runMode === "normal" ? (options.equippedTokenId ?? null) : null;
    this.newSim(options.width, options.height);
    if (process.env.NODE_ENV !== "production") {
      // Dev-only handle for browser E2E (scripts/e2e-browser.ts); stripped
      // from production builds.
      (globalThis as { __loopiternGame?: Game }).__loopiternGame = this;
    }
  }

  // --- sim state, read by the renderer -------------------------------------

  private get modifiers(): RunModifiers {
    return this.sim.modifiers;
  }

  private get player(): PlayerState {
    return this.sim.player;
  }

  private get obstacles(): Obstacle[] {
    return this.sim.obstacles;
  }

  private get enemies(): Enemy[] {
    return this.sim.enemies;
  }

  private get projectiles(): Projectile[] {
    return this.sim.projectiles;
  }

  private get pickups(): Pickup[] {
    return this.sim.pickups;
  }

  private get cameraY(): number {
    return this.sim.cameraY;
  }

  private get dangerY(): number {
    return this.sim.dangerY;
  }

  private get time(): number {
    return this.sim.time;
  }

  private get phase(): GamePhase {
    return this.sim.phase;
  }

  private get freezeT(): number {
    return this.sim.freezeT;
  }

  private get threatPulse(): number {
    return this.sim.threatPulse;
  }

  private get width(): number {
    return this.sim.width;
  }

  private get height(): number {
    return this.sim.height;
  }

  private worldToScreen(y: number) {
    return this.sim.worldToScreen(y);
  }

  private obstacleRect(o: Obstacle) {
    return this.sim.obstacleRect(o);
  }

  // --- lifecycle -------------------------------------------------------------

  /**
   * Swap the session seed used for FUTURE runs (P2M restart: GameApp fetches
   * the new session before bumping the restart token). Never disturbs a run
   * in progress — the live sim keeps its construction seed.
   */
  setSessionSeed(seed: number | undefined) {
    this.sessionSeed = seed;
  }

  private newSim(width?: number, height?: number) {
    const seed =
      this.sessionSeed != null
        ? this.sessionSeed
        : (Math.random() * 0x7fffffff) | 0;
    this.sim = new ClimbSim({
      seed,
      width: width ?? WORLD.width,
      height: height ?? WORLD.viewHeight,
      themeId: this.themeId,
      difficultyId: this.difficultyId,
      modifiers:
        this.runMode === "normal" ? this.baseModifiers : VANILLA_MODIFIERS,
    });
    this.recorder =
      this.sessionSeed != null && this.onRunRecord
        ? createInputRecorder()
        : null;
    this.acc = 0;
    this.shake = 0;
    this.hitFlash = 0;
    this.collectFlash = 0;
    this.alertBanner = 0;
    this.bannerText = "";
    this.particles = [];
    this.scenery = [];
    this.stars = [];
    this.seedScenery();
    this.seedStars();
  }

  /**
   * Size the canvas. The sim's playfield dims are locked for the whole run
   * (a mid-run resize would desync the replayed spawn stream), so the canvas
   * keeps a fixed backing store at sim dims × dpr and CSS scales it — the
   * aspect is locked 1:1 by the canvas host, so this is a clean letterbox.
   */
  setSize(cssWidth: number, cssHeight: number, dpr: number) {
    void cssWidth;
    void cssHeight;
    this.ctx.canvas.width = Math.floor(this.sim.width * dpr);
    this.ctx.canvas.height = Math.floor(this.sim.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTs = performance.now();
    const tick = (ts: number) => {
      if (!this.running) return;
      const frameDt = Math.min(0.25, (ts - this.lastTs) / 1000);
      this.lastTs = ts;
      if (!this.paused) {
        this.pauseDrawn = false;
        this.frame(frameDt);
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
    if (!paused) {
      this.lastTs = performance.now();
      this.acc = 0;
    }
  }

  isPaused() {
    return this.paused;
  }

  restart() {
    this.paused = false;
    this.newSim();
    this.emitHud(true);
  }

  // --- fixed-timestep loop ---------------------------------------------------

  private frame(frameDt: number) {
    if (this.phase === "gameover") {
      if (
        this.keyboardRestart &&
        (this.input.consumeRestart() || this.input.consumeBoost())
      ) {
        this.restart();
        this.draw();
        return;
      }
      this.input.consumeRestart();
      this.input.consumeBoost();
      this.input.consumeFreeze();
      this.input.consumeTsunami();
      this.updateCosmetics(frameDt, 8);
      this.draw();
      return;
    }

    this.input.consumeRestart(); // mid-run R spam is ignored, same as before

    this.acc = Math.min(this.acc + frameDt, 0.25);
    const MAX_STEPS = 8;
    let steps = 0;
    while (this.acc >= SIM_TICK && steps < MAX_STEPS && this.phase === "playing") {
      this.acc -= SIM_TICK;
      steps += 1;
      const inputs = this.sampleInputs();
      const events = this.sim.step(inputs);
      if (this.recorder) {
        // sim.tick counts executed steps; the step just run was tick-1.
        this.recorder.record(this.sim.tick - 1, inputs);
      }
      this.handleEvents(events);
    }
    if (steps >= MAX_STEPS) {
      // Sustained overload: drop the backlog instead of spiraling — the
      // game visibly slows, exactly like the old 33ms dt cap.
      this.acc = Math.min(this.acc, SIM_TICK);
    }

    this.updateCosmetics(frameDt, 6);
    this.emitHud();
    this.draw();
  }

  private sampleInputs(): TickInputs {
    return {
      axis: this.input.axis(),
      boost: this.input.consumeBoost(),
      freeze: this.input.consumeFreeze(),
      tsunami: this.input.consumeTsunami(),
    };
  }

  /** Translate sim events into audio + cosmetic feedback. */
  private handleEvents(events: SimEvent[]) {
    for (const ev of events) {
      switch (ev.kind) {
        case "boost": {
          this.audio?.onBoost?.();
          this.burstParticles(
            this.player.x + PLAYER.width / 2,
            this.player.y + 8,
            12,
            this.theme.accent,
          );
          break;
        }
        case "freeze": {
          this.bannerText = "FREEZE";
          this.alertBanner = 1.4;
          this.audio?.onFreeze?.();
          break;
        }
        case "tsunami": {
          const green = "#00C805";
          this.shake = Math.max(this.shake, 0.75);
          this.bannerText = "TSUNAMI";
          this.alertBanner = 1.5;
          this.burstParticles(
            this.player.x + PLAYER.width / 2,
            this.dangerY + 24,
            28,
            green,
          );
          this.burstParticles(
            this.player.x + PLAYER.width / 2,
            this.player.y - 10,
            18,
            this.theme.dangerGlow,
          );
          this.audio?.onTsunami?.();
          break;
        }
        case "hit": {
          this.shake = 0.6;
          this.hitFlash = 0.28;
          this.audio?.onHit?.();
          this.burstParticles(
            this.player.x + PLAYER.width / 2,
            this.player.y + 10,
            18,
            this.theme.dangerGlow,
          );
          break;
        }
        case "gameOver": {
          this.audio?.onGameOver?.();
          this.burstParticles(
            this.player.x + PLAYER.width / 2,
            this.player.y + 16,
            32,
            this.theme.accent,
          );
          this.finishRunRecord();
          this.emitHud(true);
          break;
        }
        case "nearMiss": {
          this.audio?.onNearMiss?.();
          break;
        }
        case "enemyAppear": {
          this.bannerText =
            ev.enemy === "alien"
              ? "ALIEN INBOUND"
              : ev.enemy === "bear"
                ? "BEAR APPROACHING"
                : "DRAGON INBOUND";
          this.alertBanner = 1.6;
          this.shake = Math.max(this.shake, 0.25);
          this.audio?.onEnemyAppear?.();
          break;
        }
        case "enemyShot": {
          this.burstParticles(ev.x, ev.y, 6, this.theme.dangerGlow);
          break;
        }
        case "projectileHit": {
          this.burstParticles(ev.x, ev.y, 14, this.theme.dangerSurface);
          break;
        }
        case "shieldPickup": {
          if (ev.healed) {
            this.collectFlash = 0.35;
            this.audio?.onShieldPickup?.();
            this.burstParticles(ev.x, ev.y, 18, "#ffe08a");
            this.burstParticles(ev.x, ev.y, 10, this.theme.accent);
          } else {
            this.collectFlash = 0.2;
            this.burstParticles(ev.x, ev.y, 10, "#ffffff");
          }
          break;
        }
        case "sinkStage": {
          const label = THEME_META[this.themeId].dangerLabel.toUpperCase();
          const capped = ev.maxStage ? " (MAX)" : "";
          this.bannerText = `${label} PULL ×${ev.stage}${capped} — BOOST UP!`;
          this.alertBanner = 2.8;
          this.shake = Math.max(this.shake, 0.5);
          this.burstParticles(
            this.player.x + PLAYER.width / 2,
            this.player.y - 20,
            16,
            this.theme.dangerGlow,
          );
          break;
        }
      }
    }
  }

  /** P2M: hand the finished run's replayable record to the app. */
  private finishRunRecord() {
    if (!this.recorder || !this.onRunRecord) return;
    const record: RunRecord = {
      inputLog: this.recorder.finish(this.sim.tick, this.sim.width, this.sim.height),
      timeSurvived: this.sim.time,
    };
    this.recorder = null;
    this.onRunRecord(record);
  }

  private updateCosmetics(dt: number, shakeDecayMul = 6) {
    this.shake = Math.max(0, this.shake - dt * shakeDecayMul);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.collectFlash = Math.max(0, this.collectFlash - dt);
    this.alertBanner = Math.max(0, this.alertBanner - dt);
    this.spawnAmbientParticles(dt);
    this.updateParticles(dt);
  }

  private seedScenery() {
    const w = this.width;
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
    const w = this.width;
    for (let i = 0; i < 90; i++) {
      this.stars.push({
        x: randRange(0, w),
        y: randRange(0, 2000),
        r: randRange(0.6, 2.2),
        tw: Math.random() * Math.PI * 2,
      });
    }
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
      x: randRange(0, this.width),
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
    this.onHud?.(this.sim.hudSnapshot());
  }

  // --- Rendering ------------------------------------------------------------

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
    this.drawFreezeOverlay();
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
    if (this.equippedRarity != null) {
      drawLoopitern(ctx, {
        rarity: this.equippedRarity,
        facing: p.facing,
        bob: p.bob,
        vxNorm: clamp(p.vx / (PLAYER.maxSpeedX * this.modifiers.speedMul), -1, 1),
        boosting: p.boostT > 0,
        palette: this.equippedPalette(),
      });
    } else {
      drawCharacter(ctx, {
        look: getCharacter(this.characterId),
        facing: p.facing,
        bob: p.bob,
        vxNorm: clamp(p.vx / (PLAYER.maxSpeedX * this.modifiers.speedMul), -1, 1),
        boosting: p.boostT > 0,
        accent: this.theme.accent,
      });
    }
    ctx.restore();
  }

  /**
   * DNA palette for the equipped token (visual colors + torso mark only).
   * Falls back to the rarity's default look when no token id is known.
   */
  private equippedPalette() {
    if (
      this.equippedRarity == null ||
      this.equippedTokenId == null ||
      !Number.isInteger(this.equippedTokenId) ||
      this.equippedTokenId < 1 ||
      this.equippedTokenId > 10_000
    ) {
      return undefined;
    }
    try {
      return loopiternRigPalette(
        dnaFromTokenId(this.equippedTokenId, this.equippedRarity),
      );
    } catch {
      return undefined;
    }
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

  private drawFreezeOverlay() {
    if (this.freezeT <= 0) return;
    const ctx = this.ctx;
    const pulse = 0.1 + Math.sin(this.time * 8) * 0.03;
    ctx.fillStyle = `rgba(140, 230, 255, ${pulse})`;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = "rgba(180, 240, 255, 0.16)";
    ctx.fillRect(0, 0, this.width, 10);
    ctx.fillRect(0, this.height - 10, this.width, 10);
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
