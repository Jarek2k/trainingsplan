// Renders public/apple-touch-icon.svg → public/apple-touch-icon.png (180×180).
// Run from repo root: `node scripts/build-touch-icon.mjs`
//
// macOS' built-in qlmanage scales SVGs to their natural unit size and pads the
// rest with white background — useless for app icons. sharp + librsvg renders
// at the requested pixel size correctly, no padding.

import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const SRC = new URL("../public/apple-touch-icon.svg", import.meta.url);
const OUT = new URL("../public/apple-touch-icon.png", import.meta.url);

const svg = await readFile(SRC);
const png = await sharp(svg, { density: 300 })
  .resize(180, 180, { fit: "contain", background: "#070b12" })
  .png()
  .toBuffer();
await writeFile(OUT, png);
console.log(`wrote ${OUT.pathname} (${png.length} bytes)`);
