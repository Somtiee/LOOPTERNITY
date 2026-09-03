/**
 * Stateless, HMAC-signed run sessions for P2M replay attestation.
 *
 * Lives outside the route file so the route only exports handlers/config
 * (Next.js route-module constraint). Imported by:
 *   - /api/loopitern/run-seed (mints sessions)
 *   - /api/loopitern/voucher   (verifies + replays the recorded run)
 *
 * A session pins, at run start:
 *   - a 32-bit seed the client's ClimbSim is constructed with
 *   - the hourly themeId (themeForEpochHour at issue time, so a UTC-hour
 *     rollover mid-run can never desync client and server)
 *   - the issue time (wall-clock gate)
 *
 * The session is a signed token the client holds and returns at mint time —
 * there is NO server-side storage. This is required on serverless (Vercel):
 * a run lasts 30–150+ seconds of real play between run-seed and voucher, and
 * two requests are free to land on different function instances. An
 * in-memory Map dies with the instance and every voucher then fails with
 * "unknown sessionId". A signed token works on any instance, warm or cold.
 *
 * The HMAC key is the server-only VOUCHER_SIGNER_PRIVATE_KEY (the same key
 * that signs vouchers — no new env var). Clients can read the token payload
 * (it's just base64url JSON) but cannot forge or alter one: the replay seed,
 * theme, and issue time are all covered by the signature, so a token the
 * client "edited" fails verification, and a token it merely replays still
 * demands an input log that genuinely survives the gate.
 *
 * At mint time the voucher route re-runs the client's recorded input log
 * through the identical deterministic ClimbSim with the token's pinned seed
 * and only signs if the replayed run genuinely survives the rarity gate. The
 * seed being public knowledge doesn't help a cheater — knowing it doesn't
 * forge a winning input log; they'd have to actually play one.
 */

import { createHmac, randomInt, randomUUID, timingSafeEqual } from "crypto";
import { listThemes, themeForEpochHour } from "@/game/themes";
import type { ThemeId } from "@/game/types";

/** A run longer than this can't still be claiming — dead sessions are refused. */
export const RUN_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

/** Compact payload embedded in every signed session token. */
type SessionPayload = {
  v: 1;
  /** Random id — makes every token unique for the same issued fields. */
  sid: string;
  seed: number;
  theme: ThemeId;
  /** Issued-at, ms since epoch — the wall-clock the voucher gate checks. */
  iat: number;
};

/** HMAC domain separator so the key is never signed over raw attacker JSON. */
const HMAC_DOMAIN = "loopternity:run-session:v1";

const THEME_IDS = new Set<string>(listThemes().map((t) => t.id as string));

/** The server-only voucher key doubles as the session-signing key. */
function getSigningKey(): Buffer | undefined {
  const raw = process.env.VOUCHER_SIGNER_PRIVATE_KEY?.trim();
  if (!raw) return undefined;
  const withPrefix = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(withPrefix)) return undefined;
  return Buffer.from(withPrefix.slice(2), "hex");
}

function signPayload(key: Buffer, payloadJson: string): string {
  return createHmac("sha256", key)
    .update(`${HMAC_DOMAIN}:${payloadJson}`)
    .digest("base64url");
}

/**
 * Create a fresh signed session for this run. Returns null when the signing
 * key is not configured — the caller must 503, never issue an unsigned
 * token.
 *
 * `address` is accepted for API compatibility (the client sends its wallet)
 * but is not bound into the session: the voucher is bound to the minter at
 * signing time and the replay gate is the real gate, so who requested the
 * seed buys nothing.
 */
export function createRunSession(
  address?: string,
): { sessionId: string; seed: number; themeId: ThemeId } | null {
  void address;
  const key = getSigningKey();
  if (!key) return null;
  const payload: SessionPayload = {
    v: 1,
    sid: randomUUID(),
    seed: randomInt(0, 0x7fffffff),
    theme: themeForEpochHour(Math.floor(Date.now() / 3_600_000)).id,
    iat: Date.now(),
  };
  const payloadJson = JSON.stringify(payload);
  const sessionId = `${Buffer.from(payloadJson).toString("base64url")}.${signPayload(key, payloadJson)}`;
  return { sessionId, seed: payload.seed, themeId: payload.theme };
}

export type SessionValidation =
  | { ok: true; session: { issuedAt: number; seed: number; themeId: ThemeId } }
  | { ok: false; error: string };

const BAD_SESSION_ID = "bad sessionId — request a run session at run start";

/**
 * Verify a session token for a voucher claim: the HMAC must check out
 * (constant-time compare), the payload must be well-formed, the session must
 * be within TTL, and at least `minElapsedSeconds` of real wall-clock time
 * must have passed since issue (defense in depth — the replay check in the
 * voucher route is the real gate).
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
  if (
    typeof sessionId !== "string" ||
    sessionId.length > 512 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(sessionId)
  ) {
    return { ok: false, error: BAD_SESSION_ID };
  }
  const key = getSigningKey();
  if (!key) {
    return { ok: false, error: "session signing is not configured" };
  }

  const dot = sessionId.indexOf(".");
  const payloadB64 = sessionId.slice(0, dot);
  const sigB64 = sessionId.slice(dot + 1);
  let payloadJson: string;
  try {
    payloadJson = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return { ok: false, error: BAD_SESSION_ID };
  }

  // Signature over the exact payload bytes — any edit breaks it. Compare
  // the decoded HMAC bytes (constant-time), not the base64 strings.
  const expected = Buffer.from(signPayload(key, payloadJson), "base64url");
  const given = Buffer.from(sigB64, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, error: "run session invalid — start a new run" };
  }

  let payload: SessionPayload;
  try {
    payload = JSON.parse(payloadJson) as SessionPayload;
  } catch {
    return { ok: false, error: BAD_SESSION_ID };
  }
  if (
    payload?.v !== 1 ||
    !Number.isInteger(payload.seed) ||
    payload.seed < 0 ||
    payload.seed > 0x7fffffff ||
    !THEME_IDS.has(payload.theme) ||
    !Number.isInteger(payload.iat) ||
    payload.iat <= 0
  ) {
    return { ok: false, error: BAD_SESSION_ID };
  }

  const elapsedMs = Date.now() - payload.iat;
  if (elapsedMs > RUN_SESSION_TTL_MS) {
    return { ok: false, error: "run session expired — start a new run" };
  }
  if (elapsedMs < minElapsedSeconds * 1000) {
    const waited = Math.max(0, Math.floor(elapsedMs / 1000));
    return {
      ok: false,
      error: `too fast — this run is ${waited}s in, the gate is ${minElapsedSeconds}s (real time)`,
    };
  }
  return {
    ok: true,
    session: { issuedAt: payload.iat, seed: payload.seed, themeId: payload.theme },
  };
}
