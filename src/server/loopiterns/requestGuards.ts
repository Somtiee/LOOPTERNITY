/**
 * Request guards for the public P2M API routes (voucher + run-seed).
 *
 * Lives outside the route files (Next.js route modules may only export
 * handlers + config) and is server-only: imports node:crypto only, never
 * anything the client bundle can pull in.
 *
 * Two guards, in the order they run:
 *
 *   1. BODY SIZE — the raw body is read capped (`readJsonBody`), so a
 *      multi-megabyte payload is refused at the byte level before
 *      JSON.parse ever sees it. Content-Length is checked first (cheap,
 *      catches the honest case), but a chunked upload that lies about its
 *      size is caught by the streaming read itself.
 *
 *   2. RATE LIMIT — fixed-window counters per key (client IP, minter
 *      address, or a global backstop bucket). In-memory on purpose: there
 *      is no durable store on the serverless filesystem, and these routes
 *      are stateless by design (see sessionStore.ts). On Vercel each
 *      function instance keeps its own window, so the effective limit is
 *      per-instance, not global — honest best-effort against a hammering
 *      client, cheap to run, no new infrastructure, no new secrets.
 *      Vercel's edge/WAF can layer a hard global limit on top later.
 *
 * Usage pattern in a route:
 *
 *   const limited = rateLimit({ key: `ip:${ip}`, max: 10, windowMs: 60_000 });
 *   if (!limited.ok) return json429(limited.retryAfterSeconds);
 *   const body = await readJsonBody(req, MAX_BODY_BYTES);
 *   if (body.error === "too-large") return … 413;
 *   if (body.error === "bad-json") return … 400;
 */

/* ------------------------------------------------------------------ */
/* Body size                                                           */
/* ------------------------------------------------------------------ */

export type JsonBody =
  | { ok: true; value: unknown }
  | { ok: false; error: "too-large" | "bad-json" };

/**
 * Read at most `maxBytes` from the request body and JSON.parse it.
 * Never allocates more than maxBytes + one chunk: the stream read stops
 * (and the connection is cancelled) as soon as the cap is exceeded.
 */
export async function readJsonBody(
  req: Request,
  maxBytes: number,
): Promise<JsonBody> {
  const declared = req.headers.get("content-length");
  if (declared !== null) {
    const n = Number(declared);
    if (Number.isFinite(n) && n > maxBytes) {
      return { ok: false, error: "too-large" };
    }
  }

  let text: string | null;
  try {
    text = await readCappedText(req, maxBytes);
  } catch {
    return { ok: false, error: "too-large" };
  }
  if (text === null) return { ok: false, error: "too-large" };

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, error: "bad-json" };
  }
}

/** Capped stream read. Returns null when the body exceeded `maxBytes`. */
async function readCappedText(
  req: Request,
  maxBytes: number,
): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        // Cancel the underlying connection — we are not reading the rest.
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  }
  const merged = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    merged.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

/* ------------------------------------------------------------------ */
/* Rate limiting                                                       */
/* ------------------------------------------------------------------ */

type Window = { start: number; count: number };

/** key → current fixed window. Bounded by MAX_TRACKED_KEYS (see eviction). */
const windows = new Map<string, Window>();

/**
 * Hard ceiling on tracked keys. Every distinct (key) gets a Map entry; a
 * spoofed-IP flood would otherwise grow the Map without bound — the exact
 * memory leak the body cap exists to prevent, one level up. When the
 * ceiling is hit the whole map is reset (cheap, and an attacker holding
 * 10k keys has already been limited 10k times this hour).
 */
const MAX_TRACKED_KEYS = 10_000;

/** Janitor pass cadence — windows are swept on a timer, not per request. */
const SWEEP_EVERY_MS = 60_000;
const lastSweep = { at: 0 };

export type RateDecision =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

/**
 * Fixed-window rate limit: allow at most `max` requests per `windowMs`
 * for `key`. Passes are counted only — never un-counted — so a rejected
 * request still spends budget, which is the point under abuse.
 */
export function rateLimit(opts: {
  key: string;
  max: number;
  windowMs: number;
}): RateDecision {
  const now = Date.now();
  sweepStaleWindows(now);

  const existing = windows.get(opts.key);
  if (!existing || now - existing.start >= opts.windowMs) {
    if (windows.size >= MAX_TRACKED_KEYS) windows.clear();
    windows.set(opts.key, { start: now, count: 1 });
    return { ok: true };
  }
  existing.count += 1;
  if (existing.count > opts.max) {
    const retryAfterMs = existing.start + opts.windowMs - now;
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }
  return { ok: true };
}

function sweepStaleWindows(now: number): void {
  if (now - lastSweep.at < SWEEP_EVERY_MS) return;
  lastSweep.at = now;
  // Any window older than 10 minutes is unreachable by every limit this
  // module is used with — drop it.
  const cutoff = now - 10 * 60 * 1000;
  for (const [key, win] of windows) {
    if (win.start < cutoff) windows.delete(key);
  }
}

/* ------------------------------------------------------------------ */
/* Client identity                                                     */
/* ------------------------------------------------------------------ */

/**
 * Best-effort client IP for rate-limit keys. On Vercel the proxy layer
 * sets x-forwarded-for; the first entry is the originating client. Behind
 * no proxy it's null — the caller falls back to a shared bucket, which
 * still throttles a flood (one bucket) at the cost of some shared-IP
 * collateral.
 */
export function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return null;
}
