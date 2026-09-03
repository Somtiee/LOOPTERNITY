/**
 * ERC-721 metadata builder for LOOPITERNS (Prompt K).
 *
 * Pure — no sharp, no node:fs. Shared by the two metadata routes:
 *   `/api/loopitern/[tokenId]/[rarity]/metadata` — client-known rarity
 *   `/api/loopitern/token/[tokenId]`               — tokenURI target for
 *     marketplaces (rarity read from chain); this is what `setBaseURI`
 *     must point at after deploy.
 */

import { isLoopiternRarityId, rarityById, type LoopiternRarityId } from "./mintTiers";
import { attributesFromDna, dnaFromTokenId } from "./loopiternTraits";
import { stillApiPath } from "./loopiternStills";

/** Contract constants mirrored from `contracts/src/Loopiterns.sol`. */
export const LOOPITERNS_MAX_SUPPLY = 10_000;

export type LoopiternTokenParams = {
  tokenId: number;
  rarity: LoopiternRarityId;
};

/**
 * Parse and validate route params. `tokenId` must be an integer 1..10000;
 * `rarity` (when present) must be 0..4. Returns null on any bad input —
 * routes answer 400.
 */
export function parseLoopiternParams(
  tokenIdRaw: string,
  rarityRaw?: string,
): LoopiternTokenParams | null {
  const tokenId = Number(tokenIdRaw);
  if (!Number.isInteger(tokenId) || tokenId < 1 || tokenId > LOOPITERNS_MAX_SUPPLY) {
    return null;
  }
  if (rarityRaw !== undefined) {
    const rarity = Number(rarityRaw);
    if (!isLoopiternRarityId(rarity)) return null;
    return { tokenId, rarity };
  }
  return { tokenId, rarity: 0 };
}

export type LoopiternMetadata = {
  name: string;
  description: string;
  image: string;
  external_url: string;
  attributes: ReturnType<typeof attributesFromDna>;
};

/**
 * Build the ERC-721 metadata document for one (tokenId, rarity).
 * `image` points at the on-demand still route so marketplaces always get a
 * PNG (composing on first hit), independent of the static `public/` cache.
 */
export function buildLoopiternMetadata(
  tokenId: number,
  rarity: LoopiternRarityId,
  origin: string,
): LoopiternMetadata {
  const dna = dnaFromTokenId(tokenId, rarity);
  const rarityName = rarityById(rarity)?.name ?? `Rarity ${rarity}`;
  return {
    name: `LOOPITERN #${tokenId} (${rarityName})`,
    description:
      `LOOPITERN #${tokenId}, a ${rarityName} climber from the LOOPTERNITY ` +
      "collection on Robinhood Chain. Painted base with DNA-driven recolor " +
      "and sketchbook shading — the same palette drives the in-game climb rig.",
    image: `${origin}${stillApiPath(tokenId, rarity)}`,
    external_url: `${origin}/`,
    attributes: attributesFromDna(dna),
  };
}
