/**
 * LOOPITERN marketplace compositor (Prompt J4).
 *
 * A composed still = the painted base `rarity-{r}.png` with
 *   (a) per-region recolor — the dominant body-green family remapped to the
 *       DNA accent tint, the cream/belly family to the DNA belly tint, the
 *       eye pixels to the DNA eye tint (luminance preserved so the painting
 *       still reads as a painting), and
 *   (b) ONE bold, always-visible DNA mark stamped on the torso (≥15% of
 *       image height, solid accent, ink keyline + cream halo).
 *
 * No serial plate — the serial is metadata only. In-game climb sprite =
 * `drawLoopitern` on the SAME DNA palette, not these stills.
 *
 * Rarity is unknown until mint. Do not bake 10k images with a guessed rarity.
 * Compose one still per (tokenId, rarity).
 *
 * Usage:
 *   npx tsx scripts/compose-loopitern.ts --chips    # recolor reference sheet
 *   npx tsx scripts/compose-loopitern.ts --tokenId 12 --rarity 0
 *   npx tsx scripts/compose-loopitern.ts --ids 1,7,12 --rarities 0,1,2,3,4
 *   npx tsx scripts/compose-loopitern.ts --sample
 *
 * Output: public/loopiterns/generated/{rarity}/{tokenId}.png
 * Path map: stillPath / stillRelativeFsPath in src/game/loopiternStills.ts
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  dnaFromTokenId,
  findTint,
  type LoopiternDna,
} from "../src/game/loopiternTraits";
import {
  LOOPITERN_PREVIEW_GRID_FS_PATH,
  LOOPITERN_STILL_SIZE,
  stillRelativeFsPath,
} from "../src/game/loopiternStills";
import type { LoopiternRarityId } from "../src/game/mintTiers";
import { isLoopiternRarityId } from "../src/game/mintTiers";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
/**
 * Pixel-pipeline resolution. All geometry below (TORSO_WINDOWS, EYE_WINDOW,
 * mark spans, margin) is tuned at 1024; the composed still is downscaled to
 * LOOPITERN_STILL_SIZE at the end, which also keeps the file size sane.
 */
const WORK_SIZE = 1024;
const SIZE = LOOPITERN_STILL_SIZE;

type Pair = { tokenId: number; rarity: LoopiternRarityId };

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

/** Torso windows (px) per rarity — the mark anchor is the fg centroid. */
const TORSO_WINDOWS: Record<LoopiternRarityId, [number, number, number, number]> = {
  0: [352, 640, 448, 736],
  1: [352, 640, 448, 736],
  2: [320, 672, 448, 736],
  3: [288, 640, 384, 672],
  4: [256, 512, 384, 576],
};

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
 */
async function recolorBase(
  rarity: LoopiternRarityId,
  tints: RecolorTints,
): Promise<{ png: Buffer; markAnchor: { x: number; y: number } }> {
  const baseAbs = path.join(PUBLIC, "loopiterns", `rarity-${rarity}.png`);
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

  for (let i = 0; i < N; i += 1) {
    const o = i * 4;
    if (data[o + 3]! < 128) continue;
    const { h, s, l } = rgbToHsl(data[o]!, data[o + 1]!, data[o + 2]!);
    hs[i] = h;
    ss[i] = s;
    ls[i] = l;
    if (l < BG_MAX_L) continue; // near-black background stays
    fgMask[i] = 1;
    if (h >= BODY_HUE[0] && h <= BODY_HUE[1] && s >= 0.2) bodyMask[i] = 1;
    else if (
      h >= CREAM_HUE[0] && h <= CREAM_HUE[1] && l >= CREAM_MIN_L && s >= 0.12
    ) {
      creamMask[i] = 1;
    }
  }

  const creamInt = integral(creamMask, W, H);
  const bodyInt = integral(bodyMask, W, H);
  const windowArea = (2 * EYE_WINDOW + 1) ** 2;

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

  // Mark anchor: foreground centroid inside the torso window.
  const [wx0, wx1, wy0, wy1] = TORSO_WINDOWS[rarity];
  let sumX = 0;
  let sumY = 0;
  let n = 0;
  for (let y = wy0; y < wy1; y += 2) {
    for (let x = wx0; x < wx1; x += 2) {
      if (!fgMask[y * W + x]) continue;
      sumX += x;
      sumY += y;
      n += 1;
    }
  }
  const margin = 100;
  const anchor =
    n > 0
      ? {
          x: Math.min(Math.max(Math.round(sumX / n), wx0 + margin), wx1 - margin),
          y: Math.min(Math.max(Math.round(sumY / n), wy0 + margin), wy1 - margin),
        }
      : { x: (wx0 + wx1) >> 1, y: (wy0 + wy1) >> 1 };
  return { png, markAnchor: anchor };
}

/* ------------------------------------------------------------------ */
/* Mark overlay — one bold always-visible emblem                       */
/* ------------------------------------------------------------------ */

type MarkGeometry = {
  /** true = filled shape, false = stroke-only. */
  filled: boolean;
  /** Base stroke width (accent layer); halo/keyline layers add on top. */
  width: number;
  body: string;
};

/** Geometry spans roughly ±80px; `scale(1.15)` ⇒ ~184px ≥ 15% of 1024. */
const MARK_GEOMETRY: Record<string, MarkGeometry> = {
  chevron: {
    filled: true,
    width: 6,
    body: `<path d="M-78,28 L0,-22 L78,28 L78,-14 L0,-64 L-78,-14 Z"/>`,
  },
  stripe: {
    filled: true,
    width: 6,
    body: `<rect x="-62" y="-82" width="34" height="164" rx="16"/><rect x="28" y="-82" width="34" height="164" rx="16"/>`,
  },
  spots: {
    filled: true,
    width: 6,
    body: `<circle cx="-40" cy="-36" r="30"/><circle cx="36" cy="-46" r="24"/><circle cx="-4" cy="42" r="26"/>`,
  },
  vine: {
    filled: false,
    width: 22,
    body: `<path d="M-58,68 C-26,-26 22,58 58,-62 M58,-62 c16,-10 22,-26 10,-38"/>`,
  },
  rune: {
    filled: false,
    width: 24,
    body: `<path d="M-56,-66 L32,-66 L-20,0 L46,0 L-36,66"/>`,
  },
  sigil: {
    filled: true,
    width: 6,
    body: `<path fill-rule="evenodd" d="M0,-72 A72,72 0 1,1 0,72 A72,72 0 1,1 0,-72 Z M0,-36 A36,36 0 1,0 0,36 A36,36 0 1,0 0,-36 Z"/>`,
  },
  band: {
    filled: true,
    width: 6,
    body: `<rect x="-82" y="-26" width="164" height="52" rx="26"/>`,
  },
  star: {
    filled: true,
    width: 6,
    body: `<path d="M0,-86 L21,-21 L86,0 L21,21 L0,86 L-21,21 L-86,0 L-21,-21 Z"/>`,
  },
  moon: {
    filled: true,
    width: 6,
    body: `<path d="M20,-72 A72,72 0 1,0 20,72 A54,54 0 1,1 20,-72 Z"/>`,
  },
  bolt: {
    filled: true,
    width: 6,
    body: `<path d="M-6,-74 L32,-74 L4,-14 L28,-14 L-12,74 L0,2 L-20,2 Z"/>`,
  },
  circuit: {
    filled: false,
    width: 20,
    body: `<path d="M-62,-58 H-16 V-16 H46 V26 H-10 V62 H-62"/>`,
  },
  crown: {
    filled: true,
    width: 6,
    body: `<path d="M-66,42 L-66,-32 L-33,2 L0,-54 L33,2 L66,-32 L66,42 Z"/>`,
  },
};

/**
 * Solid-accent emblem with an ink keyline and cream halo so it stays bold on
 * both the belly-tint chest and the accent-tinted body.
 */
export function markSvg(
  markId: string,
  accentHex: string,
  cx: number,
  cy: number,
): string {
  const geo = MARK_GEOMETRY[markId] ?? MARK_GEOMETRY.chevron!;
  const layers = [
    { color: "#f4ead4", extra: 30 },
    { color: "#05140a", extra: 16 },
    { color: accentHex, extra: 0 },
  ];
  const groups = layers
    .map(
      ({ color, extra }) =>
        `<g fill="${geo.filled ? color : "none"}" stroke="${color}" stroke-width="${geo.width + extra}" stroke-linecap="round" stroke-linejoin="round">${geo.body}</g>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><g transform="translate(${cx},${cy}) scale(1.15)">${groups}</g></svg>`;
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

export async function composeLoopiternStill(
  tokenId: number,
  rarity: LoopiternRarityId,
): Promise<{ outAbs: string; dna: LoopiternDna; png: Buffer }> {
  const dna = dnaFromTokenId(tokenId, rarity);
  const { png, markAnchor } = await recolorBase(rarity, dnaTints(dna));

  const mark = await sharp(Buffer.from(markSvg(dna.mark, dnaTints(dna).accent, markAnchor.x, markAnchor.y)))
    .png()
    .toBuffer();

  const composed = await sharp(png)
    .composite([{ input: mark, blend: "over" }])
    .resize(SIZE, SIZE, { fit: "fill", kernel: "lanczos3" })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();

  const rel = stillRelativeFsPath(tokenId, rarity);
  const outAbs = path.join(ROOT, ...rel.split("/"));
  await mkdir(path.dirname(outAbs), { recursive: true });
  await writeFile(outAbs, composed);
  return { outAbs, dna, png: composed };
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

function parseArgs(argv: string[]) {
  const out = {
    chips: false,
    sample: false,
    tokenId: null as number | null,
    rarity: null as LoopiternRarityId | null,
    ids: [] as number[],
    rarities: [] as LoopiternRarityId[],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    const next = argv[i + 1];
    if (a === "--chips") out.chips = true;
    else if (a === "--sample") out.sample = true;
    else if (a === "--tokenId" && next) {
      out.tokenId = Number(next);
      i += 1;
    } else if (a === "--rarity" && next) {
      const r = Number(next);
      if (!isLoopiternRarityId(r)) throw new Error(`bad --rarity ${next}`);
      out.rarity = r;
      i += 1;
    } else if (a === "--ids" && next) {
      out.ids = next.split(",").map((s) => Number(s.trim()));
      i += 1;
    } else if (a === "--rarities" && next) {
      out.rarities = next.split(",").map((s) => {
        const r = Number(s.trim());
        if (!isLoopiternRarityId(r)) throw new Error(`bad rarity ${s}`);
        return r;
      });
      i += 1;
    }
  }
  return out;
}

async function pixelHash(png: Buffer): Promise<string> {
  const raw = await sharp(png).raw().ensureAlpha().toBuffer();
  return createHash("sha256").update(raw).digest("hex");
}

function samplePairs(): Pair[] {
  const pairs: Pair[] = [];
  const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  const rarities: LoopiternRarityId[] = [0, 1, 2, 3, 4];
  for (let i = 0; i < ids.length; i += 1) {
    pairs.push({ tokenId: ids[i]!, rarity: rarities[i % 5]! });
  }
  pairs.push({ tokenId: 1, rarity: 4 });
  pairs.push({ tokenId: 20, rarity: 0 });
  return pairs;
}

async function assertUniquePixels(pairs: Pair[]): Promise<void> {
  if (pairs.length < 20) {
    throw new Error("uniqueness sample must be ≥ 20 (tokenId, rarity) pairs");
  }
  const seen = new Map<string, string>();
  for (const { tokenId, rarity } of pairs) {
    const { png } = await composeLoopiternStill(tokenId, rarity);
    const hash = await pixelHash(png);
    const key = `${tokenId}:${rarity}`;
    const clash = seen.get(hash);
    if (clash) {
      throw new Error(`identical pixels: ${clash} vs ${key}`);
    }
    seen.set(hash, key);
  }
  console.log(`uniqueness: ${seen.size} distinct buffers`);
}

/**
 * Rows = rarity 0→4, columns = sample tokenIds — each row must show obvious
 * color/mark differences. Chosen over the DNA roll so every row pairs five
 * hue-separated accents (min gap ≈27°, rarity 0's catalog ceiling) with five
 * pairwise-distinct marks, so no column pair can read as a copy.
 */
async function writePreviewGrid(): Promise<string> {
  const ids = [2, 37, 103, 120, 173];
  const rarities: LoopiternRarityId[] = [0, 1, 2, 3, 4];
  const tile = 192;
  const tiles: { input: Buffer; left: number; top: number }[] = [];
  for (let row = 0; row < rarities.length; row += 1) {
    for (let col = 0; col < ids.length; col += 1) {
      const { png } = await composeLoopiternStill(ids[col]!, rarities[row]!);
      const thumb = await sharp(png)
        .resize(tile, tile, { fit: "cover" })
        .png()
        .toBuffer();
      tiles.push({ input: thumb, left: col * tile, top: row * tile });
    }
  }
  const dest = path.join(ROOT, ...LOOPITERN_PREVIEW_GRID_FS_PATH.split("/"));
  await mkdir(path.dirname(dest), { recursive: true });
  await sharp({
    create: {
      width: tile * ids.length,
      height: tile * rarities.length,
      channels: 4,
      background: { r: 5, g: 20, b: 10, alpha: 1 },
    },
  })
    .composite(tiles)
    .png()
    .toFile(dest);
  return dest;
}

/** `--chips` now regenerates the recolor reference sheet (no more layer chips). */
async function writeRecolorSheet(): Promise<string> {
  const accents = ["#00a83f", "#29c4e0", "#e8b52a", "#8a5ce8", "#e8529e", "#46586e"];
  const rarities: LoopiternRarityId[] = [0, 1, 2, 3, 4];
  const tile = 256;
  const tiles: { input: Buffer; left: number; top: number }[] = [];
  for (let row = 0; row < rarities.length; row += 1) {
    for (let col = 0; col < accents.length; col += 1) {
      const { png } = await recolorBase(rarities[row]!, {
        accent: accents[col]!,
        belly: "#f4ead4",
        eye: "#e8c84a",
      });
      const thumb = await sharp(png)
        .resize(tile, tile, { fit: "cover" })
        .png()
        .toBuffer();
      tiles.push({ input: thumb, left: col * tile, top: row * tile });
    }
  }
  const dest = path.join(PUBLIC, "loopiterns", "recolor-sheet.png");
  await mkdir(path.dirname(dest), { recursive: true });
  await sharp({
    create: {
      width: tile * accents.length,
      height: tile * rarities.length,
      channels: 4,
      background: { r: 5, g: 20, b: 10, alpha: 1 },
    },
  })
    .composite(tiles)
    .png()
    .toFile(dest);
  return dest;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const work =
    args.chips ||
    args.sample ||
    args.tokenId != null ||
    args.ids.length > 0;

  if (!work) {
    console.log(
      "compose-loopitern: pass --chips (recolor sheet), --tokenId/--rarity, --ids, or --sample",
    );
    process.exit(1);
  }

  if (args.chips && !args.sample) {
    const sheet = await writeRecolorSheet();
    console.log(`recolor sheet: ${path.relative(ROOT, sheet)}`);
    return;
  }

  if (args.sample) {
    await assertUniquePixels(samplePairs());
    const grid = await writePreviewGrid();
    console.log(`preview grid: ${path.relative(ROOT, grid)}`);
    return;
  }

  const ids =
    args.ids.length > 0
      ? args.ids
      : args.tokenId != null
        ? [args.tokenId]
        : [];
  const rarities =
    args.rarities.length > 0
      ? args.rarities
      : args.rarity != null
        ? [args.rarity]
        : ([0, 1, 2, 3, 4] as LoopiternRarityId[]);

  if (ids.length === 0) {
    throw new Error("pass --tokenId or --ids");
  }

  for (const tokenId of ids) {
    for (const rarity of rarities) {
      const { outAbs, dna } = await composeLoopiternStill(tokenId, rarity);
      console.log(
        `${path.relative(ROOT, outAbs)}  accent=${dna.accentTint} belly=${dna.bellyTint} eye=${dna.eyeTint} mark=${dna.mark} cape=${dna.capeTint ?? "none"}`,
      );
    }
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
