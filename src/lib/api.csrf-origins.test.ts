/**
 * Contrato: LEXOPEN_TRUSTED_ORIGINS + igualdad estricta de origen.
 */
import assert from "node:assert/strict";
import { assertCsrf, normalizeOrigin } from "@/lib/api";
import { buildAllowedOrigins, isAllowedOrigin } from "./csrf";

const allowed = buildAllowedOrigins({
  host: "pc-estudio.tailXXXX.ts.net:3000",
  appUrl: "http://pc-estudio.tailXXXX.ts.net:3000",
  trustedCsv: "http://127.0.0.1:3000,http://localhost:3000",
});

assert.ok(allowed.includes("http://pc-estudio.tailXXXX.ts.net:3000"));
assert.ok(allowed.includes("http://127.0.0.1:3000"));
assert.ok(isAllowedOrigin("http://pc-estudio.tailXXXX.ts.net:3000", allowed));
assert.equal(
  isAllowedOrigin("http://pc-estudio.tailXXXX.ts.net:3000.attacker", allowed),
  false
);

assert.equal(normalizeOrigin("https://app.example/path"), "https://app.example");
assert.equal(normalizeOrigin("https://app.example.attacker"), "https://app.example.attacker");

const env = process.env as Record<string, string | undefined>;
const previousNodeEnv = env.NODE_ENV;
const previousAppUrl = env.NEXT_PUBLIC_APP_URL;
const previousTrusted = env.LEXOPEN_TRUSTED_ORIGINS;
const previousRelax = env.LEXOPEN_RELAX_CSRF;
env.NODE_ENV = "production";
delete env.NEXT_PUBLIC_APP_URL;
env.LEXOPEN_TRUSTED_ORIGINS = "https://app.example";
delete env.LEXOPEN_RELAX_CSRF;

assert.doesNotThrow(() =>
  assertCsrf(
    new Request("https://app.example/api/change", {
      method: "POST",
      headers: {
        host: "app.example",
        origin: "https://app.example",
      },
    })
  )
);
assert.throws(() =>
  assertCsrf(
    new Request("https://app.example/api/change", {
      method: "POST",
      headers: {
        host: "app.example",
        origin: "https://app.example.attacker",
      },
    })
  )
);

// LEXOPEN_RELAX_CSRF must not weaken production CSRF.
env.LEXOPEN_RELAX_CSRF = "1";
assert.throws(() =>
  assertCsrf(
    new Request("https://app.example/api/change", {
      method: "POST",
      headers: { host: "app.example" },
    })
  )
);

if (previousNodeEnv === undefined) delete env.NODE_ENV;
else env.NODE_ENV = previousNodeEnv;
if (previousAppUrl === undefined) delete env.NEXT_PUBLIC_APP_URL;
else env.NEXT_PUBLIC_APP_URL = previousAppUrl;
if (previousTrusted === undefined) delete env.LEXOPEN_TRUSTED_ORIGINS;
else env.LEXOPEN_TRUSTED_ORIGINS = previousTrusted;
if (previousRelax === undefined) delete env.LEXOPEN_RELAX_CSRF;
else env.LEXOPEN_RELAX_CSRF = previousRelax;

console.log("api.csrf-origins.test.ts OK");
