import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  coerceBests,
  emptyBests,
  isAddressKey,
  mergeNormalBests,
} from "@/web3/p2e/bests";
import type { AddressKey, NormalBests } from "@/web3/p2e/types";

type BestsMap = Record<string, NormalBests>;

const FILE_PATH = join(process.cwd(), "data", "normal-bests.json");
const TMP_PATH = join(tmpdir(), "loopternity-normal-bests.json");
const KV_KEY = "loopternity:normal-bests:v1";

function kvUrl(): string {
  return (
    process.env.KV_REST_API_URL?.trim() ||
    process.env.UPSTASH_REDIS_REST_URL?.trim() ||
    ""
  );
}

function kvToken(): string {
  return (
    process.env.KV_REST_API_TOKEN?.trim() ||
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    ""
  );
}

function readJsonFile(path: string): BestsMap {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      bests?: BestsMap;
    } & BestsMap;
    const raw = parsed.bests ?? parsed;
    const out: BestsMap = {};
    for (const [addr, value] of Object.entries(raw)) {
      if (isAddressKey(addr)) out[addr.toLowerCase()] = coerceBests(value);
    }
    return out;
  } catch {
    return {};
  }
}

function writeJsonFile(path: string, bests: BestsMap) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ v: 1, bests }, null, 2)}\n`);
}

function mergeMaps(...maps: BestsMap[]): BestsMap {
  const out: BestsMap = {};
  for (const map of maps) {
    for (const [addr, bests] of Object.entries(map)) {
      out[addr] = mergeNormalBests(out[addr] ?? emptyBests(), bests);
    }
  }
  return out;
}

async function kvGet(): Promise<BestsMap> {
  const url = kvUrl();
  const token = kvToken();
  if (!url || !token) return {};
  try {
    const res = await fetch(
      `${url.replace(/\/$/, "")}/get/${encodeURIComponent(KV_KEY)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return {};
    const json = (await res.json()) as { result?: unknown };
    if (json.result == null) return {};
    if (typeof json.result === "string") {
      try {
        return readJsonFromUnknown(JSON.parse(json.result));
      } catch {
        return {};
      }
    }
    return readJsonFromUnknown(json.result);
  } catch {
    return {};
  }
}

async function kvSet(bests: BestsMap): Promise<boolean> {
  const url = kvUrl();
  const token = kvToken();
  if (!url || !token) return false;
  try {
    const res = await fetch(
      `${url.replace(/\/$/, "")}/set/${encodeURIComponent(KV_KEY)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ v: 1, bests }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function readJsonFromUnknown(parsed: unknown): BestsMap {
  if (!parsed || typeof parsed !== "object") return {};
  const rec = parsed as { bests?: BestsMap } & BestsMap;
  const raw = rec.bests ?? rec;
  const out: BestsMap = {};
  for (const [addr, value] of Object.entries(raw)) {
    if (isAddressKey(addr)) out[addr.toLowerCase()] = coerceBests(value);
  }
  return out;
}

export async function loadBestsMap(): Promise<BestsMap> {
  const kv = await kvGet();
  return mergeMaps(readJsonFile(FILE_PATH), readJsonFile(TMP_PATH), kv);
}

export async function upsertAddressBests(
  address: AddressKey,
  incoming: NormalBests,
): Promise<NormalBests> {
  const all = await loadBestsMap();
  const key = address.toLowerCase();
  const merged = mergeNormalBests(all[key] ?? emptyBests(), coerceBests(incoming));
  all[key] = merged;
  const wroteKv = await kvSet(all);
  try {
    writeJsonFile(TMP_PATH, all);
  } catch {
    /* ignore */
  }
  if (!wroteKv && !process.env.VERCEL) {
    try {
      writeJsonFile(FILE_PATH, all);
    } catch {
      /* ignore */
    }
  }
  return merged;
}

export function getAddressBests(all: BestsMap, address: string): NormalBests {
  if (!isAddressKey(address)) return emptyBests();
  return all[address.toLowerCase()] ?? emptyBests();
}
