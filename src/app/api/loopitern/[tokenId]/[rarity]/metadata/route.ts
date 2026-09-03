/**
 * LOOPITERN ERC-721 metadata, client-known rarity (Prompt K).
 *
 * GET /api/loopitern/{tokenId}/{rarity}/metadata → ERC-721 metadata JSON
 *
 * Called by the client after mint, when (tokenId, rarity) are known from the
 * Minted event. Marketplaces fetching `tokenURI()` do NOT know the rarity —
 * they hit `/api/loopitern/token/[tokenId]` instead (see that route for the
 * `setBaseURI` call the owner must run after deploy).
 *
 * tokenId is guarded to 1..10000 and rarity to 0..4.
 */

import { buildLoopiternMetadata, parseLoopiternParams } from "@/game/loopiternMetadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tokenId: string; rarity: string }> },
) {
  const { tokenId, rarity } = await params;
  const parsed = parseLoopiternParams(tokenId, rarity);
  if (!parsed) {
    return Response.json(
      { error: "tokenId must be 1..10000 and rarity 0..4" },
      { status: 400 },
    );
  }

  const origin = new URL(req.url).origin;
  const metadata = buildLoopiternMetadata(parsed.tokenId, parsed.rarity, origin);
  return Response.json(metadata, {
    headers: {
      "Content-Type": "application/json",
      // (tokenId, rarity) → deterministic DNA; safe to cache forever.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
