"use client";

import type { MutableRefObject } from "react";
import type { KeyboardInput } from "@/game/input/KeyboardInput";

type TouchPadProps = {
  inputRef: MutableRefObject<KeyboardInput | null>;
  accent?: string;
  visible: boolean;
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

/** Mobile: discrete UP / LEFT / RIGHT. UP boosts. */
export function VirtualPad({
  inputRef,
  accent = "#ff6a2a",
  visible,
}: TouchPadProps) {
  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-start px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
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
    </div>
  );
}
