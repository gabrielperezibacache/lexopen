import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, parseBody, requireStaff } from "@/lib/api";
import type { Role } from "@/lib/auth/rbac";
import { consumePlan } from "@/lib/assistant/plan-store";
import { executePlanSteps } from "@/lib/assistant/pipeline";
import type { ToolContext } from "@/lib/assistant/types";

const bodySchema = z.object({
  planId: z.string().min(1),
  confirm: z.boolean(),
});

/**
 * `POST /api/assistant/confirm` — confirma o descarta un plan generado por
 * `/api/assistant`. Ejecuta los pasos de escritura (cada tool hace su propio
 * `writeAuditStrict`) y devuelve cards + tokens de deshacer.
 */
export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const body = await parseBody(req, bodySchema);

    const plan = await consumePlan(body.planId, user.id);
    if (!plan) {
      return NextResponse.json(
        { error: "Plan no encontrado, vencido (30 min) o de otro usuario." },
        { status: 404 }
      );
    }

    if (!body.confirm) {
      return NextResponse.json({ ok: true, cancelled: true, planId: plan.id });
    }

    const ctx: ToolContext = { userId: user.id, role: user.role as Role };
    const results = await executePlanSteps(plan.steps, ctx);

    const allOk = results.every((r) => r.result.ok);
    return NextResponse.json({
      ok: allOk,
      planId: plan.id,
      results: results.map((r) => ({
        toolId: r.toolId,
        ok: r.result.ok,
        message: r.result.message,
        card: r.result.card ?? null,
        undoToken: r.result.undoToken ?? null,
        entityId: r.result.entityId ?? null,
      })),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
