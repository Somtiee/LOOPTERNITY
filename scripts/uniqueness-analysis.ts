/** Temp analysis: how many of the 10k tokens have a visually unique look? */
import {
  dnaFromTokenId,
  shadingStylesFor,
  tintsFor,
  SHADING_TONES,
  SHADING_WEIGHTS,
} from "../src/game/loopiternTraits";
import { RARITIES } from "../src/game/mintTiers";

function main() {
  let totalTokens = 0;
  let totalDistinct = 0;
  let totalLookalikes = 0;

  for (const r of RARITIES) {
    const counts = new Map<string, number>();
    for (let id = 1; id <= r.supply; id += 1) {
      const d = dnaFromTokenId(id, r.id);
      const key = [
        d.eyeTint,
        d.bellyTint,
        d.accentTint,
        d.shadingStyle,
        d.shadingWeight,
        d.shadingTone,
        d.capeTint ?? "",
      ].join("|");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const distinct = counts.size;
    const lookalikes = [...counts.values()].filter((n) => n > 1).reduce((a, n) => a + n, 0);
    const combos = Math.round(
      tintsFor("eyeTint", r.id).length *
        tintsFor("bellyTint", r.id).length *
        tintsFor("accentTint", r.id).length *
        shadingStylesFor(r.id).length *
        SHADING_WEIGHTS.length *
        SHADING_TONES.length *
        (r.id === 4 ? tintsFor("capeTint", 4).length : 1),
    );
    console.log(
      `${r.name.padEnd(10)} tokens=${String(r.supply).padStart(5)}  catalog combos=${String(combos).padStart(7)}  distinct looks=${String(distinct).padStart(5)}  tokens sharing a look=${String(lookalikes).padStart(5)} (${((100 * lookalikes) / r.supply).toFixed(1)}%)`,
    );
    totalTokens += r.supply;
    totalDistinct += distinct;
    totalLookalikes += lookalikes;
  }
  console.log(
    `\nTOTAL: ${totalTokens} tokens, ${totalDistinct} distinct looks, ${totalLookalikes} tokens (${((100 * totalLookalikes) / totalTokens).toFixed(1)}%) share their exact look with at least one other token`,
  );
}

main();
