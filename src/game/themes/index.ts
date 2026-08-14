import type { ThemeId, ThemePalette } from "../types";
import { volcanicTheme } from "./volcanic";

const planetaryTheme: ThemePalette = {
  id: "planetary",
  name: "Planetary",
  skyTop: "#040012",
  skyBottom: "#1a0b3a",
  accent: "#b388ff",
  dangerCore: "#5b2d8e",
  dangerGlow: "#7cfcb0",
  dangerSurface: "#c4b5fd",
  platform: "#2a1f4a",
  platformEdge: "#9f7aea",
  particle: "#e9d5ff",
  haze: "rgba(140, 90, 255, 0.08)",
};

const antarcticaTheme: ThemePalette = {
  id: "antarctica",
  name: "Antarctica",
  skyTop: "#071018",
  skyBottom: "#163048",
  accent: "#7ecbff",
  dangerCore: "#4a9ccc",
  dangerGlow: "#8fd4ff",
  dangerSurface: "#f0f9ff",
  platform: "#2a4050",
  platformEdge: "#7aa0b8",
  particle: "#d8f0ff",
  haze: "rgba(140, 210, 255, 0.08)",
};

const THEMES: Record<ThemeId, ThemePalette> = {
  volcanic: volcanicTheme,
  planetary: planetaryTheme,
  antarctica: antarcticaTheme,
};

export function getTheme(id: ThemeId): ThemePalette {
  return THEMES[id];
}

export function listThemes(): ThemePalette[] {
  return Object.values(THEMES);
}

export { volcanicTheme };
