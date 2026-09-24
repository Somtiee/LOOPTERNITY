/**
 * GET /api/loopiterns/stats — live collection figures for the mint page.
 *
 * The public /LOOPITERNS page renders its initial figures server-side and
 * then polls this route, so the numbers keep moving as people mint instead
 * of freezing at whatever they were when the page was built.
 *
 * Returns the CollectionStats shape from src/server/loopiterns/collectionStats.ts
 * (see that file for the honesty rules around failed reads). Never 500s on an
 * RPC failure — it returns ok:false with null figures, which the page renders
 * as placeholders rather than a wrong number.
 */

import { NextResponse } from "next/server";
import { getCollectionStats } from "@/server/loopiterns/collectionStats";
import { clientIp, rateLimit } from "@/server/loopiterns/requestGuards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The page polls on a 30s interval; 90/min leaves room for several tabs and
 * a few reloads without letting one client hammer the RPC through us.
 */
const RATE_LIMIT = { max: 90, windowMs: 60_000 };

/** Shared-cache window, so a crowd on the page costs one RPC read per 15s. */
const CACHE_CONTROL = "public, max-age=0, s-maxage=15, stale-while-revalidate=45";

export async function GET(req: Request) {
  const ip = clientIp(req);
  const limited = rateLimit({
    key: `loopiterns-stats:ip:${ip ?? "unknown"}`,
    max: RATE_LIMIT.max,
    windowMs: RATE_LIMIT.windowMs,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSeconds) },
      },
    );
  }

  const stats = await getCollectionStats();
  return NextResponse.json(stats, {
    headers: { "Cache-Control": CACHE_CONTROL },
  });
}
