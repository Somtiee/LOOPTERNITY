/**
 * REAL-BROWSER E2E for the P2M replay-attested mint.
 *
 * Run:
 *   1. npm run dev            (in another terminal)
 *   2. npx tsx scripts/e2e-browser.ts
 *
 * Optional env: E2E_BASE_URL (default http://localhost:3000).
 *
 * This drives the actual production code path a player uses: real Chromium,
 * real RAF loop, real fixed-timestep accumulator, real input sampling, real
 * recorder — then takes the exact sessionId/inputLog/timeSurvived the page
 * holds after death and asks the voucher route to sign. If this passes, the
 * browser→server replay pipeline is proven end to end.
 *
 * Uses two dev-only handles (stripped from production builds):
 *   window.__loopiternGame  — the live Game (sim state + input)
 *   window.__loopiternP2m   — { runSession, runRecord } from GameApp
 */

import { chromium } from "playwright";
import { SIM_HZ } from "../src/game/sim/simMath";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const MINTER = "0x1111111111111111111111111111111111111111";

/**
 * Minimal EIP-1193 stub injected before app load. Web3Providers'
 * RestoreInjectedWallet sees eth_accounts return an address and auto-connects
 * the injected connector on chain 0x1237 (4663), exactly like a real MetaMask
 * session restored on Robinhood Chain.
 */
const WALLET_STUB = `
  Object.defineProperty(window, "ethereum", {
    value: {
      isMetaMask: true,
      request: async ({ method }) => {
        if (method === "eth_accounts" || method === "eth_requestAccounts")
          return ["${MINTER}"];
        if (method === "eth_chainId") return "0x1237";
        if (method === "net_version") return "4663";
        if (method === "wallet_getPermissions") return [];
        return null;
      },
      on() {},
      removeListener() {},
    },
    configurable: true,
  });
`;

function fail(msg: string): never {
  console.error(`\nFAIL: ${msg}`);
  process.exit(1);
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) fail(msg);
}

/** Autopilot in the PAGE context — same policy as scripts/autopilot.ts. */
const PAGE_AUTOPILOT = `
  const PLAYER_HALF = 14;
  const WALL_PAD = 24;
  const MIN_GAP = 56;
  const LOOK_AHEAD = 260;
  const STEER_GAIN = 90;
  window.__e2eDriving = true;
  const drive = () => {
    if (!window.__e2eDriving) return;
    const g = window.__loopiternGame;
    if (!g || !g.sim) { requestAnimationFrame(drive); return; }
    const sim = g.sim;
    if (sim.phase === "playing") {
      const p = sim.player;
      const px = p.x + PLAYER_HALF;
      const lo = WALL_PAD, hi = sim.width - WALL_PAD;
      const spans = [];
      for (const o of sim.obstacles) {
        const r = sim.obstacleRect(o);
        if (r.y + r.h < p.y - 20 || r.y > p.y + LOOK_AHEAD) continue;
        spans.push([r.x, r.x + r.w]);
      }
      for (const e of sim.enemies) {
        if (e.y + e.h < p.y - 40 || e.y > p.y + LOOK_AHEAD + 40) continue;
        spans.push([e.x, e.x + e.w]);
      }
      for (const pr of sim.projectiles) {
        const isFalling = String(pr.kind).startsWith("fall_");
        const ahead = isFalling ? LOOK_AHEAD * 3 : LOOK_AHEAD;
        if (pr.y + pr.h < p.y - 10 || pr.y > p.y + ahead) continue;
        spans.push([pr.x, pr.x + pr.w]);
      }
      spans.sort((a, b) => a[0] - b[0]);
      let targetX = px, bestRoom = -1, cursor = lo;
      for (const s of spans) {
        if (s[0] > cursor && s[0] - cursor >= MIN_GAP) {
          const room = s[0] - cursor;
          if (room > bestRoom) { bestRoom = room; targetX = (cursor + s[0]) / 2; }
        }
        cursor = Math.max(cursor, s[1]);
      }
      if (hi - cursor >= MIN_GAP && hi - cursor > bestRoom) {
        targetX = (cursor + hi) / 2;
      }
      if (bestRoom < 0) {
        let nearest = null;
        for (const pk of sim.pickups) {
          if (pk.y < p.y - 10 || pk.y > p.y + LOOK_AHEAD) continue;
          if (nearest === null || Math.abs(pk.x - px) < Math.abs(nearest - px)) nearest = pk.x;
        }
        if (nearest !== null) targetX = nearest;
      }
      targetX = Math.min(hi - PLAYER_HALF, Math.max(lo + PLAYER_HALF, targetX));
      let axis = Math.max(-1, Math.min(1, (targetX - px) / STEER_GAIN));
      for (const e of sim.enemies) {
        if (e.y + e.h < p.y - 40 || e.y > p.y + 160) continue;
        const dx = e.x + e.w / 2 - px;
        if (Math.abs(dx) < 110) {
          const push = (110 - Math.abs(dx)) / 110;
          axis = Math.max(-1, Math.min(1, axis - Math.sign(dx) * push));
        }
      }
      g.input.setAnalog(axis);
      g.input.setBoostHeld(sim.computeDangerProximity() > 0.7);
    } else {
      g.input.setAnalog(0);
      g.input.setBoostHeld(false);
    }
    requestAnimationFrame(drive);
  };
  requestAnimationFrame(drive);
`;

type PageP2m = {
  runSession: { sessionId: string; seed: number; themeId: string } | null;
  runRecord: { timeSurvived: number; inputLog: unknown } | null;
};

async function main() {
  console.log(`Browser E2E against ${BASE}\n`);
  const browser = await chromium.launch();

  // --- 0. connect-first gate: no wallet ⇒ no START, big CONNECT WALLET ----
  {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });

    for (const [mode, startLabel] of [
      ["NORMAL", "START RUN"],
      ["P2M", "START P2M"],
    ] as const) {
      await page
        .getByRole("button", { name: mode, exact: false })
        .first()
        .click();
      // Two CONNECT WALLET buttons render (top bar + the big start slot) —
      // the start-slot one is last in the DOM.
      await page
        .getByRole("button", { name: "CONNECT WALLET", exact: true })
        .last()
        .waitFor({ timeout: 15000 });
      const startCount = await page
        .getByRole("button", { name: startLabel, exact: true })
        .count();
      assert(
        startCount === 0,
        `${mode} without a wallet must not offer ${startLabel}`,
      );
      console.log(`  gate: ${mode} blocked without wallet ✓`);
    }
    await page.close();
  }

  // --- played run with a stubbed (auto-connected) wallet --------------------
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(WALLET_STUB);
  page.on("pageerror", (e) => console.error("  [page error]", String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") console.error("  [console error]", m.text());
  });

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  // Dev server keeps an HMR socket open — networkidle never fires.
  await page.getByRole("button", { name: "P2M", exact: false }).first().click();
  // The stub wallet auto-connects (~50ms) and unlocks the START button.
  await page.getByRole("button", { name: "START P2M" }).click();

  // Session must exist before tick 0 — poll the dev handle.
  await page.waitForFunction(
    () => (window as unknown as PageP2m).__loopiternP2m?.runSession != null,
    undefined,
    { timeout: 15000 },
  );
  console.log("  run session issued before tick 0 ✓");

  let attempt = 0;
  let record: NonNullable<PageP2m["runRecord"]> | null = null;
  let session: NonNullable<PageP2m["runSession"]> | null = null;
  for (;;) {
    attempt += 1;
    await page.evaluate(PAGE_AUTOPILOT);

    // Drive until death (record arrives) — the HUD timer is sim time.
    await page.waitForFunction(
      () =>
        (window as unknown as PageP2m).__loopiternP2m?.runRecord != null &&
        (window as unknown as PageP2m).__loopiternP2m?.runSession != null,
      undefined,
      { timeout: (SIM_HZ * 600 * 1000) / 60 + 20000 },
    );
    const p2m = (await page.evaluate(
      () => (window as unknown as PageP2m).__loopiternP2m,
    )) as PageP2m;
    record = p2m.runRecord;
    session = p2m.runSession;
    assert(record && session, "runRecord/runSession missing after death");

    console.log(
      `  attempt ${attempt}: seed ${session.seed} (${session.themeId}) → ${record.timeSurvived.toFixed(3)}s`,
    );
    if (record.timeSurvived >= 31) break;
    if (attempt >= 8) fail("browser autopilot never survived 31s in 8 tries");
    // RUN AGAIN → GameApp fetches a fresh session, then restarts.
    await page
      .getByRole("button", { name: "RUN AGAIN", exact: true })
      .click();
    await page.waitForFunction(
      () => (window as unknown as PageP2m).__loopiternP2m?.runRecord == null,
      undefined,
      { timeout: 15000 },
    );
  }

  // The exact body the mint button would post (minter swapped for a test
  // address — the voucher binds whatever address is posted).
  const claim = {
    address: MINTER,
    rarity: 0,
    timeSurvived: record!.timeSurvived,
    sessionId: session!.sessionId,
    inputLog: record!.inputLog,
  };
  console.log(
    `  honest browser run: ${claim.timeSurvived.toFixed(3)}s, log ${JSON.stringify(claim.inputLog).length / 1024}KB, session ${claim.sessionId}`,
  );

  // Wall-clock gate (30s since issue — playing took real time, but wait out
  // any remainder).
  const waited = await page.evaluate(
    () => document.timeline?.currentTime ?? performance.now(),
  );
  void waited;

  const res = await page.evaluate(async (body: unknown) => {
    const r = await fetch("/api/loopitern/voucher", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  }, claim);
  if (res.status === 403 && String(res.json.error).includes("too fast")) {
    const match = /this run is (\d+)s in/.exec(String(res.json.error));
    const elapsed = match ? Number(match[1]) : 0;
    const waitS = Math.max(1, 31 - elapsed);
    console.log(`  wall-clock: waiting ${waitS.toFixed(0)}s…`);
    await new Promise((r) => setTimeout(r, waitS * 1000));
    const retry = await page.evaluate(async (body: unknown) => {
      const r = await fetch("/api/loopitern/voucher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: r.status, json: await r.json().catch(() => ({})) };
    }, claim);
    Object.assign(res, retry);
  }

  console.log(
    `\n  voucher → ${res.status} ${JSON.stringify(res.json).slice(0, 200)}`,
  );
  const ok =
    res.status === 200 && typeof res.json.signature === "string";
  await browser.close();

  if (!ok) {
    fail(
      `the REAL BROWSER run was refused a voucher: ${JSON.stringify(res.json)}`,
    );
  }
  console.log("\nBrowser E2E passed: a real played run gets a signed voucher.");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
