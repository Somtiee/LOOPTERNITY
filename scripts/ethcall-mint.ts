/**
 * Prove the full on-chain mint leg without spending anything:
 *
 *   1. get a run session from BASE (default: production),
 *   2. play it with the shared autopilot until a death that clears the
 *      Common score gate,
 *   3. claim a Common voucher once the wall-clock floor passes,
 *   4. eth_call mintWithVoucher(rarity, deadline, nonce, sig) with
 *      value = on-chain mintPrice, from the voucher's bound minter.
 *
 * eth_call is a free simulation — no gas, no nonce consumption, no state
 * change. If it returns a token id, the exact transaction a real wallet
 * would send succeeds on-chain.
 *
 * Run: npx tsx scripts/ethcall-mint.ts   (E2E_BASE_URL defaults to https://loopternity.xyz)
 */

import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import {
  BaseError,
  createPublicClient,
  decodeErrorResult,
  decodeFunctionResult,
  http,
  encodeFunctionData,
  type Address,
} from "viem";
import { ClimbSim } from "../src/game/sim/ClimbSim";
import { RARITIES } from "../src/game/mintTiers";
import { createInputRecorder } from "../src/game/sim/inputLog";
import { SIM_HZ } from "../src/game/sim/simMath";
import { VANILLA_MODIFIERS } from "../src/game/traits";
import { ACTIVE_CHAIN_ID, ROBINHOOD_RPC_URL } from "../src/web3/config";
import type { ThemeId } from "../src/game/types";
import { autopilotInputs } from "./autopilot";
import { loopiternsAbi } from "../src/web3/loopiterns/abi";

const BASE = process.env.E2E_BASE_URL ?? "https://loopternity.xyz";
const RPC = ROBINHOOD_RPC_URL;
const VOUCHER_DOMAIN = { name: "Loopiterns", version: "2" } as const;
// Throwaway minter bound into the voucher. eth_call impersonates it for free.
const MINTER: Address = "0x1111111111111111111111111111111111111111";

function envLocal(name: string): string | undefined {
  try {
    const raw = readFileSync(resolvePath(process.cwd(), ".env.local"), "utf8");
    const m = raw.match(new RegExp(`^${name}=(.*)$`, "m"));
    return m?.[1]?.trim().replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
}

const CONTRACT = (process.env.NEXT_PUBLIC_LOOPITERNS_ADDRESS ??
  envLocal("NEXT_PUBLIC_LOOPITERNS_ADDRESS")) as Address | undefined;

if (!CONTRACT || !/^0x[0-9a-fA-F]{40}$/.test(CONTRACT)) {
  console.error("FAIL: no NEXT_PUBLIC_LOOPITERNS_ADDRESS");
  process.exit(1);
}

function fail(msg: string): never {
  console.error(`\nFAIL: ${msg}`);
  process.exit(1);
}

/**
 * Turn a viem call error back into the contract's own custom error name.
 * Without this, a rejected mint surfaces as "Execution reverted for an unknown
 * reason" — which hides the one thing worth knowing: WHICH check refused it
 * (BadVoucher vs WrongPrice vs WalletCap …).
 */
function decodeRevert(err: unknown): string {
  if (!(err instanceof BaseError)) return "not a viem error";
  const raw = err.walk(
    (e) => typeof (e as { data?: unknown }).data === "string",
  ) as { data?: `0x${string}` } | null;
  const data = raw?.data;
  if (!data || data === "0x") return "reverted with no data (no custom error)";
  try {
    return `${decodeErrorResult({ abi: loopiternsAbi, data }).errorName}()`;
  } catch {
    return `undecodable revert data ${data.slice(0, 10)}`;
  }
}

async function postJson(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

void (async () => {
  console.log(`mint-leg simulation against ${BASE}`);
  console.log(`contract ${CONTRACT} (chain ${ACTIVE_CHAIN_ID})`);

  const client = createPublicClient({ transport: http(RPC) });

  // --- 0. sanity: the public RPC + contract answer -------------------------
  const [mintPrice, remainingAll, totalSupply, paused] =
    await Promise.all([
      client.readContract({
        address: CONTRACT,
        abi: loopiternsAbi,
        functionName: "mintPrice",
      }),
      client.readContract({
        address: CONTRACT,
        abi: loopiternsAbi,
        functionName: "remainingAll",
      }),
      client.readContract({
        address: CONTRACT,
        abi: loopiternsAbi,
        functionName: "totalSupply",
      }),
      client.readContract({
        address: CONTRACT,
        abi: loopiternsAbi,
        functionName: "paused",
      }),
    ]);
  console.log(
    `  RPC ok — mintPrice ${mintPrice} wei, totalSupply ${totalSupply}, paused ${paused}, remaining [${remainingAll.join(", ")}]`,
  );

  // --- 1. session -----------------------------------------------------------
  const issuedAt = Date.now();
  const seedRes = await postJson("/api/loopitern/run-seed", {});
  if (seedRes.status !== 201) fail(`run-seed ${seedRes.status}: ${JSON.stringify(seedRes.json)}`);
  const session = seedRes.json as { sessionId: string; seed: number; themeId: ThemeId };
  console.log(`  session ${session.sessionId} (seed ${session.seed}, ${session.themeId})`);

  // --- 2. autopilot run clearing the Common score gate -----------------------
  let log;
  let score: number;
  let timeSurvived: number;
  for (let attempt = 1; ; attempt++) {
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
    console.log(
      `  attempt ${attempt}: ${sim.time.toFixed(3)}s, score ${sim.score()} (${session.themeId})`,
    );
    if (sim.score() >= RARITIES[0].minScore) {
      log = rec.finish(sim.tick, sim.width, sim.height);
      score = sim.score();
      timeSurvived = sim.time;
      break;
    }
    if (attempt >= 25) fail("no gate-clearing autopilot run in 25 sessions");
    const r = await postJson("/api/loopitern/run-seed", {});
    if (r.status !== 201) fail(`run-seed ${r.status}`);
    Object.assign(session, r.json);
  }

  // --- 3. wait out the Common wall-clock floor (ceil(30s × 0.4)), then claim -
  const waitS = Math.max(0, 12 - (Date.now() - issuedAt) / 1000);
  if (waitS > 0) {
    console.log(`  waiting ${waitS.toFixed(1)}s for the wall-clock floor…`);
    await new Promise((r) => setTimeout(r, waitS * 1000 + 500));
  }
  const v = await postJson("/api/loopitern/voucher", {
    address: MINTER,
    rarity: 0,
    score,
    timeSurvived,
    sessionId: session.sessionId,
    inputLog: log,
  });
  if (v.status !== 200) fail(`voucher ${v.status}: ${JSON.stringify(v.json)}`);
  const voucher = v.json as { deadline: string; nonce: string; signature: `0x${string}` };
  console.log(`  voucher ok {deadline ${voucher.deadline}, nonce ${voucher.nonce}}`);

  // --- 4. eth_call the exact mint transaction --------------------------------
  const data = encodeFunctionData({
    abi: loopiternsAbi,
    functionName: "mintWithVoucher",
    args: [
      0,
      BigInt(voucher.deadline),
      BigInt(voucher.nonce),
      voucher.signature,
    ],
  });
  try {
    // client.call returns { data } — the RAW return data, not a decoded value.
    // Decode it through the ABI or the token id prints as [object Object].
    const { data: returnData } = await client.call({
      to: CONTRACT,
      data,
      account: MINTER,
      value: mintPrice,
      chain: null,
    } as Parameters<typeof client.call>[0]);
    const tokenId = decodeFunctionResult({
      abi: loopiternsAbi,
      functionName: "mintWithVoucher",
      data: returnData ?? "0x",
    });
    console.log(
      `\nPASS: eth_call mintWithVoucher succeeded — the real transaction would mint token id ${tokenId}.`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(`eth_call mintWithVoucher reverted: ${msg} [${decodeRevert(err)}]`);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
