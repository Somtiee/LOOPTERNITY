/**
 * Deterministic-replay verification for the P2M anti-cheat.
 *
 * Run: npx tsx scripts/replay-check.ts
 *
 * What this proves (the properties the voucher route depends on):
 *   1. Same (seed, theme, dims, input log) → bit-identical replay outcome,
 *      across every theme and playfield width, run twice (pure determinism).
 *   2. The recorded log survives a JSON round-trip exactly (client → server
 *      transport cannot perturb the replay).
 *   3. A tampered log (one axis span flipped late in the run) changes the
 *      outcome — you can't edit your way to a better run.
 *   4. parseRunInputLog rejects garbage / malformed / out-of-range logs.
 *
 * The "player" is a small stateful autopilot that reads sim state to steer —
 * exactly the client's trust model: inputs are recorded blind and replayed
 * blind; only the recorded inputs, never the bot, reach the server.
 */

import { ClimbSim } from "../src/game/sim/ClimbSim";
import {
  createInputRecorder,
  parseRunInputLog,
  type RunInputLog,
} from "../src/game/sim/inputLog";
import { replayRun, type ReplayResult } from "../src/game/sim/replay";
import { SIM_HZ } from "../src/game/sim/simMath";
import { VANILLA_MODIFIERS } from "../src/game/traits";
import type { ThemeId } from "../src/game/types";
import { autopilotInputs } from "./autopilot";

const MAX_TICKS = SIM_HZ * 600;

function fail(msg: string): never {
  console.error(`\nFAIL: ${msg}`);
  process.exit(1);
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) fail(msg);
}

function playAutopilotRun(
  seed: number,
  themeId: ThemeId,
  width: number,
): { log: RunInputLog; result: ReplayResult } {
  const sim = new ClimbSim({
    seed,
    width,
    height: width,
    themeId,
    difficultyId: "medium",
    modifiers: VANILLA_MODIFIERS,
  });
  const rec = createInputRecorder();
  let tick = 0;
  while (sim.phase === "playing" && tick < MAX_TICKS) {
    const inputs = autopilotInputs(sim);
    rec.record(tick, inputs);
    sim.step(inputs);
    tick += 1;
  }
  return {
    log: rec.finish(sim.tick, sim.width, sim.height),
    result: {
      timeSurvived: sim.time,
      phase: sim.phase,
      ticks: sim.tick,
    },
  };
}

function replay(
  seed: number,
  themeId: ThemeId,
  log: RunInputLog,
): ReplayResult {
  return replayRun({
    seed,
    themeId,
    difficultyId: "medium",
    modifiers: VANILLA_MODIFIERS,
    width: log.width,
    height: log.height,
    log,
  });
}

function sameOutcome(a: ReplayResult, b: ReplayResult): boolean {
  return (
    a.timeSurvived === b.timeSurvived &&
    a.phase === b.phase &&
    a.ticks === b.ticks
  );
}

function fmt(r: ReplayResult): string {
  return `${r.timeSurvived.toFixed(3)}s ${r.phase} @tick ${r.ticks}`;
}

// --- 1 + 2: replay fidelity, determinism, JSON round-trip -------------------

const CASES: { seed: number; themeId: ThemeId; width: number }[] = [
  { seed: 123456789, themeId: "volcanic", width: 720 },
  { seed: 987654321, themeId: "planetary", width: 720 },
  { seed: 555555555, themeId: "antarctica", width: 720 },
  { seed: 424242424, themeId: "volcanic", width: 390 }, // mobile width
  { seed: 777777777, themeId: "planetary", width: 1024 }, // wide screen
];

console.log("Autopilot runs (determinism + replay fidelity):");
for (const c of CASES) {
  const { log, result: live } = playAutopilotRun(c.seed, c.themeId, c.width);

  const replay1 = replay(c.seed, c.themeId, log);
  const replay2 = replay(c.seed, c.themeId, log);
  const viaJson = replay(
    c.seed,
    c.themeId,
    JSON.parse(JSON.stringify(log)) as RunInputLog,
  );

  assert(
    sameOutcome(live, replay1),
    `replay ≠ live for ${c.themeId}/${c.width}: live ${fmt(live)} vs replay ${fmt(replay1)}`,
  );
  assert(
    sameOutcome(replay1, replay2),
    `replay not deterministic for ${c.themeId}/${c.width}`,
  );
  assert(
    sameOutcome(replay1, viaJson),
    `JSON round-trip changed the replay for ${c.themeId}/${c.width}`,
  );
  assert(
    replay1.phase === "gameover",
    `autopilot run for ${c.themeId}/${c.width} never died (${fmt(replay1)}) — test is weak, tune the bot`,
  );

  const size = JSON.stringify(log).length;
  console.log(
    `  ${c.themeId.padEnd(10)} w=${String(c.width).padEnd(4)} seed=${c.seed}  ` +
      `${fmt(replay1)}  log ${(size / 1024).toFixed(1)}KB`,
  );
}

// --- 3: tampering changes the outcome --------------------------------------

console.log("\nTamper detection (flip one axis span late in the run):");
{
  const { log } = playAutopilotRun(CASES[0]!.seed, CASES[0]!.themeId, CASES[0]!.width);
  const honest = replay(CASES[0]!.seed, CASES[0]!.themeId, log);
  assert(log.axis.length > 0, "autopilot produced no axis entries");

  let detected = 0;
  const attempts = Math.min(6, log.axis.length);
  for (let i = 0; i < attempts; i++) {
    const idx = Math.floor((log.axis.length * (attempts - i)) / (attempts + 1));
    const tampered: RunInputLog = {
      ...log,
      axis: log.axis.map((entry, j) =>
        j === idx ? [entry[0], entry[1] === 0 ? -1 : 0] : entry,
      ),
    };
    const out = replay(CASES[0]!.seed, CASES[0]!.themeId, tampered);
    if (!sameOutcome(honest, out)) detected += 1;
  }
  assert(detected > 0, "flipped axis spans changed nothing — replay is not input-sensitive");
  console.log(`  ${detected}/${attempts} flips changed the run outcome (honest: ${fmt(honest)})`);
}

// Truncation: a log that just stops mid-run must not count as a death.
{
  const { log } = playAutopilotRun(CASES[0]!.seed, CASES[0]!.themeId, CASES[0]!.width);
  const truncated: RunInputLog = { ...log, ticks: Math.max(1, Math.floor(log.ticks / 2)) };
  const out = replay(CASES[0]!.seed, CASES[0]!.themeId, truncated);
  assert(
    out.phase === "playing",
    `truncated log replayed as ${out.phase} — a cut-short run must still be "playing"`,
  );
  console.log(`  truncated log (${truncated.ticks} ticks) → phase "${out.phase}" at ${out.timeSurvived.toFixed(3)}s ✓`);
}

// --- 4: untrusted-log parsing ----------------------------------------------

console.log("\nparseRunInputLog rejection checks:");
{
  const { log } = playAutopilotRun(CASES[0]!.seed, CASES[0]!.themeId, CASES[0]!.width);

  const rejections: [string, unknown][] = [
    ["null", null],
    ["not an object", 42],
    ["wrong version", { ...log, v: 2 }],
    ["missing ticks", { ...log, ticks: undefined }],
    ["zero ticks", { ...log, ticks: 0 }],
    ["absurd ticks", { ...log, ticks: 10_000_000 }],
    ["fractional ticks", { ...log, ticks: 1234.5 }],
    ["width too small", { ...log, width: 100 }],
    ["width too large", { ...log, width: 5000 }],
    ["non-integer width", { ...log, width: 720.5 }],
    ["height missing", { ...log, height: undefined }],
    ["axis value out of range", { ...log, axis: [[0, 5] as [number, number]] }],
    ["axis at impossible tick", { ...log, axis: [[log.ticks, 1] as [number, number]] }],
    ["non-monotonic axis", { ...log, axis: [[5, 1], [5, -1]] }],
    ["boost value not 0/1", { ...log, boost: [[0, 2] as [number, number]] }],
    ["freeze out of range", { ...log, freeze: [log.ticks] }],
    ["axis not an array", { ...log, axis: "nope" }],
  ];
  for (const [name, bad] of rejections) {
    assert(parseRunInputLog(bad) === null, `parseRunInputLog accepted ${name}`);
  }

  const parsed = parseRunInputLog(JSON.parse(JSON.stringify(log)));
  assert(parsed !== null, "parseRunInputLog rejected a valid log");
  assert(
    parsed !== null && JSON.stringify(parsed) === JSON.stringify(log),
    "parseRunInputLog mutated a valid log",
  );
  console.log(`  ${rejections.length} malformed logs rejected, valid log accepted ✓`);
}

console.log("\nAll replay checks passed.");
