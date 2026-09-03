"use client";

import type { ThemeId } from "@/game/types";

/**
 * A P2M run session issued by POST /api/loopitern/run-seed.
 *
 * The sessionId is a server-signed token (opaque to us — the server verifies
 * its HMAC at mint time) that pins the run's seed, theme, and issue time.
 * The seed is public on purpose: the client's ClimbSim is constructed with
 * it, and knowing it doesn't help forge a *winning* input log — the server
 * replays the log through the same sim and only signs what actually
 * survives the rarity gate.
 */
export type RunSession = {
  sessionId: string;
  seed: number;
  themeId: ThemeId;
};

/** base64url payload "." base64url HMAC — what the server issues. */
const SESSION_ID_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export async function requestRunSession(
  address?: string,
): Promise<RunSession | null> {
  try {
    const res = await fetch("/api/loopitern/run-seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(address ? { address } : {}),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<RunSession> | null;
    if (
      !data ||
      typeof data.sessionId !== "string" ||
      !SESSION_ID_RE.test(data.sessionId) ||
      typeof data.seed !== "number" ||
      !Number.isInteger(data.seed) ||
      (data.themeId !== "volcanic" &&
        data.themeId !== "planetary" &&
        data.themeId !== "antarctica")
    ) {
      return null;
    }
    return {
      sessionId: data.sessionId,
      seed: data.seed,
      themeId: data.themeId,
    };
  } catch {
    return null;
  }
}
