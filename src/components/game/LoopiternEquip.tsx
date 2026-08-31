"use client";

import type { ReactNode } from "react";
import { rarityById } from "@/game/mintTiers";
import { describeTraits } from "@/game/traits";
import type { GameMode } from "@/game/types";
import { CHAIN_SWITCH_LABEL } from "@/web3/config";
import type { EquippedLoopitern } from "@/web3/loopiterns/equip";
import { useLoopiternsInventory } from "@/web3/loopiterns/useLoopiternsInventory";
import { LoopiternPortrait } from "./LoopiternPortrait";

type LoopiternEquipProps = {
  mode: GameMode;
  equipped: EquippedLoopitern | null;
  onEquip: (token: EquippedLoopitern | null) => void;
};

function tokenSelected(
  equipped: EquippedLoopitern | null,
  tokenId: bigint,
): boolean {
  return equipped !== null && equipped.tokenId === tokenId;
}

export function LoopiternEquip({
  mode,
  equipped,
  onEquip,
}: LoopiternEquipProps) {
  const { configured, hasWallet, onRobinhood, loading, tokens, error } =
    useLoopiternsInventory();

  if (mode === "p2e") return null;

  if (mode === "p2m") {
    return (
      <section className="mt-7">
        <h2 className="mb-1 font-[family-name:var(--font-display)] text-xs tracking-[0.28em] text-white/70">
          EQUIP
        </h2>
        <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
          <p className="text-xs leading-relaxed text-white/45">
            LOOPITERNS cannot be used in Play-to-Mint.
          </p>
        </div>
      </section>
    );
  }

  let body: ReactNode;
  if (!hasWallet) {
    body = (
      <p className="text-xs leading-relaxed text-white/45">
        Connect a wallet on Robinhood Chain to equip LOOPITERNS. Guests play
        the base runner.
      </p>
    );
  } else if (!onRobinhood) {
    body = (
      <p className="text-xs leading-relaxed text-white/45">
        WRONG NETWORK · {CHAIN_SWITCH_LABEL}. Switch to load your LOOPITERNS.
      </p>
    );
  } else if (!configured) {
    body = (
      <p className="text-xs leading-relaxed text-white/45">
        LOOPITERNS contract not configured. Base runner is equipped.
      </p>
    );
  } else if (loading) {
    body = (
      <p className="text-xs leading-relaxed text-white/45">
        Loading LOOPITERNS…
      </p>
    );
  } else if (error) {
    body = (
      <p className="text-xs leading-relaxed text-white/45">
        Could not load LOOPITERNS. Base runner is equipped.
      </p>
    );
  } else {
    const noneSelected = equipped === null;
    body = (
      <>
        <button
          type="button"
          onClick={() => onEquip(null)}
          className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
            noneSelected
              ? "border-[#00C805]/55 bg-[#00C805]/10"
              : "border-white/10 bg-black/25 hover:border-white/25"
          }`}
        >
          <p className="font-[family-name:var(--font-display)] text-[11px] tracking-[0.16em] text-white">
            NONE (BASE RUNNER)
          </p>
          <p className="mt-0.5 text-[10px] text-white/40">
            ASH / NOVA / NORD looks only. No extra shields or Freeze.
          </p>
        </button>
        {tokens.length === 0 ? (
          <p className="mt-2 text-[11px] text-white/40">
            No LOOPITERNS yet. Mint in P2M, then equip here.
          </p>
        ) : (
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {tokens.map((token) => {
              const rarity = rarityById(token.rarity);
              const selected = tokenSelected(equipped, token.tokenId);
              return (
                <button
                  key={token.tokenId.toString()}
                  type="button"
                  onClick={() => onEquip(token)}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                    selected
                      ? "border-[#00C805]/55 bg-[#00C805]/10"
                      : "border-white/10 bg-black/25 hover:border-white/25"
                  }`}
                >
                  <LoopiternPortrait
                    rarity={token.rarity}
                    tokenId={Number(token.tokenId)}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-[family-name:var(--font-display)] text-[11px] tracking-[0.14em] text-white">
                        #{token.tokenId.toString()}
                      </span>
                      <span
                        className="font-[family-name:var(--font-display)] text-[10px] tracking-[0.12em]"
                        style={{ color: rarity?.accent ?? "#00C805" }}
                      >
                        {rarity?.name.toUpperCase() ?? "LOOPITERN"}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] leading-snug text-white/40">
                      {describeTraits(token.rarity)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </>
    );
  }

  return (
    <section className="mt-7">
      <h2 className="mb-1 font-[family-name:var(--font-display)] text-xs tracking-[0.28em] text-white/70">
        EQUIP LOOPITERN
      </h2>
      <p className="mb-3 text-[11px] text-white/35">
        Equip a LOOPITERN to climb as that character. ASH / NOVA / NORD when
        none is equipped.
      </p>
      {body}
    </section>
  );
}
