import assert from "node:assert/strict";
import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
} from "@/lib/security/headers";

const csp = buildContentSecurityPolicy({ https: true });
assert.match(csp, /default-src 'self'/);
assert.match(csp, /frame-src 'none'/);
assert.match(csp, /script-src-attr 'none'/);
assert.match(csp, /upgrade-insecure-requests/);

const headers = buildSecurityHeaders({ https: true });
assert.ok(headers.some((h) => h.key === "Strict-Transport-Security"));
assert.ok(headers.some((h) => h.key === "Content-Security-Policy"));

const httpHeaders = buildSecurityHeaders({ https: false });
assert.equal(
  httpHeaders.some((h) => h.key === "Strict-Transport-Security"),
  false
);

console.log("security/headers.test.ts OK");
