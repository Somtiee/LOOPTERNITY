/**
 * Seeded RNG for the deterministic sim (mulberry32).
 *
 * The sim must replay bit-identically on the server and in every browser
 * engine, so gameplay randomness goes through this — never Math.random
 * (which is fine for cosmetics, which live only in the client renderer).
 */

export type Rng = {
  /** Uniform float in [0, 1). */
  next(): number;
};

export function createRng(seed: number): Rng {
  // Force uint32; mulberry32 is defined on 32-bit state.
  let a = (seed | 0) >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) | 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Seeded mirror of the unseeded randRange in src/game/math.ts. */
export function randRange(rng: Rng, min: number, max: number): number {
  return min + rng.next() * (max - min);
}
