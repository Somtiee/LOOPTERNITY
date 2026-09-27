import { ComingSoon } from "@/components/game/ComingSoon";
import { GameClient } from "@/components/game/GameClient";

/**
 * Pre-launch gate — currently ON, so `/` serves the placeholder and the game
 * and every mint path are unreachable from the site.
 *
 * It was switched off for a window to play the game on the deployed URL (mint
 * testing and capture), and is back on while the mint is still unannounced.
 * Set it to `false` when the mint link goes public; that flip is the entire
 * opening. ComingSoon.tsx, its import and the branch below are all kept so the
 * flip stays one line either way.
 *
 * The flag is a build-time switch, not a runtime one: with a literal `true` the
 * `GameClient` branch is dead code, so webpack drops the game's client chunks
 * from the build altogether (verified — no built chunk contains GameApp,
 * GameCanvas or StartMenu). With `false` the reverse happens and ComingSoon is
 * dropped instead. Either way it needs a rebuild, which a deploy does anyway.
 *
 * Only once the gate is gone for good, delete it: this constant, the import and
 * branch below, and `components/game/ComingSoon.tsx` — nothing else refers to
 * them.
 */
const COMING_SOON = true;

export default function Home() {
  if (COMING_SOON) return <ComingSoon />;
  return <GameClient />;
}
