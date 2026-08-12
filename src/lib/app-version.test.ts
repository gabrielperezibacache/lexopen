import assert from "node:assert/strict";
import {
  compareSemver,
  isNewerVersion,
  normalizeVersionTag,
  parseSemver,
} from "@/lib/app-version";

assert.equal(normalizeVersionTag("v0.1.5"), "0.1.5");
assert.equal(normalizeVersionTag("0.1.5-beta.1"), "0.1.5");
assert.equal(parseSemver("1.2.3")?.minor, 2);
assert.equal(parseSemver("nope"), null);

assert.ok(compareSemver("0.1.5", "0.1.4") > 0);
assert.ok(compareSemver("0.1.4", "0.2.0") < 0);
assert.equal(compareSemver("1.0.0", "v1.0.0"), 0);
assert.equal(isNewerVersion("0.1.5", "0.1.4"), true);
assert.equal(isNewerVersion("0.1.4", "0.1.4"), false);
assert.equal(isNewerVersion("0.1.3", "0.1.4"), false);

console.log("app-version.test.ts OK");
