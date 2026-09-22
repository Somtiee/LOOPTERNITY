"use client";

import type { MutableRefObject } from "react";
import type { KeyboardInput } from "@/game/input/KeyboardInput";

type TouchPadProps = {
  inputRef: MutableRefObject<KeyboardInput | null>;
  accent?: string;
  visible: boolean;
  freezeReady?: boolean;
  freezeActive?: boolean;
  tsunamiReady?: boolean;
};

function PadBtn({
  label,
  aria,
  accent,
  className,
  onHold,
  onRelease,
}: {
  label: string;
  aria: string;
  accent: string;
  className?: string;
  onHold: () => void;
  onRelease: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={aria}
      className={`pointer-events-auto flex h-14 w-14 touch-none select-none items-center justify-center rounded-2xl border border-white/30 bg-black/55 font-[family-name:var(--font-display)] text-[11px] tracking-[0.14em] text-white/90 backdrop-blur-sm active:brightness-125 ${className ?? ""}`}
      style={{ boxShadow: `0 0 16px ${accent}44` }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        onHold();
      }}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
    >
      {label}
    </button>
  );
}

/**
 * Ability button: a one-tap pill with the full ability word (no "F"/"T"
 * letters to memorize on a phone). Visible only when the climb reports the
 * ability in play; shows a dimmed state (still 56px+ tall) while the effect
 * is running and the next charge is not ready yet.
 */
function AbilityBtn({
  label,
  busyLabel,
  aria,
  color,
  ready,
  onFire,
}: {
  label: string;
  busyLabel: string;
  aria: string;
  color: string;
  ready: boolean;
  onFire: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={aria}
      disabled={!ready}
      className={`pointer-events-auto flex min-h-14 min-w-24 touch-none select-none items-center justify-center rounded-2xl border px-4 font-[family-name:var(--font-display)] text-[11px] tracking-[0.14em] backdrop-blur-sm ${
        ready
          ? "border-white/30 bg-black/55 text-white/90 active:brightness-125"
          : "cursor-not-allowed border-white/15 bg-black/40 text-white/40"
      }`}
      style={{ boxShadow: `0 0 16px ${ready ? `${color}55` : "transparent"}` }}
      onPointerDown={(e) => {
        if (!ready) return;
        e.preventDefault();
        onFire();
      }}
    >
      {ready ? label : busyLabel}
    </button>
  );
}

/** Mobile: discrete UP / LEFT / RIGHT. UP boosts. Abilities on the right. */
export function VirtualPad({
  inputRef,
  accent = "#00C805",
  visible,
  freezeReady = false,
  freezeActive = false,
  tsunamiReady = false,
}: TouchPadProps) {
  // Hidden while paused / on the game-over card, and the HUD snapshot is
  // reset on restart, so charges can never leave a stale button behind.
  if (!visible) return null;

  const showFreeze = freezeReady || freezeActive;
  const showAbilities = showFreeze || tsunamiReady;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-col items-center gap-2">
        <PadBtn
          label="UP"
          aria="Boost up"
          accent={accent}
          onHold={() => inputRef.current?.setBoostHeld(true)}
          onRelease={() => inputRef.current?.setBoostHeld(false)}
        />
        <div className="flex gap-2">
          <PadBtn
            label="LEFT"
            aria="Dodge left"
            accent={accent}
            onHold={() => inputRef.current?.setHeldLeft(true)}
            onRelease={() => inputRef.current?.setHeldLeft(false)}
          />
          <PadBtn
            label="RIGHT"
            aria="Dodge right"
            accent={accent}
            onHold={() => inputRef.current?.setHeldRight(true)}
            onRelease={() => inputRef.current?.setHeldRight(false)}
          />
        </div>
      </div>
      {showAbilities ? (
        <div className="flex flex-col items-end gap-2">
          {tsunamiReady ? (
            <AbilityBtn
              label="TSUNAMI"
              busyLabel="TSUNAMI"
              aria="Unleash tsunami"
              color="#00C805"
              ready={tsunamiReady}
              onFire={() => inputRef.current?.requestTsunami()}
            />
          ) : null}
          {showFreeze ? (
            <AbilityBtn
              label="FREEZE"
              busyLabel="FROZEN…"
              aria="Freeze the danger"
              color="#9ee8ff"
              ready={freezeReady}
              onFire={() => inputRef.current?.requestFreeze()}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
