/**
 * P2M run seed issuer (server-side run attestation).
 *
 * POST /api/loopitern/run-seed
 *   body: { address? }   → 201 { seedId }
 *
 * A console script can POST { timeSurvived: 9999 } straight to the voucher
 * route without playing. The run seed closes that: the client requests a
 * seed when a P2M run starts, and the voucher route only signs if real
 * wall-clock time passed between seed issue and the claim — at least
 * rarity.minSeconds for the rarity being minted. No seed, no voucher;
 * a seed minted 5s ago can never buy a Legendary (150s gate).
 *
 * The seed store lives in src/server/loopiterns/runSeedStore.ts (route
 * files may only export handlers + config).
 *
 * Honesty rules:
 *   - LOOPITERNS contract not configured → 503 (no seeds while minting is off)
 *   - non-object JSON body is tolerated (address is optional metadata)
 */

import { NextResponse } from "next/server";
import { getLoopiternsAddress } from "@/web3/loopiterns/address";
import { createRunSeed } from "@/server/loopiterns/runSeedStore";

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
    // No/invalid body is fine — the seed itself doesn't need an address.
  }

  const seedId = createRunSeed(address);
  return NextResponse.json({ seedId }, { status: 201 });
}
