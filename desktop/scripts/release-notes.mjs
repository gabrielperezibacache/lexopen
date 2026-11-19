import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function releaseNotes(notes, manifest, version, revision) {
  if (manifest.publishable !== true || manifest.version !== version || manifest.sourceRevision !== revision) {
    throw new Error("Expected the publishable manifest for this version and revision");
  }
  for (const arch of ["arm64", "x64"]) {
    const report = manifest.signatures.find(item => item.platform === "darwin" && item.arch === arch);
    for (const format of ["dmg", "zip"]) {
      const receipt = report?.artifacts?.[format];
      if (!receipt || [receipt.codeSignatureValid, receipt.publisherAuthenticated, receipt.notarized, receipt.gatekeeperAccepted].some(result => result !== true)) {
        throw new Error(`Missing public Mac artifact verification: ${arch}/${format}`);
      }
    }
  }
  const windows = manifest.signatures.find(report => report.platform === "win32");
  if (!windows) throw new Error("Missing Windows signature receipt");
  const windowsStatus = windows.publisherAuthenticated === true
    ? "El instalador de Windows tiene una firma de editor válida."
    : "El instalador de Windows se distribuye sin firma de editor verificada.";
  return [
    notes.trimEnd(),
    "En Mac Intel y Apple Silicon, el DMG de instalación y el ZIP de actualización incluyen una aplicación con firma Developer ID, ticket de notarización y aceptación de Gatekeeper.",
    windowsStatus,
    "Consulte los recibos por plataforma en `release-manifest.json` y las huellas de los archivos en `SHA256SUMS`.",
    `[Guía de instalación](https://github.com/gabrielperezibacache/lexopen/blob/v${version}/docs/INSTALADORES.md)\n`,
  ].join("\n\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { version } = JSON.parse(await fs.readFile("package.json", "utf8"));
  const manifest = JSON.parse(await fs.readFile("release/release-manifest.json", "utf8"));
  const notes = await fs.readFile(`docs/releases/${version}.md`, "utf8");
  process.stdout.write(releaseNotes(notes, manifest, version, process.env.GITHUB_SHA));
}
