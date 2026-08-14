"use client";

import { useState } from "react";
import { formatEther } from "viem";
import { formatSurvivalTime, formatMultiplier } from "@/game/score";
import { getTheme } from "@/game/themes";
import { DIFFICULTIES } from "@/game/constants";
import { getCharacter } from "@/game/characters";
import { usePlayerRegistry } from "@/web3/hooks/usePlayerRegistry";
import { useOnchainWeekTheme } from "@/web3/hooks/useOnchainWeekTheme";
import { PRIZE_POOL_BPS, TREASURY_BPS } from "@/web3/p2e/ranking";
import { vaultIsDeployed } from "@/web3/config";
import {
  getGuestCharacterId,
  getGuestNormalBests,
} from "@/web3/p2e/store";
import { ConnectWalletButton } from "@/components/web3/ConnectWalletButton";
import { ClaimPayouts } from "@/components/web3/ClaimPayouts";
import type { DifficultyId } from "@/game/types";

const DIFFS: DifficultyId[] = ["easy", "medium", "hard"];

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatCountdown(ms: number) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h ${m}m`;
}

type Tab = "bests" | "week" | "board";

export function PlayerHub({
  accent,
  onClose,
}: {
  accent: string;
  onClose: () => void;
}) {
  const {
    isConnected,
    profile,
    week,
    ranked,
    officialBoard,
    submitters,
    attested,
    boardSource,
    boardLoading,
    boardError,
    myRankIndex,
    msLeft,
    refresh,
  } = usePlayerRegistry();
  const p2eWorld = useOnchainWeekTheme();
  const [tab, setTab] = useState<Tab>(vaultIsDeployed ? "board" : "bests");
  const theme = p2eWorld.themeId ? getTheme(p2eWorld.themeId) : null;
  const poolEth = formatEther(BigInt(week.poolWei || "0"));
  const prizeEth = (
    Number(poolEth) *
    (PRIZE_POOL_BPS / 10000)
  ).toFixed(6);
  const runner = getCharacter(
    profile?.characterId ?? (isConnected ? undefined : getGuestCharacterId()),
  );
  const walletBests = profile?.normalBest;
  const guestBests = getGuestNormalBests();
  const normalBests = isConnected
    ? (walletBests ?? { easy: 0, medium: 0, hard: 0 })
    : guestBests;

  if (!isConnected && !vaultIsDeployed) {
    return (
      <div className="pointer-events-auto fixed inset-0 z-40 flex items-end justify-center bg-black/65 sm:items-center sm:p-4">
        <div className="w-full max-w-md rounded-t-2xl border border-white/15 bg-[#0d0a10] px-5 py-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center sm:rounded-2xl">
          <p className="font-[family-name:var(--font-display)] text-xs tracking-[0.28em] text-white/70">
            SCORES
          </p>
          <p className="mt-3 text-sm text-white/50">
            Connect to see scores.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-5 w-full rounded-xl border border-white/15 bg-white/5 py-3 text-xs tracking-[0.2em] text-white/80"
          >
            CLOSE
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-end justify-center bg-black/65 sm:items-center sm:p-4">
      <div className="max-h-[min(92dvh,100%)] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/15 bg-[#0d0a10] px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-[family-name:var(--font-display)] text-xs tracking-[0.28em] text-white/70">
              PLAYER
            </p>
            <p className="mt-1 text-sm text-white/55">
              {profile
                ? `${shortAddr(profile.address)} · ${runner.name}`
                : runner.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 px-2 py-1 text-[10px] tracking-[0.16em] text-white/60"
          >
            CLOSE
          </button>
        </div>

        {!isConnected ? (
          <div className="mt-3 flex justify-center">
            <ConnectWalletButton size="sm" />
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
          {(
            [
              ["bests", "NORMAL"],
              ["week", "P2E WEEK"],
              ["board", "BOARD"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-lg py-2 font-[family-name:var(--font-display)] text-[10px] tracking-[0.14em] ${
                tab === id ? "bg-white/12 text-white" : "text-white/45"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "bests" && (
          <div className="mt-4 space-y-2">
            {DIFFS.map((d) => {
              const t = normalBests[d] ?? 0;
              return (
                <div
                  key={d}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3"
                >
                  <span className="font-[family-name:var(--font-display)] text-xs tracking-[0.18em] text-white/80">
                    {DIFFICULTIES[d].label.toUpperCase()}
                  </span>
                  <span className="tabular-nums text-sm text-white">
                    {t > 0 ? formatSurvivalTime(t) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {tab === "week" && (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3">
              <p className="mt-0 font-[family-name:var(--font-display)] text-sm tracking-[0.14em] text-white">
                {p2eWorld.status === "loading"
                  ? "Loading…"
                  : p2eWorld.status === "error"
                    ? "Couldn’t load this week"
                    : (theme?.name.toUpperCase() ?? "—")}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-white/10 px-3 py-2">
                <p className="text-[10px] text-white/35">Pool</p>
                <p className="tabular-nums text-sm text-white">
                  {Number(poolEth).toFixed(6)} ETH
                </p>
              </div>
              <div className="rounded-xl border border-white/10 px-3 py-2">
                <p className="text-[10px] text-white/35">Time left</p>
                <p className="tabular-nums text-sm text-white">
                  {formatCountdown(msLeft)}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 px-3 py-2">
                <p className="text-[10px] text-white/35">Your rank</p>
                <p className="tabular-nums text-sm text-white">
                  {!isConnected
                    ? "—"
                    : vaultIsDeployed
                      ? attested
                        ? myRankIndex >= 0
                          ? `#${officialBoard[myRankIndex]?.rank}`
                          : "—"
                        : "—"
                      : myRankIndex >= 0
                        ? `#${myRankIndex + 1}`
                        : "—"}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-white/10 px-3 py-2">
                <p className="text-[10px] text-white/35">Prize (80%)</p>
                <p className="tabular-nums text-sm text-white">{prizeEth} ETH</p>
              </div>
              <div className="rounded-xl border border-white/10 px-3 py-2">
                <p className="text-[10px] text-white/35">Treasury (20%)</p>
                <p className="tabular-nums text-sm text-white">
                  {(Number(poolEth) * (TREASURY_BPS / 10000)).toFixed(6)} ETH
                </p>
              </div>
            </div>
            <ClaimPayouts />
            {attested && myRankIndex >= 0 ? (
              <p className="text-[11px] text-white/45">
                Rank #{officialBoard[myRankIndex]?.rank}
              </p>
            ) : null}
          </div>
        )}

        {tab === "board" && (
          <div className="mt-4 space-y-1.5">
            {boardLoading ? (
              <p className="py-6 text-center text-sm text-white/35">
                Loading…
              </p>
            ) : boardError ? (
              <div className="py-6 text-center">
                <p className="text-sm text-red-300/80">{boardError}</p>
                <button
                  type="button"
                  onClick={() => refresh()}
                  className="mt-3 min-h-11 rounded-xl bg-[#ffe08a] px-4 py-2 font-[family-name:var(--font-display)] text-[11px] tracking-[0.16em] text-[#0a0608]"
                >
                  RETRY
                </button>
              </div>
            ) : vaultIsDeployed && attested ? (
              officialBoard.length === 0 ? (
                <p className="py-6 text-center text-sm text-white/35">
                  No ranks this week.
                </p>
              ) : (
                officialBoard.map((row, i) => (
                  <div
                    key={`${row.rank}-${row.address}`}
                    className="flex items-center justify-between rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2"
                    style={
                      i === myRankIndex
                        ? { boxShadow: `0 0 16px ${accent}33` }
                        : undefined
                    }
                  >
                    <span className="text-[11px] text-white/50">
                      #{row.rank} {shortAddr(row.address)}
                      <span className="ml-2 text-white/30">
                        {row.runs} run{row.runs === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="text-right text-[11px] text-white">
                      {(row.shareBps / 100).toFixed(0)}%
                      <span className="ml-2 text-white/35">
                        {formatEther(BigInt(row.amountWei))} ETH
                      </span>
                    </span>
                  </div>
                ))
              )
            ) : vaultIsDeployed ? (
              submitters.length === 0 ? (
                <p className="py-6 text-center text-sm text-white/35">
                  No scores this week yet.
                </p>
              ) : (
                submitters.map((row) => (
                  <div
                    key={row.address}
                    className="flex items-center justify-between rounded-xl border border-white/8 px-3 py-2"
                  >
                    <span className="text-[11px] text-white/50">
                      {shortAddr(row.address)}
                    </span>
                    <span className="text-[11px] text-white/35">
                      {row.runCount} run{row.runCount === 1 ? "" : "s"}
                    </span>
                  </div>
                ))
              )
            ) : ranked.length === 0 ? (
              <p className="py-6 text-center text-sm text-white/35">
                No P2E runs this week yet.
              </p>
            ) : (
              ranked.slice(0, 20).map((row, i) => (
                <div
                  key={row.address}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                    i < 10
                      ? "border-white/15 bg-white/[0.05]"
                      : "border-white/8 bg-transparent"
                  }`}
                  style={
                    i === myRankIndex
                      ? { boxShadow: `0 0 16px ${accent}33` }
                      : undefined
                  }
                >
                  <span className="text-[11px] text-white/50">
                    #{i + 1} {shortAddr(row.address)}
                    <span className="ml-2 text-white/30">
                      {row.runs} run{row.runs === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="text-right text-[11px] text-white">
                    {row.weeklyScore.toFixed(1)}
                    <span className="ml-2 text-white/35">
                      {formatSurvivalTime(row.bestSurvival)}{" "}
                      {formatMultiplier(Math.round(row.bestMultiplier * 100))}
                    </span>
                  </span>
                </div>
              ))
            )}
            {boardSource === "cache" ? (
              <p className="pt-2 text-[11px] text-white/35">Cached.</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
