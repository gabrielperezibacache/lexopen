/** Safe download / upload MIME helpers. */

const INLINE_SAFE = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/markdown",
]);

const UPLOAD_ALLOWED = new Set([
  ...INLINE_SAFE,
  "text/markdown",
  "text/csv",
  "application/json",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.text",
  "application/rtf",
  "application/octet-stream",
]);

export function normalizeMimeType(raw: string | null | undefined): string {
  const base = String(raw || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!base) return "application/octet-stream";
  if (base === "image/jpg") return "image/jpeg";
  return base;
}

export function sanitizeUploadMimeType(raw: string | null | undefined): string {
  const mime = normalizeMimeType(raw);
  return UPLOAD_ALLOWED.has(mime) ? mime : "application/octet-stream";
}

export function isInlineSafeMime(raw: string | null | undefined): boolean {
  return INLINE_SAFE.has(normalizeMimeType(raw));
}

function safeFilename(name: string) {
  const cleaned = String(name || "download")
    .replace(/[\r\n"]/g, "_")
    .slice(0, 180);
  return cleaned || "download";
}

/** Build Content-Disposition; force attachment for non-inline-safe types. */
export function contentDispositionFor(
  filename: string,
  mimeType: string | null | undefined
) {
  const encoded = encodeURIComponent(safeFilename(filename));
  const mode = isInlineSafeMime(mimeType) ? "inline" : "attachment";
  return `${mode}; filename="${encoded}"; filename*=UTF-8''${encoded}`;
}

export function downloadResponseHeaders(
  filename: string,
  mimeType: string | null | undefined,
  opts?: { charset?: string }
) {
  const contentType = normalizeMimeType(mimeType);
  const charset =
    opts?.charset ||
    (contentType.startsWith("text/") || contentType === "application/json"
      ? "utf-8"
      : undefined);
  const contentTypeHeader = charset
    ? `${contentType}; charset=${charset}`
    : contentType;
  return {
    "Content-Type": contentTypeHeader,
    "Content-Disposition": contentDispositionFor(filename, contentType),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  };
}
