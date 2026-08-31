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

  ctx.fillStyle = palette.belly;
  ctx.beginPath();
  ctx.ellipse(1.5, -18, 7.2, 9.5, 0.08, 0, Math.PI * 2);
  ctx.fill();

  // DNA mark — always visible when a DNA palette is equipped
  if (palette.mark) drawDnaMark(ctx, palette.mark, palette.markFill);

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

  ctx.restore();
}

/**
 * DNA marks, drawn on the belly (belly tint background) in the solid accent
 * color with an ink keyline. Centered on the belly ellipse (1.5, -18).
 */
function drawDnaMark(
  ctx: CanvasRenderingContext2D,
  mark: string,
  fill: string,
) {
  ctx.save();
  ctx.translate(1.5, -18);
  ctx.fillStyle = fill;
  ctx.strokeStyle = LOOPITERN_INK;
  ctx.lineWidth = 0.9;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (mark) {
    case "stripe":
      ctx.beginPath();
      ctx.roundRect(-4.6, -6.5, 2.6, 13, 1.2);
      ctx.roundRect(2.0, -6.5, 2.6, 13, 1.2);
      ctx.fill();
      ctx.stroke();
      break;
    case "spots":
      ctx.beginPath();
      ctx.arc(-2.8, -3.2, 2.0, 0, Math.PI * 2);
      ctx.arc(2.6, -4.4, 1.6, 0, Math.PI * 2);
      ctx.arc(-0.4, 3.0, 1.7, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "vine":
      ctx.beginPath();
      ctx.moveTo(-3.4, 6);
      ctx.quadraticCurveTo(4.4, 0, -2.2, -6.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(2.2, 1.2, 2.0, 1.1, -0.7, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "rune":
      ctx.beginPath();
      ctx.moveTo(-3.4, -6);
      ctx.lineTo(2.6, -6);
      ctx.lineTo(-1.6, 0);
      ctx.lineTo(3.4, 0);
      ctx.lineTo(-2.6, 6);
      ctx.stroke();
      break;
    case "sigil":
      ctx.beginPath();
      ctx.arc(0, 0, 4.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 1.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "band":
      ctx.beginPath();
      ctx.roundRect(-5.6, -1.8, 11.2, 3.6, 1.8);
      ctx.fill();
      ctx.stroke();
      break;
    case "star":
      ctx.beginPath();
      ctx.moveTo(0, -6.2);
      ctx.lineTo(1.5, -1.5);
      ctx.lineTo(6.2, 0);
      ctx.lineTo(1.5, 1.5);
      ctx.lineTo(0, 6.2);
      ctx.lineTo(-1.5, 1.5);
      ctx.lineTo(-6.2, 0);
      ctx.lineTo(-1.5, -1.5);
      ctx.closePath();
      ctx.fill();
      break;
    case "moon":
      ctx.beginPath();
      ctx.arc(0, 0, 6.0, Math.PI * 0.38, Math.PI * 1.62, false);
      ctx.arc(2.6, 0, 4.6, Math.PI * 1.5, Math.PI * 0.5, true);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    case "bolt":
      ctx.beginPath();
      ctx.moveTo(-2.0, -6.6);
      ctx.lineTo(4.4, -6.6);
      ctx.lineTo(0.4, -1.2);
      ctx.lineTo(3.4, -1.2);
      ctx.lineTo(-2.8, 6.6);
      ctx.lineTo(-0.4, 0.6);
      ctx.lineTo(-3.6, 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    case "circuit":
      ctx.beginPath();
      ctx.moveTo(-5, -4.6);
      ctx.lineTo(-0.8, -4.6);
      ctx.lineTo(-0.8, 0);
      ctx.lineTo(3.6, 0);
      ctx.lineTo(3.6, 4.6);
      ctx.lineTo(-5, 4.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(3.6, -4.6, 1.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "crown":
      ctx.beginPath();
      ctx.moveTo(-4.6, 4.4);
      ctx.lineTo(-4.6, -2.6);
      ctx.lineTo(-2.2, 0.4);
      ctx.lineTo(0, -4.8);
      ctx.lineTo(2.2, 0.4);
      ctx.lineTo(4.6, -2.6);
      ctx.lineTo(4.6, 4.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    case "chevron":
    default:
      ctx.beginPath();
      ctx.moveTo(-4.6, -4.2);
      ctx.lineTo(0, -0.6);
      ctx.lineTo(4.6, -4.2);
      ctx.lineTo(4.6, -0.4);
      ctx.lineTo(0, 3.2);
      ctx.lineTo(-4.6, -0.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
  }
  ctx.restore();
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
