import assert from "node:assert/strict";
import {
  contentDispositionFor,
  documentBodyForDownload,
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

// A missing original must not become a successful zero-byte download.
assert.equal(documentBodyForDownload({ nombre: "documento", storageKey: null, contenido: null, mimeType: "application/pdf" }, null), null);
assert.equal(documentBodyForDownload({ nombre: "documento", storageKey: "missing", contenido: "extracted text", mimeType: "application/pdf" }, null), null);
assert.equal(documentBodyForDownload({ nombre: "documento", storageKey: null, contenido: "extracted text", mimeType: "application/pdf" }, null), null);
assert.equal(documentBodyForDownload({ nombre: "documento", storageKey: "pdf", contenido: null, mimeType: "Application/PDF; charset=binary" }, Buffer.from("%PDF-1.7"))?.toString(), "%PDF-1.7");
assert.equal(documentBodyForDownload({ nombre: "documento", storageKey: null, contenido: "", mimeType: "text/plain" }, null)?.length, 0);
assert.equal(documentBodyForDownload({ nombre: "archivo.PDF", storageKey: null, contenido: "no es PDF", mimeType: null }, null), null);
assert.equal(documentBodyForDownload({ nombre: "documento", storageKey: null, contenido: "error", mimeType: "application/x-pdf" }, null), null);
