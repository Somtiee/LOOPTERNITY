"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import {
  DEFAULT_DIFFICULTY,
  DEFAULT_THEME,
  DIFFICULTIES,
  THEME_META,
} from "@/game/constants";
import { audio } from "@/game/audio/AudioManager";
import { getTheme } from "@/game/themes";
import { computePerfectRun } from "@/game/score";
import type { KeyboardInput } from "@/game/input/KeyboardInput";
import { DEFAULT_CHARACTER } from "@/game/characters";
import type {
  CharacterId,
  DifficultyId,
  GameMode,
  HudSnapshot,
  ThemeId,
} from "@/game/types";
import { BASE_CHAIN, vaultIsDeployed } from "@/web3/config";
import { P2EEntryConfirm } from "@/components/web3/P2EEntryConfirm";
import { useOnchainWeekTheme } from "@/web3/hooks/useOnchainWeekTheme";
import { usePlayerRegistry } from "@/web3/hooks/usePlayerRegistry";
import {
  recordNormalBest,
  recordP2ERun,
  resolveCharacterId,
  setGuestCharacterId,
  setPlayerCharacter,
} from "@/web3/p2e/store";
import { DangerProximityBar } from "./DangerProximityBar";
import { GameCanvas } from "./GameCanvas";
import { GameHUD } from "./GameHUD";
import { StartMenu } from "./StartMenu";

type Screen = "menu" | "playing";

const P2E_DIFFICULTY: DifficultyId = "medium";

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
};

export default function GameApp() {
  const { address, isConnected, chainId } = useAccount();
  const { refresh } = usePlayerRegistry();
  const p2eWorld = useOnchainWeekTheme();
  const [screen, setScreen] = useState<Screen>("menu");
  const [mode, setMode] = useState<GameMode>("normal");
  const [themeId, setThemeId] = useState<ThemeId>(DEFAULT_THEME);
  const [difficultyId, setDifficultyId] =
    useState<DifficultyId>(DEFAULT_DIFFICULTY);
  const [characterId, setCharacterId] =
    useState<CharacterId>(DEFAULT_CHARACTER);
  const [p2eRunThemeId, setP2eRunThemeId] = useState<ThemeId | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [restartToken, setRestartToken] = useState(0);
  const [paused, setPaused] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [newBest, setNewBest] = useState(false);
  const [previousBest, setPreviousBest] = useState(0);
  const inputRef = useRef<KeyboardInput | null>(null);
  const recordedRef = useRef(false);

  const runThemeId: ThemeId | null =
    mode === "p2e" ? (p2eRunThemeId ?? p2eWorld.themeId) : themeId;
  const runDifficultyId = mode === "p2e" ? P2E_DIFFICULTY : difficultyId;

  const onHud = useCallback((next: HudSnapshot) => {
    setHud((prev) => {
      if (prev.phase === "gameover" && next.phase === "gameover") return prev;
      return next;
    });
    if (next.phase === "gameover") setPaused(false);
  }, []);

  useEffect(() => {
    if (runThemeId) audio.setTheme(runThemeId);
  }, [runThemeId]);

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

  const selectCharacter = useCallback(
    (id: CharacterId) => {
      setCharacterId(id);
      if (address) setPlayerCharacter(address, id);
      else setGuestCharacterId(id);
    },
    [address],
  );

  const launchRun = useCallback(() => {
    const themeKey = mode === "p2e" ? p2eWorld.themeId : themeId;
    if (!themeKey) return;
    if (mode === "p2e") setP2eRunThemeId(themeKey);
    const theme = getTheme(themeKey);
    recordedRef.current = false;
    setNewBest(false);
    setPreviousBest(0);
    setHud({
      ...INITIAL_HUD,
      themeName: theme.name,
      dangerLabel: THEME_META[themeKey].dangerLabel,
    });
    setRestartToken(0);
    setPaused(false);
    setRunKey((k) => k + 1);
    setScreen("playing");
  }, [mode, p2eWorld.themeId, themeId]);

  const onBase = isConnected && chainId === BASE_CHAIN.id;

  const startRun = useCallback(() => {
    if (!onBase) return;
    if (mode === "p2e") {
      if (!p2eWorld.playable) return;
      setEntryOpen(true);
      return;
    }
    launchRun();
  }, [launchRun, mode, onBase, p2eWorld.playable]);

  const restart = useCallback(() => {
    audio.sfx("click");
    if (!onBase) {
      setPaused(false);
      setEntryOpen(false);
      setScreen("menu");
      return;
    }
    if (mode === "p2e") {
      if (!p2eWorld.playable) return;
      setEntryOpen(true);
      return;
    }
    recordedRef.current = false;
    setNewBest(false);
    setPaused(false);
    inputRef.current?.requestRestart();
    setRestartToken((n) => n + 1);
  }, [mode, onBase, p2eWorld.playable]);

  const backToMenu = useCallback(() => {
    audio.sfx("click");
    setPaused(false);
    setEntryOpen(false);
    setP2eRunThemeId(null);
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
    if (mode === "normal") {
      if (isConnected && address) {
        const result = recordNormalBest(
          address,
          runDifficultyId,
          hud.timeSurvived,
        );
        setNewBest(result.isNewBest);
        setPreviousBest(result.previous);
        if (result.isNewBest) audio.sfx("success");
      } else {
        setNewBest(false);
        setPreviousBest(0);
      }
      refresh();
      return;
    }

    setNewBest(false);
    setPreviousBest(0);

    if (!vaultIsDeployed && isConnected && address) {
      const perfect = computePerfectRun({
        survivalSeconds: hud.timeSurvived,
        nearMisses: hud.nearMisses,
        hitsTaken: hud.hitsTaken,
      });
      recordP2ERun({
        address,
        at: Date.now(),
        survivalSeconds: hud.timeSurvived,
        multiplierHundredths: perfect.hundredths,
      });
    }
    refresh();
  }, [
    address,
    hud.hitsTaken,
    hud.nearMisses,
    hud.phase,
    hud.timeSurvived,
    isConnected,
    mode,
    refresh,
    runDifficultyId,
    screen,
    vaultIsDeployed,
  ]);

  useEffect(() => {
    if (onBase) return;
    setEntryOpen(false);
    if (screen === "playing") {
      setPaused(false);
      setScreen("menu");
    }
  }, [onBase, screen]);

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

  if (screen === "menu" || !runThemeId) {
    return (
      <>
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
        />
        {entryOpen ? (
          <P2EEntryConfirm
            onConfirm={() => {
              setEntryOpen(false);
              launchRun();
            }}
            onCancel={() => setEntryOpen(false)}
          />
        ) : null}
      </>
    );
  }

  const accent = getTheme(runThemeId).accent;
  const difficultyLabel =
    mode === "p2e" ? "P2E" : DIFFICULTIES[runDifficultyId].label;

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
            themeId={runThemeId}
            difficultyId={runDifficultyId}
            characterId={characterId}
            onHud={onHud}
            restartToken={restartToken}
            paused={paused}
            inputRef={inputRef}
            keyboardRestart={mode !== "p2e"}
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

      {entryOpen ? (
        <P2EEntryConfirm
          onConfirm={() => {
            setEntryOpen(false);
            launchRun();
          }}
          onCancel={() => setEntryOpen(false)}
        />
      ) : null}
    </div>
  );
}
