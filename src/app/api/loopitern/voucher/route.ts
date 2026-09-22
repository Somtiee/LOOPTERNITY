/**
 * LOOPITERNS mint voucher signer (v2 voucher-gated mint).
 *
 * POST /api/loopitern/voucher
 *   body: { address, rarity, score, timeSurvived, sessionId, inputLog }
 *   →     { deadline, nonce, signature }
 *
 * A client-sent score is spoofable, so the chain requires a server-signed
 * voucher. Three server-side gates stand between a claim and a signature:
 *
 *   1. claimed score vs the rarity gates (SCORE 15_000/25_000/35_000/
 *      45_000/60_000 — same numbers the client honors)
 *   2. run session wall clock (sanity floor only): POST /api/loopitern/
 *      run-seed pins a seed at run start; some real fraction of the tier's
 *      old gate time must have passed since, so a fabricated 2-minute log
 *      can't be POSTed the instant a session is issued
 *   3. REPLAY (the real gate): the client records every input it fed the
 *      deterministic ClimbSim; this route re-runs that log through the
 *      identical sim (same seed, same theme, P2M constants) and only signs
 *      if the replayed run genuinely ends in death with a REPLAYED score
 *      at or above the tier's gate. Posting { score: 999999 } from a
 *      console buys nothing — the replayed score is the authority.
 *
 * The voucher itself is EIP-712 bound to (minter, rarity, deadline, nonce,
 * chainId, contract); the contract's ecrecover check plus the single-use
 * nonce makes it unforgeable and unreplayable. The nonce is derived
 * deterministically from the run session, so ONE RUN = ONE MINT on chain:
 * a second voucher for the same session reuses its nonce and the contract
 * reverts the second mint with `UsedNonce` (no server storage needed).
 *
 * Honesty rules:
 *   - contract not configured (NEXT_PUBLIC_LOOPITERNS_ADDRESS empty/zero)
 *     → 503, never a signed voucher
 *   - VOUCHER_SIGNER_PRIVATE_KEY missing (server-only, gitignored)
 *     → 503, never a fake signature
 *   - rarity not unlocked by the REPLAYED score → 403
 *   - rarity out of range / bad address / bad log → 400 or 403
 *
 * Live chain: Robinhood Chain mainnet (4663). The voucher is signed with
 * chainId = ACTIVE_CHAIN_ID because Loopiterns.sol rebuilds the domain from
 * the `chainid()` opcode at verify time — signing any other chain id makes
 * every mint revert BadVoucher. Note the EIP-712 DOMAIN_VERSION stays "2"
 * (Loopiterns.sol:131) while the deployed contract is generation v3: the
 * generation and the domain version are different things, and "fixing" the
 * version here to match the generation would break every signature.
 *
 * VOUCHER_SIGNER_PRIVATE_KEY must be the key whose address was passed as
 * MINT_SIGNER_ADDRESS to the deploy. It is UNCHANGED across the Arc →
 * Robinhood pivot: the live v3 contract at
 * 0xF1d6AD543a47D84d5C624f80C0F22395BF524175 (4663) has mintSigner
 * 0x486eCE21831ffa07661EF745746e2ec47a486222 — the same signer the retired
 * v2 used. It is server-only: never NEXT_PUBLIC_, never committed, never
 * returned in any response.
 */

import { getAddress, hashTypedData, recoverAddress } from "viem";
import { privateKeyToAddress, signTypedData } from "viem/accounts";
import { NextResponse } from "next/server";
import { getLoopiternsAddress } from "@/web3/loopiterns/address";
import { ACTIVE_CHAIN_ID } from "@/web3/config";
import { highestRarityForScore, isLoopiternRarityId, rarityById } from "@/game/mintTiers";
import { VANILLA_MODIFIERS } from "@/game/traits";
import { parseRunInputLog } from "@/game/sim/inputLog";
import { replayRun } from "@/game/sim/replay";
import { validateRunSession, sessionVoucherNonce } from "@/server/loopiterns/sessionStore";
import { clientIp, rateLimit, readJsonBody } from "@/server/loopiterns/requestGuards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Request-shape limits (see requestGuards.ts). A legitimate voucher body is
 * the recorded input log, which grows ~1.2 KB per second of run (a 30s run
 * is ~35 KB, a 150s Legendary run ~180 KB, the 600s hard sim cap ~730 KB) —
 * so the cap sits at 1 MB: every honest log fits with headroom, and anything
 * past it is abuse or a broken client, refused before the replay sim runs.
 * The replay itself is CPU-bound (up to 36k sim ticks), so the per-IP limit
 * is deliberately tight: one voucher request per run is the honest rate.
 */
const MAX_BODY_BYTES = 1024 * 1024;
const RATE_LIMIT = { max: 6, windowMs: 60_000 };


/** Voucher lifetime. The client mints immediately after receiving it. */
const VOUCHER_TTL_SECONDS = 600;

/**
 * Session wall-clock floor, as a fraction of the tier's old survival gate
 * (minSeconds). NOT a rarity gate — the replayed score decides rarity.
 * This only stops a fabricated log from being POSTed the instant a session
 * is issued. The fraction must stay below the fastest honest crossing: a
 * maximally active run (boost uptime, dense near misses, constant steering)
 * scores ~1.6-1.8× the distance-only rate, so a Legendary gate can be
 * honestly crossed in ~65-70s of real play — 0.4 keeps the floor under
 * that for every tier.
 */
const WALL_CLOCK_FLOOR_FACTOR = 0.4;

/**
 * How far the client's claimed score may drift from the replayed score
 * before we call it a doctored claim. Both are computed by the same
 * deterministic sim from the same log, so honest runs match to the point
 * (~6 score per sim tick of boundary noise); 60 ≈ a tenth of a second of
 * climb. The replayed score — not the claim — is the authority.
 */
const SCORE_MATCH_TOLERANCE = 60;

/** Must match Loopiterns.sol EIP-712 domain + VOUCHER_TYPEHASH. */
const VOUCHER_DOMAIN = {
  name: "Loopiterns",
  version: "2",
} as const;
const VOUCHER_TYPES = {
  LoopiternsVoucher: [
    { name: "minter", type: "address" },
    { name: "rarity", type: "uint8" },
    { name: "deadline", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

function getVoucherSignerKey(): `0x${string}` | undefined {
  const raw = process.env.VOUCHER_SIGNER_PRIVATE_KEY?.trim();
  if (!raw) return undefined;
  const withPrefix = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(withPrefix)) return undefined;
  return withPrefix as `0x${string}`;
}

export async function POST(req: Request) {
  const contract = getLoopiternsAddress();
  if (!contract) {
    return NextResponse.json(
      { error: "LOOPITERNS contract not deployed (no address configured)" },
      { status: 503 },
    );
  }

  const privateKey = getVoucherSignerKey();
  if (privateKey === undefined) {
    return NextResponse.json(
      { error: "Voucher signing is not configured (VOUCHER_SIGNER_PRIVATE_KEY missing)" },
      { status: 503 },
    );
  }
  const mintSigner = privateKeyToAddress(privateKey);

  // Rate limit before any expensive work (JSON parse, replay sim).
  // Per-instance best-effort on serverless — see requestGuards.ts.
  const ip = clientIp(req);
  const limited = rateLimit({
    key: ip ? `voucher:ip:${ip}` : "voucher:ip:unknown",
    max: RATE_LIMIT.max,
    windowMs: RATE_LIMIT.windowMs,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many mint requests — wait a moment and retry." },
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
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const rec = body.value && typeof body.value === "object"
    ? (body.value as Record<string, unknown>)
    : {};

  const addressRaw = typeof rec.address === "string" ? rec.address.trim() : "";
  if (!/^0x[0-9a-fA-F]{40}$/.test(addressRaw)) {
    return NextResponse.json({ error: "bad address" }, { status: 400 });
  }
  const minter = getAddress(addressRaw);

  const rarity = Number(rec.rarity);
  if (!Number.isInteger(rarity) || !isLoopiternRarityId(rarity)) {
    return NextResponse.json({ error: "bad rarity" }, { status: 400 });
  }

  const score = Number(rec.score);
  if (!Number.isFinite(score) || score < 0) {
    return NextResponse.json({ error: "bad score" }, { status: 400 });
  }
  const timeSurvived = Number(rec.timeSurvived);
  if (!Number.isFinite(timeSurvived) || timeSurvived < 0) {
    return NextResponse.json({ error: "bad timeSurvived" }, { status: 400 });
  }

  // Server-side gate 1: only sign for a rarity the run CLAIMS to have
  // reached (SCORE gates — same as the client honors). The claim is just a
  // shape check; the replay below is the authority.
  const unlocked = highestRarityForScore(score);
  if (!unlocked || rarity > unlocked.id) {
    return NextResponse.json(
      {
        error: unlocked
          ? `rarity ${rarity} not unlocked — this run reached ${unlocked.name}`
          : "reach the Common score gate to unlock a mint",
      },
      { status: 403 },
    );
  }

  const mintedRarity = rarityById(rarity);
  if (!mintedRarity) {
    return NextResponse.json({ error: "bad rarity" }, { status: 400 });
  }

  // Server-side gate 2 (wall-clock sanity floor, NOT the rarity gate): the
  // session was issued when the run started; some real fraction of the
  // tier's old gate time must have passed since — a fabricated 2-minute
  // log can't be POSTed instantly. Gate on the MINTED rarity, not just the
  // claimed one.
  const wallClockFloor = Math.ceil(mintedRarity.minSeconds * WALL_CLOCK_FLOOR_FACTOR);
  const sessionCheck = validateRunSession(rec.sessionId, wallClockFloor);
  if (!sessionCheck.ok) {
    return NextResponse.json({ error: sessionCheck.error }, { status: 403 });
  }

  // Server-side gate 3 (the real one): replay the recorded run. The client
  // logged every input it fed its ClimbSim; we re-run that exact log
  // through the identical deterministic sim seeded with the session's
  // pinned seed and theme. The replay — not the claim — decides.
  const inputLog = parseRunInputLog(rec.inputLog);
  if (!inputLog) {
    return NextResponse.json(
      { error: "run replay failed — no valid run record; play the run, then mint" },
      { status: 403 },
    );
  }
  const replay = replayRun({
    seed: sessionCheck.session.seed,
    themeId: sessionCheck.session.themeId,
    difficultyId: "medium", // P2M constant
    modifiers: VANILLA_MODIFIERS, // P2M constant
    width: inputLog.width,
    height: inputLog.height,
    log: inputLog,
  });
  if (replay.phase !== "gameover") {
    // The claimed death never happened in the replay — a truncated or
    // fabricated log.
    return NextResponse.json(
      { error: "run replay failed — play the run, then mint" },
      { status: 403 },
    );
  }
  // Desync canaries: both values come from the same deterministic sim, so
  // an honest claim matches the replay to the tick.
  if (Math.abs(replay.timeSurvived - timeSurvived) > 0.75) {
    return NextResponse.json(
      { error: "run replay mismatch — play the run, then mint" },
      { status: 403 },
    );
  }
  if (Math.abs(replay.score - score) > SCORE_MATCH_TOLERANCE) {
    return NextResponse.json(
      { error: "run replay mismatch — play the run, then mint" },
      { status: 403 },
    );
  }
  // The rarity decision: the REPLAYED score must reach the gate.
  if (replay.score < mintedRarity.minScore) {
    return NextResponse.json(
      {
        error: `run replay scored ${Math.floor(replay.score)} — the ${mintedRarity.name} gate is ${mintedRarity.minScore}. Playing is the only way.`,
      },
      { status: 403 },
    );
  }

  // Everything below is server-generated; the caller controls none of it.
  const deadline = BigInt(Math.floor(Date.now() / 1000) + VOUCHER_TTL_SECONDS);
  // Deterministic nonce derived from the run session. This is what makes a
  // run single-mint on chain with zero server state: every voucher for the
  // same session carries the same nonce, so the retry-after-stuck-tx that
  // once minted twice now reverts with `UsedNonce` on the second mint. A
  // wallet rejection changes nothing (the nonce is only consumed by a
  // successful mint) and a re-request after expiry just gets a fresh
  // deadline over the same nonce. Never 0 — the contract rejects zero.
  const nonce = sessionVoucherNonce(rec.sessionId);
  if (nonce === null) {
    return NextResponse.json(
      { error: "voucher nonce unavailable — bad session" },
      { status: 403 },
    );
  }

  // EIP-712 sign via viem — same digest layout the contract reconstructs
  // (domain "Loopiterns"/"2"/chainId/contract + VOUCHER_TYPEHASH), 65-byte
  // r ‖ s ‖ v (v = 27/28) for the contract's ecrecover(r, s, v).
  const signature = await signTypedData({
    domain: {
      ...VOUCHER_DOMAIN,
      chainId: ACTIVE_CHAIN_ID,
      verifyingContract: contract,
    },
    types: VOUCHER_TYPES,
    primaryType: "LoopiternsVoucher",
    message: { minter, rarity, deadline, nonce },
    privateKey,
  });
  // Self-check: if viem and the contract ever disagree on the digest
  // layout, minting breaks silently for every player. Refuse to sign
  // instead of emitting a voucher the chain will reject.
  const recovered = await recoverAddress({
    hash: hashTypedData({
      domain: {
        ...VOUCHER_DOMAIN,
        chainId: ACTIVE_CHAIN_ID,
        verifyingContract: contract,
      },
      types: VOUCHER_TYPES,
      primaryType: "LoopiternsVoucher",
      message: { minter, rarity, deadline, nonce },
    }),
    signature,
  });
  if (recovered?.toLowerCase() !== mintSigner.toLowerCase()) {
    return NextResponse.json(
      { error: "voucher signer self-check failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    deadline: deadline.toString(),
    nonce: nonce.toString(),
    signature,
  });
}
