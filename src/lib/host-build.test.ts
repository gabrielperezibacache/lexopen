import assert from "node:assert/strict";
import { hostBuildDetails } from "./host-build";

const env = { LEXOPEN_BUILD_ID: "release_fixture_01", LEXOPEN_SOURCE_REVISION: "a".repeat(40), SESSION_SECRET: "not-a-response-field" };
assert.deepEqual(hostBuildDetails({ staff: false, desktopRuntime: true, localProbe: false }, env), {});
assert.deepEqual(hostBuildDetails({ staff: false, desktopRuntime: false, localProbe: true }, env), {});
assert.deepEqual(hostBuildDetails({ staff: false, desktopRuntime: false, localProbe: false }, env), {});
for (const access of [{ staff: true, desktopRuntime: false, localProbe: false }, { staff: false, desktopRuntime: true, localProbe: true }]) {
  assert.deepEqual(hostBuildDetails(access, env), { buildId: env.LEXOPEN_BUILD_ID, sourceRevision: env.LEXOPEN_SOURCE_REVISION });
  assert.deepEqual(hostBuildDetails(access, { LEXOPEN_BUILD_ID: "../secret\n", LEXOPEN_SOURCE_REVISION: "private-user-data" }), { buildId: null, sourceRevision: null });
}
console.log("host-build.test.ts OK: public probes omit identity, authorized probes receive bounded build fields only");
