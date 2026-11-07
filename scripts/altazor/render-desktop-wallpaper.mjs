/** Compose the approved, unchanged transparent signature on the desktop canvas. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const logo = await readFile(new URL("../../public/icons/lexopen-logo.png", import.meta.url));
const directory = new URL("../../public/branding/", import.meta.url);
const source = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="2560" height="1600" viewBox="0 0 2560 1600" role="img" aria-labelledby="title description">
  <title id="title">LexOpen · Escritorio de Altazor</title>
  <desc id="description">Fondo índigo con la firma del lector clásico en plata, a la derecha; espacio libre a la izquierda para trabajar.</desc>
  <!-- Approved signature source SHA-256: ${createHash("sha256").update(logo).digest("hex")} -->
  <path fill="#0d1022" d="M0 0h2560v1600H0z"/>
  <path fill="#11162c" d="M1960 0h600v1600H1230z"/>
  <path fill="#171b34" d="M2360 0h200v1600H1770z"/>
  <path fill="#aab5ff" opacity=".12" d="m2468 0 2 0-588 1600h-2z"/>
  <image x="1330" y="210" width="1030" height="1030" xlink:href="data:image/png;base64,${logo.toString("base64")}"/>
  <path stroke="#aab5ff" stroke-opacity=".24" stroke-width="1" d="M152 1456h2256"/>
</svg>\n`;
await mkdir(directory, { recursive: true });
await writeFile(new URL("lexopen-desktop-midnight.svg", directory), source);
for (const [width, height] of [[2560, 1600], [1280, 800]]) {
  await sharp(Buffer.from(source)).resize(width, height).png().toFile(fileURLToPath(new URL(`lexopen-desktop-midnight-${width}.png`, directory)));
}
console.log("Fondo de LexOpen generado: SVG, 2560 × 1600 y 1280 × 800.");
