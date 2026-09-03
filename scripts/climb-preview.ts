/**
 * Climb-pose preview of every rarity, rendered with the REAL in-game rig
 * (`drawLoopitern`) via @napi-rs/canvas — not a re-implementation, so what
 * you see is what the game draws. Two sprites per rarity:
 *
 *   col 1 — default look (no DNA equipped, pre-J4 palette)
 *   col 2 — a real DNA (schema v3): accent/belly/eye tints + torso mark +
 *           ink tattoo, exactly what a minted token renders with
 *
 * Output: public/loopiterns/climb-preview.jpg
 * Run: npx tsx scripts/climb-preview.ts
 */
import { GlobalFonts, createCanvas } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drawLoopitern } from "../src/game/render/drawLoopitern";
import { dnaFromTokenId } from "../src/game/loopiternTraits";
import { loopiternRigPalette } from "../src/game/loopiternArt";
import { RARITIES, type LoopiternRarityId } from "../src/game/mintTiers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "public", "loopiterns");

const SCALE = 6; // rig units → preview px
const CELL_W = 340;
const CELL_H = 560;
const SPRITE_CY = 430; // rig y=0 (feet baseline) sits here in the cell

// Windows font for labels; the preview still works without it.
let fontOK = false;
for (const f of [
  "C:/Windows/Fonts/seguisb.ttf",
  "C:/Windows/Fonts/arialbd.ttf",
  "C:/Windows/Fonts/arial.ttf",
]) {
  try {
    fontOK = GlobalFonts.registerFromPath(f, "PreviewFont");
    if (fontOK) break;
  } catch {
    // try the next candidate
  }
}

/** First token of a rarity whose DNA uses a given shading style, else any. */
function findStyled(rarity: LoopiternRarityId): number {
  for (let id = 1; id <= 80; id += 1) {
    const dna = dnaFromTokenId(id, rarity);
    if (dna.shadingStyle !== "hatchDiag") return id;
  }
  return 1;
}

async function main() {
  const rows = RARITIES.length;
  const canvas = createCanvas(CELL_W * 2, CELL_H * rows);
  const ctx = canvas.getContext("2d");

  // Backdrop
  ctx.fillStyle = "#0b1f12";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(200,255,154,0.14)";
  ctx.lineWidth = 2;
  for (let r = 1; r < rows; r += 1) {
    ctx.beginPath();
    ctx.moveTo(0, r * CELL_H);
    ctx.lineTo(canvas.width, r * CELL_H);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(CELL_W, 0);
  ctx.lineTo(CELL_W, canvas.height);
  ctx.stroke();

  RARITIES.forEach((r, row) => {
    const dna = dnaFromTokenId(findStyled(r.id), r.id);
    const cols: Array<{ label: string; palette?: ReturnType<typeof loopiternRigPalette> }> = [
      { label: `${r.name} — default` },
      {
        label: `${r.name} — DNA #${dna.tokenId}`,
        palette: loopiternRigPalette(dna),
      },
    ];

    cols.forEach((col, c) => {
      const x0 = c * CELL_W;
      const y0 = row * CELL_H;

      // Label
      if (fontOK) {
        ctx.fillStyle = "#c8ff9a";
        ctx.font = "600 24px PreviewFont";
        ctx.textAlign = "center";
        ctx.fillText(col.label, x0 + CELL_W / 2, y0 + 46);
        if (col.palette) {
          ctx.fillStyle = "rgba(244,234,212,0.75)";
          ctx.font = "16px PreviewFont";
          const parts = [
            `shading: ${dna.shadingStyle}`,
            `${dna.shadingWeight} / ${dna.shadingTone}`,
            `accent: ${dna.accentTint}`,
          ];
          parts.forEach((p, i) => {
            ctx.fillText(p, x0 + CELL_W / 2, y0 + 78 + i * 22);
          });
        }
      }

      // The real rig, mid-climb: leaning into the wall, mid-stride.
      ctx.save();
      ctx.translate(x0 + CELL_W / 2, y0 + SPRITE_CY);
      ctx.scale(SCALE, SCALE);
      drawLoopitern(ctx, {
        rarity: r.id,
        facing: 1,
        bob: 2.0,
        vxNorm: 0.55,
        boosting: false,
        palette: col.palette,
      });
      ctx.restore();
    });
  });

  mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, "climb-preview.jpg");
  writeFileSync(out, await canvas.encode("jpeg", 90));
  console.log(`wrote ${out} (${canvas.width}x${canvas.height})`);
  RARITIES.forEach((r) => {
    const id = findStyled(r.id);
    const d = dnaFromTokenId(id, r.id);
    console.log(
      `  ${r.name.padEnd(10)} DNA #${id}: shading=${d.shadingStyle}/${d.shadingWeight}/${d.shadingTone} accent=${d.accentTint}`,
    );
  });
}

main();
