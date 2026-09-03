/**
 * On-demand LOOPITERN still (Prompt K).
 *
 * GET /api/loopitern/{tokenId}/{rarity}/still → PNG
 *
 * Composes the recolored + shaded still server-side (sharp, shared module
 * `src/game/loopiternCompose.ts` — the same pipeline as
 * `scripts/compose-loopitern.ts`) on first request, caches it to
 * `public/loopiterns/generated/{rarity}/{tokenId}.png` so the static
 * `stillPath` URL serves it afterwards, and returns the PNG either way
 * (the write is best-effort; read-only hosts still get the image).
 *
 * tokenId is guarded to 1..10000 and rarity to 0..4.
 */

import {
  composeLoopiternStill,
  composeLoopiternStillCached,
} from "@/game/loopiternCompose";
import { parseLoopiternParams } from "@/game/loopiternMetadata";
import { LOOPITERN_STILL_HIRES_SIZE } from "@/game/loopiternStills";

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

  // `?size=1024` → native-resolution still (Prompt J5), composed on demand
  // and never cached to disk. Anything else serves the 512 still.
  const hiRes =
    new URL(req.url).searchParams.get("size") ===
    String(LOOPITERN_STILL_HIRES_SIZE);

  try {
    const png = hiRes
      ? (
          await composeLoopiternStill(parsed.tokenId, parsed.rarity, {
            size: LOOPITERN_STILL_HIRES_SIZE,
          })
        ).png
      : (await composeLoopiternStillCached(parsed.tokenId, parsed.rarity)).png;
    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        // (tokenId, rarity) → deterministic art; safe to cache forever.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return Response.json({ error: "composition failed" }, { status: 500 });
  }
}
