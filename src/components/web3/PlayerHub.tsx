"use client";

import { formatSurvivalTime } from "@/game/score";
import { DIFFICULTIES } from "@/game/constants";
import { getCharacter } from "@/game/characters";
import { usePlayerRegistry } from "@/web3/hooks/usePlayerRegistry";
import {
  getGuestCharacterId,
  getGuestNormalBests,
} from "@/web3/p2e/store";
import { ConnectWalletButton } from "@/components/web3/ConnectWalletButton";
import type { DifficultyId } from "@/game/types";

const DIFFS: DifficultyId[] = ["easy", "medium", "hard"];

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function PlayerHub({
  accent,
  onClose,
}: {
  accent: string;
  onClose: () => void;
}) {
  const { isConnected, profile } = usePlayerRegistry();
  const runner = getCharacter(
    profile?.characterId ?? getGuestCharacterId(),
  );
  const walletBests = profile?.normalBest;
  const guestBests = getGuestNormalBests();
  const normalBests = isConnected
    ? (walletBests ?? { easy: 0, medium: 0, hard: 0 })
    : guestBests;

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-end justify-center bg-black/65 sm:items-center sm:p-4">
      <div className="max-h-[min(92dvh,100%)] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/15 bg-[#0d0a10] px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-[family-name:var(--font-display)] text-xs tracking-[0.28em] text-white/70">
              SCORES
            </p>
            <p className="mt-1 text-sm text-white/55">
              {profile
                ? `${shortAddr(profile.address)} · ${runner.name}`
                : `${runner.name} · guest`}
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

        <p className="mt-4 font-[family-name:var(--font-display)] text-[10px] tracking-[0.18em] text-white/45">
          NORMAL BESTS
        </p>
        <div className="mt-2 space-y-2">
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
        <p className="mt-3 text-[11px] text-white/35" style={{ color: `${accent}99` }}>
          P2E leaderboard coming soon.
        </p>
      </div>
    </div>
  );
}
