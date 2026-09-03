/**
 * LOOPITERN still compositor (Prompt K — shared module).
 *
 * Server-only: imports sharp + node:fs. Used by `scripts/compose-loopitern.ts`
 * (CLI) and the on-demand still route `src/app/api/loopitern/[tokenId]/[rarity]/still/route.ts`.
 * One implementation of the recolor + sketchbook-shading pipeline, no duplicates.
 *
 * A composed still = the painted base `rarity-{r}.png` with
 *   (a) per-region recolor — the dominant body-green family remapped to the
 *       DNA accent tint, the cream/belly family to the DNA belly tint, the
 *       eye pixels to the DNA eye tint (luminance preserved so the painting
 *       still reads as a painting), and
 *   (b) SKETCHBOOK SHADING — light pencil-style strokes drawn only inside
 *       the character's painted shadow areas (a soft luminance mask), in a
 *       DNA-rolled style (hatch / stipple / contour / …), weight (stroke
 *       spacing + opacity) and tone (graphite / sepia / … or a darkened
 *       accent).
 *
 * No serial plate — the serial is metadata only. In-game climb sprite =
 * `drawLoopitern` on the SAME DNA palette, not these stills.
 *
 * Rarity is unknown until mint. Do not bake 10k images with a guessed rarity.
 * Compose one still per (tokenId, rarity).
 *
 * Paths resolve from `process.cwd()` — both the CLI (run from the repo root)
 * and the Next.js server (cwd = project root) satisfy this.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { darken } from "./loopiternArt";
import {
  dnaFromTokenId,
  findShadingTone,
  findTint,
  type LoopiternDna,
} from "./loopiternTraits";
import { LOOPITERN_STILL_SIZE, stillRelativeFsPath } from "./loopiternStills";
import type { LoopiternRarityId } from "./mintTiers";

/** Repo root (see module comment). */
export const COMPOSE_ROOT = process.cwd();
/** Absolute path of `public/`. */
export function publicDir(): string {
  return path.join(COMPOSE_ROOT, "public");
}

/**
 * Pixel-pipeline resolution. All geometry below (EYE_WINDOW, shading
 * spacing) is tuned at 1024; the composed still is downscaled to
 * LOOPITERN_STILL_SIZE at the end, which also keeps the file size sane.
 */
export const WORK_SIZE = 1024;
const SIZE = LOOPITERN_STILL_SIZE;

type Hsl = { h: number; s: number; l: number };

/* ------------------------------------------------------------------ */
/* Color math                                                          */
/* ------------------------------------------------------------------ */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHsl(r: number, g: number, b: number): Hsl {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d > 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: h * 360, s, l };
}

function hslToRgb(hsl: Hsl): [number, number, number] {
  const { h: hIn, s, l } = hsl;
  const h = ((hIn % 360) + 360) % 360 / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return [
    Math.round(channel(h + 1 / 3) * 255),
    Math.round(channel(h) * 255),
    Math.round(channel(h - 1 / 3) * 255),
  ];
}

/* ------------------------------------------------------------------ */
/* Recolor — color-distance family bucketing on the raw base pixels    */
/* ------------------------------------------------------------------ */

const BODY_HUE: [number, number] = [70, 165];
const CREAM_HUE: [number, number] = [28, 62];
const CREAM_MIN_L = 0.35;
const BG_MAX_L = 0.05;
const DARK_MAX_L = 0.2;
const EYE_WINDOW = 15;

function integral(mask: Uint8Array, w: number, h: number): Uint32Array {
  const out = new Uint32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < w; x += 1) {
      rowSum += mask[y * w + x]!;
      out[(y + 1) * (w + 1) + (x + 1)] =
        out[y * (w + 1) + (x + 1)]! + rowSum;
    }
  }
  return out;
}

function windowSum(
  integ: Uint32Array,
  w: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const W = w + 1;
  return (
    integ[(y1 + 1) * W + (x1 + 1)]! -
    integ[y0 * W + (x1 + 1)]! -
    integ[(y1 + 1) * W + x0]! +
    integ[y0 * W + x0]!
  );
}

export type RecolorTints = { accent: string; belly: string; eye: string };

/**
 * Recolor the base painting. Family bucketing by HSL distance:
 *   body-green family → accent tint, cream family → belly tint (both keep
 *   the pixel's luminance), dark eye pixels (dark surrounded by cream) →
 *   eye tint, other dark outline pixels follow the accent hue.
 *
 * When `shading` is set, also builds the sketchbook shading overlay from a
 * soft luminance mask of the painted shadows (see buildShadingOverlay).
 */
export async function recolorBase(
  rarity: LoopiternRarityId,
  tints: RecolorTints,
  shading: ShadingSpec | null = null,
): Promise<{ png: Buffer; shadingPng: Buffer | null }> {
  const baseAbs = path.join(publicDir(), "loopiterns", `rarity-${rarity}.png`);
  const { data, info } = await sharp(baseAbs)
    .ensureAlpha()
    .resize(WORK_SIZE, WORK_SIZE, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const N = W * H;

  const accent = rgbToHsl(...hexToRgb(tints.accent));
  const belly = rgbToHsl(...hexToRgb(tints.belly));
  const eye = rgbToHsl(...hexToRgb(tints.eye));

  const hs = new Float32Array(N);
  const ss = new Float32Array(N);
  const ls = new Float32Array(N);
  const creamMask = new Uint8Array(N);
  const bodyMask = new Uint8Array(N);
  const fgMask = new Uint8Array(N);
  let fgLumSum = 0;
  let fgCount = 0;

  for (let i = 0; i < N; i += 1) {
    const o = i * 4;
    if (data[o + 3]! < 128) continue;
    const { h, s, l } = rgbToHsl(data[o]!, data[o + 1]!, data[o + 2]!);
    hs[i] = h;
    ss[i] = s;
    ls[i] = l;
    if (l < BG_MAX_L) continue; // near-black background stays
    fgMask[i] = 1;
    fgLumSum += l;
    fgCount += 1;
    if (h >= BODY_HUE[0] && h <= BODY_HUE[1] && s >= 0.2) bodyMask[i] = 1;
    else if (
      h >= CREAM_HUE[0] && h <= CREAM_HUE[1] && l >= CREAM_MIN_L && s >= 0.12
    ) {
      creamMask[i] = 1;
    }
  }

  const creamInt = integral(creamMask, W, H);
  const bodyInt = integral(bodyMask, W, H);

  const out = Buffer.from(data);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = y * W + x;
      if (!fgMask[i]) continue;
      const o = i * 4;
      const l = ls[i]!;
      let next: Hsl;
      if (bodyMask[i]) {
        next = { h: accent.h, s: 0.3 * ss[i]! + 0.7 * accent.s, l };
      } else if (creamMask[i]) {
        next = { h: belly.h, s: 0.35 * ss[i]! + 0.65 * belly.s, l };
      } else if (l < DARK_MAX_L) {
        // Dark pixel: eye (dark blob surrounded by cream) or outline.
        const x0 = Math.max(0, x - EYE_WINDOW);
        const y0 = Math.max(0, y - EYE_WINDOW);
        const x1 = Math.min(W - 1, x + EYE_WINDOW);
        const y1 = Math.min(H - 1, y + EYE_WINDOW);
        const area = (x1 - x0 + 1) * (y1 - y0 + 1);
        const creamFrac = windowSum(creamInt, W, x0, y0, x1, y1) / area;
        const bodyFrac = windowSum(bodyInt, W, x0, y0, x1, y1) / area;
        if (creamFrac >= 0.5 && bodyFrac <= 0.25) {
          // Keep pupil shading but make the tint unmistakable.
          const shade = 0.5 + 0.5 * Math.min(1, l / 0.1);
          next = { h: eye.h, s: 0.9 * eye.s, l: eye.l * shade };
        } else {
          next = { h: accent.h, s: Math.min(ss[i]!, 0.35), l };
        }
      } else {
        continue;
      }
      const [r, g, b] = hslToRgb(next);
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
    }
  }

  const png = await sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();

  if (!shading || fgCount === 0) {
    return { png, shadingPng: null };
  }

  const meanLum = fgLumSum / fgCount;
  const fgCentroid = centroid(fgMask, W, 0, W, 0, H) ?? { x: W >> 1, y: H >> 1 };
  const overlay = buildShadingOverlay(
    ls,
    fgMask,
    W,
    H,
    meanLum,
    fgCentroid.x,
    fgCentroid.y,
    shading,
  );
  const shadingPng = await sharp(overlay, {
    raw: { width: W, height: H, channels: 4 },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
  return { png, shadingPng };
}

/** Centroid of set mask pixels inside a window, or null when empty. */
function centroid(
  mask: Uint8Array,
  w: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): { x: number; y: number } | null {
  const h = mask.length / w;
  let sumX = 0;
  let sumY = 0;
  let n = 0;
  for (let y = Math.max(0, y0); y < Math.min(h, y1); y += 2) {
    for (let x = Math.max(0, x0); x < Math.min(w, x1); x += 2) {
      if (!mask[y * w + x]) continue;
      sumX += x;
      sumY += y;
      n += 1;
    }
  }
  if (n === 0) return null;
  return { x: Math.round(sumX / n), y: Math.round(sumY / n) };
}

/* ------------------------------------------------------------------ */
/* Sketchbook shading — pencil strokes inside the painted shadows      */
/* ------------------------------------------------------------------ */

/** Resolved shading spec handed to the compositor. */
export type ShadingSpec = {
  style: string;
  weight: string;
  /** Stroke color as RGB 0-255. */
  toneRgb: [number, number, number];
};

/** Stroke spacing (px at WORK_SIZE) and overlay opacity per weight. */
const SHADING_WEIGHT_PARAMS: Record<string, { spacing: number; alpha: number }> = {
  light: { spacing: 26, alpha: 0.22 },
  medium: { spacing: 20, alpha: 0.32 },
  bold: { spacing: 15, alpha: 0.44 },
};

/**
 * Soft shadow ramp: `v` reaches 1 at `mean*0.58` and 0 at `mean*0.88`
 * luminance (relative to the foreground mean). The painted shadow areas
 * light up with strokes; highlights and the cream face stay clean.
 */
const SHADOW_HI = 0.88;
const SHADOW_RANGE = 0.3;

/** Deterministic hash for stipple dots (2px cells). */
function stippleHash(x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Whether the shading pattern puts a stroke on pixel (x, y). `s` = spacing,
 * `t` = stroke thickness, (cx, cy) = foreground centroid for the radial
 * styles. All coordinates are WORK_SIZE pixels.
 */
function patternHit(
  style: string,
  x: number,
  y: number,
  s: number,
  t: number,
  cx: number,
  cy: number,
): boolean {
  switch (style) {
    case "hatchH":
      return y % s < t;
    case "hatchV":
      return x % s < t;
    case "cross":
      return (x + y) % s < t || (x - y + WORK_SIZE * 2) % s < t;
    case "stipple":
      return stippleHash(x >> 1, y >> 1) % 100 < 16;
    case "scribble":
      return (
        Math.abs(Math.sin((x + 24 * Math.sin(y / 21)) * Math.PI / (s * 0.9))) < 0.45
      );
    case "contour": {
      const d = Math.hypot(x - cx, y - cy);
      return d % s < t;
    }
    case "zigzag": {
      const zz = y % (2 * s) < s ? x : -x;
      return ((zz % s) + s) % s < t;
    }
    case "wave":
      return (
        Math.abs(Math.sin((y + 18 * Math.sin(x / 28)) * Math.PI / (s * 0.9))) < 0.45
      );
    case "dash":
      return (x + y) % s < t && (((x >> 5) + (y >> 5)) % 3) !== 0;
    case "brick": {
      const row = Math.floor(y / s);
      const off = (row % 2) * (s >> 1);
      return y % s < t || (x + off) % s < t;
    }
    case "weave":
      return (
        (x % s < t && y % (2 * s) < s) ||
        (y % s < t && x % (2 * s) >= s)
      );
    case "spiral": {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx) + Math.PI;
      return (d + a * s * 0.4) % s < t;
    }
    case "cel":
      return true;
    case "long":
      return (x + y) % (s * 2) < t * 1.6;
    case "fine":
      return (x + y) % Math.max(6, s * 0.55) < Math.max(2, t * 0.55);
    case "hatchDiag":
    default:
      return (x + y) % s < t;
  }
}

/**
 * Build the shading overlay as a WORK_SIZE RGBA raw buffer. Alpha =
 * shadow value × pattern × weight opacity, so strokes fade in softly
 * toward the deeper shadows and never touch highlights.
 */
function buildShadingOverlay(
  ls: Float32Array,
  fgMask: Uint8Array,
  W: number,
  H: number,
  meanLum: number,
  cx: number,
  cy: number,
  spec: ShadingSpec,
): Buffer {
  const { spacing: s, alpha } = SHADING_WEIGHT_PARAMS[spec.weight] ??
    SHADING_WEIGHT_PARAMS.medium!;
  const t = Math.max(2, Math.round(s * 0.34));
  const overlay = Buffer.alloc(W * H * 4); // zero = fully transparent
  const [tr, tg, tb] = spec.toneRgb;
  const hi = meanLum * SHADOW_HI;
  const range = meanLum * SHADOW_RANGE;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = y * W + x;
      if (!fgMask[i]) continue;
      const v = (hi - ls[i]!) / range;
      if (v <= 0) continue;
      if (!patternHit(spec.style, x, y, s, t, cx, cy)) continue;
      const a = Math.round(255 * Math.min(1, v) * alpha);
      if (a <= 0) continue;
      const o = i * 4;
      overlay[o] = tr;
      overlay[o + 1] = tg;
      overlay[o + 2] = tb;
      overlay[o + 3] = a;
    }
  }
  return overlay;
}

/* ------------------------------------------------------------------ */
/* Still composition                                                   */
/* ------------------------------------------------------------------ */

function dnaTints(dna: LoopiternDna): RecolorTints {
  return {
    accent:
      findTint("accentTint", dna.accentTint)?.hex ?? "#00a83f",
    belly: findTint("bellyTint", dna.bellyTint)?.hex ?? "#f4ead4",
    eye: findTint("eyeTint", dna.eyeTint)?.hex ?? "#e8c84a",
  };
}

/** Resolve the DNA shading triple into a compositor spec. */
function shadingSpec(dna: LoopiternDna): ShadingSpec {
  const accent = findTint("accentTint", dna.accentTint)?.hex ?? "#00a83f";
  const toneHex = findShadingTone(dna.shadingTone)?.hex ?? darken(accent, 0.45);
  const h = toneHex.replace("#", "");
  return {
    style: dna.shadingStyle,
    weight: dna.shadingWeight,
    toneRgb: [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ],
  };
}

/** Absolute on-disk path of a composed still. */
export function stillAbsPath(
  tokenId: number,
  rarity: LoopiternRarityId,
): string {
  return path.join(COMPOSE_ROOT, ...stillRelativeFsPath(tokenId, rarity).split("/"));
}

export type ComposedStill = {
  png: Buffer;
  dna: LoopiternDna;
  outAbs: string;
  /** True when the PNG came from the on-disk cache, not a fresh compose. */
  fromCache: boolean;
};

/**
 * Compose (or read from cache) the still for one (tokenId, rarity) and,
 * when freshly composed, write it to `public/loopiterns/generated/...`
 * so the static `stillPath` URL serves it on subsequent requests.
 *
 * The write is best-effort: on read-only hosts (e.g. Vercel) the PNG is
 * still returned to the caller; only the static-cache warm-up is skipped.
 */
export async function composeLoopiternStillCached(
  tokenId: number,
  rarity: LoopiternRarityId,
): Promise<ComposedStill> {
  const outAbs = stillAbsPath(tokenId, rarity);
  // `existsSync`-free read: a miss throws ENOENT and we compose instead.
  let cached: Buffer | null = null;
  try {
    cached = readFileSync(outAbs);
  } catch {
    cached = null;
  }
  if (cached) {
    return { png: cached, dna: dnaFromTokenId(tokenId, rarity), outAbs, fromCache: true };
  }
  const composed = await composeLoopiternStill(tokenId, rarity);
  return { ...composed, fromCache: false };
}

export async function composeLoopiternStill(
  tokenId: number,
  rarity: LoopiternRarityId,
  options?: {
    /**
     * Output edge in px. Defaults to LOOPITERN_STILL_SIZE (512). Passing
     * WORK_SIZE skips the downscale and the disk-cache write — the hi-res
     * variant is served on demand (Prompt J5) and never lands in `public/`.
     */
    size?: number;
  },
): Promise<{ outAbs: string; dna: LoopiternDna; png: Buffer }> {
  const outSize = options?.size ?? SIZE;
  const dna = dnaFromTokenId(tokenId, rarity);
  const tints = dnaTints(dna);
  const { png, shadingPng } = await recolorBase(
    rarity,
    tints,
    shadingSpec(dna),
  );

  // Composite at WORK_SIZE, THEN downscale. sharp runs resize before
  // composite in a single chain, which used to stamp the 1024-space overlay
  // onto the already-512 base — every stroke landed at 2x offset in the
  // bottom-right corner, clipped at the image edge.
  const marked = shadingPng
    ? await sharp(png)
        .composite([{ input: shadingPng, blend: "over" as const }])
        .toBuffer()
    : png;
  // At WORK_SIZE the recolored base already is the target resolution —
  // resizing would just re-filter pixels for nothing.
  const composed =
    outSize === WORK_SIZE
      ? await sharp(marked)
          .png({ compressionLevel: 9, adaptiveFiltering: false })
          .toBuffer()
      : await sharp(marked)
          .resize(outSize, outSize, { fit: "fill", kernel: "lanczos3" })
          .png({ compressionLevel: 9, adaptiveFiltering: false })
          .toBuffer();

  if (outSize !== SIZE) {
    return { outAbs: stillAbsPath(tokenId, rarity), dna, png: composed };
  }
  const rel = stillRelativeFsPath(tokenId, rarity);
  const outAbs = path.join(COMPOSE_ROOT, ...rel.split("/"));
  try {
    mkdirSync(path.dirname(outAbs), { recursive: true });
    writeFileSync(outAbs, composed);
  } catch {
    // Read-only host — the caller still gets the PNG buffer.
  }
  return { outAbs, dna, png: composed };
}
