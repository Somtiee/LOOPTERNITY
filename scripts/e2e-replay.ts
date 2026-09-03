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
 *   A. Old console bypass: fresh session + timeSurvived 9999 + garbage log
 *      → 403 (wall-clock gate fires first, exactly as before).
 *   B. Autopilot run ≥ 31s on a server-issued session (new sessions until
 *      one survives — the seed is the server's, the inputs are "played").
 *   C. Garbage inputLog after the wall clock has passed → 403 "no valid
 *      run record".
 *   D. Doctored-but-valid logs (single axis flip / all axis zeroed) with the
 *      honest claimed time → 403 (replay diverges or dies early).
 *   E. The honest log → 200, and the signature recovers to the deploy's
 *      MINT_SIGNER address.
 */

import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { hashTypedData, recoverAddress } from "viem";
import { ClimbSim } from "../src/game/sim/ClimbSim";
import {
  createInputRecorder,
  type RunInputLog,
} from "../src/game/sim/inputLog";
import { SIM_HZ } from "../src/game/sim/simMath";
import { VANILLA_MODIFIERS } from "../src/game/traits";
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
const ROBINHOOD_CHAIN_ID = 4663;
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
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
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
  };
}

void (async () => {
// --- A. old console bypass (fresh session, absurd claim, garbage log) ------

console.log(`E2E against ${BASE}\n`);
console.log("A. console bypass: fresh session + timeSurvived 9999 + garbage log");
{
  const session = await requestSession();
  const { status, json } = await postJson("/api/loopitern/voucher", {
    address: MINTER,
    rarity: 4, // Legendary
    timeSurvived: 9999,
    sessionId: session.sessionId,
    inputLog: { v: 1, ticks: 10, width: 720, height: 720, axis: [], boost: [], freeze: [], tsunami: [] },
  });
  assert(status === 403, `expected 403, got ${status}: ${JSON.stringify(json)}`);
  console.log(`  → ${status} ${String(json.error)} ✓ (wall-clock gate fires first)`);
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
    timeSurvived: 60,
    sessionId: "2b7b6a30-1111-4d2f-9c66-000000000000",
    inputLog: { v: 1, ticks: 10, width: 720, height: 720, axis: [], boost: [], freeze: [], tsunami: [] },
  });
  assert(r3.status === 403, `garbage token expected 403, got ${r3.status}`);
  console.log(`  garbage sessionId   → ${r3.status} ${String(r3.json.error)} ✓`);
}

// --- B. honest autopilot run ≥ 31s on a server-issued session --------------

console.log("\nB. playing an attested run (new sessions until one survives ≥ 31s):");
let session: Session;
let log: RunInputLog;
let timeSurvived: number;
{
  let attempt = 0;
  for (;;) {
    attempt += 1;
    session = await requestSession();
    const run = playAutopilotRun(session);
    console.log(
      `  attempt ${attempt}: seed ${session.seed} (${session.themeId}) → ${run.timeSurvived.toFixed(3)}s`,
    );
    if (run.timeSurvived >= 31) {
      log = run.log;
      timeSurvived = run.timeSurvived;
      break;
    }
    if (attempt >= 25) fail("no session produced a ≥31s autopilot run in 25 tries");
  }
  console.log(
    `  session ${session.sessionId} seed ${session.seed}: honest ${timeSurvived.toFixed(3)}s run recorded (${log.ticks} ticks)`,
  );
}

// Wait out the wall-clock gate for the rarest claim below (Rare = 90s since
// issue; the honest Common claim only needs 30s, but D1/D3 mint Uncommon and
// Rare, and gate 2 checks the MINTED rarity).
{
  const elapsed = (Date.now() - session.issuedAt) / 1000;
  const waitS = Math.max(0, 90.5 - elapsed);
  if (waitS > 0) {
    console.log(`  waiting ${waitS.toFixed(1)}s for the wall-clock gate…`);
    await new Promise((r) => setTimeout(r, waitS * 1000));
  }
}

// --- C. garbage log after the clock has passed ------------------------------

console.log("\nC. garbage inputLog (clock already passed):");
{
  const { status, json } = await postJson("/api/loopitern/voucher", {
    address: MINTER,
    rarity: 0,
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
  // D1: claim a longer run than the log shows — the classic "I survived 90s".
  // The replay is authoritative: either the claim doesn't even unlock the
  // rarity, or |replay − claim| > 0.75s → no voucher either way.
  const r1 = await postJson("/api/loopitern/voucher", {
    address: MINTER,
    rarity: 1,
    timeSurvived: Math.max(timeSurvived + 5, 60.2),
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
  console.log(`  claim +5s over the log → ${r1.status} ${String(r1.json.error)} ✓`);

  // D2: strip all steering (valid shape, zero effort) + honest claimed time —
  // the replayed run dies early, so either the claim mismatches or the run
  // never reaches the gate.
  const passive: RunInputLog = { ...log, axis: [], boost: [] };
  const r2 = await postJson("/api/loopitern/voucher", {
    address: MINTER,
    rarity: 0,
    timeSurvived,
    sessionId: session.sessionId,
    inputLog: passive,
  });
  assert(r2.status === 403, `D2 expected 403, got ${r2.status}: ${JSON.stringify(r2.json)}`);
  console.log(`  strip all inputs     → ${r2.status} ${String(r2.json.error)} ✓`);

  // D3: overclaim rarity — a 79s run padded past the Rare (90s) gate.
  const r3 = await postJson("/api/loopitern/voucher", {
    address: MINTER,
    rarity: 2, // Rare (90s) claimed on a sub-90s run
    timeSurvived: 90.2, // padded past the gate
    sessionId: session.sessionId,
    inputLog: log,
  });
  assert(r3.status === 403, `D3 expected 403, got ${r3.status}: ${JSON.stringify(r3.json)}`);
  assert(
    typeof r3.json.error === "string" &&
      (r3.json.error.includes("mismatch") ||
        r3.json.error.includes("not unlocked")),
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
        chainId: ROBINHOOD_CHAIN_ID,
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
