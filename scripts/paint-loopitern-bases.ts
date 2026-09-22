/**
 * LOOPITERN base repaint — Arc blue → Robinhood green.
 *
 * The exact inverse of the Arc pivot (commit 98ea2c3), which rewrote the five
 * painted hero bases `public/loopiterns/{rarity-0..4}.png` in place by
 * remapping the green hue family onto the Arc-blue family while preserving
 * each pixel's saturation and luminance:
 *
 *   hue ∈ [205, 240]  →  hue ∈ [62, 165]   (Arc blues → body greens/teals)
 *   everything else  →  untouched          (cream face/belly stays warm for
 *                                           CREAM_HUE detection, the rarity-2
 *                                           ice family keeps its cyan hue, the
 *                                           Legendary wave cape and the
 *                                           gold/cream halo accents stay)
 *
 * ── Before you run this: the warp is NOT a lossless undo ──────────────────
 * The forward warp preserved s and l exactly, so a pixel it converted is
 * pixel-identical to one it never touched. That makes provenance
 * unrecoverable from the image alone: rarity-4's tsunami cape is *painted*
 * blue (hue 195–210) in BOTH eras, and it overlaps the forward warp's
 * destination band. Warping a blue rarity-4 therefore eats ~10% of the
 * Legendary's foreground — the cape — and turns it green. Rarity 4 is
 * exempt below for that reason.
 *
 * Because of this the checked-in bases were NOT produced by this script.
 * They were restored from the pre-pivot revision (7d5a1a0), which is the
 * exact, lossless green original — the Arc pivot was a pure hue operation
 * with a byte-identical silhouette (0.000% edge mismatch), so the restored
 * files are the true inverse, not an approximation. This script is the
 * recorded transform plus the gate below: on already-green bases it is a
 * verified no-op.
 *
 * The source band matches the Arc rework's compositor body window [195,255]
 * (the destination became BODY_HUE in loopiternCompose.ts), and the [205,240]
 * slice an exact affine fit of the pivot: cur = 184.0 + 0.3397 * old, which
 * reproduces 62→205 and 165→240. Note the band is INCLUSIVE of 240 — the
 * forward warp's integer quantisation landed the top of its range on exactly
 * 240.0, so an exclusive guard silently strands those pixels blue.
 *
 * Run: npx tsx scripts/paint-loopitern-bases.ts
 */

import path from "node:path";
import sharp from "sharp";
import type { LoopiternRarityId } from "../src/game/mintTiers";

const RARITIES: LoopiternRarityId[] = [0, 1, 2, 3, 4];
const SRC_LO = 205;
const SRC_HI = 240;
const DST_LO = 62;
const DST_HI = 165;

/**
 * Must match BODY_HUE in `src/game/loopiternCompose.ts` — the compositor
 * buckets the body family with this window, so a base whose greens sit
 * outside it renders with an un-recolored body.
 */
const BODY_WINDOW: [number, number] = [70, 165];

/**
 * Legendary only: the wave cape is painted blue (hue 195–210) in both the
 * green and the Arc art, so this rarity can never be inverted by hue alone.
 * See the header note.
 */
const WARP_EXEMPT: ReadonlySet<LoopiternRarityId> = new Set([4]);

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToRgb(hDeg: number, s: number, l: number): [number, number, number] {
  const h = (((hDeg % 360) + 360) % 360) / 360;
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

/**
 * Linear blue→green hue warp. Saturation and luminance pass through.
 * `SRC_HI` is inclusive — see the header note on the 240.0 edge.
 */
function warpHue(h: number): number {
  if (h < SRC_LO || h > SRC_HI) return h;
  const t = (h - SRC_LO) / (SRC_HI - SRC_LO);
  return DST_LO + t * (DST_HI - DST_LO);
}

/** Foreground = anything above the near-black background luminance band. */
const BG_MAX_L = 0.05;

/**
 * Body-family windows used only to classify which era a base is in. The band
 * is the wrong discriminator for rarity 4 — its painted cape legitimately
 * sits inside SRC — so classification asks which body family dominates.
 */
const GREEN_BODY: [number, number] = [70, 165];
const BLUE_BODY: [number, number] = [195, 255];

async function main() {
  const publicDir = path.join(process.cwd(), "public", "loopiterns");
  for (const rarity of RARITIES) {
    const file = path.join(publicDir, `rarity-${rarity}.png`);
    const { data, info } = await sharp(file)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const n = info.width * info.height;
    let fg = 0;
    let greenBody = 0;
    let blueBody = 0;
    for (let i = 0; i < n; i += 1) {
      const o = i * 4;
      const [h, s, l] = rgbToHsl(data[o]!, data[o + 1]!, data[o + 2]!);
      if (l < BG_MAX_L) continue;
      fg += 1;
      if (s < 0.2) continue;
      if (h >= GREEN_BODY[0] && h <= GREEN_BODY[1]) greenBody += 1;
      else if (h >= BLUE_BODY[0] && h <= BLUE_BODY[1]) blueBody += 1;
    }

    // Idempotence: a base whose body is already the green family has nothing
    // to invert, so re-running the script must not touch it.
    if (greenBody >= blueBody) {
      const cape = WARP_EXEMPT.has(rarity)
        ? ` (the ${((blueBody / fg) * 100).toFixed(1)}% still in the blue family is its painted wave cape)`
        : "";
      console.log(`rarity-${rarity}.png: already green — skipped${cape}`);
      continue;
    }
    if (WARP_EXEMPT.has(rarity)) {
      console.log(
        `rarity-${rarity}.png: REFUSED — body is blue (${((blueBody / fg) * 100).toFixed(1)}% of foreground) ` +
          `but the wave cape is painted blue in both eras, so a hue warp eats it; ` +
          `restore the pre-pivot file (git checkout 7d5a1a0 -- ${path.relative(process.cwd(), file).replace(/\\/g, "/")}) instead`,
      );
      continue;
    }

    let remapped = 0;
    for (let i = 0; i < n; i += 1) {
      const o = i * 4;
      const [h, s, l] = rgbToHsl(data[o]!, data[o + 1]!, data[o + 2]!);
      const h2 = warpHue(h);
      if (h2 === h) continue;
      const [r2, g2, b2] = hslToRgb(h2, s, l);
      data[o] = r2;
      data[o + 1] = g2;
      data[o + 2] = b2;
      remapped += 1;
    }
    await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png({ compressionLevel: 9, adaptiveFiltering: false })
      .toFile(file);
    const pct = ((remapped / n) * 100).toFixed(1);
    console.log(`rarity-${rarity}.png: ${pct}% of pixels re-hued blue→green`);
  }
  await verifyBodyCoverage(publicDir);
}

/**
 * Real sanity gate on the output: measure the painted bases against the
 * compositor's body window and fail loudly if the body family does not
 * dominate the foreground or if blue remnants survive.
 */
async function verifyBodyCoverage(publicDir: string): Promise<void> {
  /**
   * Remnant band starts at 212, above the Legendary's painted wave cape
   * (hue 195–210 in every era). The forward warp drove the body's dominant
   * greens onto 214–240, so un-inverted body pixels show up here while the
   * cape's own blue is not miscounted as a failed warp.
   */
  const REMNANT_BAND: [number, number] = [212, 255];
  for (const rarity of RARITIES) {
    const { data, info } = await sharp(path.join(publicDir, `rarity-${rarity}.png`))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let fg = 0;
    let body = 0;
    let blue = 0;
    for (let i = 0; i < info.width * info.height; i += 1) {
      const o = i * 4;
      const [h, s, l] = rgbToHsl(data[o]!, data[o + 1]!, data[o + 2]!);
      if (l < BG_MAX_L) continue; // near-black background, never recolored
      fg += 1;
      if (h >= BODY_WINDOW[0] && h <= BODY_WINDOW[1] && s >= 0.2) body += 1;
      if (h >= REMNANT_BAND[0] && h <= REMNANT_BAND[1] && s >= 0.2) blue += 1;
    }
    const bodyPct = (body / fg) * 100;
    const bluePct = (blue / fg) * 100;
    console.log(
      `rarity-${rarity}: body-window ${bodyPct.toFixed(1)}% of foreground, ` +
        `blue remnant ${bluePct.toFixed(2)}% (band ${REMNANT_BAND[0]}-${REMNANT_BAND[1]})`,
    );
    if (bodyPct < 30) {
      throw new Error(
        `rarity-${rarity}: only ${bodyPct.toFixed(1)}% of foreground sits in the compositor body window ${BODY_WINDOW} — the warp band no longer matches BODY_HUE in loopiternCompose.ts`,
      );
    }
    if (bluePct > 1) {
      throw new Error(
        `rarity-${rarity}: ${bluePct.toFixed(2)}% of foreground is still blue-family — rerun or widen the warp band`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
