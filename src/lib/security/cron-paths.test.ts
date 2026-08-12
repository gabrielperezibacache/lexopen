import assert from "node:assert/strict";
import {
  CRON_API_PATHS,
  cronSecretMatches,
  isCronApiPath,
} from "@/lib/security/cron-paths";

assert.ok(CRON_API_PATHS.includes("/api/plazos/alertas"));
assert.equal(isCronApiPath("/api/causas/monitoreo"), true);
assert.equal(isCronApiPath("/api/pjud/digest"), true);
assert.equal(isCronApiPath("/api/health"), false);
assert.equal(isCronApiPath("/api/plazos/alertas/extra"), false);

assert.equal(cronSecretMatches("abc", "abc"), true);
assert.equal(cronSecretMatches("abc", "abd"), false);
assert.equal(cronSecretMatches("abc", "ab"), false);
assert.equal(cronSecretMatches(null, "abc"), false);
assert.equal(cronSecretMatches("abc", ""), false);
assert.equal(cronSecretMatches("abc", undefined), false);

console.log("security/cron-paths.test.ts OK");
