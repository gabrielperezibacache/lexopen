/**
 * Contrato: LEXOPEN_TRUSTED_ORIGINS amplía CSRF (Host local + Tailscale).
 */
import assert from "node:assert/strict";
import { assertCsrf, normalizeOrigin } from "@/lib/api";

function buildAllowed(host: string, appUrl?: string, trustedCsv?: string) {
  const trusted = (trustedCsv || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [
    `http://${host}`,
    `https://${host}`,
    appUrl,
    ...trusted,
  ].filter(Boolean) as string[];
}

const allowed = buildAllowed(
  "pc-estudio.tailXXXX.ts.net:3000",
  "http://pc-estudio.tailXXXX.ts.net:3000",
  "http://127.0.0.1:3000,http://localhost:3000"
);

assert.ok(allowed.includes("http://pc-estudio.tailXXXX.ts.net:3000"));
assert.ok(allowed.includes("http://127.0.0.1:3000"));
assert.ok(
  allowed.some((a) => a === "http://pc-estudio.tailXXXX.ts.net:3000")
);

assert.equal(normalizeOrigin("https://app.example/path"), "https://app.example");
assert.equal(normalizeOrigin("https://app.example.attacker"), "https://app.example.attacker");

const previousNodeEnv = process.env.NODE_ENV;
const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const previousTrusted = process.env.LEXOPEN_TRUSTED_ORIGINS;
const previousRelax = process.env.LEXOPEN_RELAX_CSRF;
process.env.NODE_ENV = "production";
delete process.env.NEXT_PUBLIC_APP_URL;
process.env.LEXOPEN_TRUSTED_ORIGINS = "https://app.example";
delete process.env.LEXOPEN_RELAX_CSRF;

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

if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
else process.env.NODE_ENV = previousNodeEnv;
if (previousAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
else process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
if (previousTrusted === undefined) delete process.env.LEXOPEN_TRUSTED_ORIGINS;
else process.env.LEXOPEN_TRUSTED_ORIGINS = previousTrusted;
if (previousRelax === undefined) delete process.env.LEXOPEN_RELAX_CSRF;
else process.env.LEXOPEN_RELAX_CSRF = previousRelax;

console.log("api.csrf-origins.test.ts OK");
