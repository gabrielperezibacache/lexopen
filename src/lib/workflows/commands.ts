import type { Prisma, Workflow, WorkflowInstance } from "@prisma/client";
import { z } from "zod";
import { writeAuditStrict } from "@/lib/audit";
import { httpError, requireSiteMutationAccess } from "@/lib/auth/access";
import { siteRelatedWhere } from "@/lib/auth/causa-access";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { currentStaffActor, type StaffActor } from "@/lib/auth/staff-actor";
import { executeCommand } from "@/lib/command-execution";

const id = z.string().min(1).max(100);
const stepsSchema = z.array(z.object({ name: z.string().trim().min(1).max(240), role: z.enum(STAFF_ROLES).optional() }).strict()).min(1).max(50);
const startSchema = z.object({ action: z.literal("start"), workflowId: id, payload: z.record(z.string(), z.unknown()).default({}) }).strict();
const advanceSchema = z.object({ action: z.literal("advance"), instanceId: id, decision: z.enum(["approve", "reject"]).default("approve"), expectedStep: z.number().int().min(0).max(49) }).strict();
const createSchema = z.object({
  action: z.literal("create"), name: z.string().trim().min(1).max(240), description: z.string().max(10000).optional().nullable(), siteId: id,
  triggerType: z.enum(["manual", "file_upload", "task_done", "isheet_row"]).default("manual"),
  steps: stepsSchema.default([{ name: "Revisión abogado", role: "abogado" }, { name: "Aprobación socio", role: "socio" }]),
}).strict();
export const workflowCommandSchema = z.discriminatedUnion("action", [startSchema, advanceSchema, createSchema]);

function readSteps(json: string) {
  try { return stepsSchema.parse(JSON.parse(json)); }
  catch { throw httpError("Definición de workflow inválida", 400); }
}

async function workflowFor(id: string, user: StaffActor, tx: Prisma.TransactionClient) {
  const actor = await currentStaffActor(user, tx);
  const workflow = await tx.workflow.findFirst({ where: { AND: [{ id }, siteRelatedWhere(actor)] } });
  if (!workflow) throw httpError("Workflow no encontrado", 404);
  await requireSiteMutationAccess(workflow.siteId, actor, tx);
  return { actor, workflow };
}

export async function startWorkflowCommand(user: StaffActor, raw: unknown, key: string) {
  const input = startSchema.parse(raw);
  return executeCommand<WorkflowInstance>({
    key, ownerId: user.id, input,
    authorize: async (tx, result) => {
      const { workflow } = await workflowFor(input.workflowId, user, tx);
      if (!result) {
        if (!workflow.active) throw httpError("El workflow está desactivado", 409);
        readSteps(workflow.stepsJson);
      }
    },
    run: async tx => {
      const instance = await tx.workflowInstance.create({ data: {
        workflowId: input.workflowId, status: "pending", currentStep: 0, payloadJson: JSON.stringify(input.payload), actorId: user.id,
      } });
      await writeAuditStrict({ actorId: user.id, action: "workflow.start", entityType: "WorkflowInstance", entityId: instance.id, after: { workflowId: instance.workflowId, status: instance.status, currentStep: instance.currentStep } }, tx);
      return instance;
    },
  });
}

export async function advanceWorkflowCommand(user: StaffActor, raw: unknown, key: string) {
  const input = advanceSchema.parse(raw);
  return executeCommand<WorkflowInstance>({
    key, ownerId: user.id, input,
    authorize: async (tx, result) => {
      const instance = await tx.workflowInstance.findUnique({ where: { id: input.instanceId } });
      if (!instance) throw httpError("Workflow no encontrado", 404);
      const { actor, workflow } = await workflowFor(instance.workflowId, user, tx);
      if (result) return;
      if (!["pending", "running"].includes(instance.status)) throw httpError("El workflow ya terminó", 409);
      if (input.expectedStep !== instance.currentStep) throw httpError("El workflow cambió. Recárguelo antes de continuar", 409);
      const current = readSteps(workflow.stepsJson)[instance.currentStep];
      if (!current) throw httpError("Paso de workflow inválido", 409);
      // Host administration does not substitute the professional role of a step.
      if (current.role && current.role !== actor.role) throw httpError("Este paso requiere otro rol", 403);
    },
    run: async tx => {
      const before = await tx.workflowInstance.findUniqueOrThrow({ where: { id: input.instanceId }, include: { workflow: true } });
      const next = before.currentStep + 1, done = next >= readSteps(before.workflow.stepsJson).length || input.decision === "reject";
      const changed = await tx.workflowInstance.updateMany({ where: { id: before.id, status: before.status, currentStep: before.currentStep }, data: {
        currentStep: done ? before.currentStep : next, status: input.decision === "reject" ? "rejected" : done ? "approved" : "running", actorId: user.id,
      } });
      if (changed.count !== 1) throw httpError("El workflow cambió. Recárguelo antes de continuar", 409);
      const updated = await tx.workflowInstance.findUniqueOrThrow({ where: { id: before.id } });
      await writeAuditStrict({ actorId: user.id, action: "workflow.advance", entityType: "WorkflowInstance", entityId: updated.id,
        before: { status: before.status, currentStep: before.currentStep },
        after: { workflowId: before.workflowId, status: updated.status, currentStep: updated.currentStep, decision: input.decision },
      }, tx);
      return updated;
    },
  });
}

export async function createWorkflowCommand(user: StaffActor, raw: unknown, key: string) {
  const input = createSchema.parse(raw);
  return executeCommand<Workflow>({
    key, ownerId: user.id, input,
    authorize: async tx => { await requireSiteMutationAccess(input.siteId, await currentStaffActor(user, tx), tx); },
    run: async tx => {
      const workflow = await tx.workflow.create({ data: { name: input.name, description: input.description || null, siteId: input.siteId, triggerType: input.triggerType, stepsJson: JSON.stringify(input.steps) } });
      await writeAuditStrict({ actorId: user.id, action: "workflow.create", entityType: "Workflow", entityId: workflow.id, after: { siteId: workflow.siteId, name: workflow.name } }, tx);
      return workflow;
    },
  });
}
