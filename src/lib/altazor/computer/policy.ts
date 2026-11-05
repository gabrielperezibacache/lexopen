import { z } from "zod";
import { ConnectorError } from "@/lib/personal-connectors/core";
import type { ComputerFile } from "./types";

export const KITTIES_SOURCE_COMMIT = "6aee950bdf971ff41f3867763a0ec9f5ef8ef8e3";
export const COMPUTER_LIMITS = { files: 5, totalBytes: 20 * 1024 * 1024, imageBytes: 5 * 1024 * 1024, sessionMs: 20 * 60_000, renewalWindowMs: 2 * 60 * 60_000, bodyBytes: 29 * 1024 * 1024 } as const;
export function endpointFor(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new ConnectorError("gateway_url", "Use la dirección local del gateway dedicado."); }
  if (url.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(url.hostname) || !url.port || Number(url.port) < 1024 || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new ConnectorError("gateway_url", "Sólo se admite un gateway HTTP en 127.0.0.1 o ::1, con puerto propio. Las conexiones remotas aún no están habilitadas.");
  return url.origin;
}
export function localSetupAllowed(request: { url: string; headers: Headers; method?: string }, env: Readonly<Record<string, string | undefined>> = process.env) {
  // Hostname headers alone are not proof of a loopback peer. Configuration also
  // requires an operator-declared loopback-only listener, never a shared LAN Host.
  const bind = env.LEXOPEN_BIND || env.HOSTNAME;
  if (!["127.0.0.1", "::1"].includes(bind || "")) return false;
  try {
    const url = new URL(request.url);
    // Next can canonicalize request.url to localhost while the browser uses
    // 127.0.0.1. Validate the actual Host independently, never forwarded-host.
    const presented = request.headers.get("host");
    const publicUrl = presented ? new URL(`${url.protocol}//${presented}`) : new URL(url.origin);
    const loopback = (value: URL) => ["127.0.0.1", "[::1]", "localhost"].includes(value.hostname) && !value.username && !value.password && value.pathname === "/" && !value.search && !value.hash;
    if (!loopback(new URL(url.origin)) || !loopback(publicUrl) || publicUrl.port !== url.port) return false;
    const origin = new URL(request.headers.get("origin") || (request.method === "GET" ? publicUrl.origin : ""));
    const forwarded = [request.headers.get("x-forwarded-for"), request.headers.get("x-real-ip")].filter(Boolean).flatMap(value => value!.split(","));
    return origin.origin === publicUrl.origin && forwarded.every(value => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(value.trim()));
  } catch { return false; }
}
export function computerEnabled(env: Readonly<Record<string, string | undefined>> = process.env) { return env.ALTAZOR_COMPUTER_ENABLED === "1"; }
export function assertComputerEnabled() { if (!computerEnabled()) throw new ConnectorError("computer_disabled", "El computador opcional está desactivado en este Host.", 503); }
export const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("click"), args: z.object({ x: z.number().int().min(0).max(10000), y: z.number().int().min(0).max(10000) }).strict() }).strict(),
  z.object({ action: z.literal("type"), args: z.object({ text: z.string().min(1).max(2000).refine(value => Buffer.byteLength(value, "utf8") <= 2000, "Escriba hasta 2000 bytes UTF-8 cada vez.") }).strict() }).strict(),
  z.object({ action: z.literal("key"), args: z.object({ keys: z.string().regex(/^[A-Za-z0-9_+.-]{1,80}$/) }).strict() }).strict(),
  z.object({ action: z.literal("scroll"), args: z.object({ direction: z.enum(["up", "down"]), amount: z.number().int().min(1).max(10) }).strict() }).strict(),
]);
export type PersonInput = z.infer<typeof inputSchema>;
export function inspectSelectedFiles(files: ComputerFile[]) {
  if (files.length > COMPUTER_LIMITS.files) throw new ConnectorError("file_limit", "Seleccione hasta cinco archivos.", 413);
  let total = 0;
  return files.map(file => {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(file.data) || file.data.length > Math.ceil(COMPUTER_LIMITS.totalBytes / 3) * 4) throw new ConnectorError("file_invalid", "Uno de los archivos no pudo leerse.", 400);
    const bytes = Buffer.from(file.data, "base64"); total += bytes.length;
    if (!bytes.length || bytes.toString("base64") !== file.data || total > COMPUTER_LIMITS.totalBytes) throw new ConnectorError("file_limit", "Los archivos seleccionados deben sumar como máximo 20 MiB.", 413);
    const name = file.name.split(/[\\/]/).pop()!.replace(/[\x00-\x1f\x7f]/g, "").replace(/^\.+/, "").slice(0, 160) || "archivo";
    const prefix = bytes.subarray(0, 12), hex = prefix.toString("hex");
    if (/^(7f454c46|4d5a|cffaedfe|cefaedfe|cafebabe|feedfa)/i.test(hex)) throw new ConnectorError("executable_refused", "Adjunte documentos o imágenes; no programas.", 400);
    let mime = "";
    if (hex.startsWith("89504e470d0a1a0a")) mime = "image/png";
    else if (hex.startsWith("ffd8ff")) mime = "image/jpeg";
    else if (prefix.toString("ascii").startsWith("GIF8")) mime = "image/gif";
    else if (prefix.toString("ascii").startsWith("RIFF") && prefix.subarray(8).toString("ascii") === "WEBP") mime = "image/webp";
    else if (prefix.toString("ascii").startsWith("%PDF-")) mime = "application/pdf";
    else if (hex.startsWith("504b0304") && /\.(docx|xlsx|pptx)$/i.test(name)) mime = "application/octet-stream";
    else {
      try { const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); if (!text.includes("\0")) mime = "text/plain"; } catch { /* Non-text files need a recognised signature. */ }
    }
    if (!mime) throw new ConnectorError("file_type", "Use PDF, Office moderno, texto o una imagen PNG, JPEG, GIF o WebP.", 400);
    if (mime.startsWith("image/") && bytes.length > COMPUTER_LIMITS.imageBytes) throw new ConnectorError("image_limit", "Cada imagen admite hasta 5 MiB.", 413);
    return { name, mime, data: file.data };
  });
}
export function assertSessionLive(row: { state: string; expiresAt: Date }, now = Date.now()) {
  if (row.expiresAt.getTime() <= now) throw new ConnectorError("session_expired", "La sesión venció y su acceso quedó bloqueado. El gateway puede conservar su escritorio y archivos.", 410);
  if (!["ready", "starting"].includes(row.state)) throw new ConnectorError("session_unavailable", "La sesión no está disponible. No se repetirá su creación automáticamente.", 409);
}
