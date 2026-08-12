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
assert.equal(headers["Cache-Control"], "private, no-store");

const csv = downloadResponseHeaders("export.csv", "text/csv");
assert.match(csv["Content-Type"], /text\/csv; charset=utf-8/);
assert.match(csv["Content-Disposition"], /^attachment;/);

const md = downloadResponseHeaders("nota.md", "text/markdown");
assert.match(md["Content-Disposition"], /^inline;/);

const html = downloadResponseHeaders("boleta.html", "text/html");
assert.match(html["Content-Disposition"], /^attachment;/);
assert.equal(html["X-Content-Type-Options"], "nosniff");

console.log("security/download.test.ts OK");
