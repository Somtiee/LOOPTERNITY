"use client";

import { useEffect, useRef } from "react";
import { CHARACTER_IDS, getCharacter } from "@/game/characters";
import { drawCharacter } from "@/game/render/drawCharacter";
import type { CharacterId } from "@/game/types";

type CharacterSelectProps = {
  characterId: CharacterId;
  accent: string;
  onChange: (id: CharacterId) => void;
};

export function CharacterSelect({
  characterId,
  accent,
  onChange,
}: CharacterSelectProps) {
  return (
    <section className="mt-7">
      <h2 className="mb-1 font-[family-name:var(--font-display)] text-xs tracking-[0.28em] text-white/70">
        RUNNER
      </h2>
      <p className="mb-3 text-[11px] text-white/35">Looks only — same climb.</p>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {CHARACTER_IDS.map((id) => {
          const def = getCharacter(id);
          const selected = id === characterId;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={`flex min-h-[8.5rem] flex-col items-center rounded-2xl border px-1.5 py-2 transition duration-200 sm:min-h-[9.25rem] sm:px-2 ${
                selected
                  ? "border-white/40 bg-white/10"
                  : "border-white/10 bg-black/25 hover:border-white/25 hover:bg-white/5"
              }`}
              style={
                selected ? { boxShadow: `0 0 28px ${def.trim}33` } : undefined
              }
            >
              <CharacterPortrait id={id} accent={accent} />
              <span className="mt-1 font-[family-name:var(--font-display)] text-[10px] tracking-[0.16em] text-white sm:text-[11px]">
                {def.name.toUpperCase()}
              </span>
              <span className="mt-0.5 px-0.5 text-center text-[10px] leading-snug text-white/40">
                {def.blurb}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CharacterPortrait({ id, accent }: { id: CharacterId; accent: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const look = getCharacter(id);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = 64;
    const cssH = 72;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let raf = 0;
    let t = 0;
    const tick = (now: number) => {
      t = now / 1000;
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.save();
      ctx.translate(cssW / 2, cssH - 8);
      ctx.scale(0.92, 0.92);
      drawCharacter(ctx, {
        look,
        facing: 1,
        bob: t * 4,
        vxNorm: 0,
        boosting: false,
        accent,
      });
      ctx.restore();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [accent, id]);

  return (
    <canvas
      ref={canvasRef}
      width={64}
      height={72}
      className="h-[72px] w-16 shrink-0"
      aria-hidden
    />
  );
}
