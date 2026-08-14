/**
 * Keeper: `settleWeek` on Base mainnet (8453) after `attestTop10`.
 *
 * Split is fixed in the vault (do not change it here):
 *   20% of weekPoolWei → treasury immediately
 *   80% → Top 10 via existing bps
 *   empty address(0) ranks + leftover wei of the 80% → treasury
 *
 * Winners pull via `claim(weekId)`. This script never invents a Top 10.
 * Dry-run with forge tests (`contracts/test/LoopternityVault.t.sol`).
 * First live mainnet settle waits for a real Sunday 00:00 UTC week end.
 *
 *   npx tsx scripts/settle-week.ts
 *   npx tsx scripts/settle-week.ts --dry-run
 *   npx tsx scripts/settle-week.ts --week=2026-08-09
 *
 * Env: PRIVATE_KEY in contracts/.env (owner/keeper), BASE_MAINNET_RPC_URL,
 * NEXT_PUBLIC_LOOPTERNITY_CONTRACT_ADDRESS. Default week = previous Sunday UTC.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
  parseAbiItem,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { loopternityVaultAbi } from "../src/web3/abi/loopternityVault";
import {
  settlementPayoutsFromTop10,
  settlementSplit,
} from "../src/web3/p2e/ranking";
import { previousWeekId, weekEndsAt } from "../src/web3/p2e/week";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const DEFAULT_VAULT =
  "0x66b549F570Fa63e3109B85FD15678c175F1a02c9" as Address;
const DEPLOY_BLOCK = BigInt("49966576");

const top10AttestedEvent = parseAbiItem(
  "event Top10Attested(string weekId, address indexed attester)",
);

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

function normalizePk(raw: string): Hex {
  const hex = (raw.startsWith("0x") ? raw : `0x${raw}`).trim() as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("PRIVATE_KEY must be 32-byte hex");
  }
  return hex;
}

function argWeek(argv: string[]): string | null {
  const flag = argv.find((a) => a.startsWith("--week="));
  return flag ? flag.slice("--week=".length) : null;
}

async function main() {
  const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
  loadEnvFile(resolve(root, "contracts/.env"));
  loadEnvFile(resolve(root, ".env.local"));

  const dryRun = process.argv.includes("--dry-run");
  const rpc =
    process.env.BASE_MAINNET_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_BASE_RPC_URL?.trim() ||
    "https://mainnet.base.org";
  const vaultRaw =
    process.env.LOOPTERNITY_VAULT?.trim() ||
    process.env.NEXT_PUBLIC_LOOPTERNITY_CONTRACT_ADDRESS?.trim() ||
    DEFAULT_VAULT;
  const vault = (
    vaultRaw.toLowerCase() === ZERO.toLowerCase() ? DEFAULT_VAULT : vaultRaw
  ) as Address;

  const pkRaw = process.env.PRIVATE_KEY?.trim();
  if (!pkRaw) {
    throw new Error("Set PRIVATE_KEY in contracts/.env (owner or keeper).");
  }

  const account = privateKeyToAccount(normalizePk(pkRaw));
  const transport = http(rpc);
  const publicClient = createPublicClient({ chain: base, transport });
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport,
  });

  const chainId = await publicClient.getChainId();
  if (chainId !== base.id) {
    throw new Error(`RPC is chain ${chainId}, expected Base ${base.id}`);
  }

  const current = await publicClient.readContract({
    address: vault,
    abi: loopternityVaultAbi,
    functionName: "currentWeekId",
  });
  const weekId = argWeek(process.argv) ?? previousWeekId(current);
  const weekStartMs = new Date(`${weekId}T00:00:00.000Z`).getTime();
  const currentStartMs = new Date(`${current}T00:00:00.000Z`).getTime();
  const ended = weekStartMs < currentStartMs;

  console.log(`Chain          Base ${base.id}`);
  console.log(`Vault          ${vault}`);
  console.log(`Signer         ${account.address}`);
  console.log(`Week           ${weekId} (current onchain ${current})`);
  console.log(`Week ended     ${ended} (local clock ${Date.now() >= weekEndsAt(weekId).getTime()})`);

  if (weekId === current || weekStartMs === currentStartMs) {
    throw new Error(
      "Cannot settle the current week. Wait until Sunday 00:00 UTC, then settle the previous week.",
    );
  }
  if (weekStartMs > currentStartMs) {
    throw new Error("That week has not started onchain yet.");
  }

  const settled = await publicClient.readContract({
    address: vault,
    abi: loopternityVaultAbi,
    functionName: "weekSettled",
    args: [weekId],
  });
  if (settled) {
    console.log("Already settled on mainnet. Re-settle would revert AlreadySettled.");
    return;
  }

  const attestedLogs = await publicClient.getLogs({
    address: vault,
    event: top10AttestedEvent,
    fromBlock: DEPLOY_BLOCK,
    toBlock: "latest",
  });
  const attested = attestedLogs.some((l) => l.args.weekId === weekId);
  if (!attested) {
    throw new Error(
      `Ranking not attested for ${weekId}. Run: npx tsx scripts/attest-week.ts --week=${weekId}\nDo not invent winners for a live settle. Dry-run payouts with forge tests.`,
    );
  }

  const [owner, keeper, poolWei, top10] = await Promise.all([
    publicClient.readContract({
      address: vault,
      abi: loopternityVaultAbi,
      functionName: "owner",
    }),
    publicClient.readContract({
      address: vault,
      abi: loopternityVaultAbi,
      functionName: "keeper",
    }),
    publicClient.readContract({
      address: vault,
      abi: loopternityVaultAbi,
      functionName: "weekPoolWei",
      args: [weekId],
    }),
    publicClient.readContract({
      address: vault,
      abi: loopternityVaultAbi,
      functionName: "getTop10",
      args: [weekId],
    }),
  ]);

  const addr = account.address.toLowerCase();
  if (addr !== owner.toLowerCase() && addr !== keeper.toLowerCase()) {
    throw new Error("Signer is not the vault owner or keeper.");
  }

  const ranked = top10 as readonly Address[];
  const split = settlementSplit(poolWei, ranked);
  const payouts = settlementPayoutsFromTop10(poolWei, ranked);

  console.log(`Pool           ${poolWei} wei (${formatEther(poolWei)} ETH)`);
  console.log(
    `Prize 80%      ${split.prize} wei (${formatEther(split.prize)} ETH)`,
  );
  console.log(
    `Allocated      ${split.allocated} wei (${formatEther(split.allocated)} ETH)`,
  );
  console.log(
    `Leftover 80%   ${split.leftoverPrize} wei → treasury (empty ranks / rounding)`,
  );
  console.log(
    `Treasury total ${split.treasuryWei} wei (${formatEther(split.treasuryWei)} ETH)`,
  );
  if (payouts.length === 0) {
    console.log("Empty Top 10 — entire pool → treasury (same as contract).");
  } else {
    for (const row of payouts) {
      console.log(
        `  #${row.rank} ${row.address}  ${(row.shareBps / 100).toFixed(0)}% of 80%  ${formatEther(BigInt(row.amountWei))} ETH`,
      );
    }
  }

  if (dryRun) {
    console.log("Dry run — not sending settleWeek. No ETH moved.");
    return;
  }

  const hash = await walletClient.writeContract({
    address: vault,
    abi: loopternityVaultAbi,
    functionName: "settleWeek",
    args: [weekId],
    chain: base,
    account,
  });
  console.log(`Tx             ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error("settleWeek reverted on Base");
  }
  console.log(`Basescan       https://basescan.org/tx/${hash}`);
  console.log("Settled. Winners pull with claim(weekId).");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
