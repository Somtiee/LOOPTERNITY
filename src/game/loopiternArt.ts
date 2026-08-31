import type { LoopiternRarityId } from "./mintTiers";
import {
  ACCENT_TINTS,
  BELLY_TINTS,
  CAPE_TINTS,
  EYE_TINTS,
  findMark,
  findTint,
  type LoopiternDna,
} from "./loopiternTraits";

export const LOOPITERN_GREEN = "#00C805";
export const LOOPITERN_INK = "#05140a";
export const LOOPITERN_CREAM = "#f4ead4";

export function loopiternPortraitSrc(rarity: LoopiternRarityId): string {
  return `/loopiterns/rarity-${rarity}.png`;
}

export const LOOPITERN_BODY: Record<
  LoopiternRarityId,
  { fill: string; belly: string; trim: string }
> = {
  0: { fill: "#2f8a3c", belly: "#6db56a", trim: "#c8e8b0" },
  1: { fill: "#00C805", belly: "#7CFF7C", trim: "#f4ead4" },
  2: { fill: "#1edc72", belly: "#a8fff0", trim: "#e8fff8" },
  3: { fill: "#00b804", belly: "#f4ead4", trim: "#c8ff9a" },
  4: { fill: "#00C805", belly: "#c8ff9a", trim: "#fff6c8" },
};

/** One palette source for UI previews and the in-game climb rig (J4). */
export type LoopiternRigPalette = {
  /** Body fill — the DNA accent tint. */
  fill: string;
  /** Belly / face — the DNA belly tint. */
  belly: string;
  /** Light trim derived from the accent. */
  trim: string;
  /** Eye sclera — the DNA eye tint. */
  eye: string;
  /** DNA mark id ("chevron", "star", …). Null = no equipped DNA. */
  mark: string | null;
  /** Solid color the mark is drawn in (accent). */
  markFill: string;
  /** Legendary cape tint. Null below rarity 4. */
  cape: string | null;
};

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Mix a hex color toward white by `t` (0..1). */
export function lighten(hex: string, t: number): string {
  const [r, g, b] = parseHex(hex);
  return toHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
}

const MARK_FALLBACK = "chevron";

function tintHex(
  channel: Parameters<typeof findTint>[0],
  id: string,
  fallback: string,
): string {
  return findTint(channel, id)?.hex ?? fallback;
}

/**
 * DNA-derived rig palette. Unknown ids (schema drift) fall back to catalog
 * heads so a render never crashes on old DNA.
 */
export function loopiternRigPalette(dna: LoopiternDna): LoopiternRigPalette {
  const accent = tintHex("accentTint", dna.accentTint, ACCENT_TINTS[0]!.hex);
  const belly = tintHex("bellyTint", dna.bellyTint, BELLY_TINTS[0]!.hex);
  const eye = tintHex("eyeTint", dna.eyeTint, EYE_TINTS[0]!.hex);
  const cape =
    dna.capeTint != null
      ? tintHex("capeTint", dna.capeTint, CAPE_TINTS[0]!.hex)
      : null;
  const mark = findMark(dna.mark) ? dna.mark : MARK_FALLBACK;
  return {
    fill: accent,
    belly,
    trim: lighten(accent, 0.42),
    eye,
    mark,
    markFill: accent,
    cape,
  };
}

/** Default (no-DNA) rig palette for a rarity — keeps the pre-J4 look. */
export function loopiternRarityPalette(
  rarity: LoopiternRarityId,
): LoopiternRigPalette {
  const body = LOOPITERN_BODY[rarity];
  return {
    fill: body.fill,
    belly: body.belly,
    trim: body.trim,
    eye: LOOPITERN_CREAM,
    mark: null,
    markFill: body.trim,
    cape: rarity === 4 ? LOOPITERN_GREEN : null,
  };
}
