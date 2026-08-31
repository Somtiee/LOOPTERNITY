"use client";

import { useState } from "react";
import { loopiternPortraitSrc } from "@/game/loopiternArt";
import { rarityById, type LoopiternRarityId } from "@/game/mintTiers";
import { stillPath } from "@/game/loopiternStills";

type LoopiternPortraitProps = {
  rarity: LoopiternRarityId;
  /**
   * When present, show this token's composed still (recolored + mark) and
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
  const [stillMissing, setStillMissing] = useState(false);
  const validId =
    tokenId != null &&
    Number.isInteger(tokenId) &&
    tokenId >= 1 &&
    tokenId <= 10_000;
  const src =
    validId && !stillMissing
      ? stillPath(tokenId!, rarity)
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
      onError={() => setStillMissing(true)}
    />
  );
}
