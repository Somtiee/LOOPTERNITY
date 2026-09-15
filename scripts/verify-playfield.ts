/**
 * Layout verification for the fixed-resolution playfield (throwaway driver).
 *
 *   1. npm run dev (already running)
 *   2. npx tsx scripts/verify-playfield.ts
 *
 * Checks, at a desktop and a phone viewport:
 *   - the sim/canvas backing store is the fixed 720×720 WORLD,
 *   - tapping NEW (mid-run restart) keeps the canvas at the exact same
 *     CSS size/position (the disjointed-world bug),
 *   - the playfield frame is a square, centered on wide screens, full
 *     width on phones, with the HUD inside it.
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SHOTS = join(tmpdir(), "loopternity-verify");
mkdirSync(SHOTS, { recursive: true });

const MINTER = "0x1111111111111111111111111111111111111111";
const WALLET_STUB = `
  Object.defineProperty(window, "ethereum", {
    value: {
      isMetaMask: true,
      request: async ({ method }) => {
        if (method === "eth_accounts" || method === "eth_requestAccounts")
          return ["${MINTER}"];
        if (method === "eth_chainId") return "0x4cef52";
        if (method === "net_version") return "5042002";
        if (method === "wallet_getPermissions") return [];
        return null;
      },
      on() {},
      removeListener() {},
    },
    configurable: true,
  });
`;

type Measure = {
  canvas: { x: number; y: number; w: number; h: number };
  backing: { w: number; h: number };
  wrapper: { x: number; y: number; w: number; h: number };
  viewport: { w: number; h: number };
};

async function measure(page: import("playwright").Page): Promise<Measure> {
  return page.evaluate(() => {
    const canvas = document.querySelector(
      "canvas[aria-label='LOOPTERNITY game canvas']",
    ) as HTMLCanvasElement | null;
    if (!canvas) throw new Error("game canvas not found");
    const wrap = canvas.parentElement as HTMLElement;
    const cr = canvas.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    return {
      canvas: { x: cr.x, y: cr.y, w: cr.width, h: cr.height },
      backing: { w: canvas.width, h: canvas.height },
      wrapper: { x: wr.x, y: wr.y, w: wr.width, h: wr.height },
      viewport: { w: window.innerWidth, h: window.innerHeight },
    };
  });
}

function approx(a: number, b: number, tol = 2) {
  return Math.abs(a - b) <= tol;
}

let failures = 0;
function check(cond: boolean, msg: string) {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures += 1;
}

async function scenario(
  browser: import("playwright").Browser,
  label: string,
  viewport: { width: number; height: number },
) {
  console.log(`\n[${label}] viewport ${viewport.width}×${viewport.height}`);
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(WALLET_STUB);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });

  // The stub usually auto-restores the injected wallet; if a fresh page
  // races it, click the big CONNECT WALLET button ourselves.
  const startBtn = page.getByRole("button", { name: "START RUN", exact: true });
  try {
    await startBtn.waitFor({ timeout: 20000 });
  } catch {
    const connect = page.getByRole("button", {
      name: "CONNECT WALLET",
      exact: true,
    });
    if ((await connect.count()) > 0) {
      await connect.last().click();
      await startBtn.waitFor({ timeout: 20000 });
    } else {
      const buttons = await page
        .getByRole("button")
        .allTextContents()
        .catch(() => []);
      await page.screenshot({ path: join(SHOTS, `${label}-fail.png`) });
      throw new Error(
        `START RUN never appeared; buttons: ${JSON.stringify(buttons)}`,
      );
    }
  }
  await startBtn.click();
  await page.waitForTimeout(1500);

  const before = await measure(page);
  await page.screenshot({ path: join(SHOTS, `${label}-run1.png`) });

  await page.getByRole("button", { name: "New game" }).click();
  await page.waitForTimeout(1200);
  const after = await measure(page);
  await page.screenshot({ path: join(SHOTS, `${label}-run2.png`) });

  console.log(
    `  run1: canvas ${Math.round(before.canvas.w)}×${Math.round(before.canvas.h)} @ (${Math.round(before.canvas.x)},${Math.round(before.canvas.y)})  backing ${before.backing.w}×${before.backing.h}  wrapper ${Math.round(before.wrapper.w)}×${Math.round(before.wrapper.h)}`,
  );
  console.log(
    `  run2: canvas ${Math.round(after.canvas.w)}×${Math.round(after.canvas.h)} @ (${Math.round(after.canvas.x)},${Math.round(after.canvas.y)})  backing ${after.backing.w}×${after.backing.h}`,
  );

  check(
    before.backing.w === 720 && before.backing.h === 720,
    `fixed 720×720 world (backing ${before.backing.w}×${before.backing.h})`,
  );
  check(
    after.backing.w === 720 && after.backing.h === 720,
    `world still 720×720 after NEW (backing ${after.backing.w}×${after.backing.h})`,
  );
  check(
    approx(before.canvas.w, after.canvas.w) &&
      approx(before.canvas.h, after.canvas.h) &&
      approx(before.canvas.x, after.canvas.x) &&
      approx(before.canvas.y, after.canvas.y),
    "NEW keeps the canvas at the same size AND position (no disjointed world)",
  );
  check(
    approx(before.wrapper.w, before.wrapper.h, 2),
    `playfield frame is square (${Math.round(before.wrapper.w)}×${Math.round(before.wrapper.h)})`,
  );
  check(
    approx(before.canvas.w, before.wrapper.w) &&
      approx(before.canvas.h, before.wrapper.h),
    "canvas fills the playfield frame",
  );
  if (viewport.width > viewport.height) {
    const side = Math.min(before.wrapper.w, before.wrapper.h);
    check(
      approx(before.wrapper.x, (before.viewport.w - side) / 2, 4),
      `frame horizontally centered on desktop (x=${Math.round(before.wrapper.x)}, expected ~${Math.round((before.viewport.w - side) / 2)})`,
    );
  } else {
    check(
      approx(before.wrapper.x, 0, 2) &&
        approx(before.wrapper.w, before.viewport.w, 4),
      "frame is full-width on phone",
    );
  }
  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`);
  await page.close();
}

async function main() {
  const browser = await chromium.launch();
  await scenario(browser, "desktop", { width: 1440, height: 900 });
  await scenario(browser, "phone", { width: 390, height: 740 });
  await browser.close();
  console.log(
    `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`} — screenshots in ${SHOTS}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
