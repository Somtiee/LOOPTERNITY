"use client";

import { useState } from "react";
import { useSwitchChain } from "wagmi";
import { getTheme } from "@/game/themes";
import { audio } from "@/game/audio/AudioManager";
import {
  BASE_CHAIN,
  CHAIN_SWITCH_LABEL,
  EXPLORER_ORIGIN,
} from "@/web3/config";
import { useP2EEntryFee } from "@/web3/hooks/useP2EEntryFee";
import { useOnchainWeekTheme } from "@/web3/hooks/useOnchainWeekTheme";
import { ConnectWalletButton } from "./ConnectWalletButton";

type P2EEntryConfirmProps = {
  onConfirm: () => void;
  onCancel: () => void;
};

export function P2EEntryConfirm({ onConfirm, onCancel }: P2EEntryConfirmProps) {
  const p2eWorld = useOnchainWeekTheme();
  const fee = useP2EEntryFee();
  const { switchChainAsync } = useSwitchChain();
  const theme = p2eWorld.themeId ? getTheme(p2eWorld.themeId) : null;
  const [paidFlash, setPaidFlash] = useState(false);
  const ready =
    fee.isConnected &&
    fee.onBase &&
    fee.feeReady &&
    fee.weekAligned &&
    !fee.feeLoading &&
    !fee.rpcError &&
    p2eWorld.playable;
  const paying = fee.busy || paidFlash;

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
      <div className="max-h-[min(92dvh,100%)] w-full max-w-sm overflow-y-auto rounded-t-2xl border border-white/15 bg-[#0d0a10] px-5 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center sm:rounded-2xl sm:py-6">
        <p className="font-[family-name:var(--font-display)] text-xs tracking-[0.28em] text-white/70">
          P2E ENTRY
        </p>
        <p className="mt-3 text-sm text-white/55">
          ~${fee.usd.toFixed(2)} on Base
          {theme ? (
            <>
              {" "}
              · <span style={{ color: theme.accent }}>{theme.name}</span>
            </>
          ) : null}
        </p>
        <p className="mt-3 font-[family-name:var(--font-display)] text-lg tabular-nums text-white">
          {fee.feeLoading ? "…" : fee.ethLabel}
        </p>

        {!fee.isConnected ? (
          <div className="mt-4 flex justify-center">
            <ConnectWalletButton size="sm" />
          </div>
        ) : null}

        {fee.isConnected && !fee.onBase ? (
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

        {fee.rpcError ? (
          <div className="mt-3">
            <p className="text-[11px] text-red-300/85">{fee.rpcError}</p>
            <button
              type="button"
              onClick={() => fee.retryReads()}
              className="mt-2 min-h-11 w-full rounded-xl bg-[#ffe08a] px-3 py-2 font-[family-name:var(--font-display)] text-[11px] tracking-[0.16em] text-[#0a0608]"
            >
              RETRY
            </button>
          </div>
        ) : null}

        {fee.error ? (
          <p className="mt-3 text-[11px] text-red-300/85">{fee.error}</p>
        ) : null}

        {fee.txHash ? (
          <a
            href={`${EXPLORER_ORIGIN}/tx/${fee.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block text-[10px] tracking-[0.12em] text-white/40 underline-offset-2 hover:text-white/70 hover:underline"
          >
            View on Basescan
          </a>
        ) : null}

        <button
          type="button"
          disabled={paying || !ready}
          onClick={async () => {
            if (paying) return;
            const ok = await fee.pay();
            if (!ok) return;
            audio.sfx("success");
            setPaidFlash(true);
            window.setTimeout(() => onConfirm(), 450);
          }}
          className="mt-5 min-h-12 w-full rounded-xl px-4 py-3 font-[family-name:var(--font-display)] text-sm tracking-[0.2em] text-[#0a0608] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            background: `linear-gradient(90deg, ${theme?.accent ?? "#c4b5a0"}, #ffe08a)`,
          }}
        >
          {paidFlash
            ? "ENTRY CONFIRMED"
            : paying
              ? fee.txHash
                ? "WAITING FOR BASE…"
                : "CONFIRM IN WALLET…"
              : !fee.isConnected
                ? "CONNECT WALLET FIRST"
                : !fee.onBase
                  ? `${CHAIN_SWITCH_LABEL} REQUIRED`
                  : fee.feeLoading
                    ? "LOADING FEE…"
                    : fee.rpcError
                      ? "RETRY BASE"
                      : !fee.weekAligned
                        ? "WEEK MISMATCH"
                        : !p2eWorld.playable
                          ? "UNAVAILABLE"
                          : "PAY & START"}
        </button>
        <button
          type="button"
          disabled={paying}
          onClick={onCancel}
          className="mt-2 min-h-12 w-full rounded-xl border border-white/15 bg-white/5 py-3 text-xs tracking-[0.18em] text-white/75 disabled:opacity-40"
        >
          CANCEL
        </button>
      </div>
    </div>
  );
}
