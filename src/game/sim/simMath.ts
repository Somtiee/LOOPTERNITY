/**
 * Deterministic math for the shared sim.
 *
 * The sim replays on the server (Node/V8) and runs live in every browser
 * engine (V8, JavaScriptCore, SpiderMonkey) — it must be bit-identical
 * everywhere. IEEE 754 +,-,*,/ and Math.sqrt are exactly specified, but
 * Math.sin / Math.pow are implementation-defined and may differ by an ulp
 * between engines, which would make replays diverge. So the sim uses:
 *
 *   - SIM_TICK: fixed 1/60 timestep (kills every runtime Math.pow(k, dt)).
 *   - expLerp(base): 1 - base**SIM_TICK, rounded to 12 significant digits
 *     so any ulp-level engine difference in pow is crushed before it can
 *     compound over thousands of ticks. Memoized for the ~15 distinct
 *     bases the enemy AI uses.
 *   - simSin: a pure +,* polynomial (range-reduced Taylor) — bit-identical
 *     in every engine by construction. Accuracy vs Math.sin is ~3e-8,
 *     imperceptible in gameplay.
 *
 * Rendering keeps Math.sin/Math.random — cosmetics never touch sim state.
 */

export const SIM_TICK = 1 / 60;
export const SIM_HZ = 60;

/** Longest run the server will replay (10 minutes of ticks). */
export const MAX_REPLAY_TICKS = SIM_HZ * 600;

const expLerpCache = new Map<number, number>();

/**
 * Per-tick exponential lerp factor: 1 - base**(1/60).
 * Matches the engine's `lerp(a, b, 1 - Math.pow(base, dt))` at dt = 1/60,
 * rounded so all engines agree on the exact value.
 */
export function expLerp(base: number): number {
  const cached = expLerpCache.get(base);
  if (cached !== undefined) return cached;
  const value = Number((1 - base ** SIM_TICK).toPrecision(12));
  expLerpCache.set(base, value);
  return value;
}

const TWO_PI = 6.283185307179586;
const HALF_PI = 1.5707963267948966;
const PI = 3.141592653589793;

/** Deterministic sin — see file header. Accuracy ~3e-8 on [-π/2, π/2]. */
export function simSin(x: number): number {
  if (!Number.isFinite(x)) return 0;
  // Reduce mod 2π to roughly [-π, π] (round is exactly specified).
  let r = x - Math.round(x / TWO_PI) * TWO_PI;
  // Fold to [-π/2, π/2].
  if (r > HALF_PI) r = PI - r;
  else if (r < -HALF_PI) r = -PI - r;
  // Taylor degree 11 in Horner form: only +,-,*,/ below.
  const x2 = r * r;
  return (
    r *
    (1 -
      x2 *
        (1 / 6 -
          x2 *
            (1 / 120 -
              x2 *
                (1 / 5040 - x2 * (1 / 362880 - x2 * (1 / 39916800))))))
  );
}

/** Deterministic hypot replacement (Math.hypot is not engine-exact). */
export function simHypot(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}
