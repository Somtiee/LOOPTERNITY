import { ComingSoon } from "@/components/game/ComingSoon";
import { GameClient } from "@/components/game/GameClient";

/**
 * Pre-launch gate — currently OFF, so every environment serves the game.
 *
 * Turned off so the game can be played on the deployed URL (testing and
 * capture). Set it back to `true` to hide the game and every mint path behind
 * the placeholder again — that flip is the entire re-gate, and ComingSoon.tsx is
 * kept around for exactly that. It needs a rebuild, which a deploy does anyway.
 *
 * The flag is a build-time switch, not a runtime one: with a literal `true` the
 * `GameClient` branch is dead code, so webpack drops the game's client chunks
 * from the build altogether (verified — no built chunk contains GameApp,
 * GameCanvas or StartMenu). With `false` the reverse happens and ComingSoon is
 * dropped instead.
 *
 * Only once the gate is gone for good, delete it: this constant, the import and
 * branch below, and `components/game/ComingSoon.tsx` — nothing else refers to
 * them.
 */
const COMING_SOON = false;

export default function Home() {
  if (COMING_SOON) return <ComingSoon />;
  return <GameClient />;
}
