/**
 * Server-side run replay: the anti-cheat core.
 *
 * replayRun re-runs a claimed run from the session seed + recorded input
 * log through the exact same deterministic ClimbSim the browser played.
 * If the replay doesn't genuinely reach the rarity's score gate, no voucher
 * is signed — posting { score: 999999 } from a console buys nothing.
 */

import type { DifficultyId, ThemeId } from "../types";
import { VANILLA_MODIFIERS, type RunModifiers } from "../traits";
import { ClimbSim } from "./ClimbSim";
import { createTickDecoder, type RunInputLog } from "./inputLog";
import { MAX_REPLAY_TICKS } from "./simMath";

export type ReplayResult = {
  /** Seconds the replayed run survived (sanity signal, not the gate). */
  timeSurvived: number;
  /** Replay score (authoritative — computed here, never trusted from the client). */
  score: number;
  /** "gameover" = the log's death reproduced; "playing" = the log just ends. */
  phase: "playing" | "gameover";
  /** Ticks the sim actually executed before the run ended. */
  ticks: number;
};

export type ReplayOptions = {
  seed: number;
  themeId: ThemeId;
  difficultyId: DifficultyId;
  modifiers?: RunModifiers;
  width: number;
  height: number;
  log: RunInputLog;
};

export function replayRun(opts: ReplayOptions): ReplayResult {
  const sim = new ClimbSim({
    seed: opts.seed,
    width: opts.width,
    height: opts.height,
    themeId: opts.themeId,
    difficultyId: opts.difficultyId,
    modifiers: opts.modifiers ?? VANILLA_MODIFIERS,
  });
  const decode = createTickDecoder(opts.log);
  const ticks = Math.min(opts.log.ticks, MAX_REPLAY_TICKS);
  for (let t = 0; t < ticks && sim.phase === "playing"; t++) {
    sim.step(decode(t));
  }
  return {
    timeSurvived: sim.time,
    score: sim.score(),
    phase: sim.phase,
    ticks: sim.tick,
  };
}
