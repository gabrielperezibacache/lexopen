import assert from "node:assert/strict";
import {
  buildAppPublicConfig,
  buildSecurityFlags,
  envFlag,
  envNumber,
  envPresence,
  maskRut,
} from "./config-snapshot";

assert.equal(envFlag({ X: "1" }, "X"), true);
assert.equal(envFlag({ X: "0" }, "X"), false);
assert.equal(envPresence({ K: "  " }, "K"), false);
assert.equal(envPresence({ K: "abc" }, "K"), true);
assert.equal(envNumber({ N: "12" }, "N", 3), 12);
assert.equal(envNumber({ N: "x" }, "N", 3), 3);

assert.equal(maskRut(null), null);
assert.equal(maskRut("1-9"), "••••");
assert.equal(maskRut("12.345.678-9")?.startsWith("12"), true);
assert.equal(maskRut("12.345.678-9")?.endsWith("-9"), true);
assert.ok(maskRut("12.345.678-9")?.includes("••••"));

const app = buildAppPublicConfig({
  NEXT_PUBLIC_APP_NAME: "Estudio Demo",
  NEXT_PUBLIC_APP_URL: "https://lex.example",
  PORT: "4000",
});
assert.equal(app.displayName, "Estudio Demo");
assert.equal(app.publicUrl, "https://lex.example");
assert.equal(app.port, "4000");

const sec = buildSecurityFlags({
  LEXOPEN_DEMO_SWITCHER: "1",
  LEXOPEN_OPEN_ACCESS: "1",
  SESSION_SECRET: "x",
});
assert.equal(sec.demoSwitcher, true);
assert.equal(sec.openAccess, true);
assert.equal(sec.sessionSecretSet, true);
assert.equal(sec.relaxCsrf, false);

console.log("config-snapshot.test.ts OK");
