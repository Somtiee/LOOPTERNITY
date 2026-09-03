/**
 * Edge-encoded input log for deterministic run replay.
 *
 * The client records what it fed the sim each 60Hz tick; at mint time the
 * server replays those exact inputs through the same ClimbSim and only
 * signs a voucher if the run genuinely survives the rarity gate. The log is
 * small (a few hundred entries — only *changes* are stored) and is pure
 * data: JSON round-trips every float exactly, so a replay on the server is
 * bit-identical to the live run in the browser.
 */

import type { TickInputs } from "./ClimbSim";
import { MAX_REPLAY_TICKS } from "./simMath";

export type RunInputLog = {
  v: 1;
  /** Total ticks recorded (run length in 1/60s steps). */
  ticks: number;
  /** Playfield width the sim was constructed with (locked for the run). */
  width: number;
  /** View height the sim was constructed with (camera/culling exactness). */
  height: number;
  /** [tick, axis] — axis holds until the next entry (implied 0 before the first). */
  axis: [number, number][];
  /** [tick, 0|1] — boost holds until the next entry (implied 0 before the first). */
  boost: [number, number][];
  /** Ticks on which freeze was pressed. */
  freeze: number[];
  /** Ticks on which tsunami was pressed. */
  tsunami: number[];
};

export type InputRecorder = {
  /** Call once per sim tick, in order, with the exact inputs fed to `step`. */
  record(tick: number, inputs: TickInputs): void;
  finish(ticks: number, width: number, height: number): RunInputLog;
};

export function createInputRecorder(): InputRecorder {
  let lastAxis = 0;
  let lastBoost = false;
  const axis: [number, number][] = [];
  const boost: [number, number][] = [];
  const freeze: number[] = [];
  const tsunami: number[] = [];

  return {
    record(tick, inputs) {
      if (inputs.axis !== lastAxis) {
        axis.push([tick, inputs.axis]);
        lastAxis = inputs.axis;
      }
      if (inputs.boost !== lastBoost) {
        boost.push([tick, inputs.boost ? 1 : 0]);
        lastBoost = inputs.boost;
      }
      if (inputs.freeze) freeze.push(tick);
      if (inputs.tsunami) tsunami.push(tick);
    },
    finish(ticks, width, height) {
      return { v: 1, ticks, width, height, axis, boost, freeze, tsunami };
    },
  };
}

/**
 * Sequential tick decoder for replay. Must be called with tick 0, 1, 2, …
 * in order (replayRun only ever does). Throws on out-of-order calls rather
 * than silently mis-decoding.
 */
export function createTickDecoder(
  log: RunInputLog,
): (tick: number) => TickInputs {
  let lastTick = -1;
  let ai = 0;
  let bi = 0;
  let fi = 0;
  let ti = 0;
  let axis = 0;
  let boost = false;

  return (tick: number) => {
    if (tick !== lastTick + 1) {
      throw new Error("tick decoder must be called sequentially from 0");
    }
    lastTick = tick;

    while (ai < log.axis.length && log.axis[ai]![0] <= tick) {
      axis = log.axis[ai]![1];
      ai += 1;
    }
    while (bi < log.boost.length && log.boost[bi]![0] <= tick) {
      boost = log.boost[bi]![1] === 1;
      bi += 1;
    }
    let freeze = false;
    while (fi < log.freeze.length && log.freeze[fi]! <= tick) {
      if (log.freeze[fi]! === tick) freeze = true;
      fi += 1;
    }
    let tsunami = false;
    while (ti < log.tsunami.length && log.tsunami[ti]! <= tick) {
      if (log.tsunami[ti]! === tick) tsunami = true;
      ti += 1;
    }

    return { axis, boost, freeze, tsunami };
  };
}

function isTickInt(v: unknown, max: number): v is number {
  return (
    typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max
  );
}

/**
 * Parse + fully validate an untrusted input log (the voucher route body).
 * Returns null on any structural violation — a tampered or garbage log must
 * never reach the replay, only a clean refusal.
 */
export function parseRunInputLog(raw: unknown): RunInputLog | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;

  if (rec.v !== 1) return null;
  if (!isTickInt(rec.ticks, MAX_REPLAY_TICKS) || rec.ticks < 1) return null;
  const ticks = rec.ticks;
  // The last tick index is ticks - 1 (tick numbers start at 0).
  const lastTick = ticks - 1;

  if (!isTickInt(rec.width, 1200) || rec.width < 280) return null;
  const width = rec.width;

  if (!isTickInt(rec.height, 2200) || rec.height < 420) return null;
  const height = rec.height;

  if (!Array.isArray(rec.axis) || rec.axis.length > ticks + 1) return null;
  const axis: [number, number][] = [];
  let prevTick = -1;
  for (const entry of rec.axis) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const [t, v] = entry as [unknown, unknown];
    if (!isTickInt(t, lastTick) || t <= prevTick) return null;
    if (typeof v !== "number" || !Number.isFinite(v) || v < -1 || v > 1) {
      return null;
    }
    prevTick = t;
    axis.push([t, v]);
  }

  if (!Array.isArray(rec.boost) || rec.boost.length > ticks + 1) return null;
  const boost: [number, number][] = [];
  prevTick = -1;
  for (const entry of rec.boost) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const [t, v] = entry as [unknown, unknown];
    if (!isTickInt(t, lastTick) || t <= prevTick) return null;
    if (v !== 0 && v !== 1) return null;
    prevTick = t;
    boost.push([t, v]);
  }

  if (!Array.isArray(rec.freeze) || rec.freeze.length > ticks) return null;
  const freeze: number[] = [];
  prevTick = -1;
  for (const t of rec.freeze) {
    if (!isTickInt(t, lastTick) || t <= prevTick) return null;
    prevTick = t;
    freeze.push(t);
  }

  if (!Array.isArray(rec.tsunami) || rec.tsunami.length > ticks) return null;
  const tsunami: number[] = [];
  prevTick = -1;
  for (const t of rec.tsunami) {
    if (!isTickInt(t, lastTick) || t <= prevTick) return null;
    prevTick = t;
    tsunami.push(t);
  }

  return { v: 1, ticks, width, height, axis, boost, freeze, tsunami };
}
