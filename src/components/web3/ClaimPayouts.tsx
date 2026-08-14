"use client";

import { formatEther } from "viem";
import {
  useClaimPayout,
  type ClaimWeekRow,
} from "@/web3/hooks/useClaimPayout";

function statusCopy(row: ClaimWeekRow): string {
  switch (row.status) {
    case "claimable":
      return row.rank ? `#${row.rank}` : "Ready";
    case "claimed":
      return "Claimed";
    case "pending":
      return "Pending";
    default:
      return "—";
  }
}

export function ClaimPayouts() {
  const {
    enabled,
    isConnected,
    rows,
    loading,
    error,
    txHash,
    explorerTx,
    busyWeek,
    claim,
  } = useClaimPayout();

  if (!enabled || !isConnected) return null;

  const visible = rows.filter(
    (row) => row.status === "claimable" || row.status === "claimed",
  );
  if (!loading && visible.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-white/35">
        Rewards
      </p>
      {loading ? (
        <p className="mt-2 text-[11px] text-white/35">…</p>
      ) : (
        <div className="mt-2 space-y-2">
          {visible.map((row) => (
            <div
              key={row.weekId}
              className="flex items-center justify-between gap-2 rounded-lg border border-white/8 px-2.5 py-2"
            >
              <div className="min-w-0">
                <p className="font-[family-name:var(--font-display)] text-[11px] tracking-[0.12em] text-white/80">
                  {row.weekId}
                </p>
                <p className="mt-0.5 text-[10px] text-white/40">
                  {statusCopy(row)}
                </p>
              </div>
              {row.status === "claimable" ? (
                <button
                  type="button"
                  disabled={busyWeek !== null}
                  onClick={() => void claim(row.weekId)}
                  className="min-h-11 shrink-0 rounded-lg bg-[#ffe08a] px-3 py-2 font-[family-name:var(--font-display)] text-[10px] tracking-[0.16em] text-[#0a0608] disabled:opacity-40"
                >
                  {busyWeek === row.weekId
                    ? "…"
                    : `CLAIM ${formatEther(row.claimableWei)}`}
                </button>
              ) : (
                <span className="shrink-0 text-[11px] text-white/45">
                  {row.status === "claimed" ? "done" : "—"}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {error ? (
        <p className="mt-2 text-[11px] text-red-300/85">{error}</p>
      ) : null}
      {explorerTx ? (
        <a
          href={explorerTx}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-[10px] text-white/45 underline"
        >
          {txHash?.slice(0, 10)}…
        </a>
      ) : null}
    </div>
  );
}
