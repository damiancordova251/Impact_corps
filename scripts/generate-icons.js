import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Regenerates the PNG icon exports from the single source SVG so every
// installed-app/PWA icon size stays pixel-consistent after an SVG edit.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const iconsDir = path.join(projectRoot, "icons");
const sourceSvg = path.join(iconsDir, "app-icon.svg");
const sizes = [180, 192, 512];

await Promise.all(sizes.map((size) => sharp(sourceSvg, { density: 384 })
  .resize(size, size)
  .png()
  .toFile(path.join(iconsDir, `app-icon-${size}.png`))));

console.log(`Regenerated icons/app-icon-{${sizes.join(",")}}.png from app-icon.svg`);
