"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { audio } from "@/game/audio/AudioManager";
import { PLAYER, SINK } from "@/game/constants";
import { useCoarsePointer } from "@/game/input/useCoarsePointer";
import { formatRarityGate, RARITIES } from "@/game/mintTiers";
import { SCORE_WEIGHTS } from "@/game/score";

const GREEN = "#00C805";
const ORANGE = "#ff6a2a";
const INK = "#04140a";

/** 110 → "1:50" — matches how the HUD reads, for the undertow schedule. */
function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-h-7 min-w-7 items-center justify-center rounded-md border border-white/25 bg-white/10 px-2 font-[family-name:var(--font-display)] text-[11px] tracking-[0.08em] text-white/90">
      {children}
    </kbd>
  );
}

function Row({ keys, hint }: { keys: string[]; hint: string }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {keys.map((k) => (
        <Key key={k}>{k}</Key>
      ))}
      <span className="ml-1 text-[11px] leading-snug text-white/50">
        {hint}
      </span>
    </div>
  );
}

function Card({
  label,
  accent,
  children,
}: {
  label: string;
  accent: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3.5">
      <p
        className="font-[family-name:var(--font-display)] text-[11px] tracking-[0.24em]"
        style={{ color: accent }}
      >
        {label}
      </p>
      <div className="mt-1.5 text-xs leading-relaxed text-white/60">
        {children}
      </div>
    </div>
  );
}

type HowToPlayProps = {
  /** Live theme accent, so the sheet sits in the same chrome as the menu. */
  accent?: string;
  onClose: () => void;
};

/**
 * Controls / rules sheet. Opened from the start menu and the pause card.
 *
 * While it is open it swallows keydown at the window in the capture phase, so
 * a stray Space or arrow aimed at the sheet can never queue a boost into the
 * sim paused behind it. Escape closes.
 */
export function HowToPlay({ accent = GREEN, onClose }: HowToPlayProps) {
  const coarse = useCoarsePointer();
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      // Keys aimed at a button/link still need their default (Space/Enter
      // activate). Everything else is dropped before it reaches the game.
      const target = e.target as HTMLElement | null;
      const interactive = target?.closest?.(
        "button, a, input, select, textarea, [role='button']",
      );
      if (!interactive && (e.code === "Space" || e.key.startsWith("Arrow"))) {
        e.preventDefault();
      }
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const close = () => {
    void audio.unlock();
    audio.sfx("click");
    onClose();
  };

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={close}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="How to play"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[min(92dvh,100%)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl border border-white/15 bg-[#0d0a10] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-[0_20px_60px_rgba(0,0,0,0.55)] outline-none sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p
              className="font-[family-name:var(--font-display)] text-xs tracking-[0.35em]"
              style={{ color: ORANGE }}
            >
              LOOPTERNITY
            </p>
            <h2 className="mt-1.5 font-[family-name:var(--font-display)] text-lg tracking-[0.2em] text-white">
              HOW TO PLAY
            </h2>
            <p className="mt-1 text-sm text-white/50">
              Survive the rise. Dodge. Manage shields.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close how to play"
            title="Close (Esc)"
            onClick={close}
            className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white/70 transition hover:border-white/30 hover:bg-white/10 hover:text-white active:scale-95"
          >
            <span aria-hidden className="text-base leading-none">
              ✕
            </span>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Card label="MOVE" accent={accent}>
            <p>Dodge left and right along the wall.</p>
            {coarse ? (
              <p className="mt-2 text-[11px] text-white/50">
                Tap the <span className="text-white/80">left or right half</span>{" "}
                of the field — or hold{" "}
                <span className="text-white/80">LEFT / RIGHT</span>.
              </p>
            ) : (
              <Row keys={["A", "D"]} hint="or ← / →" />
            )}
          </Card>

          <Card label="BOOST" accent={accent}>
            <p>
              Kick upward. Boost opens real space above the rise — and it
              scores.
            </p>
            {coarse ? (
              <p className="mt-2 text-[11px] text-white/50">
                Hold <span className="text-white/80">UP</span> — or tap the{" "}
                <span className="text-white/80">top of the field</span>.
              </p>
            ) : (
              <Row keys={["W", "↑", "Space"]} hint="any of them" />
            )}
          </Card>

          <Card label="SHIELDS" accent={accent}>
            <p>
              You start with{" "}
              <span className="text-white/85">{PLAYER.maxShields}</span>. A hit
              costs one shield and buys a moment of invulnerability. Lose the
              last one and the run ends.
            </p>
            <p className="mt-2 text-[11px] text-white/45">
              Glowing shields refill the bar as you climb.
            </p>
          </Card>

          <Card label="SCORE" accent={accent}>
            <p>
              Climbing, steering, skating past an enemy and burning boost all
              add up.
            </p>
            <p className="mt-2 text-[11px] tabular-nums text-white/45">
              +{SCORE_WEIGHTS.nearMisses} a near miss · +
              {SCORE_WEIGHTS.boostSeconds} a second boosting
            </p>
            <p className="mt-2 text-[11px] text-white/45">
              Score — not the clock — decides what you can mint.
            </p>
          </Card>

          <div className="sm:col-span-2">
            <Card label="THE RISE" accent={accent}>
              <p>
                The danger climbs from below and never stops. At{" "}
                {clock(SINK.firstAt)}, {clock(SINK.secondAt)} and{" "}
                {clock(SINK.thirdAt)} an undertow drags you toward it — boost to
                break free. Past that it keeps pulsing up to ×{SINK.maxStage}.
              </p>
            </Card>
          </div>
        </div>

        <h3 className="mt-5 font-[family-name:var(--font-display)] text-[11px] tracking-[0.28em] text-white/70">
          MODES
        </h3>
        <div className="mt-2 space-y-2">
          <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-[family-name:var(--font-display)] text-xs tracking-[0.18em] text-white">
                NORMAL
              </span>
              <span
                className="rounded-md border px-2 py-0.5 text-[10px] tracking-[0.14em]"
                style={{ borderColor: `${GREEN}55`, color: GREEN }}
              >
                FREE
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-white/55">
              Pick your world and difficulty, then beat your best. Equipped
              LOOPITERNS apply here — extra shields and speed, plus Freeze /{" "}
              {coarse ? "Tsunami buttons" : "Tsunami on F / T"} once you hold a
              Rare or better.
            </p>
          </div>

          <div className="rounded-2xl border border-[#00C805]/35 bg-[#00C805]/[0.08] px-4 py-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-[family-name:var(--font-display)] text-xs tracking-[0.18em] text-white">
                P2M
              </span>
              <span
                className="rounded-md border px-2 py-0.5 text-[10px] tracking-[0.14em]"
                style={{ borderColor: `${GREEN}55`, color: GREEN }}
              >
                SCORE TO MINT
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-white/55">
              One shared world an hour, vanilla rules — no equipped abilities.
              Reach a score gate in a single run, then pay the mint price to
              claim that rarity.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {RARITIES.map((rarity) => (
                <span
                  key={rarity.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[10px] tracking-[0.08em] text-white/55"
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: rarity.accent }}
                  />
                  <span style={{ color: rarity.accent }}>{rarity.name}</span>
                  {formatRarityGate(rarity.minScore)}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-[family-name:var(--font-display)] text-xs tracking-[0.18em] text-white/70">
                P2E
              </span>
              <span className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] tracking-[0.14em] text-white/45">
                COMING SOON
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-white/40">
              Prize weeks are offline for now.
            </p>
          </div>
        </div>

        {!coarse ? (
          <p className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[10px] tracking-[0.14em] text-white/40">
            <Key>Esc</Key> or <Key>P</Key> pause
            <span className="text-white/20">·</span>
            <Key>R</Key> or <Key>Enter</Key> restart
          </p>
        ) : null}

        <button
          type="button"
          onClick={close}
          className="mt-4 min-h-12 w-full rounded-xl px-4 py-3 font-[family-name:var(--font-display)] text-sm tracking-[0.2em] transition hover:brightness-110 active:scale-[0.99]"
          style={{ background: GREEN, color: INK }}
        >
          GOT IT
        </button>
      </div>
    </div>
  );
}
