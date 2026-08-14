/**
 * Keeper: seal this week's P2E theme on Base mainnet (8453).
 *
 * Players' browsers must NOT call `sealWeeklyTheme` — owner/keeper only.
 *
 * Run from the repo root (Node on PATH):
 *
 *   npx tsx scripts/seal-week.ts
 *   npx tsx scripts/seal-week.ts --dry-run
 *
 * Env (loaded from `contracts/.env` then `.env.local`; process env wins if already set):
 *   PRIVATE_KEY                          owner or keeper hex key (has ETH for gas + Inco fee)
 *   BASE_MAINNET_RPC_URL                 default https://mainnet.base.org
 *   NEXT_PUBLIC_LOOPTERNITY_CONTRACT_ADDRESS
 *     or LOOPTERNITY_VAULT               mainnet vault
 *
 * Pays `inco.getFee()` as msg.value (one `newEuint256`). Encrypts with
 * `Lightning.baseMainnet()` bound to the vault. Theme index = `sealedThemeForWeek(weekId)`
 * in src/web3/p2e/week.ts (0 volcanic, 1 planetary, 2 antarctica).
 *
 * Idempotent: exits 0 if `themeSealed` is already true. Sepolia is not used.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { handleTypes } from "@inco/lightning-js";
import { Lightning } from "@inco/lightning-js/lite";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { loopternityVaultAbi } from "../src/web3/abi/loopternityVault";
import {
  sealedThemeForWeek,
  themeIndex,
  weekIdFromDate,
} from "../src/web3/p2e/week";

const ZERO = "0x0000000000000000000000000000000000000000";
const DEFAULT_VAULT =
  "0x66b549F570Fa63e3109B85FD15678c175F1a02c9" as Address;

const incoGetFeeAbi = [
  {
    type: "function",
    name: "getFee",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "pure",
  },
] as const;

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
    throw new Error(`RPC is chain ${chainId}, expected Base mainnet ${base.id}`);
  }

  const [owner, keeper, onchainWeekId] = await Promise.all([
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
      functionName: "currentWeekId",
    }),
  ]);

  const weekId = onchainWeekId;
  const clientWeekId = weekIdFromDate();
  const themeId = sealedThemeForWeek(weekId);
  const index = themeIndex(themeId);

  console.log(`Chain          Base ${base.id}`);
  console.log(`Vault          ${vault}`);
  console.log(`Signer         ${account.address}`);
  console.log(`Owner/keeper   ${owner} / ${keeper}`);
  console.log(`Week (vault)   ${weekId}`);
  console.log(`Week (local)   ${clientWeekId}`);
  console.log(`Theme          ${themeId} (index ${index})`);

  if (weekId !== clientWeekId) {
    throw new Error(
      `Week id mismatch (vault ${weekId} vs local Sunday UTC ${clientWeekId}).`,
    );
  }

  const already = await publicClient.readContract({
    address: vault,
    abi: loopternityVaultAbi,
    functionName: "themeSealed",
    args: [weekId],
  });
  if (already) {
    console.log("Already sealed on mainnet. Nothing to do.");
    return;
  }

  const addr = account.address.toLowerCase();
  if (addr !== owner.toLowerCase() && addr !== keeper.toLowerCase()) {
    throw new Error("Signer is not the vault owner or keeper.");
  }

  if (dryRun) {
    console.log("Dry run — not encrypting or sending.");
    return;
  }

  const lightning = await Lightning.baseMainnet({ hostChainRpcUrls: [rpc] });
  const fee = await publicClient.readContract({
    address: lightning.executorAddress,
    abi: incoGetFeeAbi,
    functionName: "getFee",
  });
  console.log(`Inco getFee    ${fee} wei`);

  const ciphertext = (await lightning.encrypt(BigInt(index), {
    accountAddress: account.address,
    dappAddress: vault,
    handleType: handleTypes.euint256,
  })) as Hex;

  const hash = await walletClient.writeContract({
    address: vault,
    abi: loopternityVaultAbi,
    functionName: "sealWeeklyTheme",
    args: [weekId, ciphertext],
    value: fee,
    chain: base,
    account,
  });
  console.log(`Tx             ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error("sealWeeklyTheme reverted on Base");
  }
  console.log(`Basescan       https://basescan.org/tx/${hash}`);
  console.log("Sealed.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
