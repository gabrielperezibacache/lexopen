import assert from "node:assert/strict";
import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
} from "@/lib/security/headers";

const csp = buildContentSecurityPolicy({ https: true });
assert.match(csp, /default-src 'self'/);
assert.match(csp, /frame-src 'none'/);
assert.match(csp, /script-src-attr 'none'/);
assert.match(csp, /style-src-attr 'unsafe-inline'/);
assert.match(csp, /upgrade-insecure-requests/);

const nonced = buildContentSecurityPolicy({
  https: true,
  nonce: "abc123",
  isDev: false,
});
assert.match(nonced, /script-src 'self' 'nonce-abc123' 'strict-dynamic'/);
assert.doesNotMatch(nonced, /script-src[^;]*unsafe-inline/);
assert.doesNotMatch(nonced, /script-src[^;]*unsafe-eval/);
assert.match(nonced, /style-src 'self' 'nonce-abc123'/);
assert.doesNotMatch(nonced, /style-src 'self' 'nonce-abc123' 'unsafe-inline'/);
assert.match(nonced, /style-src-attr 'unsafe-inline'/);

const devNonced = buildContentSecurityPolicy({
  https: false,
  nonce: "dev1",
  isDev: true,
});
assert.match(devNonced, /style-src 'self' 'nonce-dev1' 'unsafe-inline'/);

const headers = buildSecurityHeaders({ https: true });
assert.ok(headers.some((h) => h.key === "Strict-Transport-Security"));
assert.ok(headers.some((h) => h.key === "Content-Security-Policy"));

const staticOnly = buildSecurityHeaders({ https: true, includeCsp: false });
assert.equal(
  staticOnly.some((h) => h.key === "Content-Security-Policy"),
  false
);

const httpHeaders = buildSecurityHeaders({ https: false });
assert.equal(
  httpHeaders.some((h) => h.key === "Strict-Transport-Security"),
  false
);

console.log("security/headers.test.ts OK");
