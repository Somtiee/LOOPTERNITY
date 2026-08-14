"use client";

import { useEffect, useRef } from "react";
import { useSwitchChain } from "wagmi";
import { ConnectWalletButton } from "@/components/web3/ConnectWalletButton";
import { useSubmitConfidentialScore } from "@/web3/hooks/useSubmitConfidentialScore";
import { audio } from "@/game/audio/AudioManager";
import {
  BASE_CHAIN,
  CHAIN_SWITCH_LABEL,
  EXPLORER_ORIGIN,
} from "@/web3/config";
import type { HudSnapshot } from "@/game/types";

type ConfidentialScorePanelProps = {
  hud: HudSnapshot;
  accent: string;
  onRestart: () => void;
  onMenu: () => void;
};

export function ConfidentialScorePanel({
  hud,
  accent,
  onRestart,
  onMenu,
}: ConfidentialScorePanelProps) {
  const score = useSubmitConfidentialScore(hud);
  const { switchChainAsync } = useSwitchChain();
  const autoStarted = useRef(false);
  const done = score.phase === "submitted" || score.phase === "sealed";
  const readyToPost =
    score.isConnected &&
    score.onBase &&
    score.hasTicket &&
    !score.ticketsLoading &&
    !score.busy &&
    score.phase === "idle";

  useEffect(() => {
    if (autoStarted.current) return;
    if (!readyToPost) return;
    autoStarted.current = true;
    void score.submit();
  }, [readyToPost, score.submit]);

  useEffect(() => {
    if (score.phase === "submitted" || score.phase === "sealed") {
      audio.sfx("success");
    }
  }, [score.phase]);

  const posting =
    score.busy ||
    score.ticketsLoading ||
    (readyToPost && score.phase === "idle");
  const status =
    score.statusLabel ||
    (posting && score.phase === "idle" ? "Posting this run…" : "");

  return (
    <div className="mt-4 border-t border-white/10 pt-4 text-left">
      <p className="font-[family-name:var(--font-display)] text-[10px] tracking-[0.22em] text-white/45">
        WEEKLY BOARD
      </p>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/35">
            This run
          </p>
          <p
            className="font-[family-name:var(--font-display)] text-lg tabular-nums"
            style={{ color: accent }}
          >
            {score.run.label}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/35">
            Close calls
          </p>
          <p className="font-[family-name:var(--font-display)] text-lg tabular-nums text-white">
            {hud.nearMisses}
            {score.run.perfect.cleanRun ? (
              <span className="ml-1 text-[10px] tracking-[0.12em] text-white/45">
                CLEAN
              </span>
            ) : null}
          </p>
        </div>
      </div>

      {status ? (
        <p className="mt-2 text-[11px] leading-relaxed text-white/55">
          {status}
        </p>
      ) : null}

      {!score.isConnected ? (
        <div className="mt-3 flex justify-center">
          <ConnectWalletButton size="sm" />
        </div>
      ) : null}

      {score.isConnected && !score.onBase ? (
        <button
          type="button"
          onClick={() => {
            void switchChainAsync({ chainId: BASE_CHAIN.id }).catch(() => {});
          }}
          className="mt-3 min-h-12 w-full rounded-xl border border-red-400/40 bg-red-500/15 py-2.5 font-[family-name:var(--font-display)] text-[11px] tracking-[0.18em] text-red-100"
        >
          SWITCH TO {CHAIN_SWITCH_LABEL}
        </button>
      ) : null}

      {score.phase === "error" ? (
        <button
          type="button"
          onClick={() => void score.submit()}
          className="mt-3 min-h-12 w-full rounded-xl px-4 py-3 font-[family-name:var(--font-display)] text-xs tracking-[0.18em] text-[#0a0608]"
          style={{
            background: `linear-gradient(90deg, ${accent}, #ffe08a)`,
          }}
        >
          TRY AGAIN
        </button>
      ) : null}

      {score.txHash ? (
        <a
          href={`${EXPLORER_ORIGIN}/tx/${score.txHash}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block text-center text-[10px] tracking-[0.12em] text-white/40 underline-offset-2 hover:text-white/70 hover:underline"
        >
          View on Basescan
        </a>
      ) : null}

      <button
        type="button"
        disabled={posting && !done}
        onClick={onRestart}
        className="mt-5 min-h-12 w-full rounded-xl px-4 py-3 font-[family-name:var(--font-display)] text-sm tracking-[0.2em] text-[#0a0608] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        style={{
          background: `linear-gradient(90deg, ${accent}, #ffe08a)`,
        }}
      >
        PAY & RUN AGAIN
      </button>
      <button
        type="button"
        onClick={onMenu}
        className="mt-2 min-h-12 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 font-[family-name:var(--font-display)] text-xs tracking-[0.2em] text-white/80 transition hover:bg-white/10"
      >
        MAIN MENU
      </button>
    </div>
  );
}
