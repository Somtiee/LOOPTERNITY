import type { LoopiternRarityId } from "../mintTiers";
import {
  LOOPITERN_CREAM,
  LOOPITERN_GREEN,
  LOOPITERN_INK,
  loopiternRarityPalette,
  type LoopiternRigPalette,
} from "../loopiternArt";

export type DrawLoopiternOpts = {
  rarity: LoopiternRarityId;
  facing: 1 | -1;
  bob: number;
  vxNorm: number;
  boosting: boolean;
  /**
   * DNA-derived palette (J4). Omit to keep the rarity's default look.
   * Same palette family as the marketplace stills — UI and rig share
   * `loopiternRigPalette`.
   */
  palette?: LoopiternRigPalette;
};

/**
 * LOOPITERN collection runner. Origin = hitbox center, same footprint as
 * ASH/NOVA/NORD. Chunky mascot — not a stick figure. Rarity silhouettes
 * (leaf nubs / visor / ice horns / crest / halo / cape) always stay; DNA
 * only changes colors and the torso mark.
 */
export function drawLoopitern(
  ctx: CanvasRenderingContext2D,
  opts: DrawLoopiternOpts,
) {
  const { rarity, facing, bob, vxNorm, boosting } = opts;
  const palette = opts.palette ?? loopiternRarityPalette(rarity);
  const stride = Math.sin(bob * 1.4) * 4;
  const lean = vxNorm * 3.5;
  const bounce = Math.sin(bob) * 1.8;

  ctx.save();
  ctx.translate(lean, bounce);
  ctx.scale(facing, 1);

  if (boosting) {
    ctx.fillStyle = `${LOOPITERN_GREEN}66`;
    ctx.beginPath();
    ctx.moveTo(-9, 6);
    ctx.lineTo(0, 24);
    ctx.lineTo(9, 6);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(0, 3, 13, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs — padded, not strokes
  ctx.fillStyle = palette.fill;
  roundedCapsule(ctx, -7.5, -8, 6.5, 12 + stride * 0.12);
  roundedCapsule(ctx, 1.2, -8, 6.5, 12 - stride * 0.12);
  ctx.fillStyle = LOOPITERN_INK;
  ctx.beginPath();
  ctx.ellipse(-4.2, 3.2, 3.4, 1.6, 0, 0, Math.PI * 2);
  ctx.ellipse(4.4, 3.2, 3.4, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = LOOPITERN_CREAM;
  ctx.beginPath();
  ctx.ellipse(-4.2, 3.0, 2.2, 0.7, 0, 0, Math.PI * 2);
  ctx.ellipse(4.4, 3.0, 2.2, 0.7, 0, 0, Math.PI * 2);
  ctx.fill();

  if (rarity === 4) drawWaveCape(ctx, bob, palette.cape ?? LOOPITERN_GREEN);
  if (rarity === 3) drawArmorPlates(ctx, palette.trim);

  // Torso
  ctx.fillStyle = palette.fill;
  ctx.beginPath();
  ctx.ellipse(0, -22, rarity >= 3 ? 13.5 : 12.2, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  // Belly
  ctx.fillStyle = palette.belly;
  ctx.beginPath();
  ctx.ellipse(1.5, -18, 7.2, 9.5, 0.08, 0, Math.PI * 2);
  ctx.fill();

  // DNA sketchbook shading — light pencil strokes inside the shadow side
  // of the body, under the arms/head (J4 schema v4).
  if (palette.shading) {
    drawSketchShading(ctx, palette.shading);
  }

  // Arms
  ctx.fillStyle = palette.fill;
  roundedCapsule(ctx, -14, -28, 5.2, 11 + stride * 0.2);
  roundedCapsule(ctx, 8.5, -26, 5.2, 10 - stride * 0.2);

  // Head
  const headY = -42;
  const headR = rarity === 0 ? 10.2 : 10.6;
  ctx.fillStyle = palette.fill;
  ctx.beginPath();
  ctx.arc(0, headY, headR, 0, Math.PI * 2);
  ctx.fill();

  if (rarity === 0) drawLeafNubs(ctx, headY, headR, palette.trim);
  if (rarity === 1) drawVisor(ctx, headY);
  if (rarity === 2) drawIceHorns(ctx, headY, headR);
  if (rarity === 3) drawCrest(ctx, headY, headR, palette.trim);
  if (rarity === 4) drawHalo(ctx, headY, headR);

  // Snout
  ctx.fillStyle = palette.belly;
  ctx.beginPath();
  ctx.ellipse(3.2, headY + 3.2, 4.4, 3.2, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Eye — sclera takes the DNA eye tint
  ctx.fillStyle = palette.eye;
  ctx.beginPath();
  ctx.ellipse(3.6, headY - 1.2, 3.4, 3.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = LOOPITERN_INK;
  ctx.beginPath();
  ctx.arc(4.4, headY - 1.0, 1.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(5.1, headY - 1.8, 0.55, 0, Math.PI * 2);
  ctx.fill();

  // One light stroke under the chin — the head's share of the shading.
  if (palette.shading) {
    ctx.save();
    ctx.globalAlpha = SHADING_WEIGHT_ALPHA[palette.shading.weight] ?? 0.24;
    ctx.strokeStyle = palette.shading.toneHex;
    ctx.lineWidth = 0.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-1.5, headY + headR - 1.5);
    ctx.lineTo(4.5, headY + headR - 0.5);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

/** Stroke opacity per shading weight. */
const SHADING_WEIGHT_ALPHA: Record<string, number> = {
  light: 0.16,
  medium: 0.24,
  bold: 0.34,
};

/**
 * DNA sketchbook shading on the rig (schema v4). A few light strokes
 * clipped to the shadow side of the torso — a miniature of the stills'
 * pencil hatching, matched to the same style/weight/tone DNA. Drawn
 * between belly and arms so it reads as shading, not a decal.
 */
function drawSketchShading(
  ctx: CanvasRenderingContext2D,
  shading: NonNullable<LoopiternRigPalette["shading"]>,
) {
  const alpha = SHADING_WEIGHT_ALPHA[shading.weight] ?? 0.24;
  ctx.save();
  // Clip to the lower-right (shadow side) of the torso so strokes never
  // spill onto the belly patch or outside the body.
  ctx.beginPath();
  ctx.ellipse(1.5, -22, 12.2, 15.5, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.beginPath();
  ctx.rect(-2, -22, 16, 24);
  ctx.clip();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = shading.toneHex;
  ctx.fillStyle = shading.toneHex;
  ctx.lineWidth = shading.weight === "bold" ? 0.9 : 0.7;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (shading.style) {
    case "hatchH":
      strokeLines(ctx, 5, (i) => [-11 + i * 0.6, -12 + i * 4.5, 10, -8 + i * 4.5]);
      break;
    case "hatchV":
      strokeLines(ctx, 5, (i) => [-6 + i * 3.6, -34, -6 + i * 3.6, -6]);
      break;
    case "cross":
      strokeLines(ctx, 4, (i) => [-9 + i * 3.5, -32, -3 + i * 3.5, -8]);
      strokeLines(ctx, 3, (i) => [8 - i * 3.5, -32, 2 - i * 3.5, -8]);
      break;
    case "stipple": {
      const dots = [
        [-6, -28], [-3, -25], [-7, -21], [-1, -29], [1, -24], [-4, -17],
        [2, -19], [4, -27], [-8, -13], [0, -12], [5, -22], [3, -14],
        [6, -16], [-2, -9], [5, -10], [7, -12],
      ];
      ctx.beginPath();
      for (const [x, y] of dots) {
        ctx.moveTo(x, y);
        ctx.arc(x, y, 0.5, 0, Math.PI * 2);
      }
      ctx.fill();
      break;
    }
    case "scribble":
      ctx.beginPath();
      ctx.moveTo(-9, -30);
      ctx.bezierCurveTo(-2, -34, 4, -26, -3, -22);
      ctx.bezierCurveTo(2, -20, 7, -25, 2, -18);
      ctx.bezierCurveTo(-4, -12, 6, -14, 4, -9);
      ctx.stroke();
      break;
    case "contour":
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.arc(-13 + i * 1.2, -20 + i * 0.5, 12 + i * 2.6, -0.9, 0.7);
        ctx.stroke();
      }
      break;
    case "zigzag":
      ctx.beginPath();
      ctx.moveTo(-9, -30);
      for (let i = 0; i < 6; i += 1) {
        ctx.lineTo(-9 + (i + 1) * 2.8, i % 2 === 0 ? -25 : -31);
      }
      ctx.moveTo(-9, -20);
      for (let i = 0; i < 6; i += 1) {
        ctx.lineTo(-9 + (i + 1) * 2.8, i % 2 === 0 ? -15 : -21);
      }
      ctx.stroke();
      break;
    case "wave":
      ctx.beginPath();
      ctx.moveTo(-10, -26);
      ctx.quadraticCurveTo(-5, -30, 0, -26);
      ctx.quadraticCurveTo(5, -22, 10, -26);
      ctx.moveTo(-10, -17);
      ctx.quadraticCurveTo(-5, -21, 0, -17);
      ctx.quadraticCurveTo(5, -13, 10, -17);
      ctx.stroke();
      break;
    case "dash":
      ctx.setLineDash([2.4, 2]);
      strokeLines(ctx, 4, (i) => [-10, -28 + i * 5.5, 9, -25 + i * 5.5]);
      break;
    case "brick":
      ctx.setLineDash([3, 2.4]);
      strokeLines(ctx, 3, (i) => [-10, -26 + i * 6.5, 9, -26 + i * 6.5]);
      ctx.setLineDash([1.6, 2.8]);
      strokeLines(ctx, 3, (i) => [-5 + i * 4.5, -32, -5 + i * 4.5, -10]);
      break;
    case "cel":
      // Flat cel shadow — one solid darker crescent, no strokes.
      ctx.globalAlpha = alpha * 1.15;
      ctx.beginPath();
      ctx.moveTo(3, -35);
      ctx.quadraticCurveTo(13, -22, 6, -8);
      ctx.quadraticCurveTo(1, -16, 3, -35);
      ctx.closePath();
      ctx.fill();
      break;
    case "weave":
      strokeLines(ctx, 4, (i) => [-8 + i * 4, -32, -8 + i * 4, -24]);
      strokeLines(ctx, 3, (i) => [-6 + i * 4.5, -21, -6 + i * 4.5, -12]);
      strokeLines(ctx, 2, (i) => [-9, -30 + i * 6.5, 5, -30 + i * 6.5]);
      break;
    case "spiral":
      ctx.beginPath();
      ctx.arc(0, -21, 6.5, 0.4, Math.PI * 1.75);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(1, -20, 3.2, Math.PI * 1.1, Math.PI * 2.9);
      ctx.stroke();
      break;
    case "long":
      strokeLines(ctx, 3, (i) => [-10, -30 + i * 7, 10, -26 + i * 7]);
      break;
    case "fine":
      ctx.lineWidth = 0.45;
      strokeLines(ctx, 6, (i) => [-9 + i * 2.6, -32, -6 + i * 2.6, -8]);
      break;
    case "hatchDiag":
    default:
      strokeLines(ctx, 5, (i) => [-9 + i * 3.5, -32, -3 + i * 3.5, -8]);
      break;
  }
  ctx.restore();
}

/** Run `line` i times and stroke once per call. */
function strokeLines(
  ctx: CanvasRenderingContext2D,
  count: number,
  line: (i: number) => [number, number, number, number],
) {
  for (let i = 0; i < count; i += 1) {
    const [x1, y1, x2, y2] = line(i);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}

function roundedCapsule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const r = Math.min(w, h) / 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function drawLeafNubs(
  ctx: CanvasRenderingContext2D,
  headY: number,
  headR: number,
  trim: string,
) {
  ctx.fillStyle = trim;
  ctx.beginPath();
  ctx.ellipse(-7, headY - headR + 2, 3.2, 5.5, -0.5, 0, Math.PI * 2);
  ctx.ellipse(6.5, headY - headR + 1, 3.0, 5.2, 0.45, 0, Math.PI * 2);
  ctx.fill();
}

function drawVisor(ctx: CanvasRenderingContext2D, headY: number) {
  ctx.fillStyle = LOOPITERN_INK;
  ctx.beginPath();
  ctx.roundRect(-8.5, headY - 4.2, 17, 5.4, 2.2);
  ctx.fill();
  ctx.fillStyle = LOOPITERN_CREAM;
  ctx.beginPath();
  ctx.roundRect(-7.2, headY - 3.2, 14.4, 3.2, 1.4);
  ctx.fill();
  ctx.fillStyle = LOOPITERN_GREEN;
  ctx.fillRect(-6, headY - 2.2, 12, 1.2);
}

function drawIceHorns(
  ctx: CanvasRenderingContext2D,
  headY: number,
  headR: number,
) {
  ctx.fillStyle = "#d8fff8";
  ctx.beginPath();
  ctx.moveTo(-6, headY - headR + 3);
  ctx.lineTo(-9, headY - headR - 9);
  ctx.lineTo(-2.5, headY - headR + 1);
  ctx.closePath();
  ctx.moveTo(5, headY - headR + 2);
  ctx.lineTo(9.5, headY - headR - 10);
  ctx.lineTo(2, headY - headR + 1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(168, 255, 240, 0.7)";
  ctx.beginPath();
  ctx.arc(-8, headY - 6, 2.2, 0, Math.PI * 2);
  ctx.arc(8.5, headY - 5, 1.8, 0, Math.PI * 2);
  ctx.fill();
}

function drawArmorPlates(
  ctx: CanvasRenderingContext2D,
  trim: string,
) {
  ctx.fillStyle = LOOPITERN_CREAM;
  ctx.beginPath();
  ctx.roundRect(-11, -30, 8, 7, 2);
  ctx.roundRect(3, -30, 8, 7, 2);
  ctx.fill();
  ctx.fillStyle = trim;
  ctx.fillRect(-10, -27, 6, 2);
  ctx.fillRect(4, -27, 6, 2);
}

function drawCrest(
  ctx: CanvasRenderingContext2D,
  headY: number,
  headR: number,
  trim: string,
) {
  ctx.fillStyle = LOOPITERN_CREAM;
  ctx.beginPath();
  ctx.moveTo(-4, headY - headR + 2);
  ctx.lineTo(0, headY - headR - 7);
  ctx.lineTo(4, headY - headR + 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = trim;
  ctx.fillRect(-1.2, headY - headR - 5, 2.4, 6);
}

function drawHalo(
  ctx: CanvasRenderingContext2D,
  headY: number,
  headR: number,
) {
  ctx.strokeStyle = "#c8ff9a";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.ellipse(0, headY - headR - 4, 9, 3.2, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#fff6c8";
  ctx.beginPath();
  ctx.arc(-5, headY - headR - 4, 1.4, 0, Math.PI * 2);
  ctx.arc(5, headY - headR - 4, 1.4, 0, Math.PI * 2);
  ctx.arc(0, headY - headR - 7, 1.6, 0, Math.PI * 2);
  ctx.fill();
}

function drawWaveCape(
  ctx: CanvasRenderingContext2D,
  bob: number,
  capeTint: string,
) {
  const w = Math.sin(bob * 0.9) * 2;
  ctx.fillStyle = withAlpha(capeTint, 0.45);
  ctx.beginPath();
  ctx.moveTo(6, -28);
  ctx.quadraticCurveTo(18 + w, -18, 16, -4);
  ctx.quadraticCurveTo(10, -10, 4, -16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = withAlpha(capeTint, 0.7);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(8, -22);
  ctx.quadraticCurveTo(15 + w, -14, 14, -6);
  ctx.stroke();
}

/** #rrggbb + alpha → 8-digit hex (cape tints are always #rrggbb). */
function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}
