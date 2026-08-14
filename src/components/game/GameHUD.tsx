import type { ReactNode } from "react";
import { ConfidentialScorePanel } from "@/components/web3/ConfidentialScorePanel";
import { SINK } from "@/game/constants";
import { formatSurvivalTime } from "@/game/score";
import type { GameMode, HudSnapshot } from "@/game/types";
import { MuteButton } from "./MuteButton";

type GameHUDProps = {
  hud: HudSnapshot;
  accent: string;
  difficultyLabel: string;
  paused: boolean;
  mode: GameMode;
  isNewBest: boolean;
  previousBest: number;
  onPauseToggle: () => void;
  onRestart: () => void;
  onMenu: () => void;
  touchControls?: boolean;
};

function HudIconBtn({
  label,
  title,
  onClick,
  children,
}: {
  label: string;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      onClick={onClick}
      className="pointer-events-auto inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-xl border border-white/15 bg-black/45 px-3 text-[10px] font-[family-name:var(--font-display)] tracking-[0.12em] text-white/80 backdrop-blur-sm transition hover:border-white/30 hover:bg-black/60 hover:text-white active:scale-95 sm:h-9 sm:min-w-9 sm:px-2"
    >
      {children}
    </button>
  );
}

export function GameHUD({
  hud,
  accent,
  difficultyLabel,
  paused,
  mode,
  isNewBest,
  previousBest,
  onPauseToggle,
  onRestart,
  onMenu,
  touchControls = false,
}: GameHUDProps) {
  const showOverlay = paused && hud.phase !== "gameover";

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <HudIconBtn
              label={paused ? "Resume" : "Pause"}
              title={paused ? "Resume (Esc)" : "Pause (Esc)"}
              onClick={onPauseToggle}
            >
              {paused ? "RESUME" : "PAUSE"}
            </HudIconBtn>
            <HudIconBtn label="Main menu" title="Main menu" onClick={onMenu}>
              MENU
            </HudIconBtn>
            <MuteButton size="sm" />
            <HudIconBtn label="New game" title="New game" onClick={onRestart}>
              NEW
            </HudIconBtn>
          </div>
          <div>
            <p
              className="font-[family-name:var(--font-display)] text-[11px] tracking-[0.35em]"
              style={{ color: accent }}
            >
              LOOPTERNITY
            </p>
            <p className="mt-0.5 text-xs text-white/45">
              {mode === "p2e" ? `${hud.themeName} · Weekly` : `${hud.themeName} · ${difficultyLabel}`}
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="font-[family-name:var(--font-display)] text-2xl tabular-nums tracking-wide text-white">
            {formatSurvivalTime(hud.timeSurvived)}
          </p>
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">
            Survived
          </p>
        </div>
      </header>

      <div
        className={`flex items-end justify-between gap-3 ${
          touchControls ? "pb-28" : ""
        }`}
      >
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-[0.22em] text-white/40">
            Shields
          </p>
          <div className="flex gap-1.5">
            {Array.from({ length: Math.max(hud.maxShields, 1) }, (_, i) => {
              const on = i < hud.shields;
              return (
                <span
                  key={i}
                  className="h-3.5 w-7 rounded-sm border"
                  style={
                    on
                      ? {
                          borderColor: `${accent}cc`,
                          background: `linear-gradient(90deg, ${accent}, #ffe08a)`,
                          boxShadow: `0 0 12px ${accent}88`,
                        }
                      : {
                          borderColor: "rgba(255,255,255,0.15)",
                          background: "rgba(255,255,255,0.05)",
                        }
                  }
                />
              );
            })}
          </div>
          {hud.intensity > 0.35 && (
            <p className="mt-1 text-[10px] text-white/30">
              Intensity rising · enemies denser
            </p>
          )}
        </div>

        <div className="text-right">
          {hud.sinkStage > 0 && (
            <p
              className="mb-1 font-[family-name:var(--font-display)] text-[10px] tracking-[0.16em]"
              style={{ color: accent }}
            >
              {hud.dangerLabel.toUpperCase()} PULL ×{hud.sinkStage}
              {hud.sinkStage >= SINK.maxStage ? " MAX" : ""}
            </p>
          )}
          <p
            className="mb-1 font-[family-name:var(--font-display)] text-[10px] tracking-[0.18em]"
            style={{ color: hud.boostReady ? accent : "rgba(255,255,255,0.3)" }}
          >
            {hud.boostReady ? "BOOST READY" : "BOOST…"}
          </p>
          <p className="text-[11px] text-white/35">
            {hud.sinkStage > 0
              ? "Keep boosting or the rise takes you"
              : touchControls
                ? "Stick · L/R dodge · up / BOOST"
                : "W / ↑ / Space"}
            <br />
            Height {Math.floor(hud.height)}m
          </p>
        </div>
      </div>

      {showOverlay && (
        <div className="pointer-events-auto absolute inset-0 flex items-end justify-center bg-black/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
          <div className="w-full max-w-sm rounded-t-2xl border border-white/15 bg-[#0d0a10]/95 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6 text-center shadow-[0_20px_60px_rgba(0,0,0,0.55)] sm:rounded-2xl sm:px-6 sm:py-7">
            <p
              className="font-[family-name:var(--font-display)] text-xs tracking-[0.35em]"
              style={{ color: accent }}
            >
              PAUSED
            </p>
            <p className="mt-3 text-sm text-white/55">
              Take a breath. The rise waits.
            </p>
            <button
              type="button"
              onClick={onPauseToggle}
              className="mt-6 min-h-12 w-full rounded-xl px-4 py-3 font-[family-name:var(--font-display)] text-sm tracking-[0.2em] text-[#0a0608] transition hover:brightness-110"
              style={{
                background: `linear-gradient(90deg, ${accent}, #ffe08a)`,
              }}
            >
              RESUME
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="mt-2 min-h-12 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 font-[family-name:var(--font-display)] text-xs tracking-[0.2em] text-white/80 transition hover:bg-white/10"
            >
              {mode === "p2e" ? "PAY & NEW RUN" : "NEW GAME"}
            </button>
            <button
              type="button"
              onClick={onMenu}
              className="mt-2 min-h-12 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 font-[family-name:var(--font-display)] text-xs tracking-[0.2em] text-white/80 transition hover:bg-white/10"
            >
              MAIN MENU
            </button>
          </div>
        </div>
      )}

      {hud.phase === "gameover" && (
        <div className="pointer-events-auto absolute inset-0 flex items-end justify-center bg-black/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
          <div className="max-h-[min(92dvh,100%)] w-full max-w-sm overflow-y-auto rounded-t-2xl border border-white/15 bg-[#0d0a10]/95 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6 text-center shadow-[0_20px_60px_rgba(0,0,0,0.55)] sm:rounded-2xl sm:px-6 sm:py-7">
            <p
              className="font-[family-name:var(--font-display)] text-xs tracking-[0.35em]"
              style={{ color: accent }}
            >
              CAUGHT
            </p>
            <p className="mt-3 font-[family-name:var(--font-display)] text-3xl tracking-wide text-white">
              {formatSurvivalTime(hud.timeSurvived)}
            </p>
            {isNewBest && mode === "normal" ? (
              <p
                className="juice-pop mt-2 font-[family-name:var(--font-display)] text-xs tracking-[0.22em]"
                style={{ color: accent }}
              >
                NEW PERSONAL BEST
                {previousBest > 0
                  ? ` · was ${formatSurvivalTime(previousBest)}`
                  : ""}
              </p>
            ) : null}
            <p className="mt-2 text-sm text-white/55">
              {mode === "p2e"
                ? hud.themeName
                : `${hud.themeName} · ${difficultyLabel}`}
              <br />
              Climbed {Math.floor(hud.height)}m.
            </p>
            {mode === "p2e" ? (
              <ConfidentialScorePanel
                hud={hud}
                accent={accent}
                onRestart={onRestart}
                onMenu={onMenu}
              />
            ) : (
              <>
                <button
                  type="button"
                  onClick={onRestart}
                  className="mt-6 min-h-12 w-full rounded-xl px-4 py-3 font-[family-name:var(--font-display)] text-sm tracking-[0.2em] text-[#0a0608] transition hover:brightness-110"
                  style={{
                    background: `linear-gradient(90deg, ${accent}, #ffe08a)`,
                  }}
                >
                  RUN AGAIN
                </button>
                <button
                  type="button"
                  onClick={onMenu}
                  className="mt-2 min-h-12 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 font-[family-name:var(--font-display)] text-xs tracking-[0.2em] text-white/80 transition hover:bg-white/10"
                >
                  MAIN MENU
                </button>
                <p className="mt-3 text-[11px] text-white/35">
                  Press R / Enter / Space
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
