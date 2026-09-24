/**
 * Rasterizes `src/app/icon.svg` into the raster icons Next.js serves.
 *
 *   npm run icons
 *
 * The vector file is the source of truth. `icon.svg` alone covers Chrome,
 * Edge and Firefox (`sizes="any"`), but Safari ignores SVG favicons and
 * falls back to the default globe, and iOS "Add to Home Screen" wants a
 * 180px apple-touch-icon rather than a tab icon — so both rasters are
 * committed alongside it and must be regenerated whenever the SVG changes.
 *
 *   src/app/icon.svg      -> src/app/favicon.ico    16 / 32 / 48, PNG-packed
 *                         -> src/app/apple-icon.png 180px, flattened
 *
 * The ICO is PNG-in-ICO (Vista+ and every current browser); the apple touch
 * icon is flattened onto the brand ground because iOS applies its own corner
 * mask and would otherwise show through the SVG's rounded corners.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SVG_PATH = path.join(ROOT, "src/app/icon.svg");
const ICO_PATH = path.join(ROOT, "src/app/favicon.ico");
const APPLE_PATH = path.join(ROOT, "src/app/apple-icon.png");

const ICO_SIZES = [16, 32, 48];
const APPLE_SIZE = 180;

/** Brand ground — matches --ground in the app and the icon's own tile. */
const GROUND = "#04100a";

/** ICONDIR header: reserved, type 1 (icon), image count. */
function icoHeader(count: number): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  return header;
}

/** One 16-byte ICONDIRENTRY. Width/height 256 is encoded as 0. */
function icoEntry(png: Buffer, size: number, offset: number): Buffer {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0);
  entry.writeUInt8(size >= 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2); // palette size — 0 for truecolour
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(offset, 12);
  return entry;
}

async function renderPng(svg: Buffer, size: number): Promise<Buffer> {
  return sharp(svg, { density: 384 })
    .resize(size, size, { fit: "contain" })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  const svg = await readFile(SVG_PATH);

  const frames = await Promise.all(
    ICO_SIZES.map(async (size) => ({ size, png: await renderPng(svg, size) })),
  );

  // Header + directory come first, so each payload's offset is the sum of
  // everything before it: 6 + 16n, then each PNG in turn.
  const directoryBytes = 6 + frames.length * 16;
  let offset = directoryBytes;
  const entries: Buffer[] = [];
  for (const frame of frames) {
    entries.push(icoEntry(frame.png, frame.size, offset));
    offset += frame.png.length;
  }

  const ico = Buffer.concat([
    icoHeader(frames.length),
    ...entries,
    ...frames.map((f) => f.png),
  ]);
  await writeFile(ICO_PATH, ico);

  // iOS masks the corners itself, so hand it an opaque square.
  const apple = await sharp(svg, { density: 384 })
    .resize(APPLE_SIZE, APPLE_SIZE, { fit: "contain" })
    .flatten({ background: GROUND })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(APPLE_PATH, apple);

  console.log(
    `wrote ${path.relative(ROOT, ICO_PATH)} (${ICO_SIZES.join("/")}, ${ico.length} bytes)`,
  );
  console.log(
    `wrote ${path.relative(ROOT, APPLE_PATH)} (${APPLE_SIZE}px, ${apple.length} bytes)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
