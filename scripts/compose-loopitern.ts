/**
 * LOOPITERN marketplace compositor CLI (Prompt J4, schema v4).
 *
 * Thin CLI over the shared compositor module `src/game/loopiternCompose.ts`
 * (Prompt K) — the same module powers the on-demand still route, so there is
 * exactly one implementation of the recolor + sketchbook-shading pipeline.
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
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  composeLoopiternStill,
  publicDir,
  recolorBase,
} from "../src/game/loopiternCompose";
import {
  LOOPITERN_PREVIEW_GRID_FS_PATH,
} from "../src/game/loopiternStills";
import type { LoopiternRarityId } from "../src/game/mintTiers";
import { isLoopiternRarityId } from "../src/game/mintTiers";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = publicDir();

type Pair = { tokenId: number; rarity: LoopiternRarityId };

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

function parseArgs(argv: string[]) {
  const out = {
    chips: false,
    shading: false,
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
    else if (a === "--shading") out.shading = true;
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

/**
 * `--shading` — reference sheet of every shading style × weight, graphite
 * tone on the rarity-2 base, so the sketch treatments can be judged at a
 * glance.
 */
async function writeShadingSheet(): Promise<string> {
  const styles = [
    "hatchH", "hatchV", "hatchDiag", "cross", "stipple", "scribble",
    "contour", "zigzag", "wave", "dash", "brick", "cel", "long", "weave",
    "spiral", "fine",
  ];
  const weights = ["light", "medium", "bold"];
  const tile = 256;
  const tiles: { input: Buffer; left: number; top: number }[] = [];
  for (let row = 0; row < styles.length; row += 1) {
    for (let col = 0; col < weights.length; col += 1) {
      const { png, shadingPng } = await recolorBase(2, {
        accent: "#1edc72",
        belly: "#a8fff0",
        eye: "#e8c84a",
      }, {
        style: styles[row]!,
        weight: weights[col]!,
        toneRgb: [46, 54, 48],
      });
      const composed = shadingPng
        ? await sharp(png)
            .composite([{ input: shadingPng, blend: "over" as const }])
            .toBuffer()
        : png;
      const thumb = await sharp(composed)
        .resize(tile, tile, { fit: "cover" })
        .png()
        .toBuffer();
      tiles.push({ input: thumb, left: col * tile, top: row * tile });
    }
  }
  const dest = path.join(PUBLIC, "loopiterns", "shading-sheet.png");
  await mkdir(path.dirname(dest), { recursive: true });
  await sharp({
    create: {
      width: tile * weights.length,
      height: tile * styles.length,
      channels: 4,
      background: { r: 5, g: 20, b: 10, alpha: 1 },
    },
  })
    .composite(tiles)
    .png()
    .toFile(dest);
  return dest;
}

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
    args.shading ||
    args.sample ||
    args.tokenId != null ||
    args.ids.length > 0;

  if (!work) {
    console.log(
      "compose-loopitern: pass --chips (recolor sheet), --shading (shading sheet), --tokenId/--rarity, --ids, or --sample",
    );
    process.exit(1);
  }

  if (args.shading && !args.sample) {
    const sheet = await writeShadingSheet();
    console.log(`shading sheet: ${path.relative(ROOT, sheet)}`);
    return;
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
        `${path.relative(ROOT, outAbs)}  accent=${dna.accentTint} belly=${dna.bellyTint} eye=${dna.eyeTint} shading=${dna.shadingStyle}/${dna.shadingWeight}/${dna.shadingTone} cape=${dna.capeTint ?? "none"}`,
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
