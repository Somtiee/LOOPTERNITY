/**
 * LOOPITERN ERC-721 metadata, tokenURI target (Prompt K).
 *
 * GET /api/loopitern/token/{tokenId}  (also matches `{tokenId}.json`)
 *
 * This is the route marketplaces hit: `Loopiterns.tokenURI` returns
 * `baseURI + tokenId + ".json"`, and after deploy the owner must run
 *
 *   setBaseURI("https://<this-site>/api/loopitern/token/")
 *
 * from the treasury wallet so `tokenURI(7)` resolves here as
 * `…/api/loopitern/token/7.json`. The route strips the `.json` suffix,
 * reads the token's rarity from the chain (`tokenRarity`), and returns the
 * same metadata document as `/api/loopitern/[tokenId]/[rarity]/metadata`.
 *
 * Honesty rules (no zero-address pretending):
 *   - contract not configured (NEXT_PUBLIC_LOOPITERNS_ADDRESS empty/zero)
 *     → 503, never fabricated metadata
 *   - tokenId not minted yet (`ownerOf` reverts) → 404, not cached
 *   - chain unreachable → 502
 *
 * tokenId is guarded to 1..10000.
 */

import { createPublicClient, http } from "viem";
import { getLoopiternsAddress } from "@/web3/loopiterns/address";
import { ROBINHOOD_CHAIN, ROBINHOOD_RPC_URL } from "@/web3/config";
import { isLoopiternRarityId } from "@/game/mintTiers";
import { buildLoopiternMetadata, LOOPITERNS_MAX_SUPPLY } from "@/game/loopiternMetadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ABI = [
  { type: "function", name: "ownerOf", stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "tokenRarity", stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "uint8" }] },
] as const;

/** Strip the `.json` suffix that `tokenURI` appends. */
function stripJsonExt(raw: string): string {
  return raw.endsWith(".json") ? raw.slice(0, -5) : raw;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tokenId: string }> },
) {
  const { tokenId: tokenIdRaw } = await params;
  const tokenId = Number(stripJsonExt(tokenIdRaw));
  if (!Number.isInteger(tokenId) || tokenId < 1 || tokenId > LOOPITERNS_MAX_SUPPLY) {
    return Response.json({ error: "tokenId must be 1..10000" }, { status: 400 });
  }

  const contract = getLoopiternsAddress();
  if (!contract) {
    return Response.json(
      { error: "LOOPITERNS contract not deployed (no address configured)" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const client = createPublicClient({
    chain: ROBINHOOD_CHAIN,
    transport: http(ROBINHOOD_RPC_URL, { retryCount: 1 }),
  });

  try {
    // `ownerOf` reverts for unminted ids — a 404, not a fake Common.
    await client.readContract({
      address: contract,
      abi: ABI,
      functionName: "ownerOf",
      args: [BigInt(tokenId)],
    });
    const rarityRaw = await client.readContract({
      address: contract,
      abi: ABI,
      functionName: "tokenRarity",
      args: [BigInt(tokenId)],
    });
    const rarity = Number(rarityRaw);
    if (!isLoopiternRarityId(rarity)) {
      return Response.json(
        { error: `contract returned unknown rarity ${rarity}` },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }

    const origin = new URL(req.url).origin;
    const metadata = buildLoopiternMetadata(tokenId, rarity, origin);
    return Response.json(metadata, {
      headers: {
        "Content-Type": "application/json",
        // Rarity is immutable after mint — safe to cache forever once hit.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return Response.json(
      { error: `tokenId ${tokenId} is not minted (or the chain is unreachable)` },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
}
