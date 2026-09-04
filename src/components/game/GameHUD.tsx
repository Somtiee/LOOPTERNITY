"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { SINK } from "@/game/constants";
import { audio } from "@/game/audio/AudioManager";
import {
  formatRarityGate,
  highestRarityForSurvival,
  nextRarityGate,
  RARITIES,
} from "@/game/mintTiers";
import { formatSurvivalTime } from "@/game/score";
import type { GameMode, HudSnapshot } from "@/game/types";
import type { RunRecord } from "@/game/engine/Game";
import { ConnectWalletButton } from "@/components/web3/ConnectWalletButton";
import { CHAIN_SWITCH_LABEL } from "@/web3/config";
import { useWalletSession } from "@/web3/hooks/useWalletSession";
import {
  formatMintPriceEth,
  useMintLoopitern,
} from "@/web3/loopiterns";
import { LoopiternPortrait } from "./LoopiternPortrait";
import { MuteButton } from "./MuteButton";

const MAX_LOOPITERNS_PER_WALLET = 5;
const MINT_GREEN = "#00C805";
const MINT_INK = "#05140a";
/**
 * Sample tokenIds whose generated stills ship in the repo — cycled in the
 * mint preview so a rarity is never shown as one repeated image. Actual
 * tokenIds are assigned at mint; every token recolors differently (J4 DNA).
 */
const MINT_PREVIEW_TOKEN_IDS = [1, 9, 44] as const;

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
  /** Server-issued run session id for this P2M run (replay attestation). */
  runSessionId?: string | null;
  /** The finished run's recorded input log (produced by the deterministic sim). */
  runRecord?: RunRecord | null;
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

function mintButtonLabel(
  status: ReturnType<typeof useMintLoopitern>["status"],
): string {
  if (status === "confirm") return "CONFIRM IN WALLET";
  if (status === "pending") return "PENDING…";
  if (status === "success") return "MINTED";
  if (status === "error") return "RETRY MINT";
  return "MINT LOOPITERN";
}

/** Live remaining at a rarity, e.g. "1,497 left" — falls back to the cap. */
function formatMintRemaining(
  remainingByRarity: number[] | undefined,
  rarityId: number,
): string {
  const rarity = RARITIES[rarityId];
  const n = remainingByRarity?.[rarityId];
  if (n === undefined || !Number.isFinite(n)) {
    return `${(rarity?.supply ?? 0).toLocaleString()} max`;
  }
  return `${Math.max(0, n).toLocaleString()} left`;
}

function P2mMintBlock({
  timeSurvived,
  runSessionId,
  runRecord,
}: {
  timeSurvived: number;
  runSessionId: string | null;
  runRecord: RunRecord | null;
}) {
  const { hasWallet, onRobinhood } = useWalletSession();
  // The record's clock is the sim's exact time at death — the value the
  // server's replay must reproduce within tolerance.
  const claimTime = runRecord?.timeSurvived ?? timeSurvived;
  const {
    configured,
    loading,
    mintPrice,
    remainingByRarity,
    ownedCount,
    paused,
    requested: unlocked,
    resolved: willMint,
    status,
    errorMessage,
    tokenId,
    explorerTxUrl,
    mint,
    refetchInventory,
  } = useMintLoopitern(claimTime, runSessionId, runRecord);
  const next = nextRarityGate(claimTime);
  const dropped = Boolean(
    unlocked && willMint && willMint.id !== unlocked.id,
  );
  const playedSuccess = useRef(false);

  useEffect(() => {
    if (status === "success" && !playedSuccess.current) {
      playedSuccess.current = true;
      audio.sfx("success");
    }
    if (status !== "success") playedSuccess.current = false;
  }, [status]);

  const busy = status === "confirm" || status === "pending";
  const collectionSoldOut = Boolean(
    remainingByRarity?.every((n) => n === 0),
  );

  let disableReason: string | null = null;
  if (!configured) {
    // Not an error — the app degrades honestly when the address is unset.
    disableReason = "Minting not live yet — the LOOPITERNS contract isn't deployed. Preview art only.";
  } else if (loading) {
    disableReason = "Checking supply…";
  } else if (remainingByRarity === undefined) {
    disableReason = "Could not read remaining supply.";
  } else if (!unlocked) {
    disableReason = `Survive ${formatRarityGate(RARITIES[0].minSeconds)} to unlock a mint.`;
  } else if (!willMint) {
    disableReason = collectionSoldOut
      ? "Collection sold out — all 10,000 LOOPITERNS minted."
      : "Every rarity you unlocked is sold out for this run.";
  } else if (paused) {
    disableReason = "Minting is paused.";
  } else if (mintPrice === undefined) {
    disableReason = "Could not read mint price.";
  } else if (!hasWallet) {
    disableReason = "Connect a wallet to mint.";
  } else if (!onRobinhood) {
    disableReason = `Wrong network — tap the button above to switch to ${CHAIN_SWITCH_LABEL}.`;
  } else if (ownedCount >= MAX_LOOPITERNS_PER_WALLET) {
    disableReason = "MINT LIMIT REACHED — 5/5 LOOPITERNS";
  } else if (!runSessionId || !runRecord) {
    // Session or record missing (offline / 503 / unattested run). Restarting
    // gets a fresh attested run — better than a dead button with no explanation.
    disableReason = "No verified run — hit NEW GAME, play, then mint.";
  }

  const mintEnabled = disableReason === null && !busy && status !== "success";

  return (
    <div className="mt-4 rounded-xl border border-[#00C805]/40 bg-[#00C805]/10 px-3 py-3 text-left">
      <div className="flex items-center gap-3">
        {willMint || unlocked ? (
          <div className="flex shrink-0 items-center gap-1.5">
            {MINT_PREVIEW_TOKEN_IDS.map((sampleId) => (
              <LoopiternPortrait
                key={sampleId}
                rarity={(willMint ?? unlocked)!.id}
                tokenId={sampleId}
                size="sm"
                className={willMint ? "" : "opacity-40"}
              />
            ))}
          </div>
        ) : (
          <LoopiternPortrait rarity={0} size="sm" className="opacity-25 grayscale" />
        )}
        <div className="min-w-0 flex-1">
          {unlocked ? (
            willMint ? (
              <p
                className="font-[family-name:var(--font-display)] text-xs tracking-[0.16em]"
                style={{ color: unlocked.accent }}
              >
                {unlocked.name.toUpperCase()}
              </p>
            ) : (
              <p className="font-[family-name:var(--font-display)] text-xs tracking-[0.16em] text-white/40">
                {unlocked.name.toUpperCase()} · SOLD OUT
              </p>
            )
          ) : (
            <p className="font-[family-name:var(--font-display)] text-xs tracking-[0.16em] text-white/70">
              NO MINT YET
            </p>
          )}
        </div>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-white/55">
        {unlocked
          ? dropped && willMint
            ? `${unlocked.name} sold out — minting ${willMint.name}.`
            : willMint
              ? `${formatMintRemaining(remainingByRarity, unlocked.id)} at ${unlocked.name}`
              : collectionSoldOut
                ? "All 10,000 LOOPITERNS are minted."
                : "Sold out for this run."
          : next
            ? `First LOOPITERN unlocks at ${formatRarityGate(next.minSeconds)}.`
            : "Survive to unlock a mint."}
      </p>
      {mintPrice !== undefined ? (
        <p className="mt-1 text-[10px] tabular-nums text-white/40">
          {formatMintPriceEth(mintPrice)}
        </p>
      ) : null}
      <div className="mt-3 flex justify-center">
        <ConnectWalletButton size="sm" />
      </div>
      <button
        type="button"
        disabled={!mintEnabled}
        onClick={() => {
          if (!mintEnabled) return;
          audio.sfx("click");
          void mint();
        }}
        className={`mt-3 min-h-12 w-full rounded-xl px-4 py-3 font-[family-name:var(--font-display)] text-sm tracking-[0.18em] transition ${
          mintEnabled
            ? "hover:brightness-110 active:scale-[0.99]"
            : "cursor-not-allowed opacity-45"
        }`}
        style={{
          background: MINT_GREEN,
          color: MINT_INK,
        }}
      >
        {mintButtonLabel(status)}
      </button>
      {status === "confirm" ? (
        <p className="mt-2 text-center text-[10px] leading-relaxed text-[#7CFF7C]">
          Confirm in wallet…
        </p>
      ) : null}
      {status === "pending" ? (
        <p className="mt-2 text-center text-[10px] leading-relaxed text-[#7CFF7C]">
          Mint pending on Robinhood Chain…
        </p>
      ) : null}
      {status === "success" ? (
        <p className="mt-2 text-center text-[10px] leading-relaxed text-[#7CFF7C]">
          {tokenId !== null ? `Minted #${tokenId.toString()}` : "Minted"}
          {explorerTxUrl ? (
            <>
              {" · "}
              <a
                href={explorerTxUrl}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-[#00C805]/70 underline-offset-2 hover:text-white"
              >
                View tx on Blockscout
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      {status === "error" && errorMessage ? (
        <p className="mt-2 text-center text-[10px] leading-relaxed text-red-300/90">
          {errorMessage}
        </p>
      ) : null}
      {disableReason && status === "idle" ? (
        remainingByRarity === undefined && !loading ? (
          <p className="mt-2 text-center text-[10px] leading-relaxed text-white/45">
            {disableReason}{" "}
            <button
              type="button"
              onClick={() => {
                audio.sfx("click");
                void refetchInventory();
              }}
              className="pointer-events-auto underline decoration-white/40 underline-offset-2 hover:text-white"
            >
              Retry
            </button>
          </p>
        ) : (
          <p className="mt-2 text-center text-[10px] leading-relaxed text-white/45">
            {disableReason}
          </p>
        )
      ) : null}
    </div>
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
  runSessionId = null,
  runRecord = null,
}: GameHUDProps) {
  const showOverlay = paused && hud.phase !== "gameover";
  const p2mUnlocked =
    mode === "p2m" ? highestRarityForSurvival(hud.timeSurvived) : null;
  const p2mNext = mode === "p2m" ? nextRarityGate(hud.timeSurvived) : null;

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
              {`${hud.themeName} · ${difficultyLabel}`}
            </p>
            {touchControls ? (
              <div className="mt-2">
                <p className="mb-1 text-[10px] uppercase tracking-[0.22em] text-white/40">
                  Shields
                </p>
                <div className="flex gap-1.5">
                  {Array.from({ length: Math.max(hud.maxShields, 1) }, (_, i) => {
                    const on = i < hud.shields;
                    return (
                      <span
                        key={i}
                        className="h-3 w-6 rounded-sm border"
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
              </div>
            ) : null}
          </div>
        </div>

        <div className="text-right">
          <p className="font-[family-name:var(--font-display)] text-2xl tabular-nums tracking-wide text-white">
            {formatSurvivalTime(hud.timeSurvived)}
          </p>
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">
            Survived
          </p>
          {mode === "p2m" ? (
            <p
              className="mt-1 text-[10px] tracking-[0.08em]"
              style={{ color: p2mUnlocked?.accent ?? "rgba(255,255,255,0.4)" }}
            >
              {p2mUnlocked
                ? p2mNext
                  ? `${p2mUnlocked.name} · next ${p2mNext.name} ${formatRarityGate(p2mNext.minSeconds)}`
                  : `${p2mUnlocked.name} max`
                : p2mNext
                  ? `Next ${p2mNext.name} ${formatRarityGate(p2mNext.minSeconds)}`
                  : ""}
            </p>
          ) : null}
        </div>
      </header>

      <div
        className={`flex items-end justify-between gap-3 ${
          touchControls ? "pb-24" : ""
        }`}
      >
        {touchControls ? (
          <div />
        ) : (
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
        )}

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
          {hud.freezeActive ? (
            <p className="mb-1 font-[family-name:var(--font-display)] text-[10px] tracking-[0.18em] text-[#9ee8ff]">
              FROZEN
            </p>
          ) : hud.freezeReady ? (
            <p className="mb-1 font-[family-name:var(--font-display)] text-[10px] tracking-[0.18em] text-[#9ee8ff]">
              {touchControls ? "FREEZE READY" : "F · FREEZE"}
            </p>
          ) : null}
          {hud.tsunamiReady ? (
            <p className="mb-1 font-[family-name:var(--font-display)] text-[10px] tracking-[0.18em] text-[#00C805]">
              {touchControls ? "TSUNAMI READY" : "T · TSUNAMI"}
            </p>
          ) : null}
          <p className="text-[11px] text-white/35">
            {hud.sinkStage > 0
              ? "Keep boosting or the rise takes you"
              : touchControls
                ? "LEFT · RIGHT dodge · UP boost"
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
              className="mt-6 min-h-12 w-full rounded-xl px-4 py-3 font-[family-name:var(--font-display)] text-sm tracking-[0.2em] text-[#05140a] transition hover:brightness-110"
              style={{
                background: "linear-gradient(90deg, #00C805, #7CFF7C)",
              }}
            >
              RESUME
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="mt-2 min-h-12 w-full rounded-xl border border-[#00C805]/40 bg-[#00C805]/10 px-4 py-3 font-[family-name:var(--font-display)] text-xs tracking-[0.2em] text-[#7CFF7C] transition hover:bg-[#00C805]/20"
            >
              NEW GAME
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
              {`${hud.themeName} · ${difficultyLabel}`}
              <br />
              Climbed {Math.floor(hud.height)}m.
            </p>
            {mode === "p2m" ? (
              <P2mMintBlock
                timeSurvived={hud.timeSurvived}
                runSessionId={runSessionId}
                runRecord={runRecord}
              />
            ) : null}
            <button
              type="button"
              onClick={onRestart}
              className="mt-6 min-h-12 w-full rounded-xl px-4 py-3 font-[family-name:var(--font-display)] text-sm tracking-[0.2em] text-[#05140a] transition hover:brightness-110"
              style={{
                background: "linear-gradient(90deg, #00C805, #7CFF7C)",
              }}
            >
              RUN AGAIN
            </button>
            <button
              type="button"
              onClick={onMenu}
              className="mt-2 min-h-12 w-full rounded-xl border border-[#00C805]/40 bg-[#00C805]/10 px-4 py-3 font-[family-name:var(--font-display)] text-xs tracking-[0.2em] text-[#7CFF7C] transition hover:bg-[#00C805]/20"
            >
              MAIN MENU
            </button>
            <p className="mt-3 text-[11px] text-white/35">
              Press R / Enter
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
