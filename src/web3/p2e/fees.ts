import { LOOPTERNITY_CONTRACT_ADDRESS } from "@/web3/config";

export const P2E_ENTRY_FEE_USD = Number(
  process.env.NEXT_PUBLIC_P2E_ENTRY_FEE_USD?.trim() || "0.05",
);

/** Optional exact ETH override (skips USD→ETH conversion). */
export const P2E_ENTRY_FEE_ETH_OVERRIDE =
  process.env.NEXT_PUBLIC_P2E_ENTRY_FEE_ETH?.trim() || "";

/**
 * Display / docs only. Entry ETH is paid with vault `enterRun` (value ≥
 * `entryFeeWei`). Do not send a raw transfer to this address.
 */
export const P2E_TREASURY_ADDRESS = (process.env
  .NEXT_PUBLIC_P2E_TREASURY_ADDRESS?.trim() ||
  LOOPTERNITY_CONTRACT_ADDRESS) as `0x${string}`;

export async function fetchEthUsd(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.coinbase.com/v2/exchange-rates?currency=ETH",
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { rates?: { USD?: string } } };
    const n = Number(json.data?.rates?.USD);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function ethForUsd(usd: number, ethUsd: number): number {
  return usd / ethUsd;
}
