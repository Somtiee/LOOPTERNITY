"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { audio } from "@/game/audio/AudioManager";
import { WORLD } from "@/game/constants";
import { Game, type RunRecord } from "@/game/engine/Game";
import { KeyboardInput } from "@/game/input/KeyboardInput";
import type { CharacterId, DifficultyId, GameMode, HudSnapshot, ThemeId } from "@/game/types";
import type { LoopiternRarityId } from "@/game/mintTiers";
import type { RunModifiers } from "@/game/traits";
import { VANILLA_MODIFIERS } from "@/game/traits";

type GameCanvasProps = {
  themeId: ThemeId;
  difficultyId: DifficultyId;
  characterId: CharacterId;
  onHud: (hud: HudSnapshot) => void;
  restartToken: number;
  paused?: boolean;
  inputRef: MutableRefObject<KeyboardInput | null>;
  keyboardRestart?: boolean;
  /** When true, skip split-screen tap controls (on-screen analog is used). */
  disableCanvasTouch?: boolean;
  /** P2M must pass vanilla. Normal uses equipped LOOPITERN traits. */
  modifiers?: RunModifiers;
  mode?: GameMode;
  equippedRarity?: LoopiternRarityId | null;
  /** Equipped token id — derives the climb rig's DNA palette. */
  equippedTokenId?: number | null;
  /** P2M session seed — the run is recorded for server replay. */
  sessionSeed?: number | null;
  /** P2M: receives the finished run's replayable record on death. */
  onRunRecord?: (record: RunRecord) => void;
};

export function GameCanvas({
  themeId,
  difficultyId,
  characterId,
  onHud,
  restartToken,
  paused = false,
  inputRef,
  keyboardRestart = true,
  disableCanvasTouch = false,
  modifiers = VANILLA_MODIFIERS,
  mode = "normal",
  equippedRarity = null,
  equippedTokenId = null,
  sessionSeed = null,
  onRunRecord,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const onHudRef = useRef(onHud);
  onHudRef.current = onHud;
  const onRunRecordRef = useRef(onRunRecord);
  onRunRecordRef.current = onRunRecord;
  // Construction-time session seed only — later sessions (restarts) reach
  // the live Game via setSessionSeed below, never by remounting the run.
  const initialSessionSeedRef = useRef(sessionSeed);
  const effectiveModifiers =
    mode === "normal" ? modifiers : VANILLA_MODIFIERS;
  const effectiveRarity = mode === "normal" ? equippedRarity : null;
  const effectiveTokenId =
    mode === "normal" && effectiveRarity != null ? equippedTokenId : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const input = new KeyboardInput();
    input.attach();
    inputRef.current = input;

    // Sim playfield dims are locked for the whole run (the server replays
    // with these exact values), so derive them from the initial viewport —
    // integers, clamped to the ranges the voucher route validates.
    const parent0 = canvas.parentElement;
    const rect0 = parent0?.getBoundingClientRect();
    const targetAspect = WORLD.width / WORLD.viewHeight;
    let fitW = rect0?.width ?? WORLD.width;
    let fitH = rect0?.height ?? WORLD.viewHeight;
    if (fitW / fitH > targetAspect) fitW = fitH * targetAspect;
    const simW = Math.round(Math.min(1200, Math.max(280, fitW)));
    const simH = Math.round(Math.min(2200, Math.max(420, fitH)));

    const game = new Game(canvas, input, {
      themeId,
      difficultyId,
      characterId,
      onHud: (hud) => onHudRef.current(hud),
      audio: {
        onBoost: () => audio.sfx("boost"),
        onHit: () => audio.sfx("hit"),
        onShieldPickup: () => audio.sfx("shield"),
        onEnemyAppear: () => audio.sfx("enemy"),
        onGameOver: () => audio.sfx("gameover"),
        onNearMiss: () => audio.sfx("nearMiss"),
        onFreeze: () => audio.sfx("shield"),
        onTsunami: () => audio.sfx("boost"),
      },
      keyboardRestart,
      modifiers: effectiveModifiers,
      mode,
      equippedRarity: effectiveRarity,
      equippedTokenId: effectiveTokenId,
      width: simW,
      height: simH,
      seed: initialSessionSeedRef.current ?? undefined,
      onRunRecord:
        initialSessionSeedRef.current != null && onRunRecordRef.current
          ? (rec) => onRunRecordRef.current?.(rec)
          : undefined,
    });
    gameRef.current = game;

    const fit = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const dprRaw = window.devicePixelRatio || 1;
      const dpr =
        rect.width < 480 ? Math.min(dprRaw, 1.25) : Math.min(dprRaw, 2);
      const targetAspect = WORLD.width / WORLD.viewHeight;
      let cssW = rect.width;
      let cssH = rect.height;
      if (cssW / cssH > targetAspect) {
        cssW = cssH * targetAspect;
      }
      // The sim keeps its construction dims; the canvas backing store is
      // sized to them and CSS scales it (aspect is locked 1:1) — a mid-run
      // resize letterboxes instead of changing the replayed world.
      game.setSize(cssW, cssH, dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
    };

    const setTouchFromEvent = (e: PointerEvent | null) => {
      if (!e) {
        input.setTouchAxis(0);
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      // Top band = boost; lower area = left/right dodge
      if (y < rect.height * 0.22) {
        input.requestBoost();
        return;
      }
      input.setTouchAxis(x < rect.width * 0.5 ? -1 : 1);
    };

    const onPointerDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      setTouchFromEvent(e);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!canvas.hasPointerCapture(e.pointerId)) return;
      setTouchFromEvent(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      setTouchFromEvent(null);
    };

    fit();
    game.start();

    const onResize = () => fit();
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    if (!disableCanvasTouch) {
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointercancel", onPointerUp);
    }

    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      game.stop();
      input.detach();
      inputRef.current = null;
      gameRef.current = null;
    };
  }, [
    characterId,
    themeId,
    difficultyId,
    inputRef,
    keyboardRestart,
    disableCanvasTouch,
    mode,
    effectiveRarity,
    effectiveTokenId,
    effectiveModifiers.maxShields,
    effectiveModifiers.speedMul,
    effectiveModifiers.freezeCharges,
    effectiveModifiers.freezeDuration,
    effectiveModifiers.tsunamiCharges,
  ]);

  // A new session seed (P2M restart) must reach the Game BEFORE the
  // restart token below fires — effect declaration order guarantees that.
  useEffect(() => {
    gameRef.current?.setSessionSeed(sessionSeed ?? undefined);
  }, [sessionSeed]);

  useEffect(() => {
    if (restartToken > 0) gameRef.current?.restart();
  }, [restartToken]);

  useEffect(() => {
    gameRef.current?.setPaused(paused);
  }, [paused]);

  return (
    <canvas
      ref={canvasRef}
      className="mx-auto h-full max-h-full touch-none select-none bg-[#12060a]"
      aria-label="LOOPTERNITY game canvas"
    />
  );
}
