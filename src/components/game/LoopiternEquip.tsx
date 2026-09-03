"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { dnaFromTokenId, attributesFromDna } from "@/game/loopiternTraits";
import { rarityById, type LoopiternRarityId } from "@/game/mintTiers";
import { describeTraits } from "@/game/traits";
import {
  LOOPITERN_STILL_HIRES_SIZE,
  stillHiResApiPath,
} from "@/game/loopiternStills";
import type { GameMode } from "@/game/types";
import { CHAIN_SWITCH_LABEL } from "@/web3/config";
import type { EquippedLoopitern } from "@/web3/loopiterns/equip";
import {
  useLoopiternsInventory,
  type OwnedLoopitern,
} from "@/web3/loopiterns/useLoopiternsInventory";
import { LoopiternPortrait } from "./LoopiternPortrait";

type LoopiternEquipProps = {
  mode: GameMode;
  equipped: EquippedLoopitern | null;
  onEquip: (token: EquippedLoopitern | null) => void;
};

/** One carousel page = one row of 3, matching the CHARACTERS grid. */
const PER_PAGE = 3;

function tokenSelected(
  equipped: EquippedLoopitern | null,
  tokenId: bigint,
): boolean {
  return equipped !== null && equipped.tokenId === tokenId;
}

/** DNA channel summary for one token, e.g. "Eye Gold · Belly Cream · Teal". */
function dnaSummary(tokenId: number, rarity: LoopiternRarityId): string {
  const attrs = attributesFromDna(dnaFromTokenId(tokenId, rarity));
  const byType = new Map(attrs.map((a) => [a.trait_type, a.value]));
  return [
    `Eye ${byType.get("Eye Tint") ?? "—"}`,
    `Belly ${byType.get("Belly Tint") ?? "—"}`,
    byType.get("Accent") ?? "—",
    byType.get("Shading Style") ?? "—",
  ].join(" · ");
}

export function LoopiternEquip({
  mode,
  equipped,
  onEquip,
}: LoopiternEquipProps) {
  const {
    configured,
    hasWallet,
    onRobinhood,
    loading,
    tokens,
    totalOwned,
    hasMore,
    loadMore,
    error,
    errorMessage,
    refetch,
  } = useLoopiternsInventory();

  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<OwnedLoopitern | null>(null);

  // Tier order: Legendary (4) first, down to Common (0). Ties by tokenId.
  const sorted = useMemo(
    () =>
      [...tokens].sort(
        (a, b) => b.rarity - a.rarity || Number(a.tokenId - b.tokenId),
      ),
    [tokens],
  );

  const pageCount = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  // Clamp in render — the sorted list can shrink (wallet switch, refetch)
  // without an effect having to reset `page`.
  const safePage = Math.min(page, pageCount - 1);
  const visible = sorted.slice(
    safePage * PER_PAGE,
    safePage * PER_PAGE + PER_PAGE,
  );

  const goPrev = () => setPage((p) => Math.max(0, p - 1));
  const goNext = () => {
    if (safePage < pageCount - 1) {
      setPage(safePage + 1);
      return;
    }
    // Last visible page — pull the next inventory page instead of blocking.
    if (hasMore) {
      loadMore();
      setPage(safePage + 1);
    }
  };
  const canPrev = safePage > 0;
  const canNext = safePage < pageCount - 1 || hasMore;

  if (mode !== "normal") return null;

  let body: ReactNode;
  if (!hasWallet) {
    body = (
      <p className="text-xs leading-relaxed text-white/45">
        Connect a wallet on Robinhood Chain to equip LOOPITERNS.
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
        Contract not deployed yet — art previews only.
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
        {errorMessage ?? "Could not load LOOPITERNS."}{" "}
        <button
          type="button"
          onClick={() => {
            void refetch();
          }}
          className="underline decoration-white/40 underline-offset-2 hover:text-white"
        >
          Retry
        </button>
      </p>
    );
  } else {
    body = (
      <>
        {tokens.length === 0 ? (
          <p className="text-[11px] text-white/40">
            None yet — mint in P2M.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <CarouselArrow
                direction="prev"
                disabled={!canPrev}
                onClick={goPrev}
              />
              <div className="grid flex-1 grid-cols-3 gap-2 sm:gap-3">
                {visible.map((token) => {
                  const rarity = rarityById(token.rarity);
                  const selected = tokenSelected(equipped, token.tokenId);
                  return (
                    <button
                      key={token.tokenId.toString()}
                      type="button"
                      onClick={() => setDetail(token)}
                      className={`flex min-h-[8.5rem] flex-col items-center rounded-2xl border px-1.5 py-2 transition duration-200 sm:min-h-[9.25rem] sm:px-2 ${
                        selected
                          ? "border-[#00C805]/55 bg-[#00C805]/10"
                          : "border-white/10 bg-black/25 hover:border-white/25 hover:bg-white/5"
                      }`}
                      style={
                        selected
                          ? { boxShadow: `0 0 28px ${(rarity?.accent ?? "#00C805") + "33"}` }
                          : undefined
                      }
                    >
                      <LoopiternPortrait
                        rarity={token.rarity}
                        tokenId={Number(token.tokenId)}
                        size="sm"
                      />
                      <span className="mt-1 font-[family-name:var(--font-display)] text-[10px] tracking-[0.16em] text-white sm:text-[11px]">
                        #{token.tokenId.toString()}
                      </span>
                      <span
                        className="mt-0.5 font-[family-name:var(--font-display)] text-[9px] tracking-[0.12em] sm:text-[10px]"
                        style={{ color: rarity?.accent ?? "#00C805" }}
                      >
                        {rarity?.name.toUpperCase() ?? "LOOPITERN"}
                      </span>
                    </button>
                  );
                })}
                {visible.length === 0 ? (
                  <p className="col-span-3 py-6 text-center text-[11px] text-white/40">
                    Loading…
                  </p>
                ) : null}
              </div>
              <CarouselArrow
                direction="next"
                disabled={!canNext}
                onClick={goNext}
              />
            </div>
            <p className="mt-2 text-center font-[family-name:var(--font-display)] text-[10px] tracking-[0.16em] text-white/40">
              {safePage + 1} / {pageCount}
              {hasMore ? ` · ${totalOwned} OWNED` : ""}
            </p>
          </>
        )}
      </>
    );
  }

  return (
    <section className="mt-7">
      <h2 className="mb-1 font-[family-name:var(--font-display)] text-xs tracking-[0.28em] text-white/70">
        LOOPITERNS
      </h2>
      <p className="mb-3 text-[11px] text-white/35">
        Tap one to view, equip, or download. Highest tier first.
      </p>
      {body}
      {detail ? (
        <LoopiternDetail
          token={detail}
          equipped={equipped}
          onEquip={onEquip}
          onClose={() => setDetail(null)}
        />
      ) : null}
    </section>
  );
}

function CarouselArrow({
  direction,
  disabled,
  onClick,
}: {
  direction: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "prev" ? "Previous LOOPITERNS" : "Next LOOPITERNS"}
      className={`h-10 w-8 shrink-0 rounded-xl border font-[family-name:var(--font-display)] text-lg leading-none transition sm:w-9 ${
        disabled
          ? "cursor-not-allowed border-white/5 text-white/20"
          : "border-white/15 bg-black/25 text-white/70 hover:border-white/30 hover:text-white active:scale-95"
      }`}
    >
      {direction === "prev" ? "‹" : "›"}
    </button>
  );
}

function LoopiternDetail({
  token,
  equipped,
  onEquip,
  onClose,
}: {
  token: OwnedLoopitern;
  equipped: EquippedLoopitern | null;
  onEquip: (token: EquippedLoopitern | null) => void;
  onClose: () => void;
}) {
  const rarity = rarityById(token.rarity);
  const id = Number(token.tokenId);
  const [downloading, setDownloading] = useState(false);
  const selected = tokenSelected(equipped, token.tokenId);

  // Escape closes, matching the hub overlay feel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const downloadHiRes = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(stillHiResApiPath(id, token.rarity));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `loopitern-${id}-${(rarity?.name ?? "tier").toLowerCase()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Compose or download failed — hand the user the raw URL instead.
      window.open(stillHiResApiPath(id, token.rarity), "_blank");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`LOOPITERN #${id}`}
    >
      <div
        className="max-h-[min(92dvh,100%)] w-full max-w-sm overflow-y-auto rounded-2xl border border-white/15 bg-[#0d0a10] px-5 py-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-[family-name:var(--font-display)] text-xs tracking-[0.28em] text-white/70">
              LOOPITERN #{id}
            </p>
            <p
              className="mt-1 font-[family-name:var(--font-display)] text-[11px] tracking-[0.18em]"
              style={{ color: rarity?.accent ?? "#00C805" }}
            >
              {rarity?.name.toUpperCase() ?? "LOOPITERN"}
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

        <div className="mt-4 flex justify-center">
          <LoopiternPortrait rarity={token.rarity} tokenId={id} size="lg" />
        </div>

        <p className="mt-4 text-[10px] leading-relaxed text-white/40">
          {dnaSummary(id, token.rarity)}
        </p>
        <p className="mt-1 text-[10px] leading-relaxed text-white/30">
          {describeTraits(token.rarity)}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onEquip(token)}
            disabled={selected}
            className={`rounded-xl border px-3 py-2.5 font-[family-name:var(--font-display)] text-[11px] tracking-[0.16em] transition ${
              selected
                ? "cursor-default border-[#00C805]/55 bg-[#00C805]/10 text-[#00C805]"
                : "border-white/15 bg-black/25 text-white hover:border-white/30"
            }`}
          >
            {selected ? "EQUIPPED" : "EQUIP"}
          </button>
          <button
            type="button"
            onClick={() => {
              void downloadHiRes();
            }}
            disabled={downloading}
            className="rounded-xl border border-white/15 bg-black/25 px-3 py-2.5 font-[family-name:var(--font-display)] text-[11px] tracking-[0.16em] text-white transition hover:border-white/30 disabled:opacity-60"
          >
            {downloading
              ? "COMPOSING…"
              : `DOWNLOAD ${LOOPITERN_STILL_HIRES_SIZE}PX`}
          </button>
        </div>
      </div>
    </div>
  );
}
