import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), repo = path.dirname(desktop);
const require = createRequire(path.join(repo, "package.json"));
const sharp = require("sharp");
const source = fs.readFileSync(path.join(repo, "src/app/icon.svg"));
const sizes = [16, 32, 48, 64, 128, 256, 512, 1024], images = new Map();
for (const size of sizes) images.set(size, await sharp(source, { density: 192 }).resize(size, size).png().toBuffer());
const build = path.join(desktop, "build"); fs.mkdirSync(build, { recursive: true });
fs.writeFileSync(path.join(build, "icon.png"), images.get(1024));
const icoSizes = sizes.filter(size => size <= 256), header = Buffer.alloc(6 + icoSizes.length * 16);
header.writeUInt16LE(1, 2); header.writeUInt16LE(icoSizes.length, 4);
let offset = header.length;
for (const [index, size] of icoSizes.entries()) {
  const entry = 6 + index * 16, image = images.get(size);
  header[entry] = size === 256 ? 0 : size; header[entry + 1] = header[entry];
  header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(image.length, entry + 8); header.writeUInt32LE(offset, entry + 12); offset += image.length;
}
fs.writeFileSync(path.join(build, "icon.ico"), Buffer.concat([header, ...icoSizes.map(size => images.get(size))]));
const types = { 16: "icp4", 32: "icp5", 64: "icp6", 128: "ic07", 256: "ic08", 512: "ic09", 1024: "ic10" };
const chunks = Object.entries(types).map(([size, type]) => { const image = images.get(Number(size)), chunk = Buffer.alloc(8); chunk.write(type); chunk.writeUInt32BE(image.length + 8, 4); return Buffer.concat([chunk, image]); });
const icnsHeader = Buffer.alloc(8); icnsHeader.write("icns"); icnsHeader.writeUInt32BE(8 + chunks.reduce((total, chunk) => total + chunk.length, 0), 4);
fs.writeFileSync(path.join(build, "icon.icns"), Buffer.concat([icnsHeader, ...chunks]));
fs.writeFileSync(path.join(build, "icons-source.json"), JSON.stringify({ source: "src/app/icon.svg", sourceSha256: crypto.createHash("sha256").update(source).digest("hex"), png: 1024, ico: icoSizes, icns: Object.keys(types).map(Number) }, null, 2));
console.log("Desktop icons generated from the existing LexOpen SVG.");
