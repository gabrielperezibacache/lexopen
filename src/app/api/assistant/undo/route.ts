import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, parseBody, requireStaff } from "@/lib/api";
import type { Role } from "@/lib/auth/rbac";
import { isAssistantToolId } from "@/lib/assistant/types";
import { getTool } from "@/lib/assistant/tools/registry";
import type { ToolContext } from "@/lib/assistant/types";

const bodySchema = z.object({
  toolId: z.string().min(1),
  undoToken: z.string().min(1),
});

/**
 * `POST /api/assistant/undo` — revierte una escritura del asistente usando
 * el token de un solo uso devuelto por `execute()`. Cada tool valida por su
 * cuenta que el token corresponde a `toolId` (ver `plan-store.consumeUndo`).
 */
export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const body = await parseBody(req, bodySchema);

    if (!isAssistantToolId(body.toolId)) {
      return NextResponse.json({ error: "Herramienta desconocida" }, { status: 400 });
    }
    const tool = getTool(body.toolId);
    if (!tool.undo) {
      return NextResponse.json(
        { error: "Esta acción no se puede deshacer." },
        { status: 400 }
      );
    }

    const ctx: ToolContext = { userId: user.id, role: user.role as Role };
    const result = await tool.undo(body.undoToken, ctx);
    return NextResponse.json({ ok: result.ok, message: result.message });
  } catch (e) {
    return handleRouteError(e);
  }
}
