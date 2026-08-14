import { handleTypes } from "@inco/lightning-js";
import { Lightning } from "@inco/lightning-js/lite";
import type { Address, Hex } from "viem";
import { readContract } from "wagmi/actions";
import {
  BASE_CHAIN,
  baseRpcUrls,
  CHAIN_MODE,
  LOOPTERNITY_CONTRACT_ADDRESS,
  vaultIsDeployed,
  ZERO_ADDRESS,
} from "./config";
import { wagmiConfig } from "./wagmiConfig";

/** Two `newEuint256` inputs in `submitConfidentialScore` — each costs `inco.getFee()`. */
export const INCO_SCORE_INPUTS = 2;

const incoGetFeeAbi = [
  {
    type: "function",
    name: "getFee",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "pure",
  },
] as const;

/**
 * Structural client type — do not use `ReturnType<typeof Lightning.baseMainnet>`.
 * `@inco/lightning-js` pins viem 2.39; the app uses a newer viem, and those
 * `Client` types are not assignable to each other.
 */
export type IncoLightningClient = {
  executorAddress: Address;
  encrypt: (
    value: bigint | boolean,
    options: {
      accountAddress: Address;
      dappAddress: Address;
      handleType: (typeof handleTypes)[keyof typeof handleTypes];
    },
  ) => Promise<string>;
};

let lightningPromise: Promise<IncoLightningClient> | null = null;

/**
 * Singleton Inco Lightning client.
 * Sepolia uses `Lightning.baseSepoliaTestnet()` (same mainnet pepper, chain 84532).
 * Default is `Lightning.baseMainnet()`.
 */
export function getIncoLightning(): Promise<IncoLightningClient> {
  if (!lightningPromise) {
    const opts = { hostChainRpcUrls: baseRpcUrls };
    lightningPromise = (
      CHAIN_MODE === "sepolia"
        ? Lightning.baseSepoliaTestnet(opts)
        : Lightning.baseMainnet(opts)
    ) as Promise<IncoLightningClient>;
  }
  return lightningPromise;
}

export type EncryptUint256Params = {
  /** Plain value to encrypt (e.g. survival time in milliseconds). */
  value: bigint;
  /** Connected wallet address — ciphertext is bound to this account. */
  accountAddress: Address;
  /**
   * Contract that will consume the ciphertext.
   * Defaults to NEXT_PUBLIC_LOOPTERNITY_CONTRACT_ADDRESS (mainnet vault).
   */
  dappAddress?: Address;
};

function bindDappAddress(dappAddress?: Address): Address {
  const bound = dappAddress ?? LOOPTERNITY_CONTRACT_ADDRESS;
  if (vaultIsDeployed && bound.toLowerCase() === ZERO_ADDRESS) {
    throw new Error("Cannot bind Inco ciphertext to the zero address");
  }
  if (
    vaultIsDeployed &&
    bound.toLowerCase() !== LOOPTERNITY_CONTRACT_ADDRESS.toLowerCase()
  ) {
    throw new Error("Ciphertext must be bound to the Loopternity vault");
  }
  return bound;
}

/** Live Inco Lightning `getFee()` on the configured chain (8453 when mainnet). */
export async function readIncoInputFeeWei(): Promise<bigint> {
  const lightning = await getIncoLightning();
  return readContract(wagmiConfig, {
    address: lightning.executorAddress,
    abi: incoGetFeeAbi,
    functionName: "getFee",
    chainId: BASE_CHAIN.id,
  });
}

export function incoScoreSubmitValue(feePerInput: bigint): bigint {
  return feePerInput * BigInt(INCO_SCORE_INPUTS);
}

/**
 * Encrypt a uint256 for on-chain confidential use (survival time, multipliers, etc.).
 * Returns hex ciphertext ready to pass into an Inco-enabled contract.
 */
export async function encryptUint256({
  value,
  accountAddress,
  dappAddress,
}: EncryptUint256Params): Promise<Hex> {
  const lightning = await getIncoLightning();
  const ciphertext = await lightning.encrypt(value, {
    accountAddress,
    dappAddress: bindDappAddress(dappAddress),
    handleType: handleTypes.euint256,
  });
  return ciphertext as Hex;
}

/**
 * Encrypt a boolean (e.g. perfect-run flag before it becomes a sealed multiplier).
 */
export async function encryptBool({
  value,
  accountAddress,
  dappAddress,
}: {
  value: boolean;
  accountAddress: Address;
  dappAddress?: Address;
}): Promise<Hex> {
  const lightning = await getIncoLightning();
  const ciphertext = await lightning.encrypt(value, {
    accountAddress,
    dappAddress: bindDappAddress(dappAddress),
    handleType: handleTypes.ebool,
  });
  return ciphertext as Hex;
}

export type EncryptedRunScore = {
  encryptedSurvivalMs: Hex;
  encryptedMultiplier: Hex;
};

/** Encrypt survival milliseconds + perfect-run multiplier (hundredths) for the vault. */
export async function encryptRunScore(params: {
  survivalMs: bigint;
  multiplierHundredths: bigint;
  accountAddress: Address;
  dappAddress?: Address;
}): Promise<EncryptedRunScore> {
  const dappAddress = bindDappAddress(params.dappAddress);
  const [encryptedSurvivalMs, encryptedMultiplier] = await Promise.all([
    encryptUint256({
      value: params.survivalMs,
      accountAddress: params.accountAddress,
      dappAddress,
    }),
    encryptUint256({
      value: params.multiplierHundredths,
      accountAddress: params.accountAddress,
      dappAddress,
    }),
  ]);
  return { encryptedSurvivalMs, encryptedMultiplier };
}

export async function encryptThemeIndex(params: {
  themeIndex: number;
  accountAddress: Address;
  dappAddress?: Address;
}): Promise<Hex> {
  return encryptUint256({
    value: BigInt(params.themeIndex),
    accountAddress: params.accountAddress,
    dappAddress: params.dappAddress,
  });
}

export { handleTypes };
