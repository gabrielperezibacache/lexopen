import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

export function inspectMacApp(app, run) {
  const info = run("codesign", ["-dv", "--verbose=2", app]);
  const codeSignatureValid = run("codesign", ["--verify", "--deep", "--strict", app]).status === 0;
  const publisherAuthenticated = codeSignatureValid && info.status === 0 && /^Authority=Developer ID Application:/m.test(info.stderr || "");
  const notarized = publisherAuthenticated && run("xcrun", ["stapler", "validate", app]).status === 0;
  const gatekeeperAccepted = run("spctl", ["--assess", "--type", "execute", "--verbose=2", app]).status === 0;
  return { codeSignatureValid, publisherAuthenticated, notarized, gatekeeperAccepted };
}

export async function checkMacArtifact({ dist, version, arch, execute = spawnSync }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lexopen-mac-artifact-"));
  const mount = path.join(root, "mounted");
  let attached = false;
  const run = (binary, args) => execute(binary, args, { encoding: "utf8", shell: false, timeout: 180000 });
  const requireOk = (binary, args, phase) => {
    if (run(binary, args).status !== 0) throw new Error(`macOS artifact check failed: ${phase}`);
  };
  const inspect = async (file, app) => {
    if (!(await fs.lstat(app)).isDirectory()) throw new Error("Expected an extracted application bundle");
    requireOk("xattr", ["-w", "com.apple.quarantine", "0081;00000000;LexOpenCIFixture;", app], "quarantine-fixture");
    const checks = inspectMacApp(app, run);
    const digest = createHash("sha256");
    for await (const chunk of createReadStream(file)) digest.update(chunk);
    return { name: path.basename(file), sha256: digest.digest("hex"), ...checks };
  };

  try {
    const base = path.join(dist, `LexOpen-${version}-mac-${arch}`);
    const dmgFile = base + ".dmg";
    const copy = path.join(root, "LexOpen.app");
    requireOk("hdiutil", ["verify", dmgFile], "dmg-integrity");
    await fs.mkdir(mount);
    requireOk("hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", mount, dmgFile], "mount");
    attached = true;
    requireOk("ditto", [path.join(mount, "LexOpen.app"), copy], "dmg-copy");
    const dmg = await inspect(dmgFile, copy);
    await fs.rm(copy, { recursive: true }); // Free the DMG copy before extracting the update.

    const zipFile = base + ".zip";
    const extracted = path.join(root, "update");
    await fs.mkdir(extracted);
    requireOk("ditto", ["-x", "-k", zipFile, extracted], "zip-extract");
    const zip = await inspect(zipFile, path.join(extracted, "LexOpen.app"));
    // Keep the original DMG receipt fields for existing manifest readers.
    return { dmgVerified: true, artifactCodeSignatureValid: dmg.codeSignatureValid,
      artifactGatekeeperAccepted: dmg.gatekeeperAccepted, artifacts: { dmg, zip } };
  } finally {
    // Never recursively remove a mounted filesystem if detach fails.
    if (attached) requireOk("hdiutil", ["detach", mount], "detach");
    await fs.rm(root, { recursive: true, force: true });
  }
}
