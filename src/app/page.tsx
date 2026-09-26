import { ComingSoon } from "@/components/game/ComingSoon";
import { GameClient } from "@/components/game/GameClient";

/**
 * Pre-launch gate.
 *
 * While `true`, `/` renders only the COMING SOON screen — the game and every
 * mint path are unreachable from the site. Set it to `false` when the mint
 * link goes public; that flip is the entire removal. Only once the gate is
 * gone for good, delete `ComingSoon.tsx`, its import, and this constant.
 *
 * The flag is a build-time switch, not a runtime one: with a literal `true`
 * the `GameClient` branch is dead code, so webpack drops the game's client
 * chunks from the build altogether (verified — no built chunk contains
 * GameApp, GameCanvas or StartMenu). Flipping it therefore needs a rebuild,
 * which a deploy does anyway.
 */
const COMING_SOON = true;

export default function Home() {
  if (COMING_SOON) return <ComingSoon />;
  return <GameClient />;
}
