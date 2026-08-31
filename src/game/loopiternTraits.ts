/**
 * LOOPITERN DNA schema (Prompt J4, schema v2).
 *
 * LOCKED DIRECTION: the 5 painted hero bases (`rarity-{0..4}.png`) stay
 * forever — never 10k unique paintings. Per-token uniqueness = VISIBLE
 * recolor + ONE always-visible mark, driven by these DNA channels:
 *
 *   Eye Tint, Belly Tint, Accent Tint, Mark (never "none"), Cape Tint
 *   (Legendary only).
 *
 * Marketplace stills (J3 compositor) recolor the base painting with this
 * palette and stamp the mark on the torso. The in-game climb rig
 * (J4 `drawLoopitern`) uses the SAME palette via `loopiternRigPalette`.
 * The serial is metadata only — no visual plate.
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
export const LOOPITERN_TRAIT_SCHEMA_VERSION = 2;

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

/** One always-visible torso mark. There is no "none" variant. */
export type MarkEntry = {
  id: string;
  name: string;
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
  mark: string;
  /** Legendary only. Null below rarity 4. */
  capeTint: string | null;
};

/** Channels compared when judging whether two same-rarity DNAs look alike. */
export const DNA_CHANNELS = [
  "eyeTint",
  "bellyTint",
  "accentTint",
  "mark",
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

/** Always-visible torso marks. No "none" variant exists. */
export const MARKS: readonly MarkEntry[] = [
  { id: "chevron", name: "Chevron" },
  { id: "stripe", name: "Stripe" },
  { id: "spots", name: "Spot Cluster" },
  { id: "vine", name: "Vine" },
  { id: "rune", name: "Rune" },
  { id: "sigil", name: "Sigil" },
  { id: "band", name: "Band" },
  { id: "star", name: "Star" },
  { id: "moon", name: "Moon" },
  { id: "bolt", name: "Bolt" },
  { id: "circuit", name: "Circuit", minRarity: 2 },
  { id: "crown", name: "Crown", minRarity: 3 },
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

const TINT_CATALOGS: Record<
  Exclude<DnaChannel, "mark">,
  readonly TintEntry[]
> = {
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
  channel: Exclude<DnaChannel, "mark">,
  rarity: LoopiternRarityId,
): readonly TintEntry[] {
  return allowed(TINT_CATALOGS[channel], rarity);
}

/** Marks a given rarity band may roll. Never empty, never "none". */
export function marksFor(rarity: LoopiternRarityId): readonly MarkEntry[] {
  return allowed(MARKS, rarity);
}

export function findTint(
  channel: Exclude<DnaChannel, "mark">,
  id: string,
): TintEntry | undefined {
  return TINT_CATALOGS[channel].find((e) => e.id === id);
}

export function findMark(id: string): MarkEntry | undefined {
  return MARKS.find((m) => m.id === id);
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
    dna.mark,
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
 * Does not read the chain. `mark` is never "none" — MARKS has no such entry.
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
  const mark = pick(marksFor(rarity), rng);
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
    mark: mark.id,
    capeTint: capeTint?.id ?? null,
  };
}

function tintName(
  channel: Exclude<DnaChannel, "mark">,
  id: string,
): string {
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
    { trait_type: "Mark", value: findMark(dna.mark)?.name ?? dna.mark },
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
