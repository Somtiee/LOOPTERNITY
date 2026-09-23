/**
 * Layout verification for the responsive playfield + NEW-restart stability.
 *
 *   1. npm run dev (already running)
 *   2. npx tsx scripts/verify-playfield.ts
 *
 * The playfield dims are derived from the viewport at run start (full-bleed
 * portrait on phones, letterboxed on wide screens) and stay LOCKED for the
 * whole session — checks, at a desktop and a phone viewport:
 *   - the canvas backing store matches the viewport-derived sim dims,
 *   - tapping NEW (mid-run restart) keeps the canvas at the exact same
 *     CSS size/position AND the same sim dims (the disjointed-world bug),
 *   - phones render full-bleed portrait (not a square),
 *   - wide screens letterbox + center the canvas.
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ACTIVE_CHAIN_ID } from "../src/web3/config";
import { VIEW_SCALE } from "../src/game/constants";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SHOTS = join(tmpdir(), "loopternity-verify");
mkdirSync(SHOTS, { recursive: true });

const MINTER = "0x1111111111111111111111111111111111111111";
/** The chain the app is configured for, never a literal. */
const CHAIN_ID_HEX = `0x${ACTIVE_CHAIN_ID.toString(16)}`;
const WALLET_STUB = `
  Object.defineProperty(window, "ethereum", {
    value: {
      isMetaMask: true,
      request: async ({ method }) => {
        if (method === "eth_accounts" || method === "eth_requestAccounts")
          return ["${MINTER}"];
        if (method === "eth_chainId") return "${CHAIN_ID_HEX}";
        if (method === "net_version") return "${ACTIVE_CHAIN_ID}";
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
  viewport: { w: number; h: number };
  dpr: number;
};

async function measure(page: import("playwright").Page): Promise<Measure> {
  return page.evaluate(() => {
    const canvas = document.querySelector(
      "canvas[aria-label='LOOPTERNITY game canvas']",
    ) as HTMLCanvasElement | null;
    if (!canvas) throw new Error("game canvas not found");
    const cr = canvas.getBoundingClientRect();
    return {
      canvas: { x: cr.x, y: cr.y, w: cr.width, h: cr.height },
      backing: { w: canvas.width, h: canvas.height },
      viewport: { w: window.innerWidth, h: window.innerHeight },
      dpr: window.devicePixelRatio || 1,
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
    `  run1: canvas ${Math.round(before.canvas.w)}×${Math.round(before.canvas.h)} @ (${Math.round(before.canvas.x)},${Math.round(before.canvas.y)})  backing ${before.backing.w}×${before.backing.h}`,
  );
  console.log(
    `  run2: canvas ${Math.round(after.canvas.w)}×${Math.round(after.canvas.h)} @ (${Math.round(after.canvas.x)},${Math.round(after.canvas.y)})  backing ${after.backing.w}×${after.backing.h}`,
  );

  // --- NEW-restart stability (the bug this guards against) ---
  check(
    approx(before.canvas.w, after.canvas.w) &&
      approx(before.canvas.h, after.canvas.h) &&
      approx(before.canvas.x, after.canvas.x) &&
      approx(before.canvas.y, after.canvas.y),
    "NEW keeps the canvas at the same size AND position",
  );
  check(
    before.backing.w === after.backing.w && before.backing.h === after.backing.h,
    `NEW keeps the sim dims (backing ${before.backing.w}×${before.backing.h} → ${after.backing.w}×${after.backing.h})`,
  );

  // --- fairness band: browser zoom must not change how much world you see ---
  // The view dims decide how much world is visible. They come from a CSS-pixel
  // viewport, which zoom rescales, so they are clamped into VIEW_SCALE — a
  // zoomed-out player must not be able to see past maxWidth/maxHeight.
  const simW = before.backing.w / before.dpr;
  const simH = before.backing.h / before.dpr;
  console.log(
    `  field: ${Math.round(simW)}×${Math.round(simH)} sim units (band ${VIEW_SCALE.minWidth}-${VIEW_SCALE.maxWidth} × ${VIEW_SCALE.minHeight}-${VIEW_SCALE.maxHeight})`,
  );
  check(
    simW >= VIEW_SCALE.minWidth &&
      simW <= VIEW_SCALE.maxWidth &&
      simH >= VIEW_SCALE.minHeight &&
      simH <= VIEW_SCALE.maxHeight,
    `field stays inside the ${VIEW_SCALE.min}–${VIEW_SCALE.max} band of the designed world`,
  );
  // The floor can exceed a narrow canvas (a 390px-wide phone against a 432
  // floor), in which case the world renders at a slight downscale. That is
  // intentional — the band wins over the 1:1 backing/rendered match — so this
  // is reported, not asserted.
  if (simW > before.canvas.w + 1) {
    console.log(
      `  note: field is wider than the canvas, world renders at ${(before.canvas.w / simW).toFixed(3)}× (band floor)`,
    );
  }
  if (viewport.width < viewport.height) {
    check(
      approx(before.canvas.w, before.viewport.w, 2),
      "phone: canvas is full-bleed width",
    );
    check(
      before.canvas.h > before.canvas.w + 60,
      `phone: canvas is portrait full-bleed, not a square (${Math.round(before.canvas.w)}×${Math.round(before.canvas.h)})`,
    );
  } else {
    const side = Math.min(before.canvas.w, before.canvas.h);
    check(
      approx(before.canvas.w, before.canvas.h, 2),
      "desktop: canvas letterboxes to the WORLD aspect (square) by height",
    );
    check(
      approx(before.canvas.x, (before.viewport.w - side) / 2, 4),
      `desktop: canvas centered (x=${Math.round(before.canvas.x)}, expected ~${Math.round((before.viewport.w - side) / 2)})`,
    );
  }
  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`);
  await page.close();
  return { simW, simH };
}

async function main() {
  const browser = await chromium.launch();
  // CSS-pixel viewports equivalent to browser zoom on a 1440×900 window:
  // browser zoom at factor z behaves like a (W/z)×(H/z) CSS viewport, so
  // these stand in for real zoom levels without needing to drive browser UI.
  const desktop = await scenario(browser, "desktop", { width: 1440, height: 900 });
  await scenario(browser, "phone", { width: 390, height: 740 });
  const zoomedOut = await scenario(browser, "zoomout-50pct", { width: 2880, height: 1800 });
  const zoomedIn = await scenario(browser, "zoomin-360pct", { width: 400, height: 250 });
  await browser.close();

  // --- the exploit this whole band exists to close ---
  console.log("\n[zoom fairness]");
  check(
    zoomedOut.simW <= desktop.simW && zoomedOut.simH <= desktop.simH,
    `zooming out to ~50% cannot see more world than 100% (${Math.round(zoomedOut.simW)}×${Math.round(zoomedOut.simH)} vs ${Math.round(desktop.simW)}×${Math.round(desktop.simH)})`,
  );
  check(
    zoomedIn.simW >= VIEW_SCALE.minWidth && zoomedIn.simH >= VIEW_SCALE.minHeight,
    `zooming in to ~360% cannot shrink past the floor (${Math.round(zoomedIn.simW)}×${Math.round(zoomedIn.simH)})`,
  );

  console.log(
    `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`} — screenshots in ${SHOTS}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
