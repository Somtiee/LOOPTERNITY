/**
 * LOOPITERN DNA schema (Prompt J4, schema v4).
 *
 * LOCKED DIRECTION: the 5 painted hero bases (`rarity-{0..4}.png`) stay
 * forever — never 10k unique paintings. Per-token uniqueness = VISIBLE
 * recolor + a SKETCHBOOK SHADING treatment, driven by these DNA channels:
 *
 *   Eye Tint, Belly Tint, Accent Tint,
 *   Shading (style + weight + tone, every token — light pencil-style
 *   shading drawn only inside the character's painted shadow areas),
 *   Cape Tint (Legendary only).
 *
 * No symbols: the v3 torso marks and ink tattoos were removed after user
 * review — shading distinguishes tokens the way an artist shades a
 * cartoon portrait in a sketchbook, keeping the clean mascot look.
 *
 * Marketplace stills (J3 compositor) recolor the base painting with this
 * palette and hatch the shadows per the shading DNA. The in-game climb
 * rig (J4 `drawLoopitern`) uses the SAME palette via
 * `loopiternRigPalette`. The serial is metadata only — no visual plate.
 *
 * Hash seed (deterministic, documented):
 *   FNV-1a 32 of UTF-8 `${tokenId}|${rarity}|${LOOPITERN_TRAIT_SCHEMA_VERSION}`
 *   then xorshift32 words pick each channel from the rarity-allowed list.
 * Same (tokenId, rarity, schemaVersion) ⇒ same DNA. tokenId is inside the
 * seed so two Commons never share a seed.
 *
 * Client time is spoofable. This module does not prove a run.
 */

import {
  isLoopiternRarityId,
  rarityById,
  type LoopiternRarityId,
} from "./mintTiers";

/** Bump when catalogs change so compositors can invalidate caches. */
export const LOOPITERN_TRAIT_SCHEMA_VERSION = 4;

export type OpenSeaAttribute = {
  trait_type: string;
  value: string;
};

/**
 * One named palette slot. Hex values inside a catalog must be tellable
 * apart at a glance — the whole point of J4 is visible recolors.
 */
export type TintEntry = {
  id: string;
  name: string;
  hex: string;
  /** Inclusive min rarity that may roll this tint. Default 0. */
  minRarity?: LoopiternRarityId;
};


export type LoopiternDna = {
  schemaVersion: typeof LOOPITERN_TRAIT_SCHEMA_VERSION;
  tokenId: number;
  rarity: LoopiternRarityId;
  base: string;
  eyeTint: string;
  bellyTint: string;
  accentTint: string;
  /** Sketchbook shading stroke pattern id. Every token rolls one. */
  shadingStyle: string;
  /** Shading weight id (light / medium / bold). Every token rolls one. */
  shadingWeight: string;
  /** Shading tone id. Every token rolls one. */
  shadingTone: string;
  /** Legendary only. Null below rarity 4. */
  capeTint: string | null;
};

/** Channels compared when judging whether two same-rarity DNAs look alike. */
export const DNA_CHANNELS = [
  "eyeTint",
  "bellyTint",
  "accentTint",
  "shadingStyle",
  "shadingWeight",
  "shadingTone",
  "capeTint",
] as const;

export type DnaChannel = (typeof DNA_CHANNELS)[number];

/**
 * Accent tints recolor the dominant body-green family. The recolor keeps
 * each pixel's luminance, so entries are separated by HUE (and saturation),
 * not by hex lightness — two same-hue accents would render as the same body.
 */
export const ACCENT_TINTS: readonly TintEntry[] = [
  { id: "kelly", name: "Kelly", hex: "#00a83f" },
  { id: "chartreuse", name: "Chartreuse", hex: "#b4e02a" },
  { id: "teal", name: "Teal", hex: "#12b886" },
  { id: "cyan", name: "Cyan", hex: "#29c4e0" },
  { id: "cobalt", name: "Cobalt", hex: "#3f6fe8" },
  { id: "rose", name: "Rose", hex: "#d94f6c" },
  { id: "ember", name: "Ember", hex: "#f07422" },
  { id: "gold", name: "Gold", hex: "#e8b52a" },
  { id: "violet", name: "Violet", hex: "#8a5ce8", minRarity: 2 },
  { id: "magenta", name: "Magenta", hex: "#e8529e", minRarity: 2 },
  { id: "slate", name: "Slate", hex: "#46586e", minRarity: 3 },
];

/**
 * Belly tints recolor the cream/belly family (face + chest + trim). Rendered
 * at high luminance, so hue separation matters most here too.
 */
export const BELLY_TINTS: readonly TintEntry[] = [
  { id: "cream", name: "Cream", hex: "#f4ead4" },
  { id: "peach", name: "Peach", hex: "#ffb98a" },
  { id: "mint", name: "Mint", hex: "#d6ffe4" },
  { id: "rose", name: "Rose", hex: "#ffd6dd" },
  { id: "sky", name: "Sky", hex: "#cfe6ff" },
  { id: "lilac", name: "Lilac", hex: "#e2d6ff" },
  { id: "ice", name: "Ice", hex: "#e4f6ff" },
  { id: "honey", name: "Honey", hex: "#f7c873", minRarity: 1 },
  { id: "coral", name: "Coral", hex: "#ffc9b0", minRarity: 2 },
  { id: "fog", name: "Fog", hex: "#e6e6e6", minRarity: 3 },
];

/** Eye tints recolor the dark eye pixels inside the cream face. */
export const EYE_TINTS: readonly TintEntry[] = [
  { id: "gold", name: "Gold", hex: "#e8c84a" },
  { id: "spring", name: "Spring", hex: "#7cff7c" },
  { id: "cyan", name: "Cyan", hex: "#7cf0e0" },
  { id: "blue", name: "Blue", hex: "#4aa8ff" },
  { id: "amber", name: "Amber", hex: "#ff9a2a" },
  { id: "moss", name: "Moss", hex: "#3fae5a" },
  { id: "violet", name: "Violet", hex: "#9a5cff" },
  { id: "red", name: "Red", hex: "#ff5544" },
  { id: "pink", name: "Pink", hex: "#ff7ad9" },
  { id: "copper", name: "Copper", hex: "#d96f32" },
  { id: "ocean", name: "Ocean", hex: "#23d3c2" },
  { id: "white", name: "White", hex: "#f4f4f4", minRarity: 2 },
  { id: "tide", name: "Tide", hex: "#c8ff9a", minRarity: 3 },
];

/**
 * Sketchbook shading stroke patterns — how the pencil shading is drawn
 * inside the character's painted shadow areas. Every token rolls one;
 * no "none" variant exists (a clean token is just a light weight).
 */
export type ShadingStyleEntry = {
  id: string;
  name: string;
  minRarity?: LoopiternRarityId;
};

export const SHADING_STYLES: readonly ShadingStyleEntry[] = [
  { id: "hatchH", name: "Horizontal Hatch" },
  { id: "hatchV", name: "Vertical Hatch" },
  { id: "hatchDiag", name: "Diagonal Hatch" },
  { id: "stipple", name: "Stipple" },
  { id: "scribble", name: "Scribble" },
  { id: "contour", name: "Contour" },
  { id: "zigzag", name: "Zigzag" },
  { id: "wave", name: "Wave" },
  { id: "dash", name: "Dash" },
  { id: "brick", name: "Brick" },
  { id: "cel", name: "Cel Shadow" },
  { id: "cross", name: "Cross Hatch", minRarity: 1 },
  { id: "long", name: "Long Stroke", minRarity: 1 },
  { id: "weave", name: "Weave", minRarity: 2 },
  { id: "spiral", name: "Spiral", minRarity: 2 },
  { id: "fine", name: "Fine Line", minRarity: 3 },
];

/** How heavy the pencil hand is. Scales stroke spacing and opacity. */
export const SHADING_WEIGHTS = [
  { id: "light", name: "Light" },
  { id: "medium", name: "Medium" },
  { id: "bold", name: "Bold" },
] as const;

export type ShadingWeightId = (typeof SHADING_WEIGHTS)[number]["id"];

/**
 * Pencil tone for the shading strokes. The `accent` tone has no fixed hex —
 * compositors derive it by darkening the token's accent tint, so it always
 * harmonizes with the body color.
 */
export type ShadingToneEntry = {
  id: string;
  name: string;
  /** Undefined for the derived `accent` tone. */
  hex?: string;
};

export const SHADING_TONES: readonly ShadingToneEntry[] = [
  { id: "graphite", name: "Graphite", hex: "#2e3630" },
  { id: "sepia", name: "Sepia", hex: "#5c4326" },
  { id: "slate", name: "Slate", hex: "#46586e" },
  { id: "plum", name: "Plum", hex: "#4a3355" },
  { id: "accent", name: "Accent Shade" },
];

/** Tsunami-wave cape tints. Rolled only at Legendary. */
export const CAPE_TINTS: readonly TintEntry[] = [
  { id: "kelp-wave", name: "Kelp Wave", hex: "#00C805", minRarity: 4 },
  { id: "lime-foam", name: "Lime Foam", hex: "#c8ff9a", minRarity: 4 },
  { id: "tide", name: "Tide", hex: "#2f6fe8", minRarity: 4 },
  { id: "sunset", name: "Sunset", hex: "#f07422", minRarity: 4 },
  { id: "cream-banner", name: "Cream Banner", hex: "#f4ead4", minRarity: 4 },
  { id: "midnight-tide", name: "Midnight Tide", hex: "#123a5c", minRarity: 4 },
  { id: "rose-wave", name: "Rose Wave", hex: "#e8529e", minRarity: 4 },
  { id: "gold-banner", name: "Gold Banner", hex: "#e8b52a", minRarity: 4 },
];

/** Channels that pick from a TintEntry catalog (shading tones do not). */
export type TintChannel = "eyeTint" | "bellyTint" | "accentTint" | "capeTint";

const TINT_CATALOGS: Record<TintChannel, readonly TintEntry[]> = {
  eyeTint: EYE_TINTS,
  bellyTint: BELLY_TINTS,
  accentTint: ACCENT_TINTS,
  capeTint: CAPE_TINTS,
};

function allowed<T extends { minRarity?: LoopiternRarityId }>(
  catalog: readonly T[],
  rarity: LoopiternRarityId,
): T[] {
  return catalog.filter((e) => rarity >= (e.minRarity ?? 0));
}

/** Entries a given rarity band may roll, per channel. */
export function tintsFor(
  channel: TintChannel,
  rarity: LoopiternRarityId,
): readonly TintEntry[] {
  return allowed(TINT_CATALOGS[channel], rarity);
}

/** Shading styles a given rarity band may roll. Never empty. */
export function shadingStylesFor(
  rarity: LoopiternRarityId,
): readonly ShadingStyleEntry[] {
  return allowed(SHADING_STYLES, rarity);
}

export function findShadingStyle(id: string): ShadingStyleEntry | undefined {
  return SHADING_STYLES.find((s) => s.id === id);
}

export function findShadingWeight(id: string) {
  return SHADING_WEIGHTS.find((w) => w.id === id);
}

export function findShadingTone(id: string): ShadingToneEntry | undefined {
  return SHADING_TONES.find((t) => t.id === id);
}

export function findTint(
  channel: TintChannel,
  id: string,
): TintEntry | undefined {
  return TINT_CATALOGS[channel].find((e) => e.id === id);
}

/**
 * Collection uniqueness is `(rarity, dna)` including `tokenId`.
 * Visual channels can collide; Serial + seed make the DNA unique.
 */
export function dnaCollisionKey(dna: LoopiternDna): string {
  return [
    dna.schemaVersion,
    dna.rarity,
    dna.tokenId,
    dna.base,
    dna.eyeTint,
    dna.bellyTint,
    dna.accentTint,
    dna.shadingStyle,
    dna.shadingWeight,
    dna.shadingTone,
    dna.capeTint ?? "",
  ].join("|");
}

export function baseFileForRarity(rarity: LoopiternRarityId): string {
  return `/loopiterns/rarity-${rarity}.png`;
}

/**
 * FNV-1a 32. Seed string: `${tokenId}|${rarity}|${schemaVersion}`.
 */
export function traitSeed32(
  tokenId: number,
  rarity: LoopiternRarityId,
  schemaVersion = LOOPITERN_TRAIT_SCHEMA_VERSION,
): number {
  const input = `${tokenId}|${rarity}|${schemaVersion}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function xorshift32(state: number): number {
  let x = state >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

function pick<T>(choices: readonly T[], rng: { s: number }): T {
  if (choices.length === 0) {
    throw new Error("LOOPITERN DNA catalog is empty for this rarity band");
  }
  rng.s = xorshift32(rng.s);
  return choices[rng.s % choices.length]!;
}

function assertTokenId(tokenId: number): number {
  if (!Number.isInteger(tokenId) || tokenId < 1 || tokenId > 10_000) {
    throw new Error(`LOOPITERN tokenId must be an integer 1..10000, got ${tokenId}`);
  }
  return tokenId;
}

/**
 * Pure. Requires rarity (on-chain after mint, or a UI preview guess).
 * Does not read the chain. Every token rolls a full shading triple.
 * Roll order (each consumes one xorshift32 word): eye, belly, accent,
 * shading style, shading weight, shading tone, cape (Legendary).
 */
export function dnaFromTokenId(
  tokenId: number,
  rarity: LoopiternRarityId,
): LoopiternDna {
  const id = assertTokenId(tokenId);
  if (!isLoopiternRarityId(rarity)) {
    throw new Error(`Invalid LOOPITERN rarity ${rarity}`);
  }
  const rng = { s: traitSeed32(id, rarity) };
  const eyeTint = pick(tintsFor("eyeTint", rarity), rng);
  const bellyTint = pick(tintsFor("bellyTint", rarity), rng);
  const accentTint = pick(tintsFor("accentTint", rarity), rng);
  const shadingStyle = pick(shadingStylesFor(rarity), rng);
  const shadingWeight = pick(SHADING_WEIGHTS, rng);
  const shadingTone = pick(SHADING_TONES, rng);
  const capeTint =
    rarity === 4 ? pick(tintsFor("capeTint", 4), rng) : null;

  return {
    schemaVersion: LOOPITERN_TRAIT_SCHEMA_VERSION,
    tokenId: id,
    rarity,
    base: `rarity-${rarity}`,
    eyeTint: eyeTint.id,
    bellyTint: bellyTint.id,
    accentTint: accentTint.id,
    shadingStyle: shadingStyle.id,
    shadingWeight: shadingWeight.id,
    shadingTone: shadingTone.id,
    capeTint: capeTint?.id ?? null,
  };
}

function tintName(channel: TintChannel, id: string): string {
  return findTint(channel, id)?.name ?? id;
}

/**
 * OpenSea `attributes` array. Serial is plain metadata — it is NOT drawn on
 * the still as a plate.
 */
export function attributesFromDna(dna: LoopiternDna): OpenSeaAttribute[] {
  const rarityName = rarityById(dna.rarity)?.name ?? `Rarity ${dna.rarity}`;
  const attrs: OpenSeaAttribute[] = [
    { trait_type: "Rarity", value: rarityName },
    { trait_type: "Eye Tint", value: tintName("eyeTint", dna.eyeTint) },
    { trait_type: "Belly Tint", value: tintName("bellyTint", dna.bellyTint) },
    { trait_type: "Accent", value: tintName("accentTint", dna.accentTint) },
    {
      trait_type: "Shading Style",
      value: findShadingStyle(dna.shadingStyle)?.name ?? dna.shadingStyle,
    },
    {
      trait_type: "Shading Weight",
      value: findShadingWeight(dna.shadingWeight)?.name ?? dna.shadingWeight,
    },
    {
      trait_type: "Shading Tone",
      value: findShadingTone(dna.shadingTone)?.name ?? dna.shadingTone,
    },
  ];
  if (dna.capeTint) {
    attrs.push({
      trait_type: "Cape Tint",
      value: tintName("capeTint", dna.capeTint),
    });
  }
  attrs.push(
    { trait_type: "Serial", value: String(dna.tokenId) },
    { trait_type: "Schema", value: String(dna.schemaVersion) },
  );
  return attrs;
}
