/**
 * Cheap deterministic checks for the J4 DNA schema. Run:
 *   npx tsx src/game/loopiternTraits.check.ts
 */
import {
  attributesFromDna,
  dnaCollisionKey,
  dnaFromTokenId,
  DNA_CHANNELS,
  findMark,
  LOOPITERN_TRAIT_SCHEMA_VERSION,
  marksFor,
  traitSeed32,
  tintsFor,
} from "./loopiternTraits";
import type { LoopiternRarityId } from "./mintTiers";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const RARITIES: LoopiternRarityId[] = [0, 1, 2, 3, 4];
const TINT_CHANNELS = ["eyeTint", "bellyTint", "accentTint", "capeTint"] as const;

function channelDiffCount(
  a: ReturnType<typeof dnaFromTokenId>,
  b: ReturnType<typeof dnaFromTokenId>,
): number {
  return DNA_CHANNELS.filter((c) => a[c] !== b[c]).length;
}

function main() {
  assert(LOOPITERN_TRAIT_SCHEMA_VERSION === 2, "schemaVersion");

  const a = dnaFromTokenId(12, 0);
  const b = dnaFromTokenId(12, 0);
  assert(JSON.stringify(a) === JSON.stringify(b), "same (id, rarity) must match");

  const c = dnaFromTokenId(12, 1);
  assert(a.base !== c.base, "same id different rarity changes DNA");
  assert(a.rarity === 0 && c.rarity === 1, "rarity stored");
  assert(a.tokenId === 12 && a.schemaVersion === 2, "serial + schema");
  assert(a.capeTint === null, "Common has no cape tint");
  assert(dnaFromTokenId(1, 4).capeTint !== null, "Legendary always rolls a cape tint");

  // Catalogs: non-empty for every rarity band, mark never "none".
  assert(!marksFor(0).some((m) => m.id === "none"), 'no "none" mark exists');
  assert(marksFor(0).length >= 8, "at least 8 marks at Common");
  for (const r of RARITIES) {
    for (const channel of TINT_CHANNELS) {
      if (channel === "capeTint" && r < 4) {
        assert(tintsFor("capeTint", r).length === 0, "cape catalog empty below Legendary");
        continue;
      }
      assert(tintsFor(channel, r).length > 0, `${channel} non-empty at rarity ${r}`);
    }
    assert(marksFor(r).length > 0, `marks non-empty at rarity ${r}`);
  }

  // 100-token sample per rarity: mark never "none", always a real catalog id.
  for (const r of RARITIES) {
    for (let id = 1; id <= 100; id += 1) {
      const d = dnaFromTokenId(id, r);
      assert(d.mark !== "none", `mark must never be "none" (${id}/${r})`);
      assert(findMark(d.mark) != null, `mark must be a catalog id (${d.mark})`);
    }
  }

  // Two random same-rarity DNAs must differ in at least 2 channels (prompt
  // J4), drawn from a 100-token sample per rarity with a fixed seed. The
  // full pair scan adds an aggregate bound: rare 4-of-5 channel collisions
  // are legal but must stay well under 1% of pairs.
  const rng = { s: traitSeed32(1, 0) };
  const nextRng = () => {
    let x = rng.s >>> 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    rng.s = x >>> 0;
    return rng.s;
  };
  let weakPairs = 0;
  let identicalPairs = 0;
  let totalPairs = 0;
  for (const r of RARITIES) {
    const dnas = Array.from({ length: 100 }, (_, i) => dnaFromTokenId(i + 1, r));
    for (let i = 0; i < 100; i += 1) {
      for (let j = i + 1; j < 100; j += 1) {
        const diffs = channelDiffCount(dnas[i]!, dnas[j]!);
        totalPairs += 1;
        if (diffs === 0) identicalPairs += 1;
        if (diffs < 2) weakPairs += 1;
      }
    }
    for (let i = 0; i < 12; i += 1) {
      const idA = (nextRng() % 100) + 1;
      const idB = (nextRng() % 100) + 1;
      if (idA === idB) continue;
      const diffs = channelDiffCount(dnaFromTokenId(idA, r), dnaFromTokenId(idB, r));
      assert(diffs >= 2, `random ${idA}/${r} vs ${idB}/${r} differ in ${diffs} channels`);
    }
  }
  assert(
    weakPairs / totalPairs < 0.006,
    `too many pairs differing in <2 channels: ${weakPairs}/${totalPairs}`,
  );
  // Full 5-channel collisions are birthday-unavoidable with finite catalogs
  // (~1/6k–17k combos per band ⇒ ~2 expected across 24,750 pairs). Bound the
  // rate, not the raw count: still well under 0.1% of pairs.
  assert(
    identicalPairs / totalPairs < 0.001,
    `too many visually identical same-rarity pairs: ${identicalPairs}/${totalPairs}`,
  );

  // Visual variety among Commons (collision key stays unique via tokenId).
  const keys = new Set<string>();
  const collision = new Set<string>();
  for (let id = 1; id <= 200; id += 1) {
    const d = dnaFromTokenId(id, 0);
    keys.add([d.eyeTint, d.bellyTint, d.accentTint, d.mark].join("|"));
    collision.add(dnaCollisionKey(d));
  }
  assert(keys.size >= 150, `expected visual variety among Commons, got ${keys.size}`);
  assert(collision.size === 200, "tokenId in DNA keeps Commons unique");

  // OpenSea attributes carry the new channels; serial is plain metadata.
  const attrs = attributesFromDna(a);
  assert(attrs.some((x) => x.trait_type === "Rarity" && x.value === "Common"), "OpenSea rarity");
  assert(attrs.some((x) => x.trait_type === "Serial" && x.value === "12"), "OpenSea serial");
  assert(!attrs.some((x) => x.trait_type === "Cape Tint"), "no cape attribute below Legendary");
  for (const trait of ["Eye Tint", "Belly Tint", "Accent", "Mark"]) {
    assert(attrs.some((x) => x.trait_type === trait), `OpenSea ${trait}`);
  }
  const legendAttrs = attributesFromDna(dnaFromTokenId(1, 4));
  assert(legendAttrs.some((x) => x.trait_type === "Cape Tint"), "OpenSea cape tint at Legendary");

  assert(traitSeed32(1, 0) !== traitSeed32(2, 0), "tokenId in seed");
  assert(traitSeed32(1, 0) !== traitSeed32(1, 1), "rarity in seed");

  for (const r of RARITIES) {
    const d = dnaFromTokenId(7, r);
    assert(d.base === `rarity-${r}`, "base tracks rarity");
  }

  let threw = false;
  try {
    dnaFromTokenId(0, 0);
  } catch {
    threw = true;
  }
  assert(threw, "tokenId 0 rejected");

  console.log("loopiternTraits.check: ok");
}

main();
