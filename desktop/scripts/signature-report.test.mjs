import assert from "node:assert/strict";
import { inspectSignature } from "./signature-report.mjs";
const base = { platform: "darwin", arch: "arm64", dist: "/tmp/fixture-release", packaged: { appDirectory: "mac/LexOpen.app", version: "1.1.0-preview.11" } };
function inspect({ valid = true, publisher = true, notarized = true, gatekeeper = true } = {}) {
  return inspectSignature({ ...base, execute(file, args, options) {
    assert.equal(options.shell, false); assert.equal(options.timeout, 30000);
    if (args[0] === "-dv") return { status: 0, stderr: publisher ? "Authority=Developer ID Application: Fictitious fixture" : "Signature=adhoc" };
    return { status: (file === "spctl" ? gatekeeper : file === "xcrun" ? notarized : valid) ? 0 : 1 };
  } });
}
assert.equal(inspect().gatekeeperAccepted, true);
assert.equal(inspect({ valid: false }).publisherAuthenticated, false);
assert.equal(inspect({ publisher: false }).codeSignatureValid, true);
assert.equal(inspect({ notarized: false }).notarized, false);
assert.equal(inspect({ gatekeeper: false }).gatekeeperAccepted, false);
assert.equal(inspectSignature({ ...base, execute: () => ({ status: null }) }).codeSignatureValid, false);
assert.throws(() => inspectSignature({ ...base, packaged: { ...base.packaged, appDirectory: "../outside" } }), /outside/);
console.log("Signature report: damaged/ad-hoc/publisher/notarization/Gatekeeper results remain distinct.");
