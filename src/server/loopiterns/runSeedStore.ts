/**
 * Server-side run-seed store for P2M attestation.
 *
 * Lives outside the route file so the route only exports handlers/config
 * (Next.js route-module constraint). Imported by:
 *   - /api/loopitern/run-seed (creates seeds)
 *   - /api/loopitern/voucher   (validates elapsed time before signing)
 */

import { randomUUID } from "crypto";

/** A run longer than this can't still be claiming — dead seeds are refused. */
export const RUN_SEED_TTL_MS = 2 * 60 * 60 * 1000;

/** Max live seeds kept per (address) — an abusive client gets pruned. */
const MAX_SEEDS_PER_ADDRESS = 8;

export type RunSeed = {
  issuedAt: number;
};

/**
 * seedId → RunSeed. Module-level Map survives across requests in the same
 * server process (Node runtime). Multi-instance deployments would need a
 * shared store (KV); the TTL keeps memory bounded.
 */
const seeds = new Map<string, RunSeed>();

/** Track which address created which seed so one wallet can't flood the map. */
const seedsByAddress = new Map<string, string[]>();

function pruneAddressSeeds(address: string): void {
  const ids = seedsByAddress.get(address);
  if (!ids) return;
  const now = Date.now();
  const live = ids.filter((id) => {
    const seed = seeds.get(id);
    return seed !== undefined && now - seed.issuedAt <= RUN_SEED_TTL_MS;
  });
  for (const id of ids) {
    if (!live.includes(id)) seeds.delete(id);
  }
  if (live.length > MAX_SEEDS_PER_ADDRESS) {
    // Drop the oldest beyond the cap.
    for (const id of live.slice(0, live.length - MAX_SEEDS_PER_ADDRESS)) {
      seeds.delete(id);
      live.splice(live.indexOf(id), 1);
    }
  }
  if (live.length === 0) seedsByAddress.delete(address);
  else seedsByAddress.set(address, live);
}

/** Create and record a fresh seed for this run. */
export function createRunSeed(address?: string): string {
  const seedId = randomUUID();
  seeds.set(seedId, { issuedAt: Date.now() });
  if (address) {
    pruneAddressSeeds(address);
    const ids = seedsByAddress.get(address) ?? [];
    ids.push(seedId);
    seedsByAddress.set(address, ids);
  }
  return seedId;
}

/**
 * Validate a seed for a voucher claim: must exist and be within TTL, and
 * at least `minElapsedSeconds` of real wall-clock time must have passed
 * since issue. Returns an error string, or null when the seed is good.
 *
 * Seeds are intentionally NOT single-use: the player may retry the mint
 * after a wallet rejection using the same run (same elapsed floor). What
 * stops farming is the chain, not the seed — every voucher still costs
 * 0.0002 ETH and counts toward the 5-per-wallet cap.
 */
export function validateRunSeed(
  seedId: unknown,
  minElapsedSeconds: number,
): string | null {
  if (typeof seedId !== "string" || !/^[0-9a-f-]{36}$/i.test(seedId)) {
    return "bad seedId — request a run seed at run start";
  }
  const seed = seeds.get(seedId);
  if (!seed) {
    return "unknown seedId — request a run seed at run start";
  }
  const elapsedMs = Date.now() - seed.issuedAt;
  if (elapsedMs > RUN_SEED_TTL_MS) {
    return "run seed expired — start a new run";
  }
  if (elapsedMs < minElapsedSeconds * 1000) {
    const waited = Math.floor(elapsedMs / 1000);
    return `too fast — this run is ${waited}s in, the gate is ${minElapsedSeconds}s (real time)`;
  }
  return null;
}
