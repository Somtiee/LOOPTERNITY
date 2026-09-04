"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_DIFFICULTY,
  DEFAULT_THEME,
  DIFFICULTIES,
  THEME_META,
} from "@/game/constants";
import { audio } from "@/game/audio/AudioManager";
import { getTheme, themeForEpochHour } from "@/game/themes";
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
import type { RunRecord } from "@/game/engine/Game";
import { useWalletSession } from "@/web3/hooks/useWalletSession";
import { usePlayerRegistry } from "@/web3/hooks/usePlayerRegistry";
import {
  getEquippedLoopitern,
  setEquippedLoopitern,
  type EquippedLoopitern,
} from "@/web3/loopiterns/equip";
import { useLoopiternsInventory } from "@/web3/loopiterns/useLoopiternsInventory";
import { useLoopiternsSupply } from "@/web3/loopiterns/useLoopiternsSupply";
import { MAX_LOOPITERNS_PER_WALLET } from "@/web3/loopiterns";
import { requestRunSession, type RunSession } from "@/web3/loopiterns/runSession";
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
  const { address, hasWallet, onRobinhood: walletOnRobinhood } =
    useWalletSession();
  const { refresh } = usePlayerRegistry();
  const {
    tokenIds,
    loading: inventoryLoading,
    onRobinhood,
    configured,
    refetch: refetchInventory,
  } = useLoopiternsInventory();
  const supply = useLoopiternsSupply();
  // A wallet at the 5/5 cap can't mint a P2M run — the chain would reject
  // it — so P2M is locked for it. Like soldOut, a failed/unloaded read
  // never fakes the cap.
  const mintCapReached =
    configured &&
    onRobinhood &&
    !inventoryLoading &&
    tokenIds.length >= MAX_LOOPITERNS_PER_WALLET;
  const coarsePointer = useCoarsePointer();
  const [screen, setScreen] = useState<Screen>("menu");
  const [mode, setMode] = useState<GameMode>("normal");
  const [themeId, setThemeId] = useState<ThemeId>(DEFAULT_THEME);
  // P2M uses the UTC-hour theme; recomputed every render so a run started
  // after a boundary flips with the hour.
  const p2mThemeId: ThemeId = themeForEpochHour(
    Math.floor(Date.now() / 3_600_000),
  ).id;
  const [difficultyId, setDifficultyId] =
    useState<DifficultyId>(DEFAULT_DIFFICULTY);
  // Theme for the active run — locked at launch so a UTC-hour rollover
  // mid-run cannot flip the live world.
  const [runThemeId, setRunThemeId] = useState<ThemeId>(DEFAULT_THEME);
  const [characterId, setCharacterId] =
    useState<CharacterId>(DEFAULT_CHARACTER);
  const [equipped, setEquipped] = useState<EquippedLoopitern | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [restartToken, setRestartToken] = useState(0);
  // P2M replay attestation: the server pins a session (seed + theme) at run
  // start; the client plays the deterministic sim seeded with it and records
  // every input. At mint time the server replays the record through the
  // identical sim — a run that didn't really survive the gate gets no
  // voucher. Null session/record (offline / 503) leaves the run playable
  // with the mint honestly disabled.
  const [runSession, setRunSession] = useState<RunSession | null>(null);
  const [runRecord, setRunRecord] = useState<RunRecord | null>(null);
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

  /** P2M: the Game hands over the finished run's replayable record on death. */
  const handleRunRecord = useCallback((rec: RunRecord) => {
    setRunRecord(rec);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      // Dev-only handle for browser E2E (scripts/e2e-browser.ts); stripped
      // from production builds.
      (window as unknown as { __loopiternP2m?: unknown }).__loopiternP2m = {
        runSession,
        runRecord,
      };
    }
  });

  useEffect(() => {
    // P2M ignores the menu picker — the UTC-hour theme is the run's theme.
    const effective = mode === "p2m" ? p2mThemeId : themeId;
    audio.setTheme(effective);
  }, [mode, p2mThemeId, themeId]);

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
    // Checked against every owned id, not just the visible page — a token
    // beyond the current page must not be auto-unequipped.
    const owned = tokenIds.some((id) => id === equipped.tokenId);
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
    tokenIds,
  ]);

  const selectCharacter = useCallback(
    (id: CharacterId) => {
      setCharacterId(id);
      // The CHARACTERS | LOOPITERNS toggle is the source of truth — picking a
      // base character means running as that character, not the equipped NFT.
      if (equipped !== null) {
        setEquipped(null);
        if (address) setEquippedLoopitern(address, null);
      }
      if (address) setPlayerCharacter(address, id);
      else setGuestCharacterId(id);
    },
    [address, equipped],
  );

  const selectEquip = useCallback(
    (token: EquippedLoopitern | null) => {
      setEquipped(token);
      if (address) setEquippedLoopitern(address, token);
    },
    [address],
  );

  const beginRun = useCallback(
    (launchedThemeId: ThemeId) => {
      const theme = getTheme(launchedThemeId);
      const rarity = mode === "normal" ? equipped?.rarity ?? null : null;
      const mods = runModifiersForMode(mode, rarity);
      recordedRef.current = false;
      setNewBest(false);
      setPreviousBest(0);
      setRunRecord(null);
      setHud({
        ...INITIAL_HUD,
        shields: mods.maxShields,
        maxShields: mods.maxShields,
        themeName: theme.name,
        dangerLabel: THEME_META[launchedThemeId].dangerLabel,
        freezeReady: mods.freezeCharges > 0 && mods.freezeDuration > 0,
        freezeActive: false,
        tsunamiReady: mods.tsunamiCharges > 0,
      });
      setRunThemeId(launchedThemeId);
      setRestartToken(0);
      setPaused(false);
      setRunKey((k) => k + 1);
      setScreen("playing");
    },
    [equipped, mode],
  );

  const launchRun = useCallback(() => {
    if (mode === "p2e") return;
    if (mode === "p2m" && supply.soldOut) return;
    if (mode === "p2m") {
      // Wait for the session before the first tick — the run must be seeded
      // (and recorded) from tick 0 for the server's replay to accept it.
      // The server pins the hourly theme with the session, so an hour
      // rollover between click and issue can't desync the replay.
      setRunSession(null);
      void requestRunSession(address).then((s) => {
        setRunSession(s);
        beginRun(s ? s.themeId : p2mThemeId);
      });
    } else {
      setRunSession(null);
      beginRun(themeId);
    }
  }, [address, beginRun, mode, p2mThemeId, supply.soldOut, themeId]);

  const startRun = useCallback(() => {
    if (mode === "p2e") return;
    // Connect-first: both modes need a wallet, P2M needs it on Robinhood
    // Chain (the mint lives there). The menu gates this too — this is the
    // backstop.
    if (!hasWallet) return;
    if (mode === "p2m" && !walletOnRobinhood) return;
    if (mode === "p2m" && (supply.soldOut || mintCapReached)) return;
    launchRun();
  }, [
    hasWallet,
    launchRun,
    mintCapReached,
    mode,
    supply.soldOut,
    walletOnRobinhood,
  ]);

  const restart = useCallback(() => {
    audio.sfx("click");
    recordedRef.current = false;
    setNewBest(false);
    setPaused(false);
    if (mode === "p2m") {
      // A restart is a NEW run — fetch the fresh session (new seed, new
      // clock) BEFORE resetting the Game, so the replayed world and the
      // recorded inputs always match.
      setRunRecord(null);
      void requestRunSession(address).then((s) => {
        setRunSession(s);
        inputRef.current?.requestRestart();
        setRestartToken((n) => n + 1);
      });
    } else {
      inputRef.current?.requestRestart();
      setRestartToken((n) => n + 1);
    }
  }, [address, mode]);

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
        p2mThemeId={p2mThemeId}
        soldOut={supply.soldOut}
        mintCapReached={mintCapReached}
        walletConnected={hasWallet}
        onRobinhood={walletOnRobinhood}
      />
    );
  }

  // Theme for the active run — locked at launch (see launchRun) so a
  // UTC-hour rollover mid-run cannot flip the live world.
  const activeThemeId = screen === "playing" ? runThemeId : mode === "p2m" ? p2mThemeId : themeId;
  const accent = getTheme(activeThemeId).accent;
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
            themeId={activeThemeId}
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
            sessionSeed={runSession?.seed ?? null}
            onRunRecord={mode === "p2m" ? handleRunRecord : undefined}
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
            runSessionId={runSession?.sessionId ?? null}
            runRecord={runRecord}
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
