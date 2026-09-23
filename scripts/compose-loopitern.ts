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
 *   npx tsx scripts/compose-loopitern.ts --grid      # 10×10 marketing sheet
 *
 * Output: public/loopiterns/generated/{rarity}/{tokenId}.png
 *         public/loopiterns/marketing-grid.png   (--grid)
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
import { RARITIES } from "../src/game/mintTiers";
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
    grid: 0,
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
    else if (a === "--grid") {
      // Square cols×cols sheet of real tokens. Bare --grid = the 10×10
      // marketing sheet. Columns must be a multiple of the rarity count so
      // every rarity gets an equal number of rows.
      const n = next && /^\d+$/.test(next) ? Number(next) : 10;
      if (n < 5 || n > 40 || n % 5 !== 0) {
        throw new Error(`--grid columns must be 5,10,…,40 — got ${n}`);
      }
      out.grid = n;
      if (next && /^\d+$/.test(next)) i += 1;
    } else if (a === "--tokenId" && next) {
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
 * color differences. Chosen over the DNA roll so every row pairs five
 * hue-separated accents with five pairwise-distinct shading treatments, so no
 * column pair can read as a copy. The ids were re-curated when the accent
 * ladder was densified; measured against the current catalog their worst-case
 * pairwise accent gap inside a row is 19.4° (r2: #1 teal vs #3 kelly), with no
 * two columns sharing an accent in any row. Re-check both properties with
 * `--sample` if the accent catalog ever changes.
 */
async function writePreviewGrid(): Promise<string> {
  const ids = [1, 3, 28, 31, 133];
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

/**
 * Marketing sheet: `--grid [cols]` → a cols×cols PNG of REAL minted looks.
 *
 * Rows cycle rarity 0→4 and then repeat, so every rarity gets an equal share of
 * the sheet. A rarity's later pass draws its columns from a different slice of
 * the id space, so no two rows are ever the same ten tokens. Every tile is a
 * real (tokenId, rarity) pair through the same compositor the still route
 * serves — this is the collection as it will render, not an artist's mock.
 *
 * Unlike the curated preview grid this samples the id space evenly, so it can
 * only be as representative as the DNA roll; use it to show breadth, and
 * `--sample` to prove uniqueness.
 */
async function writeMarketingGrid(cols: number): Promise<string> {
  if (cols % RARITIES.length !== 0) {
    throw new Error(
      `--grid columns must be a multiple of ${RARITIES.length} so each rarity gets equal rows, got ${cols}`,
    );
  }
  const total = RARITIES.reduce((n, r) => n + r.supply, 0);
  const rows = cols;
  const passes = rows / RARITIES.length;
  const slice = total / passes;
  const tile = 256;

  /** `cols` ids spread evenly across the pass's slice of 1..total. */
  const idsFor = (pass: number) => {
    const lo = Math.round(pass * slice) + 1;
    const hi = Math.round((pass + 1) * slice);
    return Array.from({ length: cols }, (_, k) =>
      Math.round(lo + (k / (cols - 1)) * (hi - lo)),
    );
  };

  const tiles: { input: Buffer; left: number; top: number }[] = [];
  const count = rows * cols;
  for (let row = 0; row < rows; row += 1) {
    const rarity = RARITIES[row % RARITIES.length]!.id;
    const ids = idsFor(Math.floor(row / RARITIES.length));
    for (let col = 0; col < cols; col += 1) {
      const { png } = await composeLoopiternStill(ids[col]!, rarity);
      const thumb = await sharp(png)
        .resize(tile, tile, { fit: "cover" })
        .png()
        .toBuffer();
      tiles.push({ input: thumb, left: col * tile, top: row * tile });
      if ((row * cols + col + 1) % 10 === 0) {
        console.log(`  ${row * cols + col + 1}/${count} tiles…`);
      }
    }
  }

  const dest = path.join(PUBLIC, "loopiterns", "marketing-grid.png");
  await mkdir(path.dirname(dest), { recursive: true });
  await sharp({
    create: {
      width: tile * cols,
      height: tile * rows,
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
    args.grid > 0 ||
    args.tokenId != null ||
    args.ids.length > 0;

  if (!work) {
    console.log(
      "compose-loopitern: pass --chips (recolor sheet), --shading (shading sheet), --grid [cols] (marketing sheet), --tokenId/--rarity, --ids, or --sample",
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

  if (args.grid > 0) {
    const sheet = await writeMarketingGrid(args.grid);
    console.log(
      `marketing grid: ${path.relative(ROOT, sheet)} (${args.grid}×${args.grid})`,
    );
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
