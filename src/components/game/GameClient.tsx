"use client";

import dynamic from "next/dynamic";

import { GameErrorBoundary } from "./GameErrorBoundary";

const GameApp = dynamic(() => import("./GameApp"), {
  ssr: false,
  loading: () => (
    <main className="flex min-h-dvh items-center justify-center bg-[#070309]">
      <p className="font-[family-name:var(--font-display)] text-xl tracking-[0.28em] text-orange-200/80">
        LOOPTERNITY
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
