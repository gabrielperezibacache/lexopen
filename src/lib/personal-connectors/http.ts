import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { canSome } from "@/lib/auth/permissions";
import { rateLimitAsync } from "@/lib/auth/rate-limit";
import { ConnectorError, sessionHash } from "./core";

export const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
export async function connectorActor(request: NextRequest, mutation = false) {
  if (mutation) assertCsrf(request);
  const user = await requireStaff();
  if (!canSome(user, "assistant.use")) throw new ConnectorError("forbidden", "No tiene acceso al asistente personal.", 403);
  const raw = request.cookies.get(SESSION_COOKIE)?.value || "", session = verifySessionToken(raw);
  if (!session || session.userId !== user.id || session.sessionVersion !== user.sessionVersion) throw new ConnectorError("session_required", "Vuelva a iniciar sesión.", 401);
  const limit = await rateLimitAsync(`personal-connectors:${mutation ? "write" : "read"}:${user.id}`, mutation ? 20 : 90, 60_000);
  if (!limit.ok) throw new ConnectorError("rate_limited", "Espere un momento antes de volver a intentarlo.", 429);
  return { id: user.id, sessionVersion: user.sessionVersion, sessionHash: sessionHash(raw) };
}
export function connectorFailure(error: unknown) {
  const response = error instanceof ConnectorError ? NextResponse.json({ error: error.message, code: error.code }, { status: error.status }) : handleRouteError(error);
  for (const [key, value] of Object.entries(privateHeaders)) response.headers.set(key, value);
  return response;
}
