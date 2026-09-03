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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const contract = getLoopiternsAddress();
  if (!contract) {
    return NextResponse.json(
      { error: "LOOPITERNS contract not deployed (no address configured)" },
      { status: 503 },
    );
  }

  let address: string | undefined;
  try {
    const body = await req.json();
    if (
      body &&
      typeof body === "object" &&
      typeof (body as Record<string, unknown>).address === "string"
    ) {
      const raw = (body as Record<string, unknown>).address as string;
      if (/^0x[0-9a-fA-F]{40}$/.test(raw.trim())) address = raw.trim();
    }
  } catch {
    // No/invalid body is fine — the session itself doesn't need an address.
  }

  const session = createRunSession(address);
  return NextResponse.json(session, { status: 201 });
}
