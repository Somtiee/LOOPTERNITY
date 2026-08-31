/**
 * Cheap path checks for Prompt J3/J4. Run: npx tsx src/game/loopiternStills.check.ts
 */
import {
  LOOPITERN_PREVIEW_GRID_FS_PATH,
  LOOPITERN_PREVIEW_GRID_PATH,
  stillPath,
  stillRelativeFsPath,
} from "./loopiternStills";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(stillPath(1, 0) === "/loopiterns/generated/0/1.png", "stillPath common");
assert(stillPath(180, 4) === "/loopiterns/generated/4/180.png", "stillPath legendary");
assert(
  stillRelativeFsPath(7, 2) === "public/loopiterns/generated/2/7.png",
  "fs path",
);
assert(
  LOOPITERN_PREVIEW_GRID_PATH === "/loopiterns/preview-grid.png",
  "preview grid web path",
);
assert(
  LOOPITERN_PREVIEW_GRID_FS_PATH === "public/loopiterns/preview-grid.png",
  "preview grid fs path",
);

let threw = false;
try {
  stillPath(0, 0);
} catch {
  threw = true;
}
assert(threw, "tokenId 0 rejected");

console.log("loopiternStills.check: ok");
