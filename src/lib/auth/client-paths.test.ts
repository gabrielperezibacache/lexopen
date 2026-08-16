import assert from "node:assert/strict";
import {
  isClientAllowedPagePath,
  isClientAllowedPath,
} from "@/lib/auth/client-paths";

assert.equal(isClientAllowedPagePath("/portal"), true);
assert.equal(isClientAllowedPagePath("/cuenta"), true);
assert.equal(isClientAllowedPagePath(""), false);
assert.equal(isClientAllowedPagePath("/notificaciones"), true);
assert.equal(isClientAllowedPagePath("/sites"), true);
assert.equal(isClientAllowedPagePath("/sites/abc"), false);
assert.equal(isClientAllowedPagePath("/sites/abc/archivos"), true);
assert.equal(isClientAllowedPagePath("/sites/abc/qa"), true);
assert.equal(isClientAllowedPagePath("/sites/abc/wiki"), false);
assert.equal(isClientAllowedPagePath("/causas"), false);
assert.equal(isClientAllowedPagePath("/facturacion"), false);

assert.equal(isClientAllowedPath("/api/sites"), true);
assert.equal(isClientAllowedPath("/api/sites/abc/files"), true);
assert.equal(isClientAllowedPath("/api/sites/abc/qa"), true);
assert.equal(isClientAllowedPath("/api/sites/abc/members"), false);
assert.equal(isClientAllowedPath("/api/sites/abc"), false);
assert.equal(isClientAllowedPath("/api/notifications"), true);
assert.equal(isClientAllowedPath("/api/auth/me"), true);
assert.equal(isClientAllowedPath("/api/auth/password"), true);
assert.equal(isClientAllowedPath("/api/auth/logout"), true);
assert.equal(isClientAllowedPath("/api/auth/impersonate"), false);
assert.equal(isClientAllowedPath("/api/auth/login"), false);
assert.equal(isClientAllowedPath("/api/messages"), false);
assert.equal(isClientAllowedPath("/api/billing/invoices"), false);
assert.equal(isClientAllowedPath("/api/admin/host-status"), false);
assert.equal(isClientAllowedPath("/api/search"), true);
assert.equal(isClientAllowedPath("/api/health"), true);

console.log("client-paths.test.ts: ok");
