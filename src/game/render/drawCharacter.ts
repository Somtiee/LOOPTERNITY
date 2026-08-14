import type { CharacterDef } from "../characters";

export type DrawCharacterOpts = {
  look: CharacterDef;
  facing: 1 | -1;
  /** Walk cycle phase */
  bob: number;
  /** -1..1 lean from velocity */
  vxNorm: number;
  boosting: boolean;
  /** Theme accent for boost flare */
  accent: string;
};

/**
 * Local-space human (origin = hitbox center). Same footprint for every look.
 */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  opts: DrawCharacterOpts,
) {
  const { look, facing, bob, vxNorm, boosting, accent } = opts;
  const stride = Math.sin(bob * 1.4) * (look.build === "lean" ? 6 : 5);
  const lean = vxNorm * 4;
  const stocky = look.build === "stocky";
  const compact = look.build === "compact";
  const bodyW = stocky ? 22 : compact ? 18 : 16;
  const bodyH = stocky ? 26 : compact ? 26 : 30;
  const bodyY = stocky ? -40 : compact ? -40 : -44;
  const headR = stocky ? 9.2 : compact ? 8.2 : 7.6;
  const headY = stocky ? -46 : compact ? -48 : -52;
  const legY = bodyY + bodyH - 2;
  const armY = bodyY + 10;

  ctx.save();
  ctx.translate(lean, Math.sin(bob) * 2);
  ctx.scale(facing, 1);

  if (boosting) {
    ctx.fillStyle = `${accent}55`;
    ctx.beginPath();
    ctx.moveTo(-8, 4);
    ctx.lineTo(0, 22);
    ctx.lineTo(8, 4);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(0, 2, stocky ? 14 : 12, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = look.skinShadow;
  ctx.lineWidth = stocky ? 5 : 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-5, legY);
  ctx.lineTo(-6, -stride * 0.15);
  ctx.moveTo(5, legY);
  ctx.lineTo(6, stride * 0.15);
  ctx.stroke();

  ctx.fillStyle = look.outfit;
  ctx.beginPath();
  ctx.roundRect(-bodyW / 2, bodyY, bodyW, bodyH, stocky ? 8 : 6);
  ctx.fill();

  ctx.fillStyle = look.trim;
  if (compact) {
    ctx.fillRect(-2, bodyY + 6, 4, 12);
  } else if (look.build === "lean") {
    ctx.fillRect(-bodyW / 2, bodyY + 4, bodyW, 3);
    ctx.fillRect(-1.5, bodyY + 8, 3, 14);
  } else {
    ctx.fillRect(-bodyW / 2 + 3, bodyY + 8, bodyW - 6, 5);
  }

  ctx.strokeStyle = look.skin;
  ctx.lineWidth = stocky ? 4.2 : 3.5;
  ctx.beginPath();
  ctx.moveTo(-bodyW / 2, armY);
  ctx.lineTo(-14, -18 + stride * 0.35);
  ctx.moveTo(bodyW / 2, armY);
  ctx.lineTo(13, -16 - stride * 0.35);
  ctx.stroke();

  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.arc(0, headY, headR, 0, Math.PI * 2);
  ctx.fill();

  if (compact) {
    ctx.fillStyle = look.hair;
    ctx.beginPath();
    ctx.moveTo(-headR + 1, headY - 2);
    ctx.lineTo(-2, headY - headR - 5);
    ctx.lineTo(headR - 1, headY - 3);
    ctx.closePath();
    ctx.fill();
  } else if (look.build === "lean") {
    ctx.fillStyle = look.hair;
    ctx.beginPath();
    ctx.rect(-headR, headY - 4, headR * 2, 5);
    ctx.fill();
    ctx.fillStyle = look.trim;
    ctx.fillRect(-headR + 1, headY - 2, headR * 2 - 2, 2);
    ctx.fillStyle = look.hair;
    ctx.beginPath();
    ctx.moveTo(-2, headY - 4);
    ctx.lineTo(0, headY - headR - 8);
    ctx.lineTo(3, headY - 4);
    ctx.fill();
  } else {
    ctx.fillStyle = look.outfit;
    ctx.beginPath();
    ctx.ellipse(0, headY - 2, headR + 3.5, headR + 2, 0, Math.PI, 0, true);
    ctx.fill();
    ctx.fillStyle = look.hair;
    ctx.beginPath();
    ctx.arc(-3, headY - 5, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = look.eye;
  ctx.beginPath();
  ctx.arc(2.4, headY - 1, 1.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
