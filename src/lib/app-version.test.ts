import assert from "node:assert/strict";
import {
  compareSemver,
  isNewerVersion,
  normalizeVersionTag,
  parseSemver,
} from "@/lib/app-version";

assert.equal(normalizeVersionTag("v0.1.5"), "0.1.5");
assert.equal(normalizeVersionTag("0.1.5-beta.1+build.2"), "0.1.5-beta.1");
assert.equal(parseSemver("1.2.3")?.minor, 2);
assert.equal(parseSemver("nope"), null);
for (const invalid of ["01.2.3", "1.2.3-preview.01", "1.2.3-", "1.2.3+", "1.2.3-preview..1", "1.2.3+build..1", "9007199254740992.0.0"]) {
  assert.equal(parseSemver(invalid), null, invalid);
}

assert.ok(compareSemver("0.1.5", "0.1.4") > 0);
assert.ok(compareSemver("0.1.4", "0.2.0") < 0);
assert.equal(compareSemver("1.0.0", "v1.0.0"), 0);
assert.equal(isNewerVersion("0.1.5", "0.1.4"), true);
assert.equal(isNewerVersion("0.1.4", "0.1.4"), false);
assert.equal(isNewerVersion("0.1.3", "0.1.4"), false);
assert.equal(isNewerVersion("1.1.0", "1.1.0-preview.8"), true, "stable releases upgrade previews of the same version");
assert.equal(isNewerVersion("1.1.0-preview.9", "1.1.0"), false);
assert.equal(compareSemver("1.1.0+build.2", "1.1.0+build.1"), 0);
const prereleases = ["alpha", "alpha.1", "alpha.beta", "beta", "beta.2", "beta.11", "rc.1"];
for (let i = 1; i < prereleases.length; i++) {
  assert.ok(compareSemver(`1.0.0-${prereleases[i]}`, `1.0.0-${prereleases[i - 1]}`) > 0);
}
assert.ok(compareSemver("1.0.0-preview.100000000000000000000", "1.0.0-preview.99999999999999999999") > 0);

console.log("app-version.test.ts OK");
