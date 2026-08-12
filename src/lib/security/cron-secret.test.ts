import assert from "node:assert/strict";
import { verifyCronSecret } from "@/lib/security/cron-secret";
import {
  assertSafeProductionEnv,
  forbiddenProductionFlags,
} from "@/lib/security/production-env";
import {
  isCloudMetadataHostname,
  isLoopbackHostname,
  isSafeOutboundHttpUrl,
} from "@/lib/net/safe-url";

const env = process.env as Record<string, string | undefined>;
const prevCron = env.CRON_SECRET;
const prevNode = env.NODE_ENV;
const prevOpen = env.LEXOPEN_OPEN_ACCESS;
const prevRelax = env.LEXOPEN_RELAX_CSRF;

env.CRON_SECRET = "super-secret-cron-value";
assert.equal(verifyCronSecret("super-secret-cron-value"), true);
assert.equal(verifyCronSecret("wrong-secret-cron-value"), false);
assert.equal(verifyCronSecret(null), false);
assert.equal(verifyCronSecret(""), false);
delete env.CRON_SECRET;
assert.equal(verifyCronSecret("super-secret-cron-value"), false);

assert.equal(isCloudMetadataHostname("169.254.169.254"), true);
assert.equal(isLoopbackHostname("127.0.0.1"), true);
assert.equal(
  isSafeOutboundHttpUrl("http://127.0.0.1:27123", {
    allowHttp: true,
    allowLoopback: true,
  }),
  true
);
assert.equal(
  isSafeOutboundHttpUrl("http://169.254.169.254/", {
    allowHttp: true,
    allowLoopback: true,
  }),
  false
);
assert.equal(
  isSafeOutboundHttpUrl("http://127.0.0.1/secret", { allowHttp: true }),
  false
);
assert.equal(
  isSafeOutboundHttpUrl("https://[::ffff:a9fe:a9fe]/latest", {
    allowHttp: false,
  }),
  false
);
assert.equal(
  isSafeOutboundHttpUrl("https://10.0.0.1.nip.io/x", { allowHttp: false }),
  false
);

env.NODE_ENV = "production";
env.LEXOPEN_OPEN_ACCESS = "1";
// Isolate from CI/workflow env (often sets LEXOPEN_RELAX_CSRF=1).
delete env.LEXOPEN_RELAX_CSRF;
delete env.LEXOPEN_ALLOW_PLAINTEXT_PASSWORDS;
delete env.LEXOPEN_DEMO_SWITCHER;
assert.deepEqual(forbiddenProductionFlags(), ["LEXOPEN_OPEN_ACCESS"]);
assert.throws(() => assertSafeProductionEnv(), /LEXOPEN_OPEN_ACCESS/);
delete env.LEXOPEN_OPEN_ACCESS;
assert.doesNotThrow(() => assertSafeProductionEnv());

if (prevCron === undefined) delete env.CRON_SECRET;
else env.CRON_SECRET = prevCron;
if (prevNode === undefined) delete env.NODE_ENV;
else env.NODE_ENV = prevNode;
if (prevOpen === undefined) delete env.LEXOPEN_OPEN_ACCESS;
else env.LEXOPEN_OPEN_ACCESS = prevOpen;
if (prevRelax === undefined) delete env.LEXOPEN_RELAX_CSRF;
else env.LEXOPEN_RELAX_CSRF = prevRelax;

console.log("security/cron-secret + production-env + safe-url OK");
