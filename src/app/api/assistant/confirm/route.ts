import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, parseBody, requireStaff } from "@/lib/api";
import type { Role } from "@/lib/auth/rbac";
import { getPlan, cancelPlan } from "@/lib/assistant/plan-store";
import { prisma } from "@/lib/db";
import { canonicalJson } from "@/lib/command-execution";
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

    const plan = await getPlan(body.planId, user.id);
    if (!plan) {
      return NextResponse.json(
        { error: "Plan no encontrado, vencido (30 min) o de otro usuario." },
        { status: 404 }
      );
    }

    if (!body.confirm) {
      const cancelled = await cancelPlan(plan.id, user.id);
      if (!cancelled) return NextResponse.json({ error: "El plan ya se ejecutó o está en curso" }, { status: 409 });
      return NextResponse.json({ ok: true, cancelled: true, planId: plan.id });
    }

    const record = await prisma.assistantPlanRecord.findUnique({ where: { id: plan.id } });
    const alreadyCompleted = record?.status === "completed";
    if (!alreadyCompleted) {
      const claimed = await prisma.assistantPlanRecord.updateMany({
        where: { id: plan.id, ownerId: user.id, expiresAt: { gt: new Date() }, OR: [
          { status: { in: ["pending", "partial"] } },
          { status: "running", updatedAt: { lt: new Date(Date.now() - 2 * 60_000) } },
        ] },
        data: { status: "running" },
      });
      if (!claimed.count) return NextResponse.json({ error: "Plan en curso o cancelado; reintente con el mismo plan" }, { status: 409 });
    }
    const ctx: ToolContext = {
      userId: user.id, role: user.role as Role, capabilityGrants: user.capabilityGrants,
      capabilityRevokes: user.capabilityRevokes, commandKey: `assistant-plan:${plan.id}`,
    };
    let results: Awaited<ReturnType<typeof executePlanSteps>>;
    try {
      results = await executePlanSteps(plan.steps, ctx);
    } catch (error) {
      if (!alreadyCompleted) await prisma.assistantPlanRecord.update({ where: { id: plan.id }, data: { status: "partial" } });
      throw error;
    }

    const allOk = results.length === plan.steps.length && results.every((r) => r.result.ok);
    await prisma.assistantPlanRecord.update({ where: { id: plan.id }, data: {
      status: allOk ? "completed" : "partial", resultsJson: canonicalJson(results),
    } });
    return NextResponse.json({
      ok: allOk,
      planId: plan.id,
      status: allOk ? "completed" : "partial",
      retryable: !allOk,
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
