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
 * Local-space human (origin = hitbox center). Same footprint for every
 * look. Climb pose: bent pumping limbs, tapered torso, and per-build gear
 * (Ash's ember scarf, Nova's cosmic visor, Nord's fur-trimmed ice hood).
 */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  opts: DrawCharacterOpts,
) {
  const { look, facing, bob, vxNorm, boosting, accent } = opts;
  const stocky = look.build === "stocky";
  const compact = look.build === "compact";
  const bodyW = stocky ? 22 : compact ? 18 : 16;
  const bodyH = stocky ? 26 : compact ? 26 : 30;
  // Torso rides high so the hips sit at ~-18 — legs read long under it.
  const bodyY = stocky ? -42 : compact ? -42 : -46;
  const headR = stocky ? 9.2 : compact ? 8.2 : 7.6;
  const headY = stocky ? -48 : compact ? -50 : -54;
  const legY = bodyY + bodyH - 2;
  const armY = bodyY + 9;

  // Run cycle: legs swing on sin, feet lift on cos while swinging forward,
  // each arm pumps against its same-side leg.
  const cycle = bob * 1.4;
  const swing = Math.sin(cycle);
  const stride = swing * (look.build === "lean" ? 6.5 : 5.5);
  const lift = Math.max(0, Math.cos(cycle));
  const liftBack = Math.max(0, -Math.cos(cycle));
  const lean = vxNorm * 5;

  ctx.save();
  ctx.translate(lean, Math.sin(bob) * 2);
  ctx.scale(facing, 1);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (boosting) {
    // Speed streaks behind, layered flame below.
    ctx.strokeStyle = `${accent}66`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-16, -32);
    ctx.lineTo(-9, -32);
    ctx.moveTo(-17, -18);
    ctx.lineTo(-10, -18);
    ctx.stroke();
    ctx.fillStyle = `${accent}55`;
    ctx.beginPath();
    ctx.moveTo(-8, 2);
    ctx.quadraticCurveTo(-4, 12, 0, 22);
    ctx.quadraticCurveTo(4, 12, 8, 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `${accent}99`;
    ctx.beginPath();
    ctx.moveTo(-4.5, 2);
    ctx.quadraticCurveTo(-2, 8, 0, 14);
    ctx.quadraticCurveTo(2, 8, 4.5, 2);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(0, 2, stocky ? 14 : 12, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Far arm — shadowed skin, pumps against the near leg.
  const shX = bodyW / 2;
  strokeLimb(ctx, look.skinShadow, stocky ? 4.2 : 3.5, [
    [-shX + 1, armY],
    [-shX - 3.4, armY + 6 + swing * 2.6],
    [-shX + 2.5 - swing * 5, armY + 1 - swing * 5],
  ]);

  // Legs — hip → knee → foot. Knees drive forward, feet lift mid-swing.
  const hipW = stocky ? 5.4 : compact ? 4.8 : 4.4;
  const legW = stocky ? 5 : 4;
  const kneeY = (legY - 0.4) / 2 + 0.5;
  const footAy = -0.4 - lift * 2.4;
  const footBy = -0.4 - liftBack * 2.4;
  const footAx = -hipW - 0.8 + stride * 0.65;
  const footBx = hipW + 0.8 - stride * 0.65;
  strokeLimb(ctx, look.skinShadow, legW, [
    [-hipW, legY],
    [-hipW + 2.9 + lift * 1.7, kneeY],
    [footAx, footAy],
  ]);
  strokeLimb(ctx, look.skinShadow, legW, [
    [hipW, legY],
    [hipW + 2.9 + liftBack * 1.7, kneeY],
    [footBx, footBy],
  ]);

  // Boots — forward wedges with a bright sole edge, so the feet read at
  // climb speed.
  ctx.fillStyle = look.outfit;
  ctx.beginPath();
  ctx.roundRect(footAx - 1.6, footAy - 1.4, 5.6, 3.4, 1.5);
  ctx.roundRect(footBx - 1.6, footBy - 1.4, 5.6, 3.4, 1.5);
  ctx.fill();
  ctx.fillStyle = look.trim;
  ctx.fillRect(footAx - 1.6, footAy + 1.2, 5.6, 0.9);
  ctx.fillRect(footBx - 1.6, footBy + 1.2, 5.6, 0.9);

  if (compact) {
    // Ember scarf tail — trails behind, flutters with speed and bob.
    const flut = Math.sin(bob * 2.3) * 1.6 + Math.abs(vxNorm) * 2.2;
    ctx.fillStyle = look.trim;
    ctx.beginPath();
    ctx.moveTo(1.5, bodyY + 3);
    ctx.quadraticCurveTo(-5, bodyY + 5 + flut * 0.5, -10.5 - flut, bodyY + 9 + flut);
    ctx.quadraticCurveTo(-5, bodyY + 13, -0.5, bodyY + 9);
    ctx.closePath();
    ctx.fill();
  }

  // Torso — tapered, shoulders wider than the waist.
  const wS = bodyW / 2;
  const wW = wS * 0.8;
  ctx.fillStyle = look.outfit;
  ctx.beginPath();
  ctx.moveTo(-wS, bodyY + 4);
  ctx.quadraticCurveTo(-wS - 0.6, bodyY + bodyH * 0.45, -wW, bodyY + bodyH - 1);
  ctx.quadraticCurveTo(0, bodyY + bodyH + 2.2, wW, bodyY + bodyH - 1);
  ctx.quadraticCurveTo(wS + 0.6, bodyY + bodyH * 0.45, wS, bodyY + 4);
  ctx.quadraticCurveTo(0, bodyY - 3.5, -wS, bodyY + 4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = look.trim;
  if (compact) {
    // Scarf knot at the collar (the tail is behind the torso).
    ctx.beginPath();
    ctx.roundRect(-2.2, bodyY + 2, 4.4, 4.2, 1.5);
    ctx.fill();
    // Belt — anchors the tapered waist.
    ctx.fillRect(-wW - 0.5, bodyY + bodyH - 4, wW * 2 + 1, 2.2);
  } else if (look.build === "lean") {
    ctx.fillRect(-wS, bodyY + 4, bodyW, 3);
    ctx.fillRect(-1.5, bodyY + 8, 3, 14);
  } else {
    ctx.fillRect(-wS + 3, bodyY + 8, bodyW - 6, 5);
    ctx.fillRect(-wW, bodyY + bodyH - 5, wW * 2, 3.5);
  }

  // Near arm — over the torso, mirrors the far arm.
  strokeLimb(ctx, look.skin, stocky ? 4.2 : 3.5, [
    [shX - 1, armY],
    [shX + 3.4, armY + 6 - swing * 2.6],
    [shX - 2.5 + swing * 5, armY + 1 + swing * 5],
  ]);

  if (stocky) {
    // Ice hood — shell around the head, face opening toward the climb,
    // fur trim ringing the opening so the face reads at climb size.
    ctx.fillStyle = look.outfit;
    ctx.beginPath();
    ctx.arc(0, headY - 1, headR + 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = look.hair;
    ctx.beginPath();
    ctx.arc(-headR - 0.8, headY, 2, 0, Math.PI * 2);
    ctx.arc(headR + 0.8, headY, 2, 0, Math.PI * 2);
    ctx.arc(0, headY - headR - 2.8, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = look.skin;
    ctx.beginPath();
    ctx.arc(1.8, headY + 0.6, headR - 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = look.trim;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(1.8, headY + 0.6, headR - 0.4, -1.1, 1.3);
    ctx.stroke();
  } else {
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
    } else {
      // Lean — hair band + spike, cosmic visor over the eyes.
      ctx.fillStyle = look.hair;
      ctx.beginPath();
      ctx.rect(-headR, headY - 4, headR * 2, 5);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-2, headY - 4);
      ctx.lineTo(0, headY - headR - 6);
      ctx.lineTo(3, headY - 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = look.trim;
      ctx.beginPath();
      ctx.roundRect(-headR + 0.5, headY - 3.4, headR * 2 - 1, 4.8, 2.4);
      ctx.fill();
      ctx.fillStyle = look.eye;
      ctx.fillRect(-headR + 2.2, headY - 1.8, headR * 2 - 4.4, 1.5);
    }
  }

  if (look.build !== "lean") {
    ctx.fillStyle = look.eye;
    ctx.beginPath();
    ctx.arc(2.6, headY - 1, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/** Stroke a jointed limb (hip → knee → foot, shoulder → elbow → hand). */
function strokeLimb(
  ctx: CanvasRenderingContext2D,
  color: string,
  width: number,
  pts: Array<[number, number]>,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i += 1) {
    ctx.lineTo(pts[i]![0], pts[i]![1]);
  }
  ctx.stroke();
}
