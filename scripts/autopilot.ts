/**
 * A crude but honest autopilot for replay verification scripts.
 *
 * It reads live sim state to decide inputs (dodge obstacles and enemies,
 * head for shield pickups, boost when the danger rises close) — exactly the
 * client's trust model: inputs are recorded blind and replayed blind, and
 * only the recorded inputs ever reach the server.
 */

import type { ClimbSim, TickInputs } from "../src/game/sim/ClimbSim";

const PLAYER_HALF = 14; // PLAYER.width / 2
const WALL_PAD = 24; // WORLD.wallPadding
/** Only gaps at least this wide are worth steering into (player is 28 wide). */
const MIN_GAP = 56;
/** How far ahead (world +y) the bot plans. */
const LOOK_AHEAD = 260;
/** Steering deadband, in px of target offset. */
const STEER_GAIN = 90;

export function autopilotInputs(sim: ClimbSim): TickInputs {
  const p = sim.player;
  const px = p.x + PLAYER_HALF;
  const lo = WALL_PAD;
  const hi = sim.width - WALL_PAD;

  // Collect everything blocking the lane ahead as horizontal spans.
  const spans: { x0: number; x1: number }[] = [];
  for (const o of sim.obstacles) {
    const r = sim.obstacleRect(o);
    if (r.y + r.h < p.y - 20 || r.y > p.y + LOOK_AHEAD) continue;
    spans.push({ x0: r.x, x1: r.x + r.w });
  }
  for (const e of sim.enemies) {
    if (e.y + e.h < p.y - 40 || e.y > p.y + LOOK_AHEAD + 40) continue;
    spans.push({ x0: e.x, x1: e.x + e.w });
  }
  for (const pr of sim.projectiles) {
    // Falling hazards spawn far above the view and drop onto the player —
    // track them much further out than static obstacles.
    const isFalling = pr.kind.startsWith("fall_");
    const ahead = isFalling ? LOOK_AHEAD * 3 : LOOK_AHEAD;
    if (pr.y + pr.h < p.y - 10 || pr.y > p.y + ahead) continue;
    spans.push({ x0: pr.x, x1: pr.x + pr.w });
  }

  // Steer to the center of the widest gap that fits the player.
  spans.sort((a, b) => a.x0 - b.x0);
  let targetX = px;
  let bestRoom = -1;
  let cursor = lo;
  for (const s of spans) {
    if (s.x0 > cursor && s.x0 - cursor >= MIN_GAP) {
      const room = s.x0 - cursor;
      if (room > bestRoom) {
        bestRoom = room;
        targetX = (cursor + s.x0) / 2;
      }
    }
    cursor = Math.max(cursor, s.x1);
  }
  if (hi - cursor >= MIN_GAP && hi - cursor > bestRoom) {
    targetX = (cursor + hi) / 2;
  }

  // Open lane → drift toward the nearest shield pickup ahead, else hold.
  if (bestRoom < 0) {
    let nearest: number | null = null;
    for (const pk of sim.pickups) {
      if (pk.y < p.y - 10 || pk.y > p.y + LOOK_AHEAD) continue;
      if (nearest === null || Math.abs(pk.x - px) < Math.abs(nearest - px)) {
        nearest = pk.x;
      }
    }
    if (nearest !== null) targetX = nearest;
  }

  targetX = Math.min(hi - PLAYER_HALF, Math.max(lo + PLAYER_HALF, targetX));
  let axis = Math.max(-1, Math.min(1, (targetX - px) / STEER_GAIN));

  // Emergency repulsion: an enemy close in front chases horizontally, so a
  // static gap plan alone won't shake it — shove away when it's on top of us.
  for (const e of sim.enemies) {
    if (e.y + e.h < p.y - 40 || e.y > p.y + 160) continue;
    const dx = e.x + e.w / 2 - px;
    if (Math.abs(dx) < 110) {
      const push = (110 - Math.abs(dx)) / 110;
      axis = Math.max(-1, Math.min(1, axis - Math.sign(dx) * push));
    }
  }

  // Hold boost (cooldown gates retrigger) only when the rise is truly close —
  // boosting into unscouted ground is how this bot dies.
  const boost = sim.computeDangerProximity() > 0.7;
  return { axis, boost, freeze: false, tsunami: false };
}
