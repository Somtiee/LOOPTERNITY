/**
 * Marketplace still paths (Prompt J3).
 *
 * `stillPath(tokenId, rarity)` is the public URL for a composed hero still.
 * Rarity is unknown until mint (`Loopiterns.tokenRarity`) — do not assume
 * a fixed rarity per id. Climb sprites are Prompt J4, not these files.
 */

import { isLoopiternRarityId, type LoopiternRarityId } from "./mintTiers";

/** Working resolution of the compositor (bases are 1024, stills ship at 512). */
export const LOOPITERN_STILL_SIZE = 512;
export const LOOPITERN_STILL_EXT = "png";

/** J4 preview grid (rows = rarity 0→4, columns = sample tokenIds). */
export const LOOPITERN_PREVIEW_GRID_PATH = "/loopiterns/preview-grid.png";
export const LOOPITERN_PREVIEW_GRID_FS_PATH = "public/loopiterns/preview-grid.png";

function assertTokenId(tokenId: number): number {
  if (!Number.isInteger(tokenId) || tokenId < 1 || tokenId > 10_000) {
    throw new Error(`LOOPITERN tokenId must be an integer 1..10000, got ${tokenId}`);
  }
  return tokenId;
}

/** Public URL, e.g. `/loopiterns/generated/4/180.png`. */
export function stillPath(
  tokenId: number,
  rarity: LoopiternRarityId,
): string {
  const id = assertTokenId(tokenId);
  if (!isLoopiternRarityId(rarity)) {
    throw new Error(`Invalid LOOPITERN rarity ${rarity}`);
  }
  return `/loopiterns/generated/${rarity}/${id}.${LOOPITERN_STILL_EXT}`;
}

/** Repo-relative output for the compositor. Forward slashes. */
export function stillRelativeFsPath(
  tokenId: number,
  rarity: LoopiternRarityId,
): string {
  const id = assertTokenId(tokenId);
  if (!isLoopiternRarityId(rarity)) {
    throw new Error(`Invalid LOOPITERN rarity ${rarity}`);
  }
  return `public/loopiterns/generated/${rarity}/${id}.${LOOPITERN_STILL_EXT}`;
}

/**
 * On-demand still route (Prompt K) — composes server-side on first request,
 * then serves from the `public/` cache. Same PNG as `stillPath`, but it works
 * even on hosts where the runtime cannot write into `public/`.
 */
export function stillApiPath(
  tokenId: number,
  rarity: LoopiternRarityId,
): string {
  const id = assertTokenId(tokenId);
  if (!isLoopiternRarityId(rarity)) {
    throw new Error(`Invalid LOOPITERN rarity ${rarity}`);
  }
  return `/api/loopitern/${id}/${rarity}/still`;
}

/** Native compositor resolution (the recolored bases are 1024). */
export const LOOPITERN_STILL_HIRES_SIZE = 1024;

/**
 * Full-resolution still (Prompt J5) — same route, `?size=1024`. Composed on
 * demand at native base resolution and never written to the static cache.
 */
export function stillHiResApiPath(
  tokenId: number,
  rarity: LoopiternRarityId,
): string {
  return `${stillApiPath(tokenId, rarity)}?size=${LOOPITERN_STILL_HIRES_SIZE}`;
}
