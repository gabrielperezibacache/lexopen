import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { assertCsrf, requireStaff } from "@/lib/api";
import { altazorActor } from "@/lib/altazor/access";
import { rateLimitAsync } from "@/lib/auth/rate-limit";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { SecretError } from "./crypto";
import { SECRET_LIMITS } from "./policy";

export const secretHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
export async function secretActor(request: NextRequest, mutation = false) {
  if (mutation) assertCsrf(request);
  const actor = await altazorActor(await requireStaff());
  const limit = await rateLimitAsync(`altazor-secrets:${mutation ? "write" : "read"}:${actor.id}`, mutation ? 30 : 90, 60_000);
  if (!limit.ok) throw new SecretError("secret_rate_limited", "Espere un momento antes de volver a intentarlo.", 429);
  return actor;
}
export async function readSecretBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") || "")) throw new SecretError("secret_json_required", "Use el formulario de Secretos.", 415);
  return parseKnowledgeBody(request, schema, SECRET_LIMITS.bodyBytes);
}
/** Do not pass vault errors through general development logging / raw error rendering. */
export function secretFailure(error: unknown) {
  if (error instanceof SecretError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: secretHeaders });
  if (error instanceof ZodError) return NextResponse.json({ error: "Revise los campos del formulario de Secretos.", code: "secret_input_invalid" }, { status: 400, headers: secretHeaders });
  const status = Number((error as { status?: number })?.status);
  const safeStatus = [400, 401, 403, 404, 409, 410, 413, 429, 503].includes(status) ? status : (error as { code?: string })?.code === "P2002" ? 409 : 500;
  const message = safeStatus === 401 ? "Vuelva a iniciar sesión." : safeStatus === 403 ? "No tiene permiso para realizar esta operación." : safeStatus === 413 ? "El formulario supera el límite permitido." : safeStatus === 410 ? "La sesión del escritorio venció. Abra una nueva sesión." : safeStatus === 503 ? "Esta función no está disponible con la configuración actual del Host." : safeStatus === 409 ? "La operación cambió. Actualice Secretos antes de repetirla." : "No se pudo completar la operación de Secretos.";
  return NextResponse.json({ error: message, code: "secret_operation_failed" }, { status: safeStatus, headers: secretHeaders });
}
