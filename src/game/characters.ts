import type { CharacterId, ThemeId } from "./types";

export type CharacterBuild = "compact" | "lean" | "stocky";

export type CharacterDef = {
  id: CharacterId;
  name: string;
  blurb: string;
  build: CharacterBuild;
  skin: string;
  skinShadow: string;
  hair: string;
  outfit: string;
  trim: string;
  eye: string;
};

export const DEFAULT_CHARACTER: CharacterId = "ash";

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  ash: {
    id: "ash",
    name: "Ash",
    blurb: "Compact climber. Ember scarf.",
    build: "compact",
    skin: "#e8b894",
    skinShadow: "#c4845c",
    hair: "#1a1210",
    // Charcoal-plum shell — deliberately near-neutral, so the ember trim
    // stays the only warm note that marks Ash.
    outfit: "#2c2135",
    trim: "#ff6a2a",
    eye: "#1a1210",
  },
  nova: {
    id: "nova",
    name: "Nova",
    blurb: "Lean runner. Cosmic visor.",
    build: "lean",
    skin: "#f0c4a8",
    skinShadow: "#d49a78",
    hair: "#4b1f6b",
    outfit: "#18264a",
    trim: "#4ADE80",
    eye: "#0c1220",
  },
  nord: {
    id: "nord",
    name: "Nord",
    blurb: "Stocky survivor. Ice hood.",
    build: "stocky",
    skin: "#f3d7c0",
    skinShadow: "#d4b090",
    hair: "#f4e4c4",
    outfit: "#d8e6f0",
    trim: "#00C805",
    eye: "#243040",
  },
};

export const CHARACTER_IDS: CharacterId[] = ["ash", "nova", "nord"];

/**
 * The runner built for each world — dress, not stats. P2M is vanilla, so an
 * arrival there has nothing to go on when picking a character; this pairs
 * each hourly world with the one drawn for it. The mint page's deep link
 * uses it, and the picker stays open for anyone who wants someone else.
 */
const CHARACTER_FOR_THEME: Record<ThemeId, CharacterId> = {
  volcanic: "ash",
  planetary: "nova",
  antarctica: "nord",
};

export function characterForTheme(themeId: ThemeId): CharacterId {
  return CHARACTER_FOR_THEME[themeId] ?? DEFAULT_CHARACTER;
}

export function getCharacter(id: CharacterId | undefined): CharacterDef {
  return CHARACTERS[id ?? DEFAULT_CHARACTER] ?? CHARACTERS[DEFAULT_CHARACTER];
}

export function isCharacterId(value: unknown): value is CharacterId {
  return value === "ash" || value === "nova" || value === "nord";
}
