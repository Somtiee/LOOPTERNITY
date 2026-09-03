"use client";

import dynamic from "next/dynamic";

import { GameErrorBoundary } from "./GameErrorBoundary";

const GameApp = dynamic(() => import("./GameApp"), {
  ssr: false,
  loading: () => (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[#070309]">
      <p className="font-[family-name:var(--font-display)] text-xl tracking-[0.28em] text-[#f4ead4]/85">
        LOOPTERNITY
      </p>
      <p className="mt-2 font-[family-name:var(--font-display)] text-[10px] tracking-[0.32em] text-[#00C805]/80">
        LOOPITERNS
      </p>
    </main>
  ),
});

export function GameClient() {
  return (
    <GameErrorBoundary>
      <GameApp />
    </GameErrorBoundary>
  );
}
