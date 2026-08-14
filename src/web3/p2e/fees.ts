import { LOOPTERNITY_CONTRACT_ADDRESS } from "@/web3/config";

export const P2E_ENTRY_FEE_USD = Number(
  process.env.NEXT_PUBLIC_P2E_ENTRY_FEE_USD?.trim() || "0.05",
);

/**
 * Optional exact ETH amount. Leave empty on Vercel.
 * `0.05` here means 0.05 ETH (~$90), not $0.05. Do not copy the USD value.
 */
export const P2E_ENTRY_FEE_ETH_OVERRIDE =
  process.env.NEXT_PUBLIC_P2E_ENTRY_FEE_ETH?.trim() || "";

/**
 * Reject ETH overrides that look like a USD amount was pasted in
 * (`0.05` ETH vs `$0.05`). Valid overrides are tiny (e.g. 0.00002).
 */
export function parseEthFeeOverride(raw: string, usd: number): number | null {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n) || n <= 0) return null;
  if (n >= 0.001) return null;
  if (usd > 0 && n >= usd) return null;
  return n;
}

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
