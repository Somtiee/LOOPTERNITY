import { NextResponse } from "next/server";
import { coerceBests, isAddressKey } from "@/web3/p2e/bests";
import {
  getAddressBests,
  loadBestsMap,
  upsertAddressBests,
} from "./store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address")?.trim() ?? "";
  if (!isAddressKey(address)) {
    return NextResponse.json({ error: "bad address" }, { status: 400 });
  }
  const all = await loadBestsMap();
  return NextResponse.json({
    address: address.toLowerCase(),
    bests: getAddressBests(all, address),
  });
}

export async function PUT(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const address = typeof rec.address === "string" ? rec.address.trim() : "";
  if (!isAddressKey(address)) {
    return NextResponse.json({ error: "bad address" }, { status: 400 });
  }
  const bests = await upsertAddressBests(address, coerceBests(rec.bests));
  return NextResponse.json({ address: address.toLowerCase(), bests });
}
