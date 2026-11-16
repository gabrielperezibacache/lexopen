import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkMacArtifact } from "./mac-artifact-check.mjs";
export function inspectSignature({ platform, arch, dist, packaged, execute = spawnSync }) {
let publisherAuthenticated = false, notarized = false;
let codeSignatureValid = null, gatekeeperAccepted = null;
const run = (file, args, extra = {}) => execute(file, args, { encoding: "utf8", timeout: 30000, shell: false, ...extra });
if (platform === "darwin") {
  const app = path.resolve(dist, packaged.appDirectory);
  if (!app.startsWith(dist + path.sep)) throw new Error("Application outside release output");
  const info = run("codesign", ["-dv", "--verbose=2", app]);
  codeSignatureValid = run("codesign", ["--verify", "--deep", "--strict", app]).status === 0;
  publisherAuthenticated = info.status === 0 && codeSignatureValid && /^Authority=Developer ID Application:/m.test(info.stderr || "");
  notarized = publisherAuthenticated && run("xcrun", ["stapler", "validate", app]).status === 0;
  gatekeeperAccepted = run("spctl", ["--assess", "--type", "execute", "--verbose=2", app]).status === 0;
} else if (platform === "win32") {
  const installer = path.join(dist, `LexOpen-${packaged.version}-win-x64.exe`);
  const result = run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "$s=Get-AuthenticodeSignature -LiteralPath $env:LEXOPEN_SIGNATURE_TARGET; if($s.Status -eq 'Valid' -and $s.SignerCertificate){exit 0}; exit 1"], { env: { ...process.env, LEXOPEN_SIGNATURE_TARGET: installer }, stdio: "ignore" });
  publisherAuthenticated = result.status === 0;
  codeSignatureValid = publisherAuthenticated;
}
return { format: 2, platform, arch, version: packaged.version, codeSignatureValid, gatekeeperAccepted, publisherAuthenticated, notarized, kind: platform === "linux" ? "checksums-only" : publisherAuthenticated ? "publisher-signature" : "unsigned-preview" };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
const target = `${process.platform}-${process.arch}`, dist = path.resolve("desktop/dist");
const packaged = JSON.parse(fs.readFileSync(path.join(dist, `lexopen-packaged-${target}.json`), "utf8"));
const report = inspectSignature({ platform: process.platform, arch: process.arch, dist, packaged });
if (process.platform === "darwin") Object.assign(report, await checkMacArtifact({ dist, version: packaged.version, arch: process.arch }));
fs.writeFileSync(path.join(dist, `lexopen-signature-${target}.json`), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
}
