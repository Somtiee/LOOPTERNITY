"use client";

import { useCallback, useRef, type MutableRefObject } from "react";
import type { KeyboardInput } from "@/game/input/KeyboardInput";

const RADIUS = 56;
const KNOB = 22;
const DEAD = 0.18;

type VirtualPadProps = {
  inputRef: MutableRefObject<KeyboardInput | null>;
  accent?: string;
  visible: boolean;
};

export function VirtualPad({
  inputRef,
  accent = "#ff6a2a",
  visible,
}: VirtualPadProps) {
  const stickRef = useRef<HTMLDivElement | null>(null);
  const knobRef = useRef<HTMLDivElement | null>(null);
  const pointerId = useRef<number | null>(null);

  const applyStick = useCallback(
    (clientX: number, clientY: number) => {
      const el = stickRef.current;
      const input = inputRef.current;
      if (!el || !input) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const max = RADIUS - KNOB * 0.35;
      const dist = Math.hypot(dx, dy);
      if (dist > max && dist > 0) {
        dx = (dx / dist) * max;
        dy = (dy / dist) * max;
      }
      const nx = max > 0 ? dx / max : 0;
      const ny = max > 0 ? dy / max : 0;
      if (knobRef.current) {
        knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
      }
      input.setAnalog(Math.abs(nx) < DEAD ? 0 : nx);
      input.setBoostHeld(ny < -0.42);
    },
    [inputRef],
  );

  const resetStick = useCallback(() => {
    if (knobRef.current) {
      knobRef.current.style.transform = "translate(0px, 0px)";
    }
    inputRef.current?.setAnalog(0);
    inputRef.current?.setBoostHeld(false);
    pointerId.current = null;
  }, [inputRef]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div
        ref={stickRef}
        className="pointer-events-auto relative h-[112px] w-[112px] touch-none select-none rounded-full border border-white/25 bg-black/45 backdrop-blur-sm"
        style={{ boxShadow: `0 0 28px ${accent}33` }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          pointerId.current = e.pointerId;
          applyStick(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (pointerId.current !== e.pointerId) return;
          applyStick(e.clientX, e.clientY);
        }}
        onPointerUp={resetStick}
        onPointerCancel={resetStick}
        role="slider"
        aria-label="Move. Drag left or right to dodge. Drag up to boost."
      >
        <div className="absolute inset-[18px] rounded-full border border-white/10" />
        <div
          ref={knobRef}
          className="absolute left-1/2 top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40 will-change-transform"
          style={{
            background: `radial-gradient(circle at 35% 30%, #fff6, ${accent})`,
          }}
        />
        <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] tracking-[0.18em] text-white/45">
          UP
        </span>
        <span className="pointer-events-none absolute top-1/2 left-1 -translate-y-1/2 text-[9px] tracking-[0.12em] text-white/35">
          L
        </span>
        <span className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 text-[9px] tracking-[0.12em] text-white/35">
          R
        </span>
      </div>

      <button
        type="button"
        aria-label="Boost"
        className="pointer-events-auto mb-2 flex h-[72px] w-[72px] touch-none select-none items-center justify-center rounded-full border border-white/30 bg-black/45 font-[family-name:var(--font-display)] text-[11px] tracking-[0.16em] text-white/90 backdrop-blur-sm active:brightness-125"
        style={{ boxShadow: `0 0 22px ${accent}55` }}
        onPointerDown={(e) => {
          e.preventDefault();
          inputRef.current?.setBoostHeld(true);
        }}
        onPointerUp={() => inputRef.current?.setBoostHeld(false)}
        onPointerCancel={() => inputRef.current?.setBoostHeld(false)}
      >
        BOOST
      </button>
    </div>
  );
}
