"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { audio } from "@/game/audio/AudioManager";
import { WORLD } from "@/game/constants";
import { Game } from "@/game/engine/Game";
import { KeyboardInput } from "@/game/input/KeyboardInput";
import type { CharacterId, DifficultyId, HudSnapshot, ThemeId } from "@/game/types";

type GameCanvasProps = {
  themeId: ThemeId;
  difficultyId: DifficultyId;
  characterId: CharacterId;
  onHud: (hud: HudSnapshot) => void;
  restartToken: number;
  paused?: boolean;
  inputRef: MutableRefObject<KeyboardInput | null>;
  keyboardRestart?: boolean;
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
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const onHudRef = useRef(onHud);
  onHudRef.current = onHud;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const input = new KeyboardInput();
    input.attach();
    inputRef.current = input;

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
      },
      keyboardRestart,
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
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

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
  }, [characterId, themeId, difficultyId, inputRef, keyboardRestart]);

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
