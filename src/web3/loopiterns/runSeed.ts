"use client";

/**
 * Client half of the server-side run-seed attestation.
 *
 * GameApp requests a seed from POST /api/loopitern/run-seed whenever a P2M
 * run starts (launch or restart). The server records its wall clock; the
 * voucher route later refuses to sign unless real time ≥ the rarity gate
 * passed since then. The client can't fake it — it never sees a timestamp
 * it controls, only the opaque seedId.
 *
 * If the seed request fails (offline, 503), the run still plays; the mint
 * button will surface the server's "bad seedId" error if the player tries
 * to mint. Retrying the run fetches a fresh seed.
 */

export type RunSeedState = {
  /** Opaque id to send with the voucher claim. Null until fetched. */
  seedId: string | null;
  /** True while a seed request is in flight. */
  requesting: boolean;
};

export async function requestRunSeed(): Promise<string | null> {
  try {
    const res = await fetch("/api/loopitern/run-seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as
      | { seedId?: unknown }
      | null;
    if (data && typeof data.seedId === "string" && data.seedId) {
      return data.seedId;
    }
    return null;
  } catch {
    return null;
  }
}
