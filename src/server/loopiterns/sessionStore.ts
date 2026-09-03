/**
 * Server-side run-session store for P2M replay attestation.
 *
 * Lives outside the route file so the route only exports handlers/config
 * (Next.js route-module constraint). Imported by:
 *   - /api/loopitern/run-seed (creates sessions)
 *   - /api/loopitern/voucher   (validates + replays the recorded run)
 *
 * A session pins, at run start:
 *   - a 32-bit seed the client's ClimbSim is constructed with
 *   - the hourly themeId (themeForEpochHour at issue time, so a UTC-hour
 *     rollover mid-run can never desync client and server)
 *
 * At mint time the voucher route re-runs the client's recorded input log
 * through the identical deterministic ClimbSim with this seed and only
 * signs if the replayed run genuinely survives the rarity gate. The seed
 * being public knowledge doesn't help a cheater — knowing it doesn't forge
 * a winning input log; they'd have to actually play one.
 */

import { randomInt, randomUUID } from "crypto";
import { themeForEpochHour } from "@/game/themes";
import type { ThemeId } from "@/game/types";

/** A run longer than this can't still be claiming — dead sessions are refused. */
export const RUN_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

/** Max live sessions per address — an abusive client gets pruned. */
const MAX_SESSIONS_PER_ADDRESS = 8;

export type RunSession = {
  issuedAt: number;
  seed: number;
  themeId: ThemeId;
};

/**
 * sessionId → RunSession. Pinned on globalThis: Next bundles each API route
 * separately, so a plain module-level Map would give the run-seed and
 * voucher routes *different* stores and every voucher would see "unknown
 * sessionId". The global survives across requests and route bundles in the
 * same server process (Node runtime). Multi-instance deployments would need
 * a shared store (KV); the TTL keeps memory bounded.
 */
type SessionGlobals = {
  __loopiternRunSessions?: Map<string, RunSession>;
  __loopiternSessionsByAddress?: Map<string, string[]>;
};
const g = globalThis as unknown as SessionGlobals;
const sessions = (g.__loopiternRunSessions ??= new Map<string, RunSession>());

/** Track which address created which session so one wallet can't flood the map. */
const sessionsByAddress = (g.__loopiternSessionsByAddress ??=
  new Map<string, string[]>());

function pruneAddressSessions(address: string): void {
  const ids = sessionsByAddress.get(address);
  if (!ids) return;
  const now = Date.now();
  const live = ids.filter((id) => {
    const session = sessions.get(id);
    return session !== undefined && now - session.issuedAt <= RUN_SESSION_TTL_MS;
  });
  for (const id of ids) {
    if (!live.includes(id)) sessions.delete(id);
  }
  if (live.length > MAX_SESSIONS_PER_ADDRESS) {
    // Drop the oldest beyond the cap.
    for (const id of live.slice(0, live.length - MAX_SESSIONS_PER_ADDRESS)) {
      sessions.delete(id);
      live.splice(live.indexOf(id), 1);
    }
  }
  if (live.length === 0) sessionsByAddress.delete(address);
  else sessionsByAddress.set(address, live);
}

/** Create and record a fresh session for this run. */
export function createRunSession(address?: string): {
  sessionId: string;
  seed: number;
  themeId: ThemeId;
} {
  const sessionId = randomUUID();
  const session: RunSession = {
    issuedAt: Date.now(),
    seed: randomInt(0, 0x7fffffff),
    themeId: themeForEpochHour(Math.floor(Date.now() / 3_600_000)).id,
  };
  sessions.set(sessionId, session);
  if (address) {
    pruneAddressSessions(address);
    const ids = sessionsByAddress.get(address) ?? [];
    ids.push(sessionId);
    sessionsByAddress.set(address, ids);
  }
  return { sessionId, seed: session.seed, themeId: session.themeId };
}

export type SessionValidation =
  | { ok: true; session: RunSession }
  | { ok: false; error: string };

/**
 * Validate a session for a voucher claim: must exist, be within TTL, and at
 * least `minElapsedSeconds` of real wall-clock time must have passed since
 * issue (defense in depth — the replay check below is the real gate).
 *
 * Sessions are intentionally NOT single-use: the player may retry the mint
 * after a wallet rejection using the same run. What stops farming is the
 * chain, not the session — every voucher still costs 0.0002 ETH and counts
 * toward the 5-per-wallet cap.
 */
export function validateRunSession(
  sessionId: unknown,
  minElapsedSeconds: number,
): SessionValidation {
  if (typeof sessionId !== "string" || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
    return { ok: false, error: "bad sessionId — request a run session at run start" };
  }
  const session = sessions.get(sessionId);
  if (!session) {
    return { ok: false, error: "unknown sessionId — request a run session at run start" };
  }
  const elapsedMs = Date.now() - session.issuedAt;
  if (elapsedMs > RUN_SESSION_TTL_MS) {
    return { ok: false, error: "run session expired — start a new run" };
  }
  if (elapsedMs < minElapsedSeconds * 1000) {
    const waited = Math.floor(elapsedMs / 1000);
    return {
      ok: false,
      error: `too fast — this run is ${waited}s in, the gate is ${minElapsedSeconds}s (real time)`,
    };
  }
  return { ok: true, session };
}
