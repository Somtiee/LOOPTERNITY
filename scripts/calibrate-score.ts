/**
 * Rarity-threshold calibration for the score gates (run before changing
 * mintTiers.ts numbers):
 *
 *   npx tsx scripts/calibrate-score.ts
 *
 * The score gates must keep the OLD time pacing true — a normal Medium P2M
 * run that used to unlock Common/Uncommon/Rare/Epic/Legendary at
 * 30/60/90/120/150s must still clear those tiers' SCORE thresholds at
 * roughly the same moments. So this script runs the REAL ClimbSim (medium,
 * vanilla speed) and samples the score inputs at each gate time:
 *
 *   - a "passive" bot (no steer, no boost, unkillable shields): isolates
 *     the pure climb curve. The danger's catch-up glues every runner to
 *     roughly the same height at a given time, so this curve is close to
 *     what ANY survivor of T seconds has climbed — the zero-bonus floor.
 *   - the autopilot bot (dodges, boosts): approximates a normal active
 *     run — shows how far bonuses (steer px, near misses, boost seconds)
 *     lift the score above the floor.
 *
 * Thresholds should be set at (or just below) the passive bot's climbPx at
 * each gate time, rounded down to a clean number: every T-second survivor
 * clears them, bonuses only pull them earlier.
 */

import { ClimbSim, type TickInputs } from "../src/game/sim/ClimbSim";
import { climbScore, formatScore, SCORE_WEIGHTS } from "../src/game/score";
import { VANILLA_MODIFIERS, type RunModifiers } from "../src/game/traits";
import type { ThemeId } from "../src/game/types";
import { autopilotInputs } from "./autopilot";

/** Old survival gates — the pacing the score thresholds must preserve. */
const GATE_SECONDS = [30, 60, 90, 120, 150] as const;
const RUN_SECONDS = 160;
const SEEDS = [123456789, 987654321, 555555555, 424242424, 777777777];

type Sample = {
  gate: number;
  climbPx: number;
  steerPx: number;
  nearMisses: number;
  boostSeconds: number;
  score: number;
};

/** Play the sim, snapshotting the score inputs as each gate second passes. */
function runBot(
  seed: number,
  themeId: ThemeId,
  inputs: (sim: ClimbSim) => TickInputs,
  modifiers: RunModifiers,
): { samples: Sample[]; diedAtGate: number | null } {
  const sim = new ClimbSim({
    seed,
    width: 720,
    height: 720,
    themeId,
    difficultyId: "medium",
    modifiers,
  });
  const gates = [...GATE_SECONDS];
  const samples: Sample[] = [];
  while (sim.phase === "playing" && sim.time < RUN_SECONDS) {
    sim.step(inputs(sim));
    const nextGate = gates[0];
    if (nextGate !== undefined && sim.time >= nextGate) {
      const stats = sim.scoreStats();
      samples.push({ gate: nextGate, ...stats, score: climbScore(stats) });
      gates.shift();
    }
  }
  return {
    samples,
    diedAtGate: sim.phase === "gameover" ? GATE_SECONDS.findIndex((g) => g > sim.time) : null,
  };
}

console.log(
  `Weights: climbPx×${SCORE_WEIGHTS.climbPx} + steerPx×${SCORE_WEIGHTS.steerPx} ` +
    `+ nearMiss×${SCORE_WEIGHTS.nearMisses} + boostSec×${SCORE_WEIGHTS.boostSeconds}\n`,
);

const passiveModifiers: RunModifiers = { ...VANILLA_MODIFIERS, maxShields: 9999 };
const passiveInputs = (): TickInputs => ({
  axis: 0,
  boost: false,
  freeze: false,
  tsunami: false,
});
/** Autopilot with boost stripped — a dodger that never boosts: the
 *  minimal realistic climb curve (rare knock-ups, no boost extras). */
const noBoostAutopilot = (sim: ClimbSim): TickInputs => {
  const i = autopilotInputs(sim);
  return { ...i, boost: false };
};

const BOTS = [
  {
    label: "passive (no steer/boost, unkillable)",
    inputs: passiveInputs,
    modifiers: passiveModifiers,
  },
  {
    label: "autopilot, unkillable, NO boost — minimal clean curve",
    inputs: noBoostAutopilot,
    modifiers: passiveModifiers,
  },
  {
    label: "autopilot, unkillable, boost on — active-run curve",
    inputs: autopilotInputs,
    modifiers: passiveModifiers,
  },
  {
    label: "autopilot, vanilla (dies like a real mid-skill run)",
    inputs: autopilotInputs,
    modifiers: VANILLA_MODIFIERS,
  },
] as const;

for (const { label, inputs, modifiers } of BOTS) {
  console.log(`${label}:`);
  const byGate = new Map<number, Sample[]>();
  let fullRuns = 0;
  for (const seed of SEEDS) {
    const { samples, diedAtGate } = runBot(seed, "volcanic", inputs, modifiers);
    if (diedAtGate === -1 || samples.length === GATE_SECONDS.length) fullRuns += 1;
    if (diedAtGate !== null && diedAtGate !== -1) {
      console.log(
        `  seed ${seed}: died at ${samples.length} gate(s) in — partial samples only`,
      );
    }
    for (const s of samples) {
      const list = byGate.get(s.gate) ?? [];
      list.push(s);
      byGate.set(s.gate, list);
    }
  }
  console.log(`  (${fullRuns}/${SEEDS.length} seeds reached 150s)\n`);
  for (const gate of GATE_SECONDS) {
    const list = byGate.get(gate) ?? [];
    if (!list.length) continue;
    const climbs = list.map((s) => s.climbPx);
    const scores = list.map((s) => s.score);
    const near = list.map((s) => s.nearMisses);
    const boost = list.map((s) => s.boostSeconds);
    const steer = list.map((s) => s.steerPx);
    console.log(
      `  t=${String(gate).padStart(3)}s  climbPx ${Math.round(Math.min(...climbs))}–${Math.round(Math.max(...climbs))}` +
        `  near ${Math.round(Math.min(...near))}–${Math.round(Math.max(...near))}` +
        `  boostSec ${Math.min(...boost).toFixed(1)}–${Math.max(...boost).toFixed(1)}` +
        `  steerPx ${Math.round(Math.min(...steer))}–${Math.round(Math.max(...steer))}`,
    );
    console.log(
      `            score ${formatScore(Math.min(...scores))}–${formatScore(Math.max(...scores))}` +
        `  (floor candidate: ${formatScore(Math.floor(Math.min(...climbs) / 500) * 500)})`,
    );
  }
  console.log();
}
