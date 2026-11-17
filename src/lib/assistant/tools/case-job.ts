import { z } from "zod";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { serializable, canonicalJson } from "@/lib/command-execution";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { snapshotHash } from "@/lib/altazor/case-jobs/snapshot";
import {
  createCaseJob,
  prepareCasePlan,
  validateCasePlan,
  planPreview,
  caseJobAccess,
} from "@/lib/altazor/case-jobs/service";
import type { CaseJobPlan } from "@/lib/altazor/case-jobs/types";
import { desktopScope } from "./escritorio-access";
import type { AssistantTool } from "./types";
import type { AssistantPlan, ToolContext, ToolResult } from "../types";

const schema = z
  .object({
    objective: z.string().trim().min(3).max(2000),
    plan: z.custom<CaseJobPlan>((value) =>
      Boolean(
        value &&
        typeof value === "object" &&
        "version" in value &&
        value.version === 1,
      ),
    ),
    planHash: z.string().length(64),
  })
  .strict();
export async function resolveCaseJobInput(ctx: ToolContext, objective: string) {
  const { actor, conversationId } = await desktopScope(ctx);
  if (objective.length > 2000)
    throw httpError(
      "Resume el objetivo del encargo en hasta 2000 caracteres; los documentos se seleccionan desde la causa.",
      409,
    );
  const plan = await prepareCasePlan(conversationId, objective, actor);
  return { objective, plan, planHash: snapshotHash(plan) };
}
export async function assertCaseJobToolAccess(ctx: ToolContext) {
  await desktopScope(ctx, prisma, true);
}
export async function authorizeCaseJobResult(
  result: ToolResult,
  ctx: ToolContext,
) {
  const { actor, conversationId } = await desktopScope(ctx, prisma, true);
  if (!result.entityId) throw httpError("Encargo no disponible", 404);
  const { job } = await caseJobAccess(result.entityId, actor, prisma, false);
  if (
    job.conversationId !== conversationId ||
    job.originTurnId !== ctx.nativeTurnId
  )
    throw httpError("El encargo no pertenece a este mensaje", 404);
}
export const causaEncargarTool: AssistantTool<z.infer<typeof schema>> = {
  id: "causa.encargar",
  kind: "write",
  roles: [...STAFF_ROLES],
  inputSchema: schema,
  description:
    "Inicia un encargo persistente de revisión de la causa actual con equipo, modelos y fuentes confirmados. Prepara propuestas; no guarda registros del expediente sin una segunda confirmación.",
  async preview(input, ctx) {
    const { actor } = await desktopScope(ctx);
    if (
      input.planHash !== snapshotHash(input.plan) ||
      input.objective !== input.plan.objective
    )
      throw httpError("El plan cambió", 409);
    await validateCasePlan(input.plan, actor);
    return planPreview(input.plan);
  },
  async execute(input, ctx) {
    const match =
      /^assistant-plan:(altazor-[A-Za-z0-9-]{1,100}):([0-9]{1,3})$/.exec(
        ctx.commandKey || "",
      );
    if (!match || !ctx.nativeTurnId || !ctx.authorizeContext)
      throw httpError("Confirma el equipo desde el plan de Altazor", 409);
    const { actor, conversationId } = await desktopScope(ctx);
    const record = await prisma.assistantPlanRecord.findFirst({
      where: {
        id: match[1],
        ownerId: actor.id,
        expiresAt: { gt: new Date() },
        status: { not: "cancelled" },
      },
    });
    const plan = record ? (JSON.parse(record.planJson) as AssistantPlan) : null;
    const step = plan?.steps[Number(match[2])];
    if (
      !plan?.needsConfirm ||
      step?.toolId !== "causa.encargar" ||
      canonicalJson(step.input) !== canonicalJson(input) ||
      step.preview !== (await causaEncargarTool.preview(input, ctx))
    )
      throw httpError("El plan confirmado cambió", 409);
    await ctx.authorizeContext();
    ctx.signal?.throwIfAborted();
    const job = await serializable((tx) =>
      createCaseJob(
        conversationId,
        ctx.nativeTurnId!,
        `case-job:${snapshotHash(ctx.commandKey)}`,
        input.plan,
        actor,
        tx,
      ),
    );
    return {
      ok: true,
      message:
        "Encargo en cola. Altazor conservará sus etapas y preparará propuestas para tu revisión.",
      entityId: job.id,
      card: {
        type: "case-job",
        id: job.id,
        causaId: job.causaId,
        status: job.status,
      },
    };
  },
};
