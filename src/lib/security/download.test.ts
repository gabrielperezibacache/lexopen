import assert from "node:assert/strict";
import {
  contentDispositionFor,
  downloadResponseHeaders,
  isInlineSafeMime,
  sanitizeUploadMimeType,
} from "@/lib/security/download";

assert.equal(sanitizeUploadMimeType("text/html"), "application/octet-stream");
assert.equal(sanitizeUploadMimeType("image/svg+xml"), "application/octet-stream");
assert.equal(sanitizeUploadMimeType("application/pdf"), "application/pdf");
assert.equal(isInlineSafeMime("application/pdf"), true);
assert.equal(isInlineSafeMime("text/html"), false);
assert.match(contentDispositionFor("a.pdf", "application/pdf"), /^inline;/);
assert.match(contentDispositionFor("x.html", "text/html"), /^attachment;/);

const headers = downloadResponseHeaders("doc.pdf", "application/pdf");
assert.equal(headers["X-Content-Type-Options"], "nosniff");
assert.equal(headers["Content-Type"], "application/pdf");

console.log("security/download.test.ts OK");
