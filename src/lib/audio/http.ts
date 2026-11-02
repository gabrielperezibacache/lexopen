import type { CaseAudioView } from "./types";
import { byteRange } from "./ingest";

/** Receives bytes only after the caller has rechecked the case, document and original hash. */
export function audioOriginalResponse(audio: Pick<CaseAudioView, "sourceName" | "mimeType">, bytes: Buffer, rangeHeader: string | null, download = false) {
  const filename = encodeURIComponent(audio.sourceName.replace(/[\r\n"]/g, "_").slice(0, 180));
  const headers: Record<string, string> = { "Content-Type": audio.mimeType, "Accept-Ranges": "bytes", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"; filename*=UTF-8''${filename}` };
  let range: ReturnType<typeof byteRange>;
  try { range = byteRange(rangeHeader, bytes.length); }
  catch { return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${bytes.length}` } }); }
  if (range) { headers["Content-Range"] = `bytes ${range.start}-${range.end}/${bytes.length}`; headers["Content-Length"] = String(range.end - range.start + 1); return new Response(new Uint8Array(bytes.subarray(range.start, range.end + 1)), { status: 206, headers }); }
  headers["Content-Length"] = String(bytes.length); return new Response(new Uint8Array(bytes), { headers });
}
