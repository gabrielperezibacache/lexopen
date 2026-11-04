import { createHash } from "node:crypto";
import { after, type NextRequest } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { rateLimitAsync } from "@/lib/auth/rate-limit";
import { writeAuditStrict } from "@/lib/audit";
import { privatePjudJson as json, privatePjudResponse } from "@/lib/pjud/private-response";
import { ManualOjvUiError, manualOjvSessions, type ManualOjvOwner } from "@/lib/pjud/manual-session-manager";
import { manualOjvCapabilities, manualOjvQuerySession, parseManualOjvRequest } from "@/lib/pjud/manual-session-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 1800;

async function requestContext(request: NextRequest, mutation: boolean) {
  if (mutation) assertCsrf(request);
  const user = await requireStaff();
  const raw = request.cookies.get(SESSION_COOKIE)?.value || "";
  const token = verifySessionToken(raw);
  if (!token || token.userId !== user.id || token.sessionVersion !== user.sessionVersion) throw new ManualOjvUiError("Su sesión de LexOpen terminó. Vuelva a ingresar.", 401);
  const limited = await rateLimitAsync(`pjud:manual:${mutation ? "write" : "read"}:${user.id}`, mutation ? 15 : 90, 60_000);
  if (!limited.ok) throw new ManualOjvUiError("Hay demasiadas solicitudes de conexión. Espere un momento antes de reintentar.", 429);
  const owner: ManualOjvOwner = { actorId: user.id, sessionVersion: user.sessionVersion, authExpiresAt: token.expiresAt, fingerprint: createHash("sha256").update(raw).digest("hex") };
  return { user, owner, capabilities: manualOjvCapabilities(request, user) };
}

export async function GET(request: NextRequest) {
  try {
    const { owner, capabilities } = await requestContext(request, false);
    const id = manualOjvQuerySession(request);
    if (!capabilities.available || !capabilities.allowed) {
      return json({ capabilities, session: null });
    }
    return json({ capabilities, session: await manualOjvSessions.status(owner, id) });
  } catch (error) { return privatePjudResponse(handleRouteError(error)); }
}

export async function POST(request: NextRequest) {
  try {
    const { user, owner, capabilities } = await requestContext(request, true);
    const body = await parseManualOjvRequest(request);
    if (body.action === "close") {
      const session = await manualOjvSessions.close(owner, body.sessionId);
      await writeAuditStrict({ actorId: user.id, action: "pjud.manual.close", entityType: "manual_ojv_session", after: { stage: "completed" } });
      return json({ capabilities, session });
    }
    if (!capabilities.allowed) throw new ManualOjvUiError(capabilities.reason!, 403);
    if (!capabilities.available) throw new ManualOjvUiError(capabilities.reason!, 503);
    await writeAuditStrict({ actorId: user.id, action: `pjud.manual.${body.action}`, entityType: "manual_ojv_session", after: { stage: "requested", ...(body.action === "import" ? { selected: body.candidateIds.length } : {}) } });
    if (body.action === "focus") {
      // A development reload can retain an older manager and its live browser.
      if (typeof manualOjvSessions.focus !== "function") throw new ManualOjvUiError("Vuelva a abrir LexOpen y cree una nueva conexión para mostrar la ventana oficial.", 503);
      return json({ capabilities, session: await manualOjvSessions.focus(owner, body.sessionId) });
    }
    const pending = body.action === "start" ? await manualOjvSessions.start(owner)
      : body.action === "list" ? await manualOjvSessions.list(owner, body.sessionId, body.materias)
        : await manualOjvSessions.import(owner, body.sessionId, body.candidateIds);
    after(pending.run);
    return json({ capabilities, session: pending.session }, { status: 202 });
  } catch (error) { return privatePjudResponse(handleRouteError(error)); }
}
