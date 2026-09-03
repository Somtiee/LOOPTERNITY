import { getAddress, isAddress, zeroAddress, type Address } from "viem";

/**
 * LOOPITERNS on Robinhood (4663). Empty / zero address = mint disabled.
 * Set `NEXT_PUBLIC_LOOPITERNS_ADDRESS` after deploy.
 */
export function getLoopiternsAddress(): Address | undefined {
  const raw = process.env.NEXT_PUBLIC_LOOPITERNS_ADDRESS?.trim();
  if (!raw || !isAddress(raw)) return undefined;
  const address = getAddress(raw);
  if (address === zeroAddress) return undefined;
  return address;
}

/** Fallback only when `mintPrice()` cannot be read. Wei string, digits only. */
export function getMintPriceFallbackWei(): bigint | undefined {
  const raw = process.env.NEXT_PUBLIC_LOOPITERNS_MINT_PRICE_WEI?.trim();
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  try {
    return BigInt(raw);
  } catch {
    return undefined;
  }
}
