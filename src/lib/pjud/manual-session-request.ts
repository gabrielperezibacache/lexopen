import { z } from "zod";
import { MANUAL_OJV_MATERIAS, type ManualOjvCapabilities } from "@/lib/pjud/manual-session-contract";
import { MANUAL_OJV_IMPORT_LIMIT, ManualOjvUiError, manualOjvRuntimeEnabled } from "@/lib/pjud/manual-session-manager";
import { misCausasCapabilities } from "@/lib/pjud/mis-causas-access";
import type { PermissionSubject } from "@/lib/auth/permissions";

const uuid = z.string().uuid("La identificación de la conexión no es válida.");
const candidateId = z.string().uuid("La selección no es válida. Consulte nuevamente Mis Causas.");
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }).strict("La solicitud contiene campos no admitidos."),
  z.object({ action: z.literal("list"), sessionId: uuid, materias: z.array(z.enum(MANUAL_OJV_MATERIAS, { errorMap: () => ({ message: "Seleccione una materia disponible." }) })).min(1, "Seleccione una materia para consultar.").max(MANUAL_OJV_MATERIAS.length).optional() }).strict("La solicitud contiene campos no admitidos."),
  z.object({ action: z.literal("import"), sessionId: uuid, candidateIds: z.array(candidateId).min(1, "Seleccione al menos una causa.").max(MANUAL_OJV_IMPORT_LIMIT, `Seleccione hasta ${MANUAL_OJV_IMPORT_LIMIT} causas por operación.`).refine(ids => new Set(ids).size === ids.length, "La selección contiene causas repetidas") }).strict("La solicitud contiene campos no admitidos."),
  z.object({ action: z.literal("close"), sessionId: uuid }).strict("La solicitud contiene campos no admitidos."),
]);

/** Browser-origin gate for local UX; authenticated ownership and capabilities remain the authorization boundary. */
export function manualOjvLocalRequest(request: Pick<Request, "url" | "headers">) {
  try {
    const url = new URL(request.url);
    const host = request.headers.get("host") || "";
    const effective = new URL(`${url.protocol}//${host}`);
    // Next normalizes 127.0.0.1/[::1] to localhost and can use its bind address
    // (0.0.0.0/[::]) in request.url. The actual Host and browser origin must
    // still be the same loopback endpoint; forwarded headers never opt in.
    if (!/^https?:$/.test(url.protocol) || !["localhost", "127.0.0.1", "[::1]", "0.0.0.0", "[::]"].includes(url.hostname.toLowerCase()) ||
        !["localhost", "127.0.0.1", "[::1]"].includes(effective.hostname.toLowerCase()) || effective.host.toLowerCase() !== host.toLowerCase() ||
        effective.username || effective.password || effective.port !== url.port) return false;
    const site = request.headers.get("sec-fetch-site");
    if (site && !["same-origin", "none"].includes(site)) return false;
    for (const name of ["origin", "referer"]) {
      const value = request.headers.get(name);
      if (value && new URL(value).origin !== effective.origin) return false;
    }
    return true;
  } catch { return false; }
}

export function manualOjvCapabilities(request: Pick<Request, "url" | "headers">, user: PermissionSubject): ManualOjvCapabilities {
  const allowed = misCausasCapabilities(user).sync;
  const hostLocal = manualOjvLocalRequest(request);
  const configured = manualOjvRuntimeEnabled();
  return {
    available: hostLocal && configured, allowed, hostLocal, importLimit: MANUAL_OJV_IMPORT_LIMIT,
    reason: !allowed ? "La importación de Mis Causas requiere autorización para gestionar la cartera del estudio."
      : !hostLocal ? "El ingreso manual abre una ventana en el Host local. Abra LexOpen desde ese equipo para conectar su cuenta."
        : !configured ? "El Host debe habilitar el ingreso manual OJV y disponer de un navegador con ventana visible. Revise la configuración PJUD del Host."
          : null,
  };
}

export async function parseManualOjvRequest(request: Request) {
  const maximum = 16_384;
  if (Number(request.headers.get("content-length") || 0) > maximum) { await request.body?.cancel(); throw new ManualOjvUiError("La selección supera el tamaño permitido.", 413); }
  const reader = request.body?.getReader();
  if (!reader) throw new ManualOjvUiError("Se requiere una solicitud JSON.", 400);
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.length;
      if (bytes > maximum) { await reader.cancel(); throw new ManualOjvUiError("La selección supera el tamaño permitido.", 413); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, bytes))); }
  catch { throw new ManualOjvUiError("La solicitud JSON no pudo leerse.", 400); }
  return schema.parse(value);
}

export function manualOjvQuerySession(request: Request) {
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some(key => key !== "sessionId") || url.searchParams.getAll("sessionId").length > 1) throw new ManualOjvUiError("La consulta de conexión no es válida.", 400);
  const id = url.searchParams.get("sessionId");
  return id === null ? undefined : uuid.parse(id);
}
