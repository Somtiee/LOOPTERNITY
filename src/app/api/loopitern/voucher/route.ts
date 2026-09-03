/**
 * LOOPITERNS mint voucher signer (v2 voucher-gated mint).
 *
 * POST /api/loopitern/voucher
 *   body: { address, rarity, timeSurvived }
 *   →     { deadline, nonce, signature }
 *
 * The client survival time is spoofable, so the chain now requires a
 * server-signed voucher. This route checks the claimed survival time
 * against the rarity gates (45/60/90/120/180s) — the same gates the
 * client honors — and signs an EIP-712 voucher bound to (minter, rarity,
 * deadline, nonce, chainId, contract). The contract's ecrecover check plus
 * the single-use nonce makes the voucher unforgeable and unreplayable.
 *
 * Honesty rules:
 *   - contract not configured (NEXT_PUBLIC_LOOPITERNS_ADDRESS empty/zero)
 *     → 503, never a signed voucher
 *   - VOUCHER_SIGNER_PRIVATE_KEY missing (server-only, gitignored)
 *     → 503, never a fake signature
 *   - rarity not unlocked by timeSurvived → 403
 *   - rarity out of range / bad address → 400
 *
 * VOUCHER_SIGNER_PRIVATE_KEY must be the key whose address was passed as
 * MINT_SIGNER_ADDRESS to the v2 deploy. It is server-only: never
 * NEXT_PUBLIC_, never committed, never returned in any response.
 */

import { getAddress, hashTypedData, recoverAddress } from "viem";
import { privateKeyToAddress, signTypedData } from "viem/accounts";
import { NextResponse } from "next/server";
import { getLoopiternsAddress } from "@/web3/loopiterns/address";
import { ROBINHOOD_CHAIN_ID } from "@/web3/config";
import { highestRarityForSurvival, isLoopiternRarityId } from "@/game/mintTiers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Voucher lifetime. The client mints immediately after receiving it. */
const VOUCHER_TTL_SECONDS = 600;

/** Must match Loopiterns.sol EIP-712 domain + VOUCHER_TYPEHASH. */
const VOUCHER_DOMAIN = {
  name: "Loopiterns",
  version: "2",
} as const;
const VOUCHER_TYPES = {
  LoopiternsVoucher: [
    { name: "minter", type: "address" },
    { name: "rarity", type: "uint8" },
    { name: "deadline", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

function getVoucherSignerKey(): `0x${string}` | undefined {
  const raw = process.env.VOUCHER_SIGNER_PRIVATE_KEY?.trim();
  if (!raw) return undefined;
  const withPrefix = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(withPrefix)) return undefined;
  return withPrefix as `0x${string}`;
}

export async function POST(req: Request) {
  const contract = getLoopiternsAddress();
  if (!contract) {
    return NextResponse.json(
      { error: "LOOPITERNS contract not deployed (no address configured)" },
      { status: 503 },
    );
  }

  const privateKey = getVoucherSignerKey();
  if (privateKey === undefined) {
    return NextResponse.json(
      { error: "Voucher signing is not configured (VOUCHER_SIGNER_PRIVATE_KEY missing)" },
      { status: 503 },
    );
  }
  const mintSigner = privateKeyToAddress(privateKey);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  const addressRaw = typeof rec.address === "string" ? rec.address.trim() : "";
  if (!/^0x[0-9a-fA-F]{40}$/.test(addressRaw)) {
    return NextResponse.json({ error: "bad address" }, { status: 400 });
  }
  const minter = getAddress(addressRaw);

  const rarity = Number(rec.rarity);
  if (!Number.isInteger(rarity) || !isLoopiternRarityId(rarity)) {
    return NextResponse.json({ error: "bad rarity" }, { status: 400 });
  }

  const timeSurvived = Number(rec.timeSurvived);
  if (!Number.isFinite(timeSurvived) || timeSurvived < 0) {
    return NextResponse.json({ error: "bad timeSurvived" }, { status: 400 });
  }

  // Server-side gate: only sign for a rarity the run actually reached.
  // Same 45/60/90/120/180s gates the client honors — a spoofed client
  // timer buys nothing here.
  const unlocked = highestRarityForSurvival(timeSurvived);
  if (!unlocked || rarity > unlocked.id) {
    return NextResponse.json(
      {
        error: unlocked
          ? `rarity ${rarity} not unlocked — this run reached ${unlocked.name}`
          : "survive 45s (Common) to unlock a mint",
      },
      { status: 403 },
    );
  }

  // Everything below is server-generated; the caller controls none of it.
  const deadline = BigInt(Math.floor(Date.now() / 1000) + VOUCHER_TTL_SECONDS);
  // Random 64-bit nonce (never 0 — the contract rejects zero).
  const nonce =
    BigInt.asUintN(
      64,
      BigInt(`0x${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`),
    ) || 1n;

  // EIP-712 sign via viem — same digest layout the contract reconstructs
  // (domain "Loopiterns"/"2"/chainId/contract + VOUCHER_TYPEHASH), 65-byte
  // r ‖ s ‖ v (v = 27/28) for the contract's ecrecover(r, s, v).
  const signature = await signTypedData({
    domain: {
      ...VOUCHER_DOMAIN,
      chainId: ROBINHOOD_CHAIN_ID,
      verifyingContract: contract,
    },
    types: VOUCHER_TYPES,
    primaryType: "LoopiternsVoucher",
    message: { minter, rarity, deadline, nonce },
    privateKey,
  });
  // Self-check: if viem and the contract ever disagree on the digest
  // layout, minting breaks silently for every player. Refuse to sign
  // instead of emitting a voucher the chain will reject.
  const recovered = await recoverAddress({
    hash: hashTypedData({
      domain: {
        ...VOUCHER_DOMAIN,
        chainId: ROBINHOOD_CHAIN_ID,
        verifyingContract: contract,
      },
      types: VOUCHER_TYPES,
      primaryType: "LoopiternsVoucher",
      message: { minter, rarity, deadline, nonce },
    }),
    signature,
  });
  if (recovered?.toLowerCase() !== mintSigner.toLowerCase()) {
    return NextResponse.json(
      { error: "voucher signer self-check failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    deadline: deadline.toString(),
    nonce: nonce.toString(),
    signature,
  });
}
