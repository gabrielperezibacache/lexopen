import { taskWorkspaceCauseMatch } from "@/lib/tasks/workspace";
import { createHash } from "node:crypto";
import type { Prisma, Task } from "@prisma/client";
import { canonicalJson, serializable } from "@/lib/command-execution";
import { currentStaffActor, type StaffActor } from "@/lib/auth/staff-actor";
import { assertCausaAccess, assertCausaCapability, causaAccessWhere } from "@/lib/auth/causa-access";
import { httpError } from "@/lib/auth/access";
import { isStaff } from "@/lib/auth/rbac";
import { STAFF_ROLES } from "@/lib/auth/roles";
export type Actor = Awaited<ReturnType<typeof currentStaffActor>>;
export const hashReference = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");
export function referenceConflict(message = "Una referencia cambió desde que se preparó. Revise sus versiones antes de sincronizar.") {
  return Object.assign(httpError(message, 409), { code: "offline_reference_conflict", unapplied: true });
}
export async function userReference(id: string, tx: Prisma.TransactionClient) {
  const row = await tx.user.findUnique({ where: { id }, select: { id: true, name: true, role: true, capabilityGrants: true, capabilityRevokes: true, sessionVersion: true } });
  if (!row || !isStaff(row.role)) throw httpError("El responsable ya no está disponible como profesional del estudio", 403);
  return { id: row.id, label: row.name, version: hashReference(row) };
}
export async function causeReference(id: string, actor: Actor, tx: Prisma.TransactionClient, write = false) {
  if (write) await assertCausaCapability(id, actor, "causa.write", tx);
  else await assertCausaAccess(id, actor, { auditOverride: false }, tx);
  const row = await tx.causa.findUniqueOrThrow({ where: { id }, select: {
    id: true, titulo: true, rit: true, clienteId: true, acceso: true, abogadoId: true, updatedAt: true,
    cliente: { select: { id: true, razonSocial: true, updatedAt: true } },
    miembros: { orderBy: { id: "asc" }, select: { id: true, userId: true, rol: true, desde: true, hasta: true } },
  } });
  const bindings = await tx.task.findMany({ where: { AND: [taskWorkspaceCauseMatch(id), { clienteId: { not: null } }] },
    orderBy: { id: "asc" }, take: 101, select: { id: true, clienteId: true, updatedAt: true, assigneeId: true, creatorId: true } });
  return { id: row.id, label: [row.rit, row.titulo].filter(Boolean).join(" · "), clientId: row.clienteId,
    clientLabel: row.cliente?.razonSocial || null, version: hashReference({ row, bindings }) };
}
export async function taskReferenceContext(row: Task, actor: Actor, tx: Prisma.TransactionClient) {
  const anchors = await tx.task.findUniqueOrThrow({ where: { id: row.id }, select: {
    assignee: { select: { id: true, name: true, role: true, capabilityGrants: true, capabilityRevokes: true, sessionVersion: true } },
    site: { select: { id: true, causaId: true, updatedAt: true } }, parent: { select: { id: true, causaId: true, updatedAt: true } },
    plazo: { select: { id: true, causaId: true, updatedAt: true } }, evento: { select: { id: true, causaId: true, updatedAt: true } },
    tramite: { select: { id: true, causaId: true, updatedAt: true } },
    minutaAcciones: { orderBy: { id: "asc" }, select: { id: true, minuta: { select: { id: true, causaId: true, updatedAt: true, confidencial: true } } } },
    subtasks: { take: 1, orderBy: { id: "asc" }, select: { id: true } },
  } });
  const ids = [...new Set([row.causaId, anchors.site?.causaId, anchors.parent?.causaId, anchors.plazo?.causaId, anchors.evento?.causaId, anchors.tramite?.causaId, ...anchors.minutaAcciones.map(x => x.minuta.causaId)].filter((id): id is string => Boolean(id)))].sort();
  const causes = [];
  for (const id of ids) causes.push(await causeReference(id, actor, tx));
  const locked = row.origen !== "manual" || Boolean(row.siteId || row.parentId || row.plazoId || row.eventoId || row.tramiteId || anchors.minutaAcciones.length || anchors.subtasks.length);
  return { causes, cause: causes.find(c => c.id === row.causaId) || causes[0] || null, locked,
    version: hashReference({ causaId: row.causaId, origen: row.origen, anchors, causes: causes.map(c => ({ id: c.id, version: c.version })) }) };
}
export async function listOfflineReferences(user: StaffActor, opts: { type: string; q?: string; after?: string; id?: string }) {
  if (!["user", "cause"].includes(opts.type) || (opts.q?.length || 0) > 200 || opts.after && !/^[A-Za-z0-9_-]{1,100}$/.test(opts.after)) throw httpError("Búsqueda de referencias inválida", 400);
  if (opts.id && !/^[A-Za-z0-9_-]{1,100}$/.test(opts.id)) throw httpError("Referencia inválida", 400);
  return serializable(async tx => {
    const actor = await currentStaffActor(user, tx), q = opts.q?.trim();
    if (opts.id) return { type: opts.type, items: [opts.type === "user" ? await userReference(opts.id, tx) : await causeReference(opts.id, actor, tx, true)], nextAfter: null, self: await userReference(actor.id, tx) };
    const page = opts.type === "user" ? await tx.user.findMany({ where: { role: { in: [...STAFF_ROLES] }, ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}), ...(opts.after ? { id: { gt: opts.after } } : {}) }, select: { id: true }, orderBy: { id: "asc" }, take: 31 })
      : await tx.causa.findMany({ where: { AND: [causaAccessWhere(actor), ...(q ? [{ OR: [{ titulo: { contains: q, mode: "insensitive" as const } }, { rit: { contains: q, mode: "insensitive" as const } }] }] : []), ...(opts.after ? [{ id: { gt: opts.after } }] : [])] }, select: { id: true }, orderBy: { id: "asc" }, take: 31 });
    const items = [];
    for (const row of page.slice(0, 30)) {
      try { items.push(opts.type === "user" ? await userReference(row.id, tx) : await causeReference(row.id, actor, tx, true)); }
      catch (error) { if (![403, 404].includes((error as { status?: number }).status || 0)) throw error; }
    }
    return { type: opts.type, items, nextAfter: page.length > 30 ? page[29].id : null, self: await userReference(actor.id, tx) };
  });
}
