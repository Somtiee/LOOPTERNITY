"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_DIFFICULTY,
  DEFAULT_THEME,
  DIFFICULTIES,
  THEME_META,
} from "@/game/constants";
import { audio } from "@/game/audio/AudioManager";
import { getTheme } from "@/game/themes";
import type { KeyboardInput } from "@/game/input/KeyboardInput";
import { DEFAULT_CHARACTER } from "@/game/characters";
import type {
  CharacterId,
  DifficultyId,
  GameMode,
  HudSnapshot,
  ThemeId,
} from "@/game/types";
import { runModifiersForMode } from "@/game/traits";
import { useWalletSession } from "@/web3/hooks/useWalletSession";
import { usePlayerRegistry } from "@/web3/hooks/usePlayerRegistry";
import {
  getEquippedLoopitern,
  setEquippedLoopitern,
  type EquippedLoopitern,
} from "@/web3/loopiterns/equip";
import { useLoopiternsInventory } from "@/web3/loopiterns/useLoopiternsInventory";
import {
  recordGuestNormalBest,
  recordNormalBest,
  resolveCharacterId,
  setGuestCharacterId,
  setPlayerCharacter,
} from "@/web3/p2e/store";
import { DangerProximityBar } from "./DangerProximityBar";
import { GameCanvas } from "./GameCanvas";
import { GameHUD } from "./GameHUD";
import { StartMenu } from "./StartMenu";
import { VirtualPad } from "./VirtualPad";
import { useCoarsePointer } from "@/game/input/useCoarsePointer";

type Screen = "menu" | "playing";

/** P2M mint runs use a shared Medium climb so time gates stay fair. */
const P2M_DIFFICULTY: DifficultyId = "medium";

const INITIAL_HUD: HudSnapshot = {
  phase: "playing",
  shields: 3,
  maxShields: 3,
  timeSurvived: 0,
  height: 0,
  themeName: "Volcanic Eruption",
  boostReady: true,
  dangerProximity: 0,
  threatLevel: 0,
  intensity: 0,
  dangerLabel: "Magma",
  sinkStage: 0,
  nearMisses: 0,
  hitsTaken: 0,
  freezeReady: false,
  freezeActive: false,
  tsunamiReady: false,
};

export default function GameApp() {
  const { address } = useWalletSession();
  const { refresh } = usePlayerRegistry();
  const {
    tokens,
    loading: inventoryLoading,
    onRobinhood,
    configured,
    refetch: refetchInventory,
  } = useLoopiternsInventory();
  const coarsePointer = useCoarsePointer();
  const [screen, setScreen] = useState<Screen>("menu");
  const [mode, setMode] = useState<GameMode>("normal");
  const [themeId, setThemeId] = useState<ThemeId>(DEFAULT_THEME);
  const [difficultyId, setDifficultyId] =
    useState<DifficultyId>(DEFAULT_DIFFICULTY);
  const [characterId, setCharacterId] =
    useState<CharacterId>(DEFAULT_CHARACTER);
  const [equipped, setEquipped] = useState<EquippedLoopitern | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [restartToken, setRestartToken] = useState(0);
  const [paused, setPaused] = useState(false);
  const [newBest, setNewBest] = useState(false);
  const [previousBest, setPreviousBest] = useState(0);
  const inputRef = useRef<KeyboardInput | null>(null);
  const recordedRef = useRef(false);

  const onHud = useCallback((next: HudSnapshot) => {
    setHud((prev) => {
      if (prev.phase === "gameover" && next.phase === "gameover") return prev;
      return next;
    });
    if (next.phase === "gameover") setPaused(false);
  }, []);

  useEffect(() => {
    audio.setTheme(themeId);
  }, [themeId]);

  useEffect(() => {
    if (screen === "menu") audio.playBed("menu");
    else audio.playBed("game");
  }, [screen]);

  useEffect(() => {
    const unlock = () => {
      void audio.unlock();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      audio.playBed("none");
    };
  }, []);

  useEffect(() => {
    setCharacterId(resolveCharacterId(address));
  }, [address]);

  useEffect(() => {
    if (screen !== "menu") return;
    void refetchInventory();
  }, [screen, refetchInventory]);

  useEffect(() => {
    if (!address) {
      setEquipped(null);
      return;
    }
    setEquipped(getEquippedLoopitern(address));
  }, [address]);

  useEffect(() => {
    if (!address || !onRobinhood || !configured || inventoryLoading) return;
    if (!equipped) return;
    const owned = tokens.some((t) => t.tokenId === equipped.tokenId);
    if (!owned) {
      setEquipped(null);
      setEquippedLoopitern(address, null);
    }
  }, [
    address,
    configured,
    equipped,
    inventoryLoading,
    onRobinhood,
    tokens,
  ]);

  const selectCharacter = useCallback(
    (id: CharacterId) => {
      setCharacterId(id);
      if (address) setPlayerCharacter(address, id);
      else setGuestCharacterId(id);
    },
    [address],
  );

  const selectEquip = useCallback(
    (token: EquippedLoopitern | null) => {
      setEquipped(token);
      if (address) setEquippedLoopitern(address, token);
    },
    [address],
  );

  const launchRun = useCallback(() => {
    if (mode === "p2e") return;
    const theme = getTheme(themeId);
    const rarity = mode === "normal" ? equipped?.rarity ?? null : null;
    const mods = runModifiersForMode(mode, rarity);
    recordedRef.current = false;
    setNewBest(false);
    setPreviousBest(0);
    setHud({
      ...INITIAL_HUD,
      shields: mods.maxShields,
      maxShields: mods.maxShields,
      themeName: theme.name,
      dangerLabel: THEME_META[themeId].dangerLabel,
      freezeReady: mods.freezeCharges > 0 && mods.freezeDuration > 0,
      freezeActive: false,
      tsunamiReady: mods.tsunamiCharges > 0,
    });
    setRestartToken(0);
    setPaused(false);
    setRunKey((k) => k + 1);
    setScreen("playing");
  }, [equipped, mode, themeId]);

  const startRun = useCallback(() => {
    if (mode === "p2e") return;
    launchRun();
  }, [launchRun, mode]);

  const restart = useCallback(() => {
    audio.sfx("click");
    recordedRef.current = false;
    setNewBest(false);
    setPaused(false);
    inputRef.current?.requestRestart();
    setRestartToken((n) => n + 1);
  }, []);

  const backToMenu = useCallback(() => {
    audio.sfx("click");
    setPaused(false);
    setScreen("menu");
  }, []);

  const togglePause = useCallback(() => {
    audio.sfx("click");
    setPaused((p) => !p);
  }, []);

  useEffect(() => {
    if (screen !== "playing" || hud.phase !== "gameover" || recordedRef.current) {
      return;
    }
    recordedRef.current = true;
    if (mode !== "normal") return;
    const result = address
      ? recordNormalBest(address, difficultyId, hud.timeSurvived)
      : recordGuestNormalBest(difficultyId, hud.timeSurvived);
    setNewBest(result.isNewBest);
    setPreviousBest(result.previous);
    if (result.isNewBest) audio.sfx("success");
    refresh();
  }, [
    address,
    difficultyId,
    hud.phase,
    hud.timeSurvived,
    mode,
    refresh,
    screen,
  ]);

  useEffect(() => {
    if (screen !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape" || e.code === "KeyP") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen]);

  if (screen === "menu") {
    return (
      <StartMenu
        mode={mode}
        themeId={themeId}
        difficultyId={difficultyId}
        characterId={characterId}
        onModeChange={setMode}
        onThemeChange={setThemeId}
        onDifficultyChange={setDifficultyId}
        onCharacterChange={selectCharacter}
        onStart={startRun}
        equipped={equipped}
        onEquip={selectEquip}
      />
    );
  }

  const accent = getTheme(themeId).accent;
  const runDifficultyId = mode === "p2m" ? P2M_DIFFICULTY : difficultyId;
  const difficultyLabel =
    mode === "p2m" ? "P2M" : DIFFICULTIES[runDifficultyId].label;
  const equippedRarity = mode === "normal" ? equipped?.rarity ?? null : null;
  const equippedTokenId =
    mode === "normal" && equipped !== null
      ? Number(equipped.tokenId)
      : null;
  const runModifiers = runModifiersForMode(mode, equippedRarity);

  return (
    <div
      className="relative flex h-dvh w-full items-center justify-center overflow-hidden bg-[#070309]"
      style={{
        boxShadow: `inset 0 0 120px ${accent}14`,
      }}
    >
      <div className="relative flex h-full max-h-dvh w-full flex-col items-center">
        <div className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.45)]">
          <GameCanvas
            key={runKey}
            themeId={themeId}
            difficultyId={runDifficultyId}
            characterId={characterId}
            onHud={onHud}
            restartToken={restartToken}
            paused={paused}
            inputRef={inputRef}
            keyboardRestart
            disableCanvasTouch={coarsePointer}
            modifiers={runModifiers}
            mode={mode}
            equippedRarity={equippedRarity}
            equippedTokenId={equippedTokenId}
          />
          <GameHUD
            hud={hud}
            accent={accent}
            difficultyLabel={difficultyLabel}
            paused={paused}
            mode={mode}
            isNewBest={newBest}
            previousBest={previousBest}
            onPauseToggle={togglePause}
            onRestart={restart}
            onMenu={backToMenu}
            touchControls={coarsePointer}
          />
          <VirtualPad
            inputRef={inputRef}
            accent={accent}
            visible={
              coarsePointer &&
              !paused &&
              hud.phase !== "gameover"
            }
            freezeReady={hud.freezeReady}
            freezeActive={hud.freezeActive}
            tsunamiReady={hud.tsunamiReady}
          />
        </div>

        <div className="relative flex h-8 shrink-0 items-center justify-end bg-[#070309] px-2 pb-[env(safe-area-inset-bottom)]">
          <DangerProximityBar
            proximity={hud.dangerProximity}
            label={hud.dangerLabel}
            accent={accent}
          />
        </div>
      </div>
    </div>
  );
}
