/**
 * Article-only rarity ink ramp, common → legendary.
 *
 * These are the in-app RARITIES accents shifted one step brighter. The in-app
 * ramp is tuned for small chips on the dark game HUD; at tier-name size on
 * this page's near-black ground the in-app Common green (#0E8A3E) does not
 * carry enough contrast, so every tier reads one step up the same green
 * family. This file has no "use client" directive on purpose: both the
 * server-rendered roster table and the live client ladder import the ramp as
 * a value, which a client-boundary module could not give the server.
 */
export const RARITY_INK = [
  "#00C805", // Common
  "#4ADE80", // Uncommon
  "#86EFAC", // Rare
  "#A7F3D0", // Epic
  "#D6F5DE", // Legendary
] as const;
