import assert from "node:assert/strict";
import { checkMacArtifact } from "./mac-artifact-check.mjs";
for (const failed of ["", "codesign", "spctl", "ditto"]) {
  const calls = [];
  const pending = checkMacArtifact({ dist: "/tmp/fictitious-release", version: "1.1.0-preview.11", arch: "arm64", execute(binary, args, options) {
    assert.equal(options.shell, false); calls.push([binary, args]);
    return { status: binary === failed ? 1 : 0 };
  } });
  if (failed === "ditto") await assert.rejects(pending, /copy/);
  else {
    const result = await pending;
    assert.equal(result.dmgVerified, true);
    assert.equal(result.artifactCodeSignatureValid, failed !== "codesign");
    assert.equal(result.artifactGatekeeperAccepted, failed !== "spctl");
  }
  assert(calls.some(([binary, args]) => binary === "hdiutil" && args[0] === "detach"));
  assert(calls.some(([binary, args]) => binary === "hdiutil" && args.includes("-readonly")));
}
console.log("DMG round-trip: readonly mount, quarantined owned copy, signature/Gatekeeper separation and detach on error passed.");
