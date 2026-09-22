import type { LoopiternRarityId } from "./mintTiers";
import {
  ACCENT_TINTS,
  BELLY_TINTS,
  CAPE_TINTS,
  EYE_TINTS,
  findShadingStyle,
  findShadingTone,
  findShadingWeight,
  findTint,
  type LoopiternDna,
} from "./loopiternTraits";

/** Robinhood-green brand accent — the collection's dominant body family. */
export const LOOPITERN_ACCENT = "#00C805";
export const LOOPITERN_INK = "#050d14";
export const LOOPITERN_CREAM = "#f4ead4";

export function loopiternPortraitSrc(rarity: LoopiternRarityId): string {
  return `/loopiterns/rarity-${rarity}.png`;
}

export const LOOPITERN_BODY: Record<
  LoopiternRarityId,
  { fill: string; belly: string; trim: string }
> = {
  0: { fill: "#0E8A3E", belly: "#5FC98A", trim: "#c8f0d6" },
  1: { fill: "#00C805", belly: "#4ADE80", trim: "#f4ead4" },
  2: { fill: "#4ADE80", belly: "#A7F3C4", trim: "#e6f7ec" },
  3: { fill: "#22C55E", belly: "#f4ead4", trim: "#D6F5DE" },
  4: { fill: "#00C805", belly: "#D6F5DE", trim: "#F2FBF5" },
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
  /**
   * DNA sketchbook shading (style + weight + tone, with the resolved
   * stroke color). Null = no equipped DNA — keep the rarity's clean look.
   */
  shading: {
    style: string;
    weight: string;
    tone: string;
    /** Resolved stroke color — fixed tone hex or darkened accent. */
    toneHex: string;
  } | null;
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

/** Mix a hex color toward black by `t` (0..1). */
export function darken(hex: string, t: number): string {
  const [r, g, b] = parseHex(hex);
  return toHex(r * (1 - t), g * (1 - t), b * (1 - t));
}

function tintHex(
  channel: Parameters<typeof findTint>[0],
  id: string,
  fallback: string,
): string {
  return findTint(channel, id)?.hex ?? fallback;
}

const SHADING_FALLBACK_STYLE = "hatchDiag";

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
  const style = findShadingStyle(dna.shadingStyle)
    ? dna.shadingStyle
    : SHADING_FALLBACK_STYLE;
  const weight = findShadingWeight(dna.shadingWeight)
    ? dna.shadingWeight
    : "medium";
  const tone = findShadingTone(dna.shadingTone) ? dna.shadingTone : "graphite";
  const toneHex =
    findShadingTone(dna.shadingTone)?.hex ?? darken(accent, 0.45);
  return {
    fill: accent,
    belly,
    trim: lighten(accent, 0.42),
    eye,
    shading: { style, weight, tone, toneHex },
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
    shading: null,
    cape: rarity === 4 ? LOOPITERN_ACCENT : null,
  };
}
