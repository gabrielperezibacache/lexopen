import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, requireStaff } from "@/lib/api";
import { altazorActor } from "@/lib/altazor/access";
import { rateLimitAsync } from "@/lib/auth/rate-limit";
import { connectorFailure, privateHeaders } from "@/lib/personal-connectors/http";
import { ConnectorError } from "@/lib/personal-connectors/core";
import { COMPUTER_LIMITS } from "./policy";

export { privateHeaders };
export const requestIdSchema = z.string().regex(/^[A-Za-z0-9._:-]{8,160}$/);
export async function computerActor(request: NextRequest, mutation = false) {
  if (mutation) assertCsrf(request);
  const actor = await altazorActor(await requireStaff());
  const limit = await rateLimitAsync(`computer:${mutation ? "write" : "read"}:${actor.id}`, mutation ? 90 : 180, 60_000);
  if (!limit.ok) throw new ConnectorError("rate_limited", "Espere un momento antes de repetir la acción.", 429);
  return actor;
}
export function computerFailure(error: unknown) {
  if ((error as { code?: string }).code === "P2002") return NextResponse.json({ error: "Esta operación o gateway ya está registrado. Actualice el estado antes de repetirla.", code: "operation_registered" }, { status: 409, headers: privateHeaders });
  return connectorFailure(error);
}
const messageSchema = z.object({ requestId: requestIdSchema, text: z.string().trim().min(1).max(16000), confirmed: z.literal(true), files: z.array(z.object({ name: z.string().min(1).max(240), mime: z.string().max(150), data: z.string().max(28 * 1024 * 1024) }).strict()).max(5) }).strict();
export async function readComputerMessage(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ConnectorError("json_required", "Envíe la tarea mediante el formulario.", 415);
  if (Number(request.headers.get("content-length") || 0) > COMPUTER_LIMITS.bodyBytes) { await request.body?.cancel(); throw new ConnectorError("message_limit", "La tarea supera el límite admitido.", 413); }
  const reader = request.body?.getReader(); if (!reader) throw new ConnectorError("message_required", "Escriba una tarea.");
  const chunks: Uint8Array[] = []; let length = 0;
  try { for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > COMPUTER_LIMITS.bodyBytes) { await reader.cancel(); throw new ConnectorError("message_limit", "La tarea y sus archivos superan el límite admitido.", 413); } chunks.push(part.value); } } finally { reader.releaseLock(); }
  let raw: unknown; try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, length))); } catch { throw new ConnectorError("message_invalid", "No se pudo leer la tarea."); }
  return messageSchema.parse(raw);
}
