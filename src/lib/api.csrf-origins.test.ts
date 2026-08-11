/**
 * Contrato: LEXOPEN_TRUSTED_ORIGINS amplía CSRF (Host local + Tailscale).
 */
import assert from "node:assert/strict";

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

console.log("api.csrf-origins.test.ts OK");
