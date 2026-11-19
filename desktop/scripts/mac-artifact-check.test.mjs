import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { checkMacArtifact } from "./mac-artifact-check.mjs";

const dist = await mkdtemp(path.join(os.tmpdir(), "lexopen-fictitious-release-"));
const version = "1.1.0-preview.11", arch = "arm64";
const name = format => `LexOpen-${version}-mac-${arch}.${format}`;
try {
  for (const format of ["dmg", "zip"]) await writeFile(path.join(dist, name(format)), format);
  for (const failed of ["", "dmg-copy", "zip-extract", "zip-notarization", "dmg-gatekeeper"]) {
    const calls = [];
    const pending = checkMacArtifact({ dist, version, arch, execute(binary, args, options) {
      assert.equal(options.shell, false);
      calls.push([binary, args]);
      const dest = args.at(-1);
      if (binary === "ditto") {
        const zip = args[0] === "-x";
        if (failed === (zip ? "zip-extract" : "dmg-copy")) return { status: 1 };
        if (zip) assert.deepEqual(args.slice(0, 3), ["-x", "-k", path.join(dist, name("zip"))]);
        mkdirSync(zip ? path.join(dest, "LexOpen.app") : dest);
      }
      if (args[0] === "-dv") return { status: 0, stderr: "Authority=Developer ID Application: Fixture" };
      const isZip = path.basename(path.dirname(dest)) === "update";
      const rejected = (binary === "xcrun" && isZip && failed === "zip-notarization") ||
        (binary === "spctl" && !isZip && failed === "dmg-gatekeeper");
      return { status: rejected ? 1 : 0 };
    } });
    if (["dmg-copy", "zip-extract"].includes(failed)) {
      await assert.rejects(pending, new RegExp(failed));
    } else {
      const result = await pending;
      for (const format of ["dmg", "zip"]) {
        assert.deepEqual(result.artifacts[format], {
          name: name(format), sha256: createHash("sha256").update(format).digest("hex"), codeSignatureValid: true,
          publisherAuthenticated: true, notarized: format !== "zip" || failed !== "zip-notarization",
          gatekeeperAccepted: format !== "dmg" || failed !== "dmg-gatekeeper",
        });
      }
      const quarantined = calls.filter(([binary]) => binary === "xattr").map(([,args]) => args.at(-1));
      assert.equal(new Set(quarantined).size, 2);
      assert(quarantined.every(app => !existsSync(app)));
    }
    assert(calls.some(([binary, args]) => binary === "hdiutil" && args[0] === "detach"));
    assert(calls.some(([binary, args]) => binary === "hdiutil" && args.includes("-readonly")));
  }
} finally { await rm(dist, { recursive: true, force: true }); }
console.log("Mac DMG and update ZIP: independent quarantine, publisher, signature, notarization and Gatekeeper receipts passed.");
