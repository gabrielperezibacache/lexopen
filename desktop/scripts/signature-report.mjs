import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
const target = `${process.platform}-${process.arch}`, dist = path.resolve("desktop/dist");
const packaged = JSON.parse(fs.readFileSync(path.join(dist, `lexopen-packaged-${target}.json`), "utf8"));
let publisherAuthenticated = false, notarized = false;
if (process.platform === "darwin") {
  const app = path.resolve(dist, packaged.appDirectory);
  if (!app.startsWith(dist + path.sep)) throw new Error("Application outside release output");
  const info = spawnSync("codesign", ["-dv", "--verbose=2", app], { encoding: "utf8" });
  const verify = spawnSync("codesign", ["--verify", "--deep", "--strict", app]);
  publisherAuthenticated = info.status === 0 && verify.status === 0 && /^Authority=Developer ID Application:/m.test(info.stderr);
  notarized = publisherAuthenticated && spawnSync("xcrun", ["stapler", "validate", app], { stdio: "ignore" }).status === 0;
} else if (process.platform === "win32") {
  const installer = path.join(dist, `LexOpen-${packaged.version}-win-x64.exe`);
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "$s=Get-AuthenticodeSignature -LiteralPath $env:LEXOPEN_SIGNATURE_TARGET; if($s.Status -eq 'Valid' -and $s.SignerCertificate){exit 0}; exit 1"], { env: { ...process.env, LEXOPEN_SIGNATURE_TARGET: installer }, stdio: "ignore", shell: false });
  publisherAuthenticated = result.status === 0;
}
const report = { format: 1, platform: process.platform, arch: process.arch, version: packaged.version, publisherAuthenticated, notarized, kind: process.platform === "linux" ? "checksums-only" : publisherAuthenticated ? "publisher-signature" : "unsigned-preview" };
fs.writeFileSync(path.join(dist, `lexopen-signature-${target}.json`), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
