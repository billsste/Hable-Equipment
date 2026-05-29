import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "icons");

const PURPLE = "#533afd";
const DEEP = "#4434d4";

function svg({ size, padding = 0, mark = "ED" }) {
  const fontSize = Math.round((size - padding * 2) * 0.42);
  const fontWeight = 700;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${PURPLE}"/>
      <stop offset="100%" stop-color="${DEEP}"/>
    </linearGradient>
  </defs>
  <rect x="${padding}" y="${padding}" width="${size - padding * 2}" height="${size - padding * 2}" rx="${(size - padding * 2) * 0.22}" fill="url(#g)"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
        font-family="-apple-system, BlinkMacSystemFont, Inter, system-ui, sans-serif"
        font-size="${fontSize}" font-weight="${fontWeight}" fill="#ffffff" letter-spacing="-2">${mark}</text>
</svg>`;
}

async function emit(file, buf) {
  writeFileSync(join(outDir, file), buf);
  console.log("wrote", file);
}

async function main() {
  // Standard icons
  await emit("icon-192.png", await sharp(Buffer.from(svg({ size: 192 }))).png().toBuffer());
  await emit("icon-512.png", await sharp(Buffer.from(svg({ size: 512 }))).png().toBuffer());

  // Maskable: 20% safe-area padding, full background bleed
  await emit("icon-maskable-512.png", await sharp(Buffer.from(svg({ size: 512, padding: 0, mark: "ED" }))).png().toBuffer());

  // Apple touch icon (180px, no rounding — iOS rounds it)
  await emit("apple-touch-icon.png", await sharp(Buffer.from(svg({ size: 180 }))).png().toBuffer());

  // Favicons
  await emit("favicon-32.png", await sharp(Buffer.from(svg({ size: 32 }))).png().toBuffer());
  await emit("favicon-16.png", await sharp(Buffer.from(svg({ size: 16 }))).png().toBuffer());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
