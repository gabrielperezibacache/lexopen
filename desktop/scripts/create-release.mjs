import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const pilotTag = "v1.1.0";

export function createDesktopRelease({ tag, version, revision, notesFile, assets }, gh) {
  if (tag !== `v${version}`) throw new Error("La etiqueta no corresponde a la versión ensamblada.");
  const names = assets.map(file => path.basename(file));
  if (!names.includes("release-manifest.json") || !names.includes("SHA256SUMS")) throw new Error("Faltan el manifiesto o las sumas de la versión ensamblada.");
  const args = ["release", "create", tag, ...assets, "--verify-tag", "--title", `LexOpen ${version}`, "--generate-notes", "--notes-file", notesFile];
  if (tag === pilotTag) {
    // A rebuild can produce different bytes. The first candidate stays available for the pilot.
    const existing = gh(["api", "--paginate", "repos/{owner}/{repo}/releases?per_page=100", "--jq", `.[] | select(.tag_name == "${pilotTag}") | .id`]);
    if (existing.trim()) throw new Error(`Ya existe una release para ${pilotTag}. Revise ese candidato antes de continuar.`);
    const commit = gh(["api", `repos/{owner}/{repo}/commits/refs/tags/${pilotTag}`, "--jq", ".sha"]).trim();
    if (commit !== revision) throw new Error("El commit actual de la etiqueta difiere del candidato ensamblado.");
    args.push("--draft", "--target", revision);
  } else if (version.includes("-")) {
    args.push("--prerelease");
  }
  return gh(args);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [version, notesFile] = process.argv.slice(2);
  const assets = readdirSync("release").filter(name => !name.startsWith(".")).sort().map(name => path.join("release", name));
  const result = createDesktopRelease({ tag: process.env.GITHUB_REF_NAME, revision: process.env.GITHUB_SHA, version, notesFile, assets },
    args => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }));
  process.stdout.write(result);
}
