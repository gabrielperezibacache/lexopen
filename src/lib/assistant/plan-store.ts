/** PostgreSQL-backed plans and undo tokens survive process restarts. */
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { canonicalJson } from "@/lib/command-execution";
import { assistantTransaction } from "./transaction-context";
import type { AssistantPlan } from "./types";

const PLAN_TTL_MS = 30 * 60 * 1000;

export async function storePlan(plan: AssistantPlan, ownerId: string, ttlMs = PLAN_TTL_MS) {
  await prisma.assistantPlanRecord.create({ data: {
    id: plan.id, ownerId, planJson: canonicalJson(plan), expiresAt: new Date(Date.now() + ttlMs),
  } });
  return plan;
}

export async function getPlan(id: string, ownerId: string): Promise<AssistantPlan | null> {
  const record = await prisma.assistantPlanRecord.findFirst({
    where: { id, ownerId, expiresAt: { gt: new Date() }, status: { not: "cancelled" } },
  });
  return record ? JSON.parse(record.planJson) as AssistantPlan : null;
}

/** Cancellation does not delete receipts for previously completed steps. */
export async function cancelPlan(id: string, ownerId: string) {
  const result = await prisma.assistantPlanRecord.updateMany({
    where: { id, ownerId, status: { in: ["pending", "partial"] }, expiresAt: { gt: new Date() } },
    data: { status: "cancelled" },
  });
  return result.count > 0;
}

export type UndoPayload = {
  toolId: string;
  entityType: string;
  entityId: string;
  before?: unknown;
};

export async function snapshotEntity(tx: Prisma.TransactionClient, entityType: string, id: string): Promise<unknown> {
  switch (entityType) {
    case "Nota": return tx.nota.findUnique({ where: { id } });
    case "Task": return tx.task.findUnique({ where: { id }, include: {
      comments: { orderBy: { id: "asc" } }, minutaAcciones: { orderBy: { id: "asc" } },
      historial: { orderBy: { id: "asc" } }, subtasks: { orderBy: { id: "asc" } }, tramite: true,
    } });
    case "Causa": return tx.causa.findUnique({ where: { id } });
    case "Documento": return tx.documento.findUnique({ where: { id } });
    case "Minuta": return tx.minuta.findUnique({ where: { id }, include: { documento: true, acciones: { orderBy: { id: "asc" } } } });
    case "Plazo": return tx.plazo.findUnique({ where: { id }, include: { minutaAcciones: { orderBy: { id: "asc" } } } });
    case "Evento": return tx.evento.findUnique({ where: { id } });
    default: throw httpError("Tipo de reversión no permitido", 400);
  }
}

/** Undo receipt and the post-write snapshot commit with the same domain TX. */
export async function storeUndo(payload: UndoPayload, ttlMs = PLAN_TTL_MS): Promise<string> {
  const context = assistantTransaction();
  if (!context) throw new Error("Undo requiere una escritura transaccional");
  const { tx, actor } = context;
  const expected = await snapshotEntity(tx, payload.entityType, payload.entityId);
  const id = randomUUID();
  await tx.assistantUndo.create({ data: {
    id,
    ownerId: actor.userId,
    toolId: payload.toolId,
    entityType: payload.entityType,
    entityId: payload.entityId,
    payloadJson: canonicalJson(payload),
    expectedJson: canonicalJson(expected),
    expiresAt: new Date(Date.now() + ttlMs),
  } });
  return id;
}

export async function readUndo(token: string, ownerId: string, toolId: string, tx: Prisma.TransactionClient) {
  return tx.assistantUndo.findFirst({ where: {
    id: token, ownerId, toolId, consumedAt: null, expiresAt: { gt: new Date() },
  } });
}

/** Called only after owner, current ACL and version validation by secureTool. */
export async function consumeUndo(token: string): Promise<UndoPayload | null> {
  const context = assistantTransaction();
  if (!context) throw new Error("Undo requiere una transacción");
  const { tx, actor } = context;
  const record = await tx.assistantUndo.findFirst({ where: {
    id: token, ownerId: actor.userId, consumedAt: null, expiresAt: { gt: new Date() },
  } });
  if (!record) return null;
  const claimed = await tx.assistantUndo.updateMany({
    where: { id: token, ownerId: actor.userId, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (!claimed.count) return null;
  return JSON.parse(record.payloadJson) as UndoPayload;
}
