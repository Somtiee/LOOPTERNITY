/**
 * Climb-pose preview of every runner, rendered with the REAL in-game rigs
 * (`drawCharacter` + `drawLoopitern`) via @napi-rs/canvas — not a
 * re-implementation, so what you see is what the game draws.
 *
 * Rows: ASH, NOVA, NORD, then LOOPITERN Common → Legendary.
 * Columns: Idle / Climb / Boost, plus a fourth pose — mirrored climb for
 * the humans, a real DNA palette (schema v3 tints + shading) for the
 * LOOPITERNS.
 *
 * Output: public/loopiterns/climb-preview.jpg
 * Run: npx tsx scripts/climb-preview.ts
 */
import { GlobalFonts, createCanvas } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drawCharacter } from "../src/game/render/drawCharacter";
import { drawLoopitern } from "../src/game/render/drawLoopitern";
import { dnaFromTokenId } from "../src/game/loopiternTraits";
import { loopiternRigPalette, LOOPITERN_ACCENT } from "../src/game/loopiternArt";
import { RARITIES, type LoopiternRarityId } from "../src/game/mintTiers";
import { CHARACTER_IDS, getCharacter } from "../src/game/characters";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "public", "loopiterns");

const SCALE = 5; // rig units → preview px
const CELL_W = 260;
const CELL_H = 560;
const HEADER_H = 64;
const SPRITE_CY = 430; // rig y=0 (feet baseline) sits here in the cell

// Windows font for labels; the preview still works without it.
let fontOK = false;
for (const f of [
  "C:/Windows/Fonts/seguisb.ttf",
  "C:/Windows/Fonts/arialbd.ttf",
  "C:/Windows/Fonts/arial.ttf",
]) {
  try {
    fontOK = GlobalFonts.RegisterFromPath(f, "PreviewFont");
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

type Pose = {
  label: string;
  facing: 1 | -1;
  bob: number;
  vxNorm: number;
  boosting: boolean;
};

// cycle = bob * 1.4 = π/2 → stride 0, feet planted: a clean idle stance.
const IDLE_BOB = Math.PI / 2.8;

function posesFor(kind: "human" | "loopitern"): Pose[] {
  return [
    { label: "Idle", facing: 1, bob: IDLE_BOB, vxNorm: 0, boosting: false },
    { label: "Climb", facing: 1, bob: 2.0, vxNorm: 0.55, boosting: false },
    { label: "Boost", facing: 1, bob: 3.6, vxNorm: 1, boosting: true },
    kind === "human"
      ? { label: "Climb (flip)", facing: -1, bob: 2.6, vxNorm: -0.55, boosting: false }
      : { label: "Climb + DNA", facing: 1, bob: 2.6, vxNorm: 0.55, boosting: false },
  ];
}

async function main() {
  const humanRows = CHARACTER_IDS.map((id) => ({
    kind: "human" as const,
    label: getCharacter(id).name.toUpperCase(),
    id,
  }));
  const loopRows = RARITIES.map((r) => {
    const dnaToken = findStyled(r.id);
    return {
      kind: "loopitern" as const,
      label: `LOOPITERN — ${r.name}`,
      rarity: r.id,
      dnaToken,
      dna: dnaFromTokenId(dnaToken, r.id),
    };
  });
  const rows = [...humanRows, ...loopRows];

  const canvas = createCanvas(CELL_W * 4, HEADER_H + CELL_H * rows.length);
  const ctx = canvas.getContext("2d");

  // Backdrop + grid
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(191,224,255,0.14)";
  ctx.lineWidth = 2;
  for (let r = 0; r <= rows.length; r += 1) {
    const y = HEADER_H + r * CELL_H;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  for (let c = 1; c < 4; c += 1) {
    ctx.beginPath();
    ctx.moveTo(c * CELL_W, 0);
    ctx.lineTo(c * CELL_W, canvas.height);
    ctx.stroke();
  }

  // Header — pose column labels
  if (fontOK) {
    ctx.fillStyle = "#c8e4ff";
    ctx.font = "600 22px PreviewFont";
    ctx.textAlign = "center";
    ["Idle", "Climb", "Boost", "Flip / DNA"].forEach((label, c) => {
      ctx.fillText(label, c * CELL_W + CELL_W / 2, 40);
    });
  }

  rows.forEach((row, r) => {
    const y0 = HEADER_H + r * CELL_H;

    if (fontOK) {
      ctx.fillStyle = "#c8e4ff";
      ctx.font = "600 22px PreviewFont";
      ctx.textAlign = "left";
      ctx.fillText(row.label, 14, y0 + 36);
      if (row.kind === "loopitern") {
        ctx.fillStyle = "rgba(244,234,212,0.75)";
        ctx.font = "15px PreviewFont";
        ctx.fillText(
          `DNA #${row.dnaToken} — shading ${row.dna.shadingStyle} / ${row.dna.shadingWeight}`,
          14,
          y0 + 60,
        );
      }
    }

    posesFor(row.kind).forEach((pose, c) => {
      ctx.save();
      ctx.translate(c * CELL_W + CELL_W / 2, y0 + SPRITE_CY);
      ctx.scale(SCALE, SCALE);
      if (row.kind === "human") {
        drawCharacter(ctx, {
          look: getCharacter(row.id),
          facing: pose.facing,
          bob: pose.bob,
          vxNorm: pose.vxNorm,
          boosting: pose.boosting,
          accent: LOOPITERN_ACCENT,
        });
      } else {
        drawLoopitern(ctx, {
          rarity: row.rarity,
          facing: pose.facing,
          bob: pose.bob,
          vxNorm: pose.vxNorm,
          boosting: pose.boosting,
          palette:
            pose.label === "Climb + DNA"
              ? loopiternRigPalette(row.dna)
              : undefined,
        });
      }
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
