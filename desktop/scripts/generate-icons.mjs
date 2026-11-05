import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), repo = path.dirname(desktop);
const require = createRequire(path.join(repo, "package.json"));
const sharp = require("sharp");
const sourcePath = "docs/assets/lexopen-lockup.png", readerPath = "docs/assets/lexopen-engraving.png";
const source = fs.readFileSync(path.join(repo, sourcePath)), reader = fs.readFileSync(path.join(repo, readerPath));
const pwa = path.join(repo, "public/icons");
const transparentLogo = fs.readFileSync(path.join(pwa, "lexopen-logo.png"));
const sizes = [16, 32, 48, 64, 128, 180, 192, 256, 512, 1024], images = new Map();
for (const size of sizes) images.set(size, await sharp(size < 128 ? reader : source).resize(size, size).ensureAlpha().png().toBuffer());
const build = path.join(desktop, "build"); fs.mkdirSync(build, { recursive: true });
fs.writeFileSync(path.join(build, "icon.png"), images.get(1024));
const icoSizes = [16, 32, 48, 64, 128, 256], header = Buffer.alloc(6 + icoSizes.length * 16);
header.writeUInt16LE(1, 2); header.writeUInt16LE(icoSizes.length, 4);
let offset = header.length;
for (const [index, size] of icoSizes.entries()) {
  const entry = 6 + index * 16, image = images.get(size);
  header[entry] = size === 256 ? 0 : size; header[entry + 1] = header[entry];
  header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(image.length, entry + 8); header.writeUInt32LE(offset, entry + 12); offset += image.length;
}
const ico = Buffer.concat([header, ...icoSizes.map(size => images.get(size))]);
fs.writeFileSync(path.join(build, "icon.ico"), ico);
fs.writeFileSync(path.join(repo, "src/app/favicon.ico"), ico);
fs.writeFileSync(path.join(repo, "src/app/icon.png"), images.get(192));
fs.writeFileSync(path.join(repo, "src/app/apple-icon.png"), images.get(180));
fs.writeFileSync(path.join(desktop, "renderer", "lexopen-brand.png"), await sharp(transparentLogo).resize(192, 192).png().toBuffer());
for (const size of [192, 512]) fs.writeFileSync(path.join(pwa, `icon-${size}.png`), images.get(size));
// Frame the reader without the wordmark for navigation surfaces.
const compactLogo = await sharp(transparentLogo)
  .extract({ left: 230, top: 127, width: 768, height: 768 })
  .resize(152, 152)
  .extend({ top: 20, bottom: 20, left: 20, right: 20, background: "transparent" })
  .png().toBuffer();
fs.writeFileSync(path.join(pwa, "lexopen-reader-transparent-192.png"), compactLogo);
// Keep the figure inside the maskable safe circle and extend the midnight field to every edge.
const maskable = await sharp(reader).resize(448, 448).extend({ top: 32, bottom: 32, left: 32, right: 32, background: "#0d1022" }).png().toBuffer();
fs.writeFileSync(path.join(pwa, "icon-maskable-512.png"), maskable);
fs.writeFileSync(path.join(repo, "docs/assets/lexopen-logo.png"), await sharp(transparentLogo).resize(256, 256).png().toBuffer());
const types = { 16: "icp4", 32: "icp5", 64: "icp6", 128: "ic07", 256: "ic08", 512: "ic09", 1024: "ic10" };
const chunks = Object.entries(types).map(([size, type]) => { const image = images.get(Number(size)), chunk = Buffer.alloc(8); chunk.write(type); chunk.writeUInt32BE(image.length + 8, 4); return Buffer.concat([chunk, image]); });
const icnsHeader = Buffer.alloc(8); icnsHeader.write("icns"); icnsHeader.writeUInt32BE(8 + chunks.reduce((total, chunk) => total + chunk.length, 0), 4);
fs.writeFileSync(path.join(build, "icon.icns"), Buffer.concat([icnsHeader, ...chunks]));
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
fs.writeFileSync(path.join(build, "icons-source.json"), JSON.stringify({ source: sourcePath, sourceSha256: sha(source), reader: readerPath, readerSha256: sha(reader), png: 1024, ico: icoSizes, icns: Object.keys(types).map(Number), web: { apple: 180, pwa: [192, 512], maskable: 512 } }, null, 2) + "\n");
console.log("LexOpen brand, compact icon and installer resources regenerated.");
