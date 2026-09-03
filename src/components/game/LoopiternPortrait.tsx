"use client";

import { useState } from "react";
import { loopiternPortraitSrc } from "@/game/loopiternArt";
import { rarityById, type LoopiternRarityId } from "@/game/mintTiers";
import { stillApiPath, stillPath } from "@/game/loopiternStills";

type LoopiternPortraitProps = {
  rarity: LoopiternRarityId;
  /**
   * When present, show this token's composed still (recolored + shading) and
   * fall back to the rarity base if the still is not generated yet.
   */
  tokenId?: number;
  /** sm = CharacterSelect slot (~64px). lg = 256px preview. */
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE = {
  sm: "h-16 w-16",
  md: "h-20 w-20",
  lg: "h-64 w-64",
} as const;

export function LoopiternPortrait({
  rarity,
  tokenId,
  size = "sm",
  className = "",
}: LoopiternPortraitProps) {
  const def = rarityById(rarity);
  // Stage 0: static cache (`public/loopiterns/generated/...`, warmed by the
  // compositor or the mint flow). Stage 1: on-demand still route (composes
  // server-side — works even where the static file is not written yet).
  // Stage 2: the painted rarity base.
  const [stage, setStage] = useState(0);
  const validId =
    tokenId != null &&
    Number.isInteger(tokenId) &&
    tokenId >= 1 &&
    tokenId <= 10_000;
  const src =
    validId && stage === 0
      ? stillPath(tokenId!, rarity)
      : validId && stage === 1
        ? stillApiPath(tokenId!, rarity)
        : loopiternPortraitSrc(rarity);

  return (
    <img
      src={src}
      alt={
        def
          ? `LOOPITERN ${def.name}${validId ? ` #${tokenId}` : ""}`
          : "LOOPITERN"
      }
      width={size === "lg" ? 256 : size === "md" ? 80 : 64}
      height={size === "lg" ? 256 : size === "md" ? 80 : 64}
      className={`shrink-0 rounded-xl object-cover ${SIZE[size]} ${className}`}
      draggable={false}
      onError={() => setStage((s) => Math.min(s + 1, 2))}
    />
  );
}
