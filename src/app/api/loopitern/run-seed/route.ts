/**
 * P2M run-session issuer (server-side run attestation).
 *
 * POST /api/loopitern/run-seed
 *   body: { address? }   → 201 { sessionId, seed, themeId }
 *
 * The client requests a session when a P2M run starts and constructs its
 * deterministic ClimbSim with the returned seed. At mint time the client
 * submits the recorded input log; the voucher route replays it through the
 * identical sim with the same seed and only signs a voucher if the replayed
 * run genuinely survives the rarity gate. No session, no voucher; a session
 * issued 5s ago can never mint a Legendary (150s gate) — and neither can a
 * hand-crafted input log that doesn't actually survive the replay.
 *
 * The session store lives in src/server/loopiterns/sessionStore.ts (route
 * files may only export handlers + config).
 *
 * Honesty rules:
 *  - LOOPITERNS contract not configured → 503 (no sessions while minting is off)
 *  - non-object JSON body is tolerated (address is optional metadata)
 */

import { NextResponse } from "next/server";
import { getLoopiternsAddress } from "@/web3/loopiterns/address";
import { createRunSession } from "@/server/loopiterns/sessionStore";
import { clientIp, rateLimit, readJsonBody } from "@/server/loopiterns/requestGuards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Request-shape limits (see requestGuards.ts). The body is a single
 * optional address — 4 KB is generous. A session per run start is the
 * honest rate; runs shorter than a few seconds are useless anyway, so a
 * per-IP limit of 30/min inconveniences nobody but a flood.
 */
const MAX_BODY_BYTES = 4 * 1024;
const RATE_LIMIT = { max: 30, windowMs: 60_000 };

export async function POST(req: Request) {
  const contract = getLoopiternsAddress();
  if (!contract) {
    return NextResponse.json(
      { error: "LOOPITERNS contract not deployed (no address configured)" },
      { status: 503 },
    );
  }

  // Rate limit before reading the body — a flood never gets to allocate.
  // Per-instance best-effort on serverless — see requestGuards.ts.
  const ip = clientIp(req);
  const limited = rateLimit({
    key: ip ? `run-seed:ip:${ip}` : "run-seed:ip:unknown",
    max: RATE_LIMIT.max,
    windowMs: RATE_LIMIT.windowMs,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many run starts — wait a moment and retry." },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSeconds) },
      },
    );
  }

  const body = await readJsonBody(req, MAX_BODY_BYTES);
  if (!body.ok) {
    if (body.error === "too-large") {
      return NextResponse.json(
        { error: "Request body too large" },
        { status: 413 },
      );
    }
    // Syntactically broken JSON gets the honest 400; a missing body is
    // tolerated below (address is optional metadata).
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  let address: string | undefined;
  try {
    const value: unknown = body.value;
    if (
      value &&
      typeof value === "object" &&
      typeof (value as Record<string, unknown>).address === "string"
    ) {
      const raw = (value as Record<string, unknown>).address as string;
      if (/^0x[0-9a-fA-F]{40}$/.test(raw.trim())) address = raw.trim();
    }
  } catch {
    // No/invalid body is fine — the session itself doesn't need an address.
  }

  const session = createRunSession(address);
  if (!session) {
    // No signing key configured — never hand out an unsigned session.
    return NextResponse.json(
      { error: "Run sessions are not configured (VOUCHER_SIGNER_PRIVATE_KEY missing)" },
      { status: 503 },
    );
  }
  return NextResponse.json(session, { status: 201 });
}
