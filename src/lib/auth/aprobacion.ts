/**
 * Aprobaciones genéricas ligadas a cualquier entidad (escrito, horas, factura…).
 */

import { writeAuditStrict } from "@/lib/audit";
import { httpError } from "@/lib/auth/access";
import { assertCausaAccess, billingRelatedWhere, documentReadWhere, taskAccessWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { can, type PermissionSubject } from "@/lib/auth/permissions";
import { canSeeConfidential } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const APROBACION_TIPOS = [
  "escrito",
  "time_batch",
  "invoice",
  "gasto",
  "descuento",
  "override_walls",
  "envio_cliente",
  "minuta",
] as const;

export type AprobacionTipo = (typeof APROBACION_TIPOS)[number];

export const APROBACION_ESTADOS = [
  "pendiente",
  "aprobada",
  "rechazada",
  "expirada",
  "cancelada",
] as const;

export function isAprobacionTipo(v: string): v is AprobacionTipo {
  return (APROBACION_TIPOS as readonly string[]).includes(v);
}

/** Capacidad que habilita a resolver según tipo. */
export function capabilityForAprobacionTipo(tipo: string) {
  switch (tipo) {
    case "escrito":
    case "minuta":
      return "escrito.approve" as const;
    case "time_batch":
      return "time.approve" as const;
    case "invoice":
    case "gasto":
    case "descuento":
      return "billing.manage" as const;
    case "override_walls":
      return "causa.override_walls" as const;
    case "envio_cliente":
      return "client.message" as const;
    default:
      return null;
  }
}

export async function createAprobacion(opts: {
  tipo: AprobacionTipo;
  titulo: string;
  detalle?: string | null;
  entityType: string;
  entityId: string;
  solicitanteId: string;
  aprobadorId?: string | null;
  venceAt?: Date | null;
}) {
  const actor = await prisma.user.findUniqueOrThrow({ where: { id: opts.solicitanteId } });
  if (opts.venceAt && opts.venceAt <= new Date()) throw httpError("El vencimiento debe ser futuro", 400);
  return prisma.$transaction(async (tx) => {
    await approvalScope(opts.entityType, opts.entityId, actor, tx);
    if (opts.aprobadorId) {
      const approver = await tx.user.findUniqueOrThrow({ where: { id: opts.aprobadorId } });
      const causaRol = await approvalScope(opts.entityType, opts.entityId, approver, tx);
      const cap = capabilityForAprobacionTipo(opts.tipo);
      if (!cap || !can(approver, cap, { causaRol })) throw httpError("El aprobador no tiene permiso sobre esta entidad", 403);
    }
    const row = await tx.aprobacion.create({
    data: {
      tipo: opts.tipo,
      titulo: opts.titulo,
      detalle: opts.detalle ?? null,
      entityType: opts.entityType,
      entityId: opts.entityId,
      solicitanteId: opts.solicitanteId,
      aprobadorId: opts.aprobadorId ?? null,
      venceAt: opts.venceAt ?? null,
      estado: "pendiente",
    },
    });
    await writeAuditStrict({ actorId: actor.id, action: "aprobacion.create", entityType: "Aprobacion", entityId: row.id }, tx);
    if (row.aprobadorId) await tx.notification.create({ data: { userId: row.aprobadorId, title: "Aprobación pendiente", body: "Tiene una solicitud pendiente de revisión.", href: "/tareas?tab=aprobaciones", entityType: row.entityType, entityId: row.entityId } });
    return row;
  });
}

export async function canReadApproval(row: { entityType: string; entityId: string }, user: CausaAccessUser) {
  try { await approvalScope(row.entityType, row.entityId, user, prisma); return true; } catch { return false; }
}

async function approvalScope(entityType: string, entityId: string, user: CausaAccessUser, tx: Prisma.TransactionClient) {
  const key = entityType.toLowerCase();
  let causaId: string | null = null;
  if (key === "causa") causaId = entityId;
  else if (key === "documento") {
    const document = await tx.documento.findFirst({ where: { id: entityId, ...documentReadWhere(user) }, select: { causaId: true } });
    if (!document) throw httpError("No encontrada", 404);
    causaId = document.causaId;
  }
  else if (key === "minuta" || key === "escrito") {
    const document = await tx.minuta.findUniqueOrThrow({ where: { id: entityId }, select: { causaId: true, confidencial: true } });
    if (document.confidencial && !canSeeConfidential(user)) throw httpError("No encontrada", 404);
    causaId = document.causaId;
  }
  else if (key === "task") causaId = (await tx.task.findFirstOrThrow({ where: { id: entityId, ...taskAccessWhere(user) }, select: { causaId: true } })).causaId;
  else if (key === "invoice") causaId = (await tx.invoice.findFirstOrThrow({ where: { id: entityId, ...billingRelatedWhere(user) }, select: { causaId: true } })).causaId;
  else if (key === "expense" || key === "gasto") causaId = (await tx.expense.findFirstOrThrow({ where: { id: entityId, ...billingRelatedWhere(user) }, select: { causaId: true } })).causaId;
  else if (key === "timeentry") causaId = (await tx.timeEntry.findFirstOrThrow({ where: { AND: [{ id: entityId }, { OR: [{ userId: user.id }, billingRelatedWhere(user)] }] }, select: { causaId: true } })).causaId;
  else throw httpError("Tipo de entidad no admitido para aprobación", 400);
  return causaId ? (await assertCausaAccess(causaId, user, undefined, tx)).causaRol : null;
}

export async function resolveAprobacion(opts: {
  id: string;
  actor: PermissionSubject & { id: string };
  decision: "aprobada" | "rechazada" | "cancelada";
  comentario?: string | null;
}) {
  const result = await prisma.$transaction(async (tx) => {
    const row = await tx.aprobacion.findUnique({ where: { id: opts.id } });
    if (!row) throw httpError("Aprobación no encontrada", 404);
    const causaRol = await approvalScope(row.entityType, row.entityId, opts.actor, tx);
    if (row.estado !== "pendiente") throw httpError("La aprobación ya fue resuelta", 409);
    const now = new Date();
    if (row.venceAt && row.venceAt <= now) {
      const expired = await tx.aprobacion.updateMany({ where: { id: row.id, estado: "pendiente" }, data: { estado: "expirada", resueltaAt: now } });
      if (expired.count) await writeAuditStrict({ actorId: opts.actor.id, action: "aprobacion.expirada", entityType: "Aprobacion", entityId: row.id }, tx);
      return null;
    }
    if (opts.decision === "cancelada") {
      if (row.solicitanteId !== opts.actor.id && !can(opts.actor, "host.admin")) throw httpError("Solo el solicitante puede cancelar", 403);
    } else {
      const cap = capabilityForAprobacionTipo(row.tipo);
      const assigned = !row.aprobadorId || row.aprobadorId === opts.actor.id || can(opts.actor, "host.admin");
      if (!cap || !can(opts.actor, cap, { causaRol }) || !assigned) throw httpError("No puede resolver esta aprobación", 403);
    }
    const changed = await tx.aprobacion.updateMany({ where: { id: row.id, estado: "pendiente", OR: [{ venceAt: null }, { venceAt: { gt: now } }] }, data: { estado: opts.decision, comentario: opts.comentario ?? null, resueltaAt: now, resueltaPorId: opts.actor.id } });
    if (changed.count !== 1) throw httpError("La aprobación cambió. Actualice antes de resolver.", 409);
    await writeAuditStrict({ actorId: opts.actor.id, action: `aprobacion.${opts.decision}`, entityType: "Aprobacion", entityId: row.id, after: { tipo: row.tipo, entityType: row.entityType, entityId: row.entityId, decision: opts.decision } }, tx);
    return tx.aprobacion.findUniqueOrThrow({ where: { id: row.id } });
  });
  if (!result) throw httpError("La aprobación ha expirado", 409);
  return result;
}
