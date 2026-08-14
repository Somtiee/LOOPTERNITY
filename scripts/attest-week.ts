/**
 * Keeper: decrypt Inco score handles and `attestTop10` on Base mainnet (8453).
 *
 * Hybrid A (same as settlement will use for order):
 *   weeklyScore = (survivalMs/1000)*(hundredths/100) + activityBonus(runCount)
 *
 * Call after Sunday 00:00 UTC of the *next* week (contract: WeekNotEnded otherwise).
 * Players' browsers must NOT attest. Default week = previous Sunday UTC week.
 * After attest, settle with `npx tsx scripts/settle-week.ts` (do not invent winners).
 *
 *   npx tsx scripts/attest-week.ts
 *   npx tsx scripts/attest-week.ts --dry-run
 *   npx tsx scripts/attest-week.ts --week=2026-08-09
 *
 * Env: PRIVATE_KEY in contracts/.env (owner/keeper), BASE_MAINNET_RPC_URL,
 * NEXT_PUBLIC_LOOPTERNITY_CONTRACT_ADDRESS. Sepolia is not used.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Lightning } from "@inco/lightning-js/lite";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbiItem,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { loopternityVaultAbi } from "../src/web3/abi/loopternityVault";
import { hybridAScore } from "../src/web3/p2e/ranking";
import {
  previousWeekId,
  weekEndsAt,
  weekIdFromDate,
  weekIdKey,
} from "../src/web3/p2e/week";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;
const DEFAULT_VAULT =
  "0x66b549F570Fa63e3109B85FD15678c175F1a02c9" as Address;
const DEPLOY_BLOCK = 49966576n;

const scoreSubmittedEvent = parseAbiItem(
  "event ScoreSubmitted(address indexed player, string weekId, uint256 runCount)",
);
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

function asBigint(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "boolean") return value ? BigInt(1) : BigInt(0);
  throw new Error(`Unexpected plaintext ${String(value)}`);
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
  const ended = Date.now() >= weekEndsAt(weekId).getTime();

  console.log(`Chain          Base ${base.id}`);
  console.log(`Vault          ${vault}`);
  console.log(`Signer         ${account.address}`);
  console.log(`Week           ${weekId} (current onchain ${current})`);
  console.log(`Week ended     ${ended}`);

  if (!ended) {
    throw new Error(
      "Week has not ended. attestTop10 reverts WeekNotEnded until next Sunday 00:00 UTC.",
    );
  }

  const attestedLogs = await publicClient.getLogs({
    address: vault,
    event: top10AttestedEvent,
    fromBlock: DEPLOY_BLOCK,
    toBlock: "latest",
  });
  if (attestedLogs.some((l) => l.args.weekId === weekId)) {
    console.log("Already attested on mainnet. Nothing to do.");
    return;
  }

  const [owner, keeper] = await Promise.all([
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
  ]);
  const addr = account.address.toLowerCase();
  if (addr !== owner.toLowerCase() && addr !== keeper.toLowerCase()) {
    throw new Error("Signer is not the vault owner or keeper.");
  }

  const submitted = await publicClient.getLogs({
    address: vault,
    event: scoreSubmittedEvent,
    fromBlock: DEPLOY_BLOCK,
    toBlock: "latest",
  });
  const players = [
    ...new Set(
      submitted
        .filter((l) => l.args.weekId === weekId && l.args.player)
        .map((l) => l.args.player as Address),
    ),
  ];

  type Row = {
    address: Address;
    runCount: number;
    survivalMs: bigint;
    hundredths: bigint;
    weeklyScore: number;
  };
  const rows: Row[] = [];

  const lightning = await Lightning.baseMainnet({ hostChainRpcUrls: [rpc] });

  for (const player of players) {
    const [has, runCount, survivalHandle, multiplierHandle] = await Promise.all(
      [
        publicClient.readContract({
          address: vault,
          abi: loopternityVaultAbi,
          functionName: "hasScore",
          args: [weekIdKey(weekId), player],
        }),
        publicClient.readContract({
          address: vault,
          abi: loopternityVaultAbi,
          functionName: "runCount",
          args: [weekIdKey(weekId), player],
        }),
        publicClient.readContract({
          address: vault,
          abi: loopternityVaultAbi,
          functionName: "bestSurvivalHandle",
          args: [weekId, player],
        }),
        publicClient.readContract({
          address: vault,
          abi: loopternityVaultAbi,
          functionName: "bestMultiplierHandle",
          args: [weekId, player],
        }),
      ],
    );
    if (!has || runCount === BigInt(0)) continue;
    if (
      survivalHandle === ZERO_BYTES32 ||
      multiplierHandle === ZERO_BYTES32
    ) {
      console.warn(`Skip ${player}: empty handle`);
      continue;
    }
    const decrypted = await lightning.attestedDecrypt(walletClient, [
      survivalHandle,
      multiplierHandle,
    ]);
    const survivalMs = asBigint(decrypted[0]?.plaintext.value);
    const hundredths = asBigint(decrypted[1]?.plaintext.value);
    const weeklyScore = hybridAScore(survivalMs, hundredths, Number(runCount));
    rows.push({
      address: player,
      runCount: Number(runCount),
      survivalMs,
      hundredths,
      weeklyScore,
    });
  }

  rows.sort((a, b) => {
    if (b.weeklyScore !== a.weeklyScore) return b.weeklyScore - a.weeklyScore;
    return a.address.toLowerCase().localeCompare(b.address.toLowerCase());
  });

  const top10: Address[] = [];
  for (let i = 0; i < 10; i++) {
    top10.push(rows[i]?.address ?? ZERO);
  }

  console.log(`Submitters     ${rows.length}`);
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const r = rows[i]!;
    console.log(
      `  #${i + 1} ${r.address}  score=${r.weeklyScore.toFixed(4)}  runs=${r.runCount}`,
    );
  }
  if (rows.length === 0) {
    console.log("Empty week — attesting address(0) × 10 (shares → treasury).");
  }

  if (dryRun) {
    console.log("Dry run — not sending attestTop10.");
    return;
  }

  const hash = await walletClient.writeContract({
    address: vault,
    abi: loopternityVaultAbi,
    functionName: "attestTop10",
    args: [
      weekId,
      [
        top10[0]!,
        top10[1]!,
        top10[2]!,
        top10[3]!,
        top10[4]!,
        top10[5]!,
        top10[6]!,
        top10[7]!,
        top10[8]!,
        top10[9]!,
      ],
    ],
    chain: base,
    account,
  });
  console.log(`Tx             ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error("attestTop10 reverted on Base");
  }
  console.log(`Basescan       https://basescan.org/tx/${hash}`);
  console.log("Attested.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
