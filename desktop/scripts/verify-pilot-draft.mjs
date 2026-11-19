import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pilotTag } from "./create-release.mjs";
import { releaseNotes } from "./release-notes.mjs";

const repo = "repos/{owner}/{repo}";
const version = pilotTag.slice(1);
const manifestName = "release-manifest.json";
const sumsName = "SHA256SUMS";
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

// Only the two small metadata files are downloaded. For installers, GitHub supplies the uploaded byte digests.
export function verifyPilotDraft(revision, get) {
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error("Indique el SHA completo del commit aprobado (40 caracteres).");
  const readRows = (route, query) => {
    const lines = get(route, "--paginate", "--jq", query).toString("utf8").trim();
    return lines ? lines.split("\n").map(line => JSON.parse(line)) : [];
  };
  const releases = readRows(`${repo}/releases?per_page=100`, `.[] | select(.tag_name == "${pilotTag}") | {id, draft, prerelease} | @json`);
  if (releases.length !== 1 || releases[0].draft !== true || releases[0].prerelease !== false) throw new Error(`Se requiere un único borrador estable visible para ${pilotTag}.`);
  const releaseId = releases[0].id;
  const commit = get(`${repo}/commits/refs/tags/${pilotTag}`, "--jq", ".sha").toString("utf8").trim();
  if (commit !== revision) throw new Error("El SHA de la etiqueta difiere del commit aprobado.");
  const assets = readRows(`${repo}/releases/${releaseId}/assets?per_page=100`, ".[] | {id, name, size, state, digest} | @json");
  const byName = new Map(assets.map(asset => [asset.name, asset]));
  if (byName.size !== assets.length) throw new Error("GitHub informa nombres de archivo repetidos.");
  for (const asset of assets) {
    if (asset.state !== "uploaded" || !/^sha256:[a-f0-9]{64}$/.test(asset.digest) || !Number.isSafeInteger(asset.size) || asset.size <= 0) throw new Error(`Archivo incompleto en GitHub: ${asset.name}`);
  }
  function metadata(name) {
    const asset = byName.get(name);
    if (!asset) throw new Error(`Falta ${name} en el borrador.`);
    const bytes = get(`${repo}/releases/assets/${asset.id}`, "-H", "Accept: application/octet-stream");
    if (bytes.length !== asset.size || `sha256:${sha256(bytes)}` !== asset.digest) throw new Error(`Los bytes de ${name} difieren de su registro en GitHub.`);
    return bytes.toString("utf8");
  }
  const manifest = JSON.parse(metadata(manifestName));
  if (manifest.format !== 1 || manifest.channel !== "latest" || manifest.prerelease !== false || !manifest.files?.length) throw new Error("Se requiere el manifiesto estable de la versión.");
  releaseNotes("", manifest, version, revision);
  if (!manifest.signatures.some(report => report.platform === "win32" && report.publisherAuthenticated === true)) throw new Error("Se requiere una firma de editor válida para Windows.");
  const expectedNames = new Set([manifestName, sumsName]);
  const sums = [];
  for (const file of manifest.files) {
    const asset = byName.get(file.name);
    if (!asset || expectedNames.has(file.name) || file.size !== asset.size || `sha256:${file.sha256}` !== asset.digest) throw new Error(`El archivo difiere del manifiesto: ${file.name}`);
    expectedNames.add(file.name);
    sums.push(`${file.sha256}  ${file.name}`);
  }
  if (expectedNames.size !== byName.size) throw new Error("Hay archivos del borrador fuera del manifiesto.");
  const manifestSha256 = byName.get(manifestName).digest.slice(7);
  sums.push(`${manifestSha256}  ${manifestName}`);
  if (metadata(sumsName) !== sums.join("\n") + "\n") throw new Error("SHA256SUMS difiere del manifiesto.");
  return {
    tag: pilotTag, revision, releaseId, manifestSha256, checksumsSha256: byName.get(sumsName).digest.slice(7),
    assets: assets.map(({ id, name, size, digest }) => ({ id, name, size, sha256: digest.slice(7) })).sort((a, b) => a.id - b.id),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const report = verifyPilotDraft(process.argv[2], (...args) => execFileSync("gh", ["api", "--method", "GET", ...args], { stdio: ["ignore", "pipe", "inherit"] }));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
