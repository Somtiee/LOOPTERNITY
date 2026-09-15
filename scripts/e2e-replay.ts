/**
 * Dev-server E2E for the replay-verified P2M mint (run against `next dev`).
 *
 * Run:
 *   1. npm run dev            (in another terminal)
 *   2. npx tsx scripts/e2e-replay.ts
 *
 * Optional env: E2E_BASE_URL (default http://localhost:3000).
 *
 * Paths exercised — every cheat route must end in 403, only the honest one
 * in a signature:
 *
 *   A. Old console bypass: fresh session + score 999999 + garbage log
 *      → 403 (wall-clock floor fires first, exactly as before).
 *   B. Autopilot run reaching the Common score gate on a server-issued
 *      session (new sessions until one does — the seed is the server's,
 *      the inputs are "played").
 *   C. Garbage inputLog after the wall clock has passed → 403 "no valid
 *      run record".
 *   D. Doctored-but-valid claims/logs (padded score / all inputs zeroed /
 *      overclaimed rarity) → 403 (replay diverges or scores under the gate).
 *   E. The honest log → 200, and the signature recovers to the deploy's
 *      MINT_SIGNER address.
 */

import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { hashTypedData, recoverAddress } from "viem";
import { ClimbSim } from "../src/game/sim/ClimbSim";
import { RARITIES } from "../src/game/mintTiers";
import { formatScore } from "../src/game/score";
import {
  createInputRecorder,
  type RunInputLog,
} from "../src/game/sim/inputLog";
import { SIM_HZ } from "../src/game/sim/simMath";
import { VANILLA_MODIFIERS } from "../src/game/traits";
import { ARC_CHAIN_ID } from "../src/web3/config";
import type { ThemeId } from "../src/game/types";
import { autopilotInputs } from "./autopilot";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
/** The v2 deploy's MINT_SIGNER (public on-chain value, not a secret). */
const EXPECTED_MINT_SIGNER = "0x486eCE21831ffa07661EF745746e2ec47a486222";

/** Read a var from .env.local (value stays in memory, never printed). */
function envLocal(name: string): string | undefined {
  try {
    const raw = readFileSync(resolvePath(process.cwd(), ".env.local"), "utf8");
    const m = raw.match(new RegExp(`^${name}=(.*)$`, "m"));
    return m?.[1]?.trim().replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
}
const VOUCHER_DOMAIN = { name: "Loopiterns", version: "2" } as const;
const VOUCHER_TYPES = {
  LoopiternsVoucher: [
    { name: "minter", type: "address" },
    { name: "rarity", type: "uint8" },
    { name: "deadline", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
} as const;
// Throwaway minter — the voucher binds whatever address is posted.
const MINTER = "0x1111111111111111111111111111111111111111";

function fail(msg: string): never {
  console.error(`\nFAIL: ${msg}`);
  process.exit(1);
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) fail(msg);
}

async function postJson(
  path: string,
  body: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  for (;;) {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    // The route rate-limits per IP (6/min). This script deliberately bursts
    // ~10 posts; wait out the window and retry — a 429 is not a verdict.
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? "10");
      console.log(`  (rate limited — waiting ${retryAfter}s)`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000 + 500));
      continue;
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, json };
  }
}

type Session = { sessionId: string; seed: number; themeId: ThemeId; issuedAt: number };

async function requestSession(): Promise<Session> {
  const { status, json } = await postJson("/api/loopitern/run-seed", {});
  assert(status === 201, `run-seed returned ${status}: ${JSON.stringify(json)}`);
  const s = json as Partial<Session>;
  assert(
    typeof s.sessionId === "string" &&
      typeof s.seed === "number" &&
      (s.themeId === "volcanic" ||
        s.themeId === "planetary" ||
        s.themeId === "antarctica"),
    `run-seed returned bad body: ${JSON.stringify(json)}`,
  );
  return {
    sessionId: s.sessionId!,
    seed: s.seed!,
    themeId: s.themeId!,
    issuedAt: Date.now(),
  };
}

/** Play an attested session with the autopilot and return the honest record. */
function playAutopilotRun(session: Session): {
  log: RunInputLog;
  timeSurvived: number;
  score: number;
} {
  const sim = new ClimbSim({
    seed: session.seed,
    width: 720,
    height: 720,
    themeId: session.themeId,
    difficultyId: "medium",
    modifiers: VANILLA_MODIFIERS,
  });
  const rec = createInputRecorder();
  let tick = 0;
  while (sim.phase === "playing" && tick < SIM_HZ * 600) {
    const inputs = autopilotInputs(sim);
    rec.record(tick, inputs);
    sim.step(inputs);
    tick += 1;
  }
  assert(sim.phase === "gameover", "autopilot run never died — bot too good?");
  return {
    log: rec.finish(sim.tick, sim.width, sim.height),
    timeSurvived: sim.time,
    score: sim.score(),
  };
}

void (async () => {
// --- A. old console bypass (fresh session, absurd claim, garbage log) ------

console.log(`E2E against ${BASE}\n`);
console.log("A. console bypass: fresh session + score 999999 + garbage log");
{
  const session = await requestSession();
  const { status, json } = await postJson("/api/loopitern/voucher", {
    address: MINTER,
    rarity: 4, // Legendary
    score: 999_999,
    timeSurvived: 9999,
    sessionId: session.sessionId,
    inputLog: { v: 1, ticks: 10, width: 720, height: 720, axis: [], boost: [], freeze: [], tsunami: [] },
  });
  assert(status === 403, `expected 403, got ${status}: ${JSON.stringify(json)}`);
  console.log(`  → ${status} ${String(json.error)} ✓ (wall-clock floor fires first)`);
}

// --- A2. tampered/unsigned session tokens -----------------------------------

console.log("\nA2. tampered session tokens:");
{
  const session = await requestSession();

  // Flip a character mid-signature — the HMAC must fail. (The token's last
  // char carries ignored base64 padding bits, so flip one that counts.)
  const dotIdx = session.sessionId.indexOf(".");
  const chars = session.sessionId.split("");
  const midSig = dotIdx + 10;
  chars[midSig] = chars[midSig] === "A" ? "B" : "A";
  const tampered = chars.join("");
  const r1 = await postJson("/api/loopitern/voucher", {
    address: MINTER,
    rarity: 0,
    score: 20_000,
    timeSurvived: 60,
    sessionId: tampered,
    inputLog: { v: 1, ticks: 10, width: 720, height: 720, axis: [], boost: [], freeze: [], tsunami: [] },
  });
  assert(r1.status === 403, `tampered token expected 403, got ${r1.status}`);
  assert(
    typeof r1.json.error === "string" &&
      (r1.json.error.includes("invalid") || r1.json.error.includes("bad sessionId")),
    `A2 tampered token unexpected error: ${JSON.stringify(r1.json)}`,
  );
  console.log(`  edited token        → ${r1.status} ${String(r1.json.error)} ✓`);

  // Hand-crafted "signed" token with a backdated iat (to pass the wall
  // clock) — the HMAC can't be forged without the server key.
  const fakePayload = Buffer.from(
    JSON.stringify({ v: 1, sid: "x", seed: 1, theme: "volcanic", iat: Date.now() - 999_999 }),
  ).toString("base64url");
  const r2 = await postJson("/api/loopitern/voucher", {
    address: MINTER,
    rarity: 0,
    score: 20_000,
    timeSurvived: 60,
    sessionId: `${fakePayload}.AAAA forgery`,
    inputLog: { v: 1, ticks: 10, width: 720, height: 720, axis: [], boost: [], freeze: [], tsunami: [] },
  });
  assert(r2.status === 403, `forged token expected 403, got ${r2.status}`);
  assert(
    typeof r2.json.error === "string" &&
      (r2.json.error.includes("bad sessionId") || r2.json.error.includes("invalid")),
    `A2 forged token unexpected error: ${JSON.stringify(r2.json)}`,
  );
  console.log(`  forged backdated    → ${r2.status} ${String(r2.json.error)} ✓`);

  // Nonce-free uuid garbage (old format) still rejected.
  const r3 = await postJson("/api/loopitern/voucher", {
    address: MINTER,
    rarity: 0,
    score: 20_000,
    timeSurvived: 60,
    sessionId: "2b7b6a30-1111-4d2f-9c66-000000000000",
    inputLog: { v: 1, ticks: 10, width: 720, height: 720, axis: [], boost: [], freeze: [], tsunami: [] },
  });
  assert(r3.status === 403, `garbage token expected 403, got ${r3.status}`);
  console.log(`  garbage sessionId   → ${r3.status} ${String(r3.json.error)} ✓`);
}

// --- B. honest autopilot run reaching the Common score gate -----------------

console.log(
  `\nB. playing an attested run (new sessions until one scores ≥ ${formatScore(RARITIES[0].minScore)}):`,
);
let session: Session;
let log: RunInputLog;
let score: number;
let timeSurvived: number;
{
  let attempt = 0;
  for (;;) {
    attempt += 1;
    session = await requestSession();
    const run = playAutopilotRun(session);
    console.log(
      `  attempt ${attempt}: seed ${session.seed} (${session.themeId}) → ${run.timeSurvived.toFixed(3)}s, score ${formatScore(run.score)}`,
    );
    if (run.score >= RARITIES[0].minScore) {
      log = run.log;
      score = run.score;
      timeSurvived = run.timeSurvived;
      break;
    }
    if (attempt >= 25) fail("no session produced a gate-clearing autopilot run in 25 tries");
  }
  console.log(
    `  session ${session.sessionId} seed ${session.seed}: honest run — score ${formatScore(score)} in ${timeSurvived.toFixed(3)}s (${log.ticks} ticks)`,
  );
}

// Wait out the wall-clock floor for the rarest claim below. The floor is
// ceil(minSeconds × 0.4) of the MINTED rarity: Rare (90s) → 36s since issue.
// The honest Common claim only needs 12s, but D1/D3 mint Uncommon (24s) and
// Rare (36s), and gate 2 checks the MINTED rarity.
{
  const elapsed = (Date.now() - session.issuedAt) / 1000;
  const waitS = Math.max(0, 36.5 - elapsed);
  if (waitS > 0) {
    console.log(`  waiting ${waitS.toFixed(1)}s for the wall-clock floor…`);
    await new Promise((r) => setTimeout(r, waitS * 1000));
  }
}

// --- C. garbage log after the clock has passed ------------------------------

console.log("\nC. garbage inputLog (clock already passed):");
{
  const { status, json } = await postJson("/api/loopitern/voucher", {
    address: MINTER,
    rarity: 0,
    score,
    timeSurvived,
    sessionId: session.sessionId,
    inputLog: { garbage: true },
  });
  assert(status === 403, `expected 403, got ${status}: ${JSON.stringify(json)}`);
  assert(
    typeof json.error === "string" && json.error.includes("no valid run record"),
    `unexpected error: ${JSON.stringify(json)}`,
  );
  console.log(`  → ${status} ${String(json.error)} ✓`);
}

// --- D. doctored logs --------------------------------------------------------

console.log("\nD. doctored claims and logs:");
{
  // D1: claim a higher score than the log produces — the classic padded
  // claim. The replay is authoritative: either |replay − claim| exceeds the
  // match tolerance, or the replayed score never reaches the gate → 403
  // either way.
  const r1 = await postJson("/api/loopitern/voucher", {
    address: MINTER,
    rarity: 1,
    score: Math.max(score + 5_000, 25_100), // padded past the Uncommon gate
    timeSurvived,
    sessionId: session.sessionId,
    inputLog: log,
  });
  assert(r1.status === 403, `D1 expected 403, got ${r1.status}: ${JSON.stringify(r1.json)}`);
  assert(
    typeof r1.json.error === "string" &&
      (r1.json.error.includes("mismatch") ||
        r1.json.error.includes("not unlocked")),
    `D1 unexpected error: ${JSON.stringify(r1.json)}`,
  );
  console.log(`  padded score +5_000  → ${r1.status} ${String(r1.json.error)} ✓`);

  // D2: strip all steering (valid shape, zero effort) + honest claim — the
  // replayed run scores far less (and usually dies early), so the replay
  // never reaches the gate.
  const passive: RunInputLog = { ...log, axis: [], boost: [] };
  const r2 = await postJson("/api/loopitern/voucher", {
    address: MINTER,
    rarity: 0,
    score,
    timeSurvived,
    sessionId: session.sessionId,
    inputLog: passive,
  });
  assert(r2.status === 403, `D2 expected 403, got ${r2.status}: ${JSON.stringify(r2.json)}`);
  console.log(`  strip all inputs     → ${r2.status} ${String(r2.json.error)} ✓`);

  // D3: overclaim rarity — a sub-gate run padded past the Rare score gate.
  const r3 = await postJson("/api/loopitern/voucher", {
    address: MINTER,
    rarity: 2, // Rare (35_000) claimed on a sub-gate run
    score: 35_100, // padded past the gate
    timeSurvived,
    sessionId: session.sessionId,
    inputLog: log,
  });
  assert(r3.status === 403, `D3 expected 403, got ${r3.status}: ${JSON.stringify(r3.json)}`);
  assert(
    typeof r3.json.error === "string" &&
      (r3.json.error.includes("mismatch") ||
        r3.json.error.includes("not unlocked") ||
        r3.json.error.includes("Playing is the only way")),
    `D3 unexpected error: ${JSON.stringify(r3.json)}`,
  );
  console.log(`  overclaimed rarity   → ${r3.status} ${String(r3.json.error)} ✓`);
}

// --- E. the honest log gets a valid voucher ---------------------------------

console.log("\nE. honest log → voucher:");
{
  const { status, json } = await postJson("/api/loopitern/voucher", {
    address: MINTER,
    rarity: 0,
    score,
    timeSurvived,
    sessionId: session.sessionId,
    inputLog: log,
  });
  assert(status === 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
  const deadline = String(json.deadline);
  const nonce = String(json.nonce);
  const signature = String(json.signature);
  assert(/^\d+$/.test(deadline) && /^\d+$/.test(nonce) && /^0x[0-9a-fA-F]{130}$/.test(signature), `bad voucher body: ${JSON.stringify(json)}`);

  const contract = (process.env.NEXT_PUBLIC_LOOPITERNS_ADDRESS ??
    envLocal("NEXT_PUBLIC_LOOPITERNS_ADDRESS")) as `0x${string}`;
  assert(/^0x[0-9a-fA-F]{40}$/.test(contract), "no NEXT_PUBLIC_LOOPITERNS_ADDRESS to verify the signature against");

  const recovered = await recoverAddress({
    hash: hashTypedData({
      domain: {
        ...VOUCHER_DOMAIN,
        chainId: ARC_CHAIN_ID,
        verifyingContract: contract,
      },
      types: VOUCHER_TYPES,
      primaryType: "LoopiternsVoucher",
      message: {
        minter: MINTER,
        rarity: 0,
        deadline: BigInt(deadline),
        nonce: BigInt(nonce),
      },
    }),
    signature: signature as `0x${string}`,
  });
  assert(
    recovered?.toLowerCase() === EXPECTED_MINT_SIGNER.toLowerCase(),
    `signature recovered to ${recovered}, expected ${EXPECTED_MINT_SIGNER}`,
  );
  console.log(`  → 200 voucher {deadline ${deadline}, nonce ${nonce}} signed by ${recovered} ✓`);
}

console.log("\nAll E2E checks passed: only the played run minted.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
