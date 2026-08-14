/**
 * Sunday keeper: seal the new week, then attest + settle the week that just ended.
 *
 *   npx tsx scripts/weekly-keeper.ts
 *
 * GitHub Action runs this at 00:05 UTC every Sunday.
 * Env: same as seal-week / attest-week / settle-week (PRIVATE_KEY in contracts/.env).
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

function run(file: string) {
  const result = spawnSync("npx", ["tsx", file], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${file} failed (${result.status ?? "spawn error"})`);
  }
}

run("scripts/seal-week.ts");
run("scripts/attest-week.ts");
run("scripts/settle-week.ts");
