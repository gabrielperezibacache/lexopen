import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

/** Round-trip the actual DMG. Never remove quarantine from a user's app. */
export async function checkMacArtifact({ dist, version, arch, execute = spawnSync }) {
  const dmg = path.join(dist, `LexOpen-${version}-mac-${arch}.dmg`);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lexopen-mac-artifact-"));
  const mount = path.join(root, "mounted"), copy = path.join(root, "LexOpen.app");
  let attached = false;
  const run = (binary, args) => execute(binary, args, { encoding: "utf8", shell: false, timeout: 180000 });
  const requireOk = (binary, args, phase) => { if (run(binary, args).status !== 0) throw new Error(`macOS artifact check failed: ${phase}`); };
  try {
    requireOk("hdiutil", ["verify", dmg], "dmg-integrity");
    await fs.mkdir(mount);
    requireOk("hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", mount, dmg], "mount"); attached = true;
    requireOk("ditto", [path.join(mount, "LexOpen.app"), copy], "copy");
    requireOk("xattr", ["-w", "com.apple.quarantine", "0081;00000000;LexOpenCIFixture;", copy], "quarantine-fixture");
    return { dmgVerified: true,
      artifactCodeSignatureValid: run("codesign", ["--verify", "--deep", "--strict", copy]).status === 0,
      artifactGatekeeperAccepted: run("spctl", ["--assess", "--type", "execute", "--verbose=2", copy]).status === 0 };
  } finally {
    // Never recursively remove a mounted filesystem if detach fails.
    if (attached) requireOk("hdiutil", ["detach", mount], "detach");
    await fs.rm(root, { recursive: true, force: true });
  }
}
